import * as THREE from '../vendor/three.module.js';
import { computePhotoCover } from './weather.js';

// Every coordinate below is in the original interior photograph, measured
// from its top-left corner. The camera and photographed wood grain never move.
// The fireplace remains centred when object-fit: cover crops a portrait view.
export const HEARTH_LAYOUT = {
  opening: [0.367, 0.357, 0.629, 0.687],
  fire: [0.497, 0.643, 0.101, 0.257],
  logs: [
    [0.412, 0.651, 0.576, 0.641, 0.022],
    [0.431, 0.617, 0.548, 0.597, 0.019],
    [0.455, 0.660, 0.551, 0.661, 0.020]
  ],
  // Floor contacts; projected shadows keep these points anchored.
  feet: [[0.111, 0.968], [0.245, 0.886], [0.888, 0.895], [0.978, 0.989]]
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

/** One continuous fire drives the flame, embers, room light and cast shadows. */
export function firelightAt(time) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const slow = scalarNoise(t * 1.41, 2.3);
  const fast = scalarNoise(t * 8.7, 9.1);
  return [
    0.42 + slow * 0.90 + fast * 0.24,
    (scalarNoise(t * 1.73, 4.7) - 0.5) * 0.014,
    (scalarNoise(t * 2.11, 7.2) - 0.5) * 0.017
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
  uniform vec4 uLogEnds[3];
  uniform vec3 uLogRadii;
  uniform vec2 uFeet[4];
  varying vec2 vScreenUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    float n = noise(p) * 0.57;
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.09 + 6.7;
    n += noise(p) * 0.28;
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 3.1;
    return n + noise(p) * 0.15;
  }
  float hearthNoise3(vec3 p) {
    float layer = floor(p.z), f = fract(p.z);
    f = f * f * (3.0 - 2.0 * f);
    return mix(noise(p.xy + layer * vec2(37.0, 17.0)),
               noise(p.xy + (layer + 1.0) * vec2(37.0, 17.0)), f);
  }
  float volumeNoise(vec3 p) {
    float n = hearthNoise3(p) * 0.58;
    p = mat3(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64) * p * 2.02 + 7.1;
    n += hearthNoise3(p) * 0.28;
    p = p * 2.07 + vec3(11.3, 6.1, 9.8);
    return n + hearthNoise3(p) * 0.14;
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
  vec2 logCoordinates(vec2 p, vec4 ends) {
    vec2 span = ends.zw - ends.xy;
    float along = dot(p - ends.xy, span) / dot(span, span);
    float across = dot(p - mix(ends.xy, ends.zw, along), normalize(vec2(-span.y, span.x)));
    return vec2(along, across);
  }
  float logMask(vec2 q, float radius) {
    float end = smoothstep(0.015, 0.13, q.x) * (1.0 - smoothstep(0.87, 0.995, q.x));
    float roughEdge = radius * (0.78 + noise(vec2(q.x * 33.0, 6.4)) * 0.22);
    return (1.0 - smoothstep(roughEdge * 0.70, roughEdge * 1.08, abs(q.y))) * end;
  }
  float fracture(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    float first = 9.0, second = 9.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 jitter = vec2(hash21(cell + offset), hash21(cell + offset + 19.37));
        vec2 d = offset + jitter - f;
        float cellDistance = dot(d, d);
        if (cellDistance < first) { second = first; first = cellDistance; }
        else second = min(second, cellDistance);
      }
    }
    return 1.0 - smoothstep(0.012, 0.068, sqrt(second) - sqrt(first));
  }

  // Heat follows the irregular photographed bark and split grain. A broken
  // Voronoi network gives thin ember fissures without a repeating wire grid.
  vec3 burningWood(vec2 p, vec3 photograph, out float occlusion) {
    vec3 heat = vec3(0.0);
    occlusion = 0.0;
    float luminance = dot(photograph, vec3(0.2126, 0.7152, 0.0722));
    float wood = smoothstep(0.0025, 0.014, luminance);
    float bark = (1.0 - smoothstep(0.016, 0.080, luminance)) * wood;
    for (int i = 0; i < 3; i++) {
      float radius = i == 0 ? uLogRadii.x : (i == 1 ? uLogRadii.y : uLogRadii.z);
      vec2 q = logCoordinates(p, uLogEnds[i]);
      float silhouette = logMask(q, radius * 1.18);
      float mask = logMask(q, radius) * wood;
      occlusion = max(occlusion, silhouette);
      if (mask > 0.001) {
        float seed = float(i) * 14.23;
        float row = q.y / radius;
        vec2 grainP = vec2(q.x * 17.0, row * 2.3 + seed);
        grainP += vec2(noise(grainP * 0.61 + 3.0), noise(grainP * 0.71 + 7.0)) * 0.9;
        float cracks = fracture(grainP) * smoothstep(0.34, 0.66, noise(grainP * 0.8 + seed));
        float hotPatch = smoothstep(0.30, 0.78, fbm(grainP * 0.65));
        float glow = (0.65 + 0.35 * noise(vec2(q.x * 8.0 - uTime * 0.14, row + seed))) *
          (0.76 + uFireLight.x * 0.31);
        heat += mask * glow * (vec3(0.13, 0.005, 0.0004) * hotPatch * bark +
          vec3(0.59, 0.061, 0.002) * cracks * (0.22 + bark * 0.78));
      }
    }
    return heat;
  }

  // Integrate a turbulent flame volume through depth. Density breaks apart as
  // it rises, forming transparent gaps and wispy tips instead of solid tongues.
  vec3 fireEmission(vec2 p) {
    vec2 q = vec2((p.x - uFire.x) / uFire.z, (uFire.y - p.y) / uFire.w);
    if (q.y < -0.05 || q.y > 1.18 || abs(q.x) > 1.3) return vec3(0.0);
    float y = max(0.0, q.y);
    float strength = 0.82 + uFireLight.x * 0.18;
    float rise = uTime * 1.85;
    float bend = (noise(vec2(y * 2.3 - uTime * 0.95, 3.7)) - 0.5) * y * 0.42;
    bend += uFireLight.y * 13.0 * y;
    float radius = 0.91 * pow(max(0.0, 1.0 - y / strength), 0.58);
    float baseFade = smoothstep(-0.035, 0.04, q.y);
    float transmittance = 1.0;
    vec3 emission = vec3(0.0);
    for (int sampleIndex = 0; sampleIndex < 12; sampleIndex++) {
      float z = (float(sampleIndex) + 0.5) / 6.0 - 1.0;
      vec3 v = vec3((q.x + bend) * 3.2, y * 4.6 - rise, z * 2.7);
      vec2 warp = vec2(hearthNoise3(v * 0.71 + 7.2), hearthNoise3(v * 0.83 + 19.1)) - 0.5;
      float body = volumeNoise(v + vec3(warp * 1.65, 0.0));
      float fine = hearthNoise3(v * 3.1 + vec3(0.0, -uTime * 0.63, 5.1));
      float contour = radius - abs(q.x + bend + warp.x * y * 0.25) - z * z * 0.36;
      float field = contour * 0.57 + (body - 0.56) * 1.21 + (fine - 0.5) * 0.12;
      float density = smoothstep(0.015, 0.16, field) * max(0.0, field) * baseFade;
      density *= 1.0 - smoothstep(0.90, 1.13, y);
      float opacity = 1.0 - exp(-density * 0.73);
      float hot = clamp(density * 1.85 + (1.0 - y) * 0.21 - 0.12, 0.0, 1.0);
      vec3 temperature = mix(vec3(1.0, 0.105, 0.002), vec3(1.0, 0.72, 0.20), hot);
      temperature = mix(temperature, vec3(1.0, 0.94, 0.63), smoothstep(0.66, 0.95, hot) * 0.58);
      emission += transmittance * opacity * temperature * 2.7;
      transmittance *= 1.0 - opacity;
    }
    return emission;
  }

  float castFloorShadow(vec2 p, vec2 contact, vec2 light, float width) {
    vec2 end = contact + (contact - light) * 3.6;
    vec2 span = end - contact;
    float t = clamp(dot(p - contact, span) / dot(span, span), 0.0, 1.0);
    float shadowDistance = length(p - mix(contact, end, t));
    float r = width * (1.0 + t * 3.2);
    float softness = 0.002 + t * 0.016;
    return (1.0 - smoothstep(r, r + softness, shadowDistance)) *
      smoothstep(-0.002, 0.018, dot(p - contact, normalize(span))) * (1.0 - t * 0.65);
  }

  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    // Stationary sample: shadows and light move over the furniture; no UV
    // displacement can bend the walls, table, chair or source photograph.
    vec3 photo = texture2D(uPhoto, sourceUv).rgb;
    float opening = boxMask(p, uOpening, 0.002);
    vec2 light = vec2(uFire.x + uFireLight.y, uFire.y - 0.064 + uFireLight.z);

    float wallGlow = ellipse(p, light - vec2(0.0, 0.19), vec2(0.49, 0.46));
    float nearHearth = ellipse(p, light, vec2(0.24, 0.28));
    float floorGlow = ellipse(p, vec2(light.x + uFireLight.y, 0.89), vec2(0.41, 0.24));
    floorGlow *= smoothstep(0.71, 0.81, p.y);
    float illumination = wallGlow * 0.29 + nearHearth * 0.45 + floorGlow * 0.31;
    illumination *= 0.63 + uFireLight.x * 0.52;

    float shadows = 0.0;
    for (int i = 0; i < 4; i++) {
      shadows = max(shadows, castFloorShadow(p, uFeet[i], light, 0.006));
    }
    shadows *= smoothstep(0.75, 0.83, p.y);
    // A broad softened furniture silhouette receives the same moving source.
    // It is restrained, so wood texture and existing contact shadows stay legible.
    vec2 wallShadowP = p + vec2(uFireLight.y * 2.4, uFireLight.z * 1.2);
    float leftWallShadow = ellipse(wallShadowP, vec2(0.156, 0.505), vec2(0.082, 0.214));
    float rightWallShadow = ellipse(wallShadowP, vec2(0.842, 0.564), vec2(0.067, 0.173));
    float wallShadows = (leftWallShadow + rightWallShadow) * 0.23;

    vec3 reflected = vec3(1.0, 0.39, 0.11);
    vec3 color = photo * (0.79 + reflected * illumination * (0.2 + uFireLight.x * 2.3));
    color += reflected * illumination * 0.014 * (0.3 + uFireLight.x * 0.7);
    color *= 1.0 - shadows * 0.43 - wallShadows;

    if (opening > 0.001) {
      float logOcclusion;
      vec3 embers = burningWood(p, photo, logOcclusion);
      vec3 fire = fireEmission(p) * (1.0 - logOcclusion * 0.98);
      float coalBed = ellipse(p, vec2(uFire.x, uFire.y + 0.021), vec2(uFire.z, 0.018));
      float coalGrain = noise(p * vec2(265.0, 410.0));
      vec3 coals = vec3(0.16, 0.007, 0.0004) * coalBed *
        smoothstep(0.43, 0.81, coalGrain) * (0.68 + uFireLight.x * 0.51);
      vec3 emission = fire + embers + coals;
      // Local exposure compression keeps the yellow-white flame core detailed.
      vec3 fireColor = vec3(1.0) - exp(-emission);
      color = color + fireColor * opening * (vec3(1.0) - min(color, vec3(1.0)));

      // A few short-lived sparks rise only inside the chimney aperture.
      for (int i = 0; i < 5; i++) {
        float seed = float(i) * 12.47;
        float cycle = uTime * (0.14 + float(i) * 0.013) + seed;
        float age = fract(cycle), event = floor(cycle);
        float x = uFire.x + (hash21(vec2(event, seed)) - 0.5) * uFire.z * 1.16;
        x += sin(age * 7.0 + seed) * age * 0.009;
        float y = uFire.y - age * uFire.w * 1.06;
        float sparkle = ellipse(p, vec2(x, y), vec2(0.0007, 0.0025));
        sparkle *= smoothstep(0.02, 0.15, age) * (1.0 - smoothstep(0.45, 0.86, age));
        color += vec3(0.82, 0.29, 0.018) * sparkle * opening;
      }
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
  scene.name = 'Woodland hearth with live fire, coals and reflected firelight';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uPhoto: { value: texture },
    uCover: { value: new THREE.Vector4(...computePhotoCover(width, height, sourceWidth, sourceHeight)) },
    uTime: { value: 0 },
    uFireLight: { value: new THREE.Vector3(...firelightAt(0)) },
    uOpening: { value: new THREE.Vector4(...HEARTH_LAYOUT.opening) },
    uFire: { value: new THREE.Vector4(...HEARTH_LAYOUT.fire) },
    uLogEnds: { value: HEARTH_LAYOUT.logs.map(log => new THREE.Vector4(...log.slice(0, 4))) },
    uLogRadii: { value: new THREE.Vector3(...HEARTH_LAYOUT.logs.map(log => log[4])) },
    uFeet: { value: HEARTH_LAYOUT.feet.map(foot => new THREE.Vector2(...foot)) }
  };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    name: 'hearth-fire-and-coherent-room-light', uniforms,
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
