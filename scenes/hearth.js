import * as THREE from '../vendor/three.module.js';
import { computePhotoCover } from './weather.js';

// Measured in the lively-fire photograph, from its top-left corner. Fuel and
// surrounding room geometry retain their photographed source coordinates.
export const HEARTH_LAYOUT = {
  opening: [0.358, 0.346, 0.641, 0.710],
  fire: [0.501, 0.627, 0.115, 0.250],
  flameBounds: [0.388, 0.360, 0.610, 0.675],
  // Upper wood envelope, including the central upright charred piece. Flame
  // pixels among/below these smaller split logs only change brightness.
  fuelContour: [[0.391, 0.655], [0.497, 0.612], [0.515, 0.587],
    [0.534, 0.591], [0.563, 0.628], [0.616, 0.666]]
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

/** Visible but continuous firelight variation; no frame-based random flashes. */
export function firelightAt(time) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  return [
    0.72 + scalarNoise(t * 0.91, 2.3) * 0.40 + scalarNoise(t * 3.7, 9.1) * 0.19,
    (scalarNoise(t * 1.21, 4.7) - 0.5) * 0.024 + (scalarNoise(t * 3.3, 1.8) - 0.5) * 0.004,
    (scalarNoise(t * 1.57, 7.2) - 0.5) * 0.014
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
  uniform vec2 uFuelContour[6];
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
    float edge = uFuelContour[0].y;
    for (int i = 0; i < 5; i++) {
      if (x >= uFuelContour[i].x) {
        edge = mix(uFuelContour[i].y, uFuelContour[i + 1].y,
          clamp((x - uFuelContour[i].x) / (uFuelContour[i + 1].x - uFuelContour[i].x), 0.0, 1.0));
      }
    }
    return edge;
  }
  float motionArea(vec2 p) {
    // A margin above the real wood prevents either side of the lookup from
    // moving a log edge. Foreground fire among the logs only changes brightness.
    float aboveWood = 1.0 - smoothstep(fuelTop(p.x) - 0.009, fuelTop(p.x) - 0.005, p.y);
    return boxMask(p, uFlameBounds, 0.004) * aboveWood;
  }
  float flameKey(vec3 color) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    // Include translucent orange edges in the light modulation, not only cores.
    float warm = smoothstep(0.006, 0.040, color.r - color.b);
    return max(warm * smoothstep(0.004, 0.040, luminance),
               smoothstep(0.60, 0.84, luminance));
  }
  vec3 photoAt(vec2 p) {
    return texture2D(uPhoto, vec2(p.x, 1.0 - p.y)).rgb;
  }
  float floorShadowArea(vec2 p) {
    // Visible floor beside the chair/table feet. These bounds
    // select existing photograph shadows; they never define a shadow silhouette.
    // Keep a clear margin around legs, chair rails, rug, basket and fireplace.
    float left = boxMask(p, vec4(0.079, 0.911, 0.205, 0.992), 0.010);
    float right = boxMask(p, vec4(0.842, 0.925, 0.985, 0.992), 0.010);
    // The hearth's existing soft floor shadow is also visible in portrait crop.
    float hearth = boxMask(p, vec4(0.282, 0.824, 0.735, 0.864), 0.007);
    return max(max(left, right), hearth);
  }
  float photographedSoftShadow(vec2 p) {
    // Reuse the photo's existing mip chain: two low-frequency samples only in
    // the small floor patches, with no per-pixel blur loop or extra texture.
    vec3 lowFrequency = textureLod(uPhoto, vec2(p.x, 1.0 - p.y), 3.6).rgb;
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
      float anchor = fuelTop(p.x) - 0.010;
      float flameHeight = max(0.08, anchor - uFlameBounds.y);
      float rise = clamp((anchor - p.y) / flameHeight, 0.0, 1.2);
      // Separate tongues evolve at different rates. Turbulence travels upwards;
      // the flame tips bend and rise instead of shifting as one solid cut-out.
      float travel = smoothNoise(vec2(p.x * 37.0, rise * 4.2 - uTime * 2.5));
      float curl = smoothNoise(vec2(p.x * 85.0 + rise * 1.8, rise * 8.0 - uTime * 4.2));
      float heightPulse = smoothNoise(vec2(p.x * 51.0 + 8.3, uTime * 1.85));
      float heightScale = 0.80 + heightPulse * 0.42;
      float rootLock = smoothstep(0.0, 0.22, rise);
      float topRoom = smoothstep(uOpening.y + 0.012, uOpening.y + 0.045, p.y);
      vec2 movingP = p;
      movingP.y = mix(p.y, anchor - (anchor - p.y) / heightScale, rootLock * movable * topRoom);
      movingP.x += ((travel - 0.5) * 0.026 + (curl - 0.5) * 0.010 +
        uFireLight.y * 0.25) * pow(clamp(rise, 0.0, 1.0), 0.72) * movable;
      vec3 moved = photoAt(movingP);
      // Replace the entire safe firebox sample, including dim translucent tips
      // and their dark background. A colour-key blend leaves an unmoving orange
      // silhouette behind its displaced yellow core. The dark firebox receives
      // only the associated heat shimmer; the wood and room stay outside it.
      float replace = movable * motionArea(movingP);
      color = mix(original, moved, replace);
    }

    float opening = boxMask(p, uOpening, 0.004);
    float fireRegion = boxMask(p, vec4(uFlameBounds.xy - vec2(0.012),
      uFlameBounds.z + 0.020, uOpening.w - 0.015), 0.006);
    float photographedFlame = flameKey(color) * fireRegion;
    float variation = uFireLight.x - 1.0;
    // The luminous pixels change as individual tongues rise through the image.
    // Solid wood retains its original sampled coordinates and photographed bark.
    float localFlicker = smoothNoise(vec2(p.x * 91.0, p.y * 79.0 + uTime * 4.5)) - 0.5;
    color *= 1.0 + photographedFlame * (variation * 0.60 + localFlicker * 0.38);

    vec2 light = vec2(uFire.x + uFireLight.y, uFire.y - 0.018 + uFireLight.z);
    float wall = ellipse(p, light - vec2(0.0, 0.11), vec2(0.62, 0.48));
    float floor = ellipse(p, vec2(light.x, 0.86), vec2(0.55, 0.25)) * smoothstep(0.71, 0.79, p.y);
    float stone = ellipse(p, light, vec2(0.28, 0.28));
    float outdoors = boxMask(p, vec4(0.048, 0.072, 0.186, 0.405), 0.012);
    float reflected = (wall * 0.58 + floor * 0.96 + stone * 0.37) * (1.0 - opening) * (1.0 - outdoors);
    vec3 warmth = vec3(1.0, 0.70, 0.39);
    color *= vec3(1.0) + warmth * reflected * variation * 2.15;

    float shadowArea = floorShadowArea(p);
    if (shadowArea > 0.001) {
      vec2 motion = uFireLight.yz / vec2(0.014, 0.007);
      motion *= 18.0 / max(1.0, length(motion));
      vec2 offset = motion * uPhotoTexel;
      float restingShadow = photographedSoftShadow(p);
      float movedShadow = photographedSoftShadow(p + offset);
      // Move only the soft illumination boundary by at most 18 source pixels.
      // Positive/negative differences preserve the original exposure; the fixed
      // colour sample above keeps all floor grain and furniture stationary.
      float difference = clamp((movedShadow - restingShadow) * 0.90, -0.16, 0.16);
      color *= 1.0 - difference * shadowArea * floorShadowArea(p + offset);
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
  scene.name = 'Lively photographic wood fire with moving reflected light';
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
    uFuelContour: { value: HEARTH_LAYOUT.fuelContour.map(point => new THREE.Vector2(...point)) },
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
