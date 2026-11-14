import * as THREE from '../vendor/three.module.js';

/* Fixed-camera weather. All mattes are authored in the original photograph's
 * coordinates, so object-fit: cover cannot detach the weather from the scene.
 * The photograph itself is never displaced or resampled at an animated UV. */

export function computePhotoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale);
  const y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

export const WEATHER_VERTEX_SHADER = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const NOISE = /* glsl */`
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise21(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), u.x), u.y);
  }
  float fbm(vec2 p) {
    float n = noise21(p) * 0.57;
    p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.07 + 6.4;
    n += noise21(p) * 0.28;
    p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.03 + 4.7;
    return n + noise21(p) * 0.15;
  }
`;

// Top-down source coordinates. The cabin roof, walls and nearer trunks block
// distant rain. A much smaller near layer can pass in front of the building.
export const CABIN_MASK_GLSL = /* glsl */`
  float edgeSide(vec2 p, vec2 a, vec2 b) {
    vec2 e = b - a;
    return (e.x * (p.y - a.y) - e.y * (p.x - a.x)) / length(e);
  }
  float triangleMatte(vec2 p, vec2 a, vec2 b, vec2 c) {
    float orientation = sign(edgeSide(c, a, b));
    float d = min(min(edgeSide(p, a, b), edgeSide(p, b, c)), edgeSide(p, c, a));
    if (orientation < 0.0) {
      d = min(min(-edgeSide(p, a, b), -edgeSide(p, b, c)), -edgeSide(p, c, a));
    }
    return smoothstep(-0.0018, 0.0018, d);
  }
  float cabinMatte(vec2 p) {
    vec2 a = vec2(0.077, 0.522), b = vec2(0.147, 0.443);
    vec2 c = vec2(0.912, 0.570), d = vec2(0.302, 0.545);
    float roof = max(triangleMatte(p, a, b, c), triangleMatte(p, a, c, d));
    vec2 e = vec2(0.165, 0.506), f = vec2(0.858, 0.569);
    vec2 g = vec2(0.858, 0.659), h = vec2(0.165, 0.666);
    float wall = max(triangleMatte(p, e, f, g), triangleMatte(p, e, g, h));
    return max(roof, wall);
  }
  float trunkMatte(vec2 p, vec2 a, vec2 b, float r0, float r1) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    float radius = mix(r0, r1, t);
    float d = length((p - a - t * ab) * vec2(1.0, 0.667));
    return 1.0 - smoothstep(radius - 0.001, radius + 0.002, d);
  }
  float trunksMatte(vec2 p) {
    float m = trunkMatte(p, vec2(0.954, -0.04), vec2(0.974, 0.575), 0.010, 0.018);
    m = max(m, trunkMatte(p, vec2(0.750, 0.03), vec2(0.768, 0.548), 0.008, 0.014));
    m = max(m, trunkMatte(p, vec2(0.442, 0.08), vec2(0.449, 0.499), 0.004, 0.009));
    m = max(m, trunkMatte(p, vec2(0.380, 0.16), vec2(0.389, 0.484), 0.003, 0.006));
    return m;
  }
`;

export const RAIN_VERTEX_SHADER = /* glsl */`
  attribute vec4 aSeed;
  attribute float aLayer;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vScreenUv;
  varying vec2 vDropUv;
  varying float vLayer;
  varying float vOpacity;
  void main() {
    float layer = aLayer;
    float speed = mix(0.36, 0.94, layer * 0.5) * mix(0.84, 1.16, aSeed.z);
    float lengthPx = mix(7.0, 29.0, layer * 0.5) * mix(0.75, 1.25, aSeed.w);
    float widthPx = mix(0.74, 1.9, layer * 0.5) * mix(0.8, 1.15, aSeed.z);
    float lean = 0.10 + 0.025 * sin(uTime * 0.18);
    vec2 centre = vec2(
      fract(aSeed.x + uTime * speed * lean / max(0.4, uResolution.x / uResolution.y)) * 1.12 - 0.06,
      fract(aSeed.y - uTime * speed) * 1.16 - 0.08
    );
    vec2 offset = vec2(position.x * widthPx - position.y * lengthPx * lean,
                       position.y * lengthPx) / uResolution;
    vScreenUv = centre + offset;
    vDropUv = uv;
    vLayer = layer;
    vOpacity = mix(0.16, 0.39, layer * 0.5) * mix(0.65, 1.0, aSeed.w);
    gl_Position = vec4(vScreenUv * 2.0 - 1.0, 0.5 - layer * 0.2, 1.0);
  }
`;

