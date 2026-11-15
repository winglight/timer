import * as THREE from '../vendor/three.module.js';
import { computePhotoCover } from './weather.js';

// Measured in the natural-fire photograph, from its top-left corner. All wood,
// stone and furniture retain their photographed shape and source coordinates.
export const HEARTH_LAYOUT = {
  opening: [0.367, 0.357, 0.629, 0.708],
  fire: [0.497, 0.622, 0.072, 0.145],
  flameBounds: [0.442, 0.481, 0.535, 0.628],
  // The upper edge of the diagonal log: left x/y, right x/y.
  fuelEdge: [0.413, 0.632, 0.558, 0.565]
};

function scalarNoise(position, seed) {
  const cell = Math.floor(position), f = position - cell;
  const hash = value => {
    const n = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const blend = f * f * (3 - 2 * f);
  return hash(cell) * (1 - blend) + hash(cell + 1) * blend;
}

/** Small continuous changes; the photographed fire is already fully present. */
export function firelightAt(time) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  return [
    0.95 + scalarNoise(t * 1.41, 2.3) * 0.09 + scalarNoise(t * 6.7, 9.1) * 0.04,
    (scalarNoise(t * 1.73, 4.7) - 0.5) * 0.0048,
    (scalarNoise(t * 2.11, 7.2) - 0.5) * 0.0032
  ];
}

