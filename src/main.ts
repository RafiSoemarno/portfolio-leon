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

const container = document.querySelector<HTMLElement>('#app') ?? document.body;

const viewer = createViewer(container);
const lights = setupLighting(viewer.scene);

const model = loadModel(viewer.scene, {
  url: MODEL_URL,
  scale: 0.02, // Adjust scale if needed
  position: [0, 1.5, 3], // Position it where the sphere was
  rotation: [-Math.PI / 10, -Math.PI / 2, 0],
  onError: (error) => {
    console.error('Error loading FBX:', error);
  }
});

model.ready.then((loaded) => {
  if (loaded) viewer.setRotationTarget(loaded.root);
});

// LEON-11 adds real mount/unmount lifecycle hooks; until then teardown runs
// when the page goes away so no GL context is left behind.
function teardown(): void {
  model.dispose();
  lights.dispose();
  viewer.dispose();
}

window.addEventListener('beforeunload', teardown);
