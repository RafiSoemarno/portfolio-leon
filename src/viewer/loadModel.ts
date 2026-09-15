import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * Model loading with a cancellable lifecycle.
 *
 * The prototype used a hardcoded `AK-74M.fbx` with a fixed scale/rotation;
 * transforms are options here so registry-driven values (LEON-12/LEON-15) can
 * replace them without touching this module.
 */

export interface LoadedModel {
  readonly root: THREE.Group;
  /** Detaches the model from its parent and releases its GPU resources. */
  dispose(): void;
}

export interface ModelLoad {
  /** Resolves with the model, or `null` if the load failed or was disposed. */
  readonly ready: Promise<LoadedModel | null>;
  /**
   * Cancels a pending load (the arriving object is discarded) and disposes the
   * model if it already loaded. Idempotent.
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
  onProgress?: (event: ProgressEvent) => void;
  /** Called instead of throwing; the load resolves with `null`. */
  onError?: (error: unknown) => void;
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
  const loader = new FBXLoader();
  let loaded: LoadedModel | null = null;
  let disposed = false;

  const ready = new Promise<LoadedModel | null>((resolve) => {
    loader.load(
      options.url,
      (object) => {
        if (disposed) {
          disposeObject(object);
          resolve(null);
          return;
        }

        const root = object;
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

        loaded = {
          root,
          dispose(): void {
            root.removeFromParent();
            disposeObject(root);
          }
        };
        resolve(loaded);
      },
      options.onProgress,
      (error) => {
        if (disposed) {
          resolve(null);
          return;
        }
        options.onError?.(error);
        resolve(null);
      }
    );
  });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    loaded?.dispose();
    loaded = null;
  }

  return { ready, dispose };
}
