import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * Model loading with a cancellable lifecycle.
 *
 * The prototype used a hardcoded `AK-74M.fbx` with a fixed scale/rotation;
 * transforms are options here so registry-driven values (LEON-12/LEON-15) can
 * replace them without touching this module.
 *
 * The file is fetched with `fetch()` rather than `FBXLoader.load()` so that
 * (a) progress can be reported from the response stream and (b) `dispose()`
 * aborts an in-flight request instead of only discarding its result.
 */

export interface LoadProgress {
  /** Bytes received so far. */
  readonly loaded: number;
  /** Total bytes from `Content-Length`, or `null` when the server omits it. */
  readonly total: number | null;
  /** `loaded / total` clamped to `0..1`, or `null` when the total is unknown. */
  readonly ratio: number | null;
}

export interface LoadedModel {
  readonly root: THREE.Group;
  /** Detaches the model from its parent and releases its GPU resources. Idempotent. */
  dispose(): void;
}

export interface ModelLoad {
  /** Resolves with the model, or `null` if the load failed or was disposed. */
  readonly ready: Promise<LoadedModel | null>;
  /**
   * Aborts a pending request (nothing arrives later) and disposes the model if
   * it already loaded. Idempotent; never reports an error for its own abort.
   */
  dispose(): void;
}

export interface LoadModelOptions {
  /** URL as served from the web root, e.g. `/AK-74M.fbx`. */
  url: string;
  /** FBX units differ from scene units; the prototype used `0.02`. */
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onProgress?: (progress: LoadProgress) => void;
  /** Called on a real failure; aborts and disposals are not errors. */
  onError?: (error: unknown) => void;
}

/** Directory of `url`, used to resolve externally referenced resources. */
function basePath(url: string): string {
  const index = url.lastIndexOf('/');
  return index === -1 ? '' : url.slice(0, index + 1);
}

function contentLength(response: Response): number | null {
  const header = response.headers.get('content-length');
  if (header === null) return null;
  const total = Number(header);
  return Number.isFinite(total) && total > 0 ? total : null;
}

async function fetchArrayBuffer(
  url: string,
  signal: AbortSignal,
  onProgress?: (progress: LoadProgress) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }

  const total = contentLength(response);

  // No streaming body (older browsers, opaque proxies): fall back to one shot.
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.({ loaded: buffer.byteLength, total, ratio: total === null ? null : 1 });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  // Aborting rejects the pending read; cancelling the reader as well drops the
  // connection (and the throttle) instead of leaving it draining in the background.
  const onAbort = (): void => {
    void reader.cancel();
  };
  signal.addEventListener('abort', onAbort);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({
        loaded,
        total,
        ratio: total === null ? null : Math.min(loaded / total, 1)
      });
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }

  // A cancelled reader can end the loop as `done` with a partial body.
  if (signal.aborted) throw new DOMException('The load was aborted', 'AbortError');

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if ((value as THREE.Texture | null)?.isTexture) {
      (value as THREE.Texture).dispose();
    }
  }
  material.dispose();
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
    } else if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  });
}

export function loadModel(parent: THREE.Object3D, options: LoadModelOptions): ModelLoad {
  const controller = new AbortController();

  let disposed = false;
  let loaded: LoadedModel | null = null;

  const ready = new Promise<LoadedModel | null>((resolve) => {
    void (async () => {
      let buffer: ArrayBuffer;
      try {
        buffer = await fetchArrayBuffer(options.url, controller.signal, options.onProgress);
      } catch (error) {
        // An abort is a caller-driven cancel, not a failure to report.
        if (disposed || controller.signal.aborted) {
          resolve(null);
          return;
        }
        options.onError?.(error);
        resolve(null);
        return;
      }

      if (disposed) {
        resolve(null);
        return;
      }

      let root: THREE.Group;
      try {
        root = new FBXLoader().parse(buffer, basePath(options.url));
      } catch (error) {
        options.onError?.(error);
        resolve(null);
        return;
      }

      // The load may have been cancelled while parsing; release and bail out.
      if (disposed) {
        disposeObject(root);
        resolve(null);
        return;
      }

      if (options.scale !== undefined) root.scale.setScalar(options.scale);
      if (options.position) root.position.set(...options.position);
      if (options.rotation) root.rotation.set(...options.rotation);

      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      parent.add(root);

      let released = false;
      loaded = {
        root,
        dispose(): void {
          if (released) return;
          released = true;
          root.removeFromParent();
          disposeObject(root);
        }
      };
      resolve(loaded);
    })();
  });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    controller.abort(); // real cancellation: the response stream stops here
    loaded?.dispose();
    loaded = null;
  }

  return { ready, dispose };
}
