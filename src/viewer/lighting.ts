import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Light rig for the viewer.
 *
 * - Image-based lighting: a `RoomEnvironment` scene is baked once through
 *   `PMREMGenerator` and assigned to `scene.environment`, so PBR surfaces
 *   (`MeshStandardMaterial`) receive soft, direction-varying fill instead of
 *   relying on a single hard key. Zero download (~0 payload); swapping in a
 *   real HDR later only changes the source handed to `PMREMGenerator`.
 * - One shadow-casting spotlight stays as the key light for shape/shadowing.
 * - A dim ambient floor keeps unlit sides from going fully black.
 *
 * Tone mapping (ACES) + sRGB output live on the renderer in `createViewer.ts`;
 * the light intensities here are chosen to sit under that curve.
 */

export interface LightingRig {
  readonly spotlight: THREE.SpotLight;
  readonly ambient: THREE.AmbientLight;
  /** Baked PMREM environment map assigned to `scene.environment`. */
  readonly environment: THREE.Texture;
  /** Detaches the lights/env and releases their GPU resources. Idempotent. */
  dispose(): void;
}

export interface LightingOptions {
  /**
   * World-space point the key light aims at. Pages pass the loaded model's
   * position so the cone/stem stay centred on the subject.
   */
  target?: [number, number, number];
}

/** Full-resolution shadow map edge; halved on small/low-power devices. */
const SHADOW_MAP_SIZE = 2048;
const SHADOW_MAP_SIZE_LOW = 1024;

/** Small viewport, few CPU cores or a coarse pointer all mean "scale back". */
function prefersLowShadowBudget(): boolean {
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 640;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  return smallViewport || fewCores || coarsePointer;
}

export function setupLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  options: LightingOptions = {}
): LightingRig {
  // --- Image-based lighting ------------------------------------------------
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  // The render target owns the PMREM texture; keep it so `dispose()` can free
  // the GPU allocation, not just detach the texture from the scene.
  const envRenderTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = 1;

  // --- Key light -----------------------------------------------------------
  // Intensity is in candela and three uses physically-correct inverse-square
  // falloff, so a key ~4.5 units from a mid-grey model needs ~10x the old
  // prototype value to sit in the upper half of the ACES curve instead of
  // reading as a black silhouette.
  const spotlight = new THREE.SpotLight(0xffffff, 120);
  spotlight.position.set(2, 5, 5);
  spotlight.angle = Math.PI / 4; // try values between Math.PI / 6 and Math.PI / 3
  spotlight.penumbra = 0.5; // adds a soft edge to the spotlight
  spotlight.castShadow = true;
  const shadowMapSize = prefersLowShadowBudget() ? SHADOW_MAP_SIZE_LOW : SHADOW_MAP_SIZE;
  spotlight.shadow.mapSize.width = shadowMapSize;
  spotlight.shadow.mapSize.height = shadowMapSize;
  spotlight.shadow.camera.near = 1;
  spotlight.shadow.camera.far = 20;
  spotlight.target.position.set(...(options.target ?? [0, 1, 0])); // aim at the model

  // Soft ambient floor so shadowed surfaces still read (the IBL above only
  // lights PBR materials; this keeps legacy FBX materials from going black).
  const ambient = new THREE.AmbientLight(0x404040, 1.2);

  scene.add(spotlight.target, spotlight, ambient);

  let disposed = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    // Detach before freeing so nothing samples a disposed texture.
    if (scene.environment === envRenderTarget.texture) {
      scene.environment = null;
    }

    scene.remove(spotlight.target, spotlight, ambient);
    spotlight.shadow.map?.dispose();
    spotlight.dispose();
    ambient.dispose();

    envRenderTarget.dispose();
    pmremGenerator.dispose();
    roomEnvironment.dispose();
  }

  return { spotlight, ambient, environment: envRenderTarget.texture, dispose };
}