export const RAIN_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uTime;
  varying vec2 vScreenUv;
  varying vec2 vDropUv;
  varying float vLayer;
  varying float vOpacity;
  ${CABIN_MASK_GLSL}
  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    float cabin = cabinMatte(p), trees = trunksMatte(p);
    // Distant weather is behind the building. Middle drops are between the
    // building and foreground trees; only the sparse nearest layer crosses all.
    float occlusion = vLayer < 0.5 ? max(cabin, trees) :
                      (vLayer < 1.5 ? trees * 0.8 : 0.0);
    float ground = mix(0.675, 1.07, vLayer * 0.5);
    float landing = 1.0 - smoothstep(ground - 0.025, ground, p.y);
    float across = exp(-pow((vDropUv.x - 0.5) * 3.5, 2.0));
    float ends = smoothstep(0.0, 0.23, vDropUv.y) *
                 (1.0 - smoothstep(0.66, 1.0, vDropUv.y));
    float alpha = vOpacity * across * ends * (1.0 - occlusion) * landing;
    alpha *= smoothstep(0.0, 0.8, uTime);
    if (alpha < 0.002) discard;
    vec3 ambient = texture2D(uPhoto, sourceUv).rgb;
    float light = dot(ambient, vec3(0.2126, 0.7152, 0.0722));
    vec3 rain = mix(vec3(0.32, 0.40, 0.42), vec3(0.60, 0.67, 0.68), light);
    gl_FragColor = vec4(rain, alpha);
    #include <colorspace_fragment>
  }
`;

export const RAIN_MIST_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uTime;
  varying vec2 vScreenUv;
  ${NOISE}
  ${CABIN_MASK_GLSL}
  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    float band = smoothstep(0.19, 0.38, p.y) * (1.0 - smoothstep(0.56, 0.70, p.y));
    float mask = 1.0 - max(cabinMatte(p), trunksMatte(p));
    if (band * mask < 0.002) discard;
    float density = fbm(vec2(p.x * 6.8 - uTime * 0.027, p.y * 12.0 + uTime * 0.004));
    float alpha = band * mask * smoothstep(0.25, 0.75, density) * 0.13;
    alpha *= smoothstep(0.0, 1.5, uTime);
    vec3 ambient = texture2D(uPhoto, sourceUv).rgb;
    gl_FragColor = vec4(mix(ambient, vec3(0.42, 0.47, 0.43), 0.72), alpha);
    #include <colorspace_fragment>
  }
`;

export const CLOUD_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uTime;
  varying vec2 vScreenUv;
  ${NOISE}
  float terrainMatte(vec2 p, vec3 photoColor) {
    // Foreground ridge outline, authored against the source photo. Unlike the
    // old displacement mask, this has no oversized motion-protection margin.
    float ridge = mix(0.815, 0.775, clamp((p.x - 0.835) / 0.065, 0.0, 1.0));
    ridge = mix(ridge, 0.720, clamp((p.x - 0.90) / 0.10, 0.0, 1.0));
    float outline = smoothstep(0.828, 0.845, p.x) * smoothstep(ridge - 0.004, ridge + 0.004, p.y);
    // Fog already covers the foot of this ridge in the photograph. Stop the
    // matte there, rather than freezing all of the clouds below the summit.
    float foot = 1.0 - smoothstep(ridge + 0.055, ridge + 0.10, p.y);
    float rock = 1.0 - smoothstep(0.075, 0.16, dot(photoColor, vec3(0.2126, 0.7152, 0.0722)));
    return outline * foot * rock;
  }
  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    float distanceFade = smoothstep(0.573, 0.637, p.y);
    if (distanceFade < 0.002) discard;
    vec3 ambient = texture2D(uPhoto, sourceUv).rgb;
    float terrain = terrainMatte(p, ambient);
    if (distanceFade * (1.0 - terrain) < 0.002) discard;

    // Different scales advect at different speeds; domain warp changes the
    // billows rather than sliding or reversing an entire photographed layer.
    vec2 farP = vec2(p.x * 7.0 - uTime * 0.025, p.y * 23.0 + uTime * 0.004);
    float farShape = fbm(farP);
    float farLight = fbm(farP + vec2(-0.16, -0.11));
    float nearAmount = smoothstep(0.60, 0.88, p.y);
    vec2 nearP = vec2(p.x * 5.1 - uTime * 0.043, p.y * 13.2 + uTime * 0.007);
    nearP += vec2(farShape * 0.52, noise21(nearP * 0.7 + 4.1) * 0.24);
    float nearShape = fbm(nearP);
    float nearLight = fbm(nearP + vec2(-0.20, -0.15));
    float farDensity = smoothstep(0.29, 0.72, farShape);
    float nearDensity = smoothstep(0.31, 0.70, nearShape);
    float farAlpha = (0.10 + farDensity * 0.43) * mix(1.0, 0.72, nearAmount);
    float nearAlpha = (0.16 + nearDensity * 0.74) * nearAmount;
    float alpha = (1.0 - (1.0 - farAlpha) * (1.0 - nearAlpha));
    alpha *= distanceFade * (1.0 - terrain) * smoothstep(0.0, 1.3, uTime);

    // Match the cool shadow / warm upper-light palette of this photograph.
    // Photo sampling is stationary, used only for local ambient colour.
    float shadeFar = clamp(0.30 + farShape * 0.55 + (farShape - farLight) * 2.8, 0.10, 0.94);
    float shadeNear = clamp(0.26 + nearShape * 0.65 + (nearShape - nearLight) * 3.0, 0.07, 0.97);
    shadeNear += (noise21(nearP * 6.1) - 0.5) * 0.035;
    vec3 darkCloud = vec3(0.070, 0.130, 0.180);
    vec3 lightCloud = vec3(0.340, 0.430, 0.470);
    vec3 farColor = mix(darkCloud, lightCloud, shadeFar);
    vec3 nearColor = mix(darkCloud, lightCloud, shadeNear);
    float blend = nearAlpha / max(0.001, farAlpha + nearAlpha);
    vec3 cloud = mix(farColor, nearColor, blend);
    cloud = mix(cloud, ambient, 0.24);
    gl_FragColor = vec4(cloud, alpha);
    #include <colorspace_fragment>
  }