export const HEARTH_VERTEX_SHADER = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const HEARTH_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uTime;
  uniform vec3 uFireLight;
  uniform vec4 uOpening;
  uniform vec4 uFire;
  uniform vec4 uFlameBounds;
  uniform vec4 uFuelEdge;
  uniform vec2 uPhotoTexel;
  varying vec2 vScreenUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float smoothNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
  }
  float ellipse(vec2 p, vec2 centre, vec2 radii) {
    vec2 q = (p - centre) / radii;
    return exp(-dot(q, q) * 2.0);
  }
  float boxMask(vec2 p, vec4 bounds, float feather) {
    return smoothstep(bounds.x - feather, bounds.x + feather, p.x) *
      (1.0 - smoothstep(bounds.z - feather, bounds.z + feather, p.x)) *
      smoothstep(bounds.y - feather, bounds.y + feather, p.y) *
      (1.0 - smoothstep(bounds.w - feather, bounds.w + feather, p.y));
  }
  float fuelTop(float x) {
    return mix(uFuelEdge.y, uFuelEdge.w,
      clamp((x - uFuelEdge.x) / (uFuelEdge.z - uFuelEdge.x), 0.0, 1.0));
  }
  float motionArea(vec2 p) {
    // A margin above the real wood prevents either side of the lookup from
    // moving a log edge. Foreground fire among the logs only changes brightness.
    float aboveWood = 1.0 - smoothstep(fuelTop(p.x) - 0.009, fuelTop(p.x) - 0.005, p.y);
    return boxMask(p, uFlameBounds, 0.004) * aboveWood;
  }
  float flameKey(vec3 color) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float warm = smoothstep(0.045, 0.16, color.r - color.b);
    float yellow = smoothstep(0.065, 0.20, color.g);
    return max(warm * yellow * smoothstep(0.075, 0.19, luminance),
               smoothstep(0.60, 0.84, luminance));
  }
  vec3 photoAt(vec2 p) {
    return texture2D(uPhoto, vec2(p.x, 1.0 - p.y)).rgb;
  }
  float floorShadowArea(vec2 p) {
    // Small patches of visible floor beside the chair/table feet. These bounds
    // select existing photograph shadows; they never define a shadow silhouette.
    // Keep a clear margin around legs, chair rails, rug, basket and fireplace.
    float left = max(boxMask(p, vec4(0.013, 0.900, 0.079, 0.982), 0.005),
                     boxMask(p, vec4(0.137, 0.906, 0.181, 0.992), 0.005));
    float right = max(boxMask(p, vec4(0.845, 0.910, 0.871, 0.985), 0.005),
                      boxMask(p, vec4(0.917, 0.925, 0.963, 0.992), 0.005));
    return max(left, right);
  }
  float photographedSoftShadow(vec2 p) {
    // Reuse the photo's existing mip chain: two low-frequency samples only in
    // the small floor patches, with no per-pixel blur loop or extra texture.
    vec3 lowFrequency = textureLod(uPhoto, vec2(p.x, 1.0 - p.y), 4.3).rgb;
    float luminance = dot(lowFrequency, vec3(0.2126, 0.7152, 0.0722));
    return 1.0 - smoothstep(0.012, 0.075, luminance);
  }

  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    vec3 original = texture2D(uPhoto, sourceUv).rgb;
    vec3 color = original;
    float movable = motionArea(p);

    if (movable > 0.001) {
      float rise = clamp((fuelTop(p.x) - p.y) / 0.128, 0.0, 1.0);
      float travel = smoothNoise(vec2(rise * 3.7 - uTime * 1.24, p.x * 31.0));
      float fine = smoothNoise(vec2(p.x * 143.0, p.y * 159.0 + uTime * 1.63));
      float heightPulse = smoothNoise(vec2(p.x * 57.0, uTime * 1.11 + 5.3));
      vec2 flow = vec2(
        (travel - 0.5) * 0.0044 + (fine - 0.5) * 0.0010 + uFireLight.y * 0.32,
        (heightPulse - 0.5) * 0.0034 + uFireLight.z * 0.28
      ) * (0.20 + rise * 0.80) * movable;
      vec2 movingP = p + flow;
      vec3 moved = photoAt(movingP);
      float flame = max(flameKey(original), flameKey(moved));
      // Replace the existing flame sample once. There is no second flame layer,
      // added flame geometry or additive sprite left over the original picture.
      float replace = smoothstep(0.025, 0.18, flame) * movable * motionArea(movingP);
      color = mix(original, moved, replace);
    }

    float opening = boxMask(p, uOpening, 0.004);
    float fireRegion = boxMask(p, vec4(0.441, 0.482, 0.580, 0.687), 0.006);
    float photographedFlame = flameKey(color) * fireRegion;
    float variation = uFireLight.x - 1.0;
    // Preserve the photograph's exposure, colours, ember cracks and real bark.
    // The subtle modulation follows the bright fire; it does not paint over logs.
    color *= 1.0 + photographedFlame * variation * 0.85;

    vec2 light = vec2(uFire.x + uFireLight.y, uFire.y - 0.018 + uFireLight.z);
    float wall = ellipse(p, light - vec2(0.0, 0.12), vec2(0.57, 0.43));
    float floor = ellipse(p, vec2(light.x, 0.85), vec2(0.42, 0.21)) * smoothstep(0.71, 0.79, p.y);
    float reflected = (wall * 0.43 + floor * 0.64) * (1.0 - opening);
    vec3 warmth = vec3(1.0, 0.64, 0.35);
    color *= vec3(1.0) + warmth * reflected * variation * 1.35;

    float shadowArea = floorShadowArea(p);
    if (shadowArea > 0.001) {
      vec2 motion = uFireLight.yz / vec2(0.0024, 0.0016);
      motion *= 3.5 / max(1.0, length(motion));
      vec2 offset = motion * uPhotoTexel;
      float restingShadow = photographedSoftShadow(p);
      float movedShadow = photographedSoftShadow(p + offset);
      // Move only the soft illumination boundary by at most 3.5 source pixels.
      // Positive/negative differences preserve the original exposure; the fixed
      // colour sample above keeps all floor grain and furniture stationary.
      float difference = clamp((movedShadow - restingShadow) * 0.34, -0.016, 0.016);
      color *= 1.0 - difference * shadowArea;
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Borrowed photoTexture is never disposed; production owns its loaded photo. */
export async function createHearthScene({ width, height, photoUrl, photoTexture }) {
  const ownsPhoto = !photoTexture;
  const texture = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
  const sourceWidth = texture.image?.naturalWidth || texture.image?.width;
  const sourceHeight = texture.image?.naturalHeight || texture.image?.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    if (ownsPhoto) texture.dispose();
    throw new Error('Hearth photograph has no dimensions');
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const scene = new THREE.Scene();
  scene.name = 'Natural wood fire with gentle photographic flame motion';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uPhoto: { value: texture },
    uCover: { value: new THREE.Vector4(...computePhotoCover(width, height, sourceWidth, sourceHeight)) },
    uTime: { value: 0 },
    uFireLight: { value: new THREE.Vector3(...firelightAt(0)) },
    uOpening: { value: new THREE.Vector4(...HEARTH_LAYOUT.opening) },
    uFire: { value: new THREE.Vector4(...HEARTH_LAYOUT.fire) },
    uFlameBounds: { value: new THREE.Vector4(...HEARTH_LAYOUT.flameBounds) },
    uFuelEdge: { value: new THREE.Vector4(...HEARTH_LAYOUT.fuelEdge) },
    uPhotoTexel: { value: new THREE.Vector2(1 / sourceWidth, 1 / sourceHeight) }
  };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    name: 'hearth-photographic-flame-motion', uniforms,
    vertexShader: HEARTH_VERTEX_SHADER, fragmentShader: HEARTH_FRAGMENT_SHADER,
    depthTest: false, depthWrite: false, toneMapped: false
  });
  const interior = new THREE.Mesh(geometry, material);
  interior.frustumCulled = false;
  scene.add(interior);
  let disposed = false;
  return {
    scene, camera,
    update(time) {
      if (disposed) return;
      const t = Number.isFinite(time) ? Math.max(0, time) : 0;
      uniforms.uTime.value = t;
      uniforms.uFireLight.value.set(...firelightAt(t));
    },
    resize(nextWidth, nextHeight) {
      if (!disposed) uniforms.uCover.value.set(...computePhotoCover(nextWidth, nextHeight, sourceWidth, sourceHeight));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      if (ownsPhoto) texture.dispose();
      scene.clear();
    }
  };
}
