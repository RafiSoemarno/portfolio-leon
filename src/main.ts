import './styles.css';
import { createViewer, type Viewer } from './viewer/createViewer';
import { loadModel, type ModelLoad } from './viewer/loadModel';
import { setupLighting, type LightingRig } from './viewer/lighting';
import { createStatusUi, type StatusUi } from './viewer/statusUi';

/**
 * Page entry: wires the viewer modules together and owns the mount/unmount
 * lifecycle. All scene code lives in `src/viewer/`; this file resolves the
 * mount point, picks the model and forwards teardown.
 */

const MODEL_URL = '/AK-74M.fbx';
// Placeholder poster for the error/no-WebGL states (LEON-18 supplies real renders).
const POSTER_URL = '/og-placeholder.png';
// Position it where the sphere was. The orbit target tracks it so rotation and
// dolly stay centred on the model; the registry (LEON-12) supplies these per model.
const MODEL_POSITION: [number, number, number] = [0, 1.5, 3];

const UNSUPPORTED_MESSAGE =
  'This browser or device does not support WebGL, so the interactive 3D preview is unavailable.';

const LOAD_ERROR_MESSAGE =
  'The model could not be downloaded. Check your connection and try again.';

interface Session {
  viewer: Viewer | null;
  lights: LightingRig | null;
  status: StatusUi | null;
  model: ModelLoad | null;
  disposed: boolean;
}

let session: Session | null = null;

/**
 * Cheap capability gate. The authoritative check is whether the renderer can
 * actually create a context (see `mount`), which also covers blacklisted or
 * exhausted GPUs without allocating a probe context here.
 */
function hasWebGL(): boolean {
  return typeof WebGLRenderingContext !== 'undefined' || typeof WebGL2RenderingContext !== 'undefined';
}

function startLoad(current: Session): void {
  const viewer = current.viewer;
  const status = current.status;
  if (!viewer || !status) return;

  // A retry replaces the previous attempt; this aborts it if still in flight.
  current.model?.dispose();
  status.showLoading();

  const model = loadModel(viewer.scene, {
    url: MODEL_URL,
    scale: 0.02, // Adjust scale if needed
    position: MODEL_POSITION,
    rotation: [-Math.PI / 10, -Math.PI / 2, 0],
    onProgress: (progress) => status.setProgress(progress),
    onError: (error) => {
      // Handled by the fallback UI, so this is a warning rather than an error.
      console.warn('FBX load failed:', error);
      status.showError(LOAD_ERROR_MESSAGE);
    }
  });

  current.model = model;

  void model.ready.then((loaded) => {
    // `null` means the load failed (error state already shown) or was disposed.
    if (!loaded || current.disposed) return;
    status.showReady();
  });
}

export function mount(): void {
  if (session) return;

  const container = document.querySelector<HTMLElement>('#app') ?? document.body;
  const statusHost = document.querySelector<HTMLElement>('#viewer-status') ?? container;

  const current: Session = { viewer: null, lights: null, status: null, model: null, disposed: false };
  session = current;

  const status = createStatusUi({
    container: statusHost,
    posterUrl: POSTER_URL,
    onRetry: () => {
      if (!current.disposed) startLoad(current);
    }
  });
  current.status = status;

  if (!hasWebGL()) {
    status.showUnsupported(UNSUPPORTED_MESSAGE);
    return;
  }

  let viewer: Viewer;
  try {
    viewer = createViewer(container);
  } catch (error) {
    console.warn('WebGL context could not be created:', error);
    status.showUnsupported(UNSUPPORTED_MESSAGE);
    return;
  }

  current.viewer = viewer;
  current.lights = setupLighting(viewer.scene);
  viewer.controls.target.set(...MODEL_POSITION);

  startLoad(current);
}

export function unmount(): void {
  const current = session;
  if (!current) return;
  session = null;
  current.disposed = true;

  current.model?.dispose(); // aborts an in-flight fetch, releases loaded geometry
  current.lights?.dispose();
  current.viewer?.dispose(); // cancels the rAF loop, releases the GL context
  current.status?.dispose(); // removes the progress / fallback overlay
}

// Lifecycle hooks for page navigation (LEON-13/LEON-14) and for headless checks
// that need to exercise repeated mount/unmount.
declare global {
  interface Window {
    __leonViewer?: { mount: () => void; unmount: () => void };
  }
}
window.__leonViewer = { mount, unmount };

mount();

// `pagehide` covers mobile Safari, where `beforeunload` is unreliable.
window.addEventListener('beforeunload', unmount);
window.addEventListener('pagehide', unmount);
