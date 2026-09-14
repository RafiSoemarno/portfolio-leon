import * as THREE from 'three';

/**
 * Light rig for the viewer: one shadow-casting spotlight aimed at the model
 * plus a soft ambient fill. Values match the prototype exactly.
 *
 * Note: image-based lighting (`RoomEnvironment` + `PMREMGenerator`) and tone
 * mapping land in LEON-10; this task is a pure extraction, so the current
 * lighting semantics are preserved.
 */

export interface LightingRig {
  readonly spotlight: THREE.SpotLight;
  readonly ambient: THREE.AmbientLight;
  /** Detaches the lights from the scene and releases their GPU resources. */
  dispose(): void;
}

export function setupLighting(scene: THREE.Scene): LightingRig {
  // Spotlight
  const spotlight = new THREE.SpotLight(0xffffff, 100);
  spotlight.position.set(2, 5, 5);
  spotlight.angle = Math.PI / 4; // try values between Math.PI / 6 and Math.PI / 3
  spotlight.penumbra = 0.5; // adds a soft edge to the spotlight
  spotlight.castShadow = true;
  spotlight.shadow.mapSize.width = 2048;
  spotlight.shadow.mapSize.height = 2048;
  spotlight.shadow.camera.near = 1;
  spotlight.shadow.camera.far = 20;
  spotlight.target.position.set(0, 1, 0); // aim at the sphere

  // Ambient Light for soft illumination
  const ambient = new THREE.AmbientLight(0x404040);

  scene.add(spotlight.target, spotlight, ambient);

  let disposed = false;

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    scene.remove(spotlight.target, spotlight, ambient);
    spotlight.shadow.map?.dispose();
    spotlight.dispose();
    ambient.dispose();
  }

  return { spotlight, ambient, dispose };
}