`;

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function rainGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // Near rain is deliberately sparse, allowing the cabin photograph to remain
  // readable. Most of the rainfall belongs to the forest behind the roof.
  const layers = [360, 168, 48];
  const total = layers.reduce((a, b) => a + b, 0);
  const seeds = new Float32Array(total * 4), depths = new Float32Array(total);
  const random = randomGenerator(82731);
  let index = 0;
  layers.forEach((count, layer) => {
    for (let i = 0; i < count; i++, index++) {
      seeds.set([random(), random(), random(), random()], index * 4);
      depths[index] = layer;
    }
  });
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute('aLayer', new THREE.InstancedBufferAttribute(depths, 1));
  geometry.instanceCount = total;
  return geometry;
}

function weatherMaterial(name, uniforms, vertexShader, fragmentShader) {
  const material = new THREE.ShaderMaterial({
    name, uniforms, vertexShader, fragmentShader,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.NormalBlending, toneMapped: false
  });
  return material;
}

/** photoTexture is injectable for deterministic native/offscreen rendering QA. */
export async function createWeatherScene({ id, width, height, photoUrl, photoTexture }) {
  if (id !== 'cabin' && id !== 'mountain') throw new Error('Unsupported weather scene: ' + id);
  const ownsPhoto = !photoTexture;
  const texture = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const sourceWidth = texture.image.naturalWidth || texture.image.width;
  const sourceHeight = texture.image.naturalHeight || texture.image.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    if (ownsPhoto) texture.dispose();
    throw new Error('Weather photograph has no dimensions');
  }
  const scene = new THREE.Scene();
  scene.name = id === 'cabin' ? 'Rain between forest layers' : 'Cloud sea behind the ridge';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
    uCover: { value: new THREE.Vector4(...computePhotoCover(width, height, sourceWidth, sourceHeight)) },
    uPhoto: { value: texture }
  };
  const geometries = [], materials = [];
  function add(geometry, material, order) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    scene.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    return mesh;
  }
  if (id === 'cabin') {
    add(new THREE.PlaneGeometry(2, 2), weatherMaterial('cabin-distant-haze', uniforms,
      WEATHER_VERTEX_SHADER, RAIN_MIST_FRAGMENT_SHADER), 0);
    add(rainGeometry(), weatherMaterial('cabin-depth-rain', uniforms,
      RAIN_VERTEX_SHADER, RAIN_FRAGMENT_SHADER), 1);
  } else {
    add(new THREE.PlaneGeometry(2, 2), weatherMaterial('mountain-layered-clouds', uniforms,
      WEATHER_VERTEX_SHADER, CLOUD_FRAGMENT_SHADER), 0);
  }
  let disposed = false;
  return {
    scene, camera,
    update(time) { if (!disposed) uniforms.uTime.value = time; },
    resize(nextWidth, nextHeight) {
      if (disposed) return;
      uniforms.uResolution.value.set(nextWidth, nextHeight);
      uniforms.uCover.value.set(...computePhotoCover(nextWidth, nextHeight, sourceWidth, sourceHeight));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      if (ownsPhoto) texture.dispose();
      scene.clear();
    }
  };
}
