import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Owns the render loop and everything attached to the GL context: scene,
 * camera, renderer, input controls, resize handling and the canvas itself.
 *
 * Input is `OrbitControls`: touch/pen + mouse orbit, damping, pinch dolly and
 * wheel dolly (never FOV zoom — that distorts perspective with no dolly to
 * compensate).
 */

export interface Viewer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /**
   * Orbit controls bound to the canvas. Pages set `controls.target` to the
   * loaded model's position (and, later, per-model camera presets).
   */
  readonly controls: OrbitControls;
  /** Stops the loop, releases listeners and the GL context. Idempotent. */
  dispose(): void;
}

const MAX_DPR = 2;
const GROUND_SIZE = 1000;

/** Closest/farthest the camera may dolly to `controls.target`. */
const MIN_DISTANCE = 0.35;
const MAX_DISTANCE = 15;
const DAMPING_FACTOR = 0.08;

export function createViewer(container: HTMLElement = document.body): Viewer {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional for softer shadows
  container.appendChild(renderer.domElement);

  // Ground Plane — stage geometry belongs to the viewer (scene content), not to
  // the light rig, so it is created and disposed here.
  const groundGeometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const canvas = renderer.domElement;

  const controls = new OrbitControls(camera, canvas);
  // Damping/inertia: `controls.update()` must run every frame (see `animate`).
  controls.enableDamping = true;
  controls.dampingFactor = DAMPING_FACTOR;
  // Pinch/two-finger drag dollies + orbits around the target instead of the
  // default dolly+pan, which slides the model off-centre on small screens.
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  // Clamp the dolly range so the camera cannot enter the model or fly away.
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  // OrbitControls' `connect()` sets `canvas.style.touchAction = 'none'` (no page
  // scroll over the canvas) and consumes `wheel` with `preventDefault()`.

  // Handle resize
  function onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update camera
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
  }

  // Animation loop
  let frameId = 0;
  function animate(): void {
    frameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', onResize);
  frameId = requestAnimationFrame(animate);

  let disposed = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    cancelAnimationFrame(frameId);

    controls.dispose(); // releases pointer capture + its canvas/document listeners
    window.removeEventListener('resize', onResize);

    scene.remove(ground);
    groundGeometry.dispose();
    groundMaterial.dispose();

    renderer.dispose();
    renderer.forceContextLoss(); // free the GL context, not just the canvas
    canvas.remove();
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    dispose
  };
}
