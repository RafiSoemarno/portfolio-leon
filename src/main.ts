import './styles.css';
import { createViewer } from './viewer/createViewer';
import { loadModel } from './viewer/loadModel';
import { setupLighting } from './viewer/lighting';

/**
 * Page entry: wires the viewer modules together. All scene code lives in
 * `src/viewer/`; this file only resolves the mount point, picks the model and
 * forwards teardown.
 */

const MODEL_URL = '/AK-74M.fbx';
// Position it where the sphere was. The orbit target tracks it so rotation and
// dolly stay centred on the model; the registry (LEON-12) supplies these per model.
const MODEL_POSITION: [number, number, number] = [0, 1.5, 3];

const container = document.querySelector<HTMLElement>('#app') ?? document.body;

const viewer = createViewer(container);
viewer.controls.target.set(...MODEL_POSITION);
const lights = setupLighting(viewer.scene, viewer.renderer, { target: MODEL_POSITION });

const model = loadModel(viewer.scene, {
  url: MODEL_URL,
  scale: 0.02, // Adjust scale if needed
  position: MODEL_POSITION,
  rotation: [-Math.PI / 10, -Math.PI / 2, 0],
  onError: (error) => {
    console.error('Error loading FBX:', error);
  }
});

// LEON-11 adds real mount/unmount lifecycle hooks; until then teardown runs
// when the page goes away so no GL context is left behind.
function teardown(): void {
  model.dispose();
  lights.dispose();
  viewer.dispose();
}

window.addEventListener('beforeunload', teardown);
