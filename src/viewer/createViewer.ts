import * as THREE from 'three';

/**
 * Owns the render loop and everything attached to the GL context: scene,
 * camera, renderer, resize handling and the canvas itself.
 *
 * Input handling here (FOV wheel-zoom, pointer-drag rotation) is the prototype
 * behaviour, kept verbatim for a pure refactor. LEON-9 replaces it with
 * `OrbitControls`.
 */

export interface Viewer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /**
   * Object that the drag handler rotates. Pass the loaded model's root once it
   * is ready; pass `null` to detach.
   */
  setRotationTarget(target: THREE.Object3D | null): void;
  /** Stops the loop, releases listeners and the GL context. Idempotent. */
  dispose(): void;
}

const MIN_FOV = 20;
const MAX_FOV = 90;
const ZOOM_SPEED = 1;
const MAX_DPR = 2;
const ROTATION_SPEED = 0.005;
const GROUND_SIZE = 1000;

export function createViewer(container: HTMLElement = document.body): Viewer {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 1, 0); // Focus on the sphere

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

  let rotationTarget: THREE.Object3D | null = null;
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };

  // Scroll to zoom
  function onWheel(event: WheelEvent): void {
    event.preventDefault();

    const direction = event.deltaY > 0 ? -1 : 1;

    camera.fov -= direction * ZOOM_SPEED;

    // Clamp FOV to avoid distortion
    camera.fov = Math.max(MIN_FOV, Math.min(camera.fov, MAX_FOV));

    camera.updateProjectionMatrix(); // Needed to apply FOV changes
  }

  // Controls for rotating model
  function onMouseDown(event: MouseEvent): void {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };
  }

  function onMouseUp(): void {
    isDragging = false;
  }

  function onMouseMove(event: MouseEvent): void {
    if (!isDragging || !rotationTarget) return;

    const deltaMove = {
      x: event.clientX - previousMousePosition.x,
      y: event.clientY - previousMousePosition.y
    };

    rotationTarget.rotation.y += deltaMove.x * ROTATION_SPEED;
    rotationTarget.rotation.x += deltaMove.y * ROTATION_SPEED;

    previousMousePosition = { x: event.clientX, y: event.clientY };
  }

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
    renderer.render(scene, camera);
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onResize);
  frameId = requestAnimationFrame(animate);

  let disposed = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    cancelAnimationFrame(frameId);

    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);

    rotationTarget = null;
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
    setRotationTarget(target: THREE.Object3D | null): void {
      rotationTarget = target;
    },
    dispose
  };
}
