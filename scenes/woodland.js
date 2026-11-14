import * as THREE from '../vendor/three.module.js';

// The woodland photographs stay fixed. Mist uses source-image coordinates so
// the nearer trunks continue to occlude it when object-fit: cover crops a view.
const SCREEN_VERTEX = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const MIST_NOISE = /* glsl */`
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

export const FOREST_MASK_GLSL = /* glsl */`
  float trunk(vec2 p, vec2 a, vec2 b, float r0, float r1) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    float distanceToCentre = abs(p.x - mix(a.x, b.x, t));
    float radius = mix(r0, r1, t);
    float vertical = smoothstep(a.y - 0.005, a.y + 0.008, p.y) *
                     (1.0 - smoothstep(b.y - 0.075, b.y + 0.025, p.y));
    float feather = mix(0.0022, 0.0060, smoothstep(0.010, 0.030, radius));
    return (1.0 - smoothstep(radius - feather, radius + feather, distanceToCentre)) * vertical;
  }
  float nearTrunks(vec2 p) {
    float mask = trunk(p, vec2(0.028, -0.10), vec2(0.027, 1.07), 0.040, 0.042);
    mask = max(mask, trunk(p, vec2(0.198, -0.10), vec2(0.214, 0.715), 0.030, 0.023));
    mask = max(mask, trunk(p, vec2(0.877, -0.10), vec2(0.861, 0.775), 0.031, 0.026));
    return mask;
  }
  float middleTrunks(vec2 p) {
    float mask = trunk(p, vec2(0.515, 0.14), vec2(0.516, 0.752), 0.007, 0.011);
    mask = max(mask, trunk(p, vec2(0.770, -0.02), vec2(0.765, 0.570), 0.004, 0.006));
    mask = max(mask, trunk(p, vec2(0.447, 0.11), vec2(0.442, 0.608), 0.005, 0.006));
    mask = max(mask, trunk(p, vec2(0.278, 0.10), vec2(0.282, 0.645), 0.005, 0.006));
    return mask;
  }
`;

export const FOREST_MIST_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uTime;
  varying vec2 vScreenUv;
  ${MIST_NOISE}
  ${FOREST_MASK_GLSL}

  // A horizontal, advected density bank. Its upper and lower boundaries roll
  // at different rates, rather than moving the photograph or fading a sprite.
  float mistBank(vec2 p, float centre, float thickness, float speed, float seed) {
    float x = p.x - uTime * speed;
    float broad = noise21(vec2(x * 4.8 + seed, seed * 0.7));
    float crest = centre + (broad - 0.5) * 0.125 +
                  sin(x * 12.0 + seed + uTime * 0.12) * 0.013;
    float depth = (p.y - crest) / thickness;
    float envelope = exp(-depth * depth * 1.7);
    vec2 detail = vec2(x * 11.0, p.y * 29.0 + seed);
    detail.y += (broad - 0.5) * 1.1;
    float folds = fbm(detail);
    float density = smoothstep(0.21, 0.79, folds);
    return envelope * (0.20 + density * 0.80);
  }
  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    float vegetation = smoothstep(0.26, 0.42, p.y) * (1.0 - smoothstep(0.82, 0.98, p.y));
    if (vegetation < 0.002) discard;
    vec3 photo = texture2D(uPhoto, sourceUv).rgb;
    float trunkColour = 1.0 - smoothstep(0.035, 0.095, dot(photo, vec3(0.2126, 0.7152, 0.0722)));
    float nearMask = nearTrunks(p) * trunkColour;
    float middleMask = middleTrunks(p) * trunkColour;
    float far = mistBank(p, 0.505, 0.078, 0.0048, 2.8) * 0.54;
    far *= (1.0 - max(nearMask, middleMask));
    float mid = mistBank(p, 0.665, 0.060, 0.0075, 7.1) * 0.49;
    mid *= (1.0 - nearMask) * (1.0 - middleMask * 0.72);
    float near = mistBank(p, 0.808, 0.049, 0.0100, 13.4) * 0.29;
    near *= 1.0 - nearMask;
    // The clearing on the right is back-lit; dark foliage on the left admits
    // less light, so the same density does not become a flat white overlay.
    float light = smoothstep(0.22, 0.83, p.x) * (1.0 - smoothstep(0.80, 1.03, p.x));
    float alpha = (1.0 - (1.0 - far) * (1.0 - mid) * (1.0 - near));
    alpha *= vegetation * mix(0.70, 1.0, light) * smoothstep(0.0, 1.5, uTime);
    if (alpha < 0.002) discard;
    vec3 mist = mix(vec3(0.145, 0.205, 0.176), vec3(0.405, 0.495, 0.420), light);
    mist = mix(mist, photo, 0.13);
    gl_FragColor = vec4(mist, alpha);
    #include <colorspace_fragment>
  }
`;

export const PETAL_VERTEX_SHADER = /* glsl */`
  attribute vec4 aSeed;
  attribute vec4 aMotion;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vPetalUv;
  varying vec3 vPetalNormal;
  varying float vOpacity;
  varying float vTint;
  mat3 rotateX(float a) {
    float s = sin(a), c = cos(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
  }
  mat3 rotateY(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }
  mat3 rotateZ(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
  }
  void main() {
    float depth = aSeed.z;
    float phase = aMotion.w * 6.283185;
    float travel = uTime * mix(0.023, 0.047, depth) * mix(0.80, 1.20, aSeed.w);
    // Fall and horizontal drift wrap beyond the viewport. A shared wind plus
    // a per-petal eddy produce broad, continuous paths without synchronized sway.
    float wind = uTime * mix(0.013, 0.035, depth);
    vec2 centre = vec2(fract(aSeed.x + wind) * 1.32 - 0.16,
                       fract(aSeed.y - travel) * 1.30 - 0.15);
    centre.x += sin(uTime * 0.36 + phase) * mix(0.008, 0.036, depth);
    centre.x += sin(uTime * 0.14 + phase * 1.7) * 0.011;
    centre.y += sin(uTime * 0.53 + phase * 0.6) * mix(0.003, 0.012, depth);
    float xAngle = phase + uTime * mix(0.52, 1.05, aMotion.x);
    float yAngle = sin(uTime * mix(0.28, 0.58, aMotion.y) + phase) * 1.05;
    float zAngle = phase * 1.8 + uTime * mix(-0.34, 0.34, aMotion.z) + sin(uTime * 0.31 + phase) * 0.36;
    mat3 turn = rotateZ(zAngle) * rotateY(yAngle) * rotateX(xAngle);
    float size = mix(3.0, 23.0, pow(depth, 1.65)) * mix(0.75, 1.25, aMotion.y);
    // Pixel dimensions make petals retain their natural size on a narrow phone
    // rather than turning into large pink disks as the source photo is cropped.
    vec3 curved = turn * position;
    vec2 screenUv = centre + curved.xy * size / uResolution;
    vPetalNormal = turn * normal;
    vPetalUv = uv;
    vTint = aMotion.x;
    vOpacity = mix(0.48, 0.96, depth) * smoothstep(0.0, 1.3, uTime);
    gl_Position = vec4(screenUv * 2.0 - 1.0, 0.75 - depth * 0.5, 1.0);
  }
`;

export const PETAL_FRAGMENT_SHADER = /* glsl */`
  varying vec2 vPetalUv;
  varying vec3 vPetalNormal;
  varying float vOpacity;
  varying float vTint;
  void main() {
    vec3 normal = normalize(vPetalNormal);
    float lighting = 0.76 + abs(dot(normal, normalize(vec3(-0.4, 0.65, 0.7)))) * 0.24;
    float base = pow(1.0 - vPetalUv.y, 2.0);
    vec3 pale = mix(vec3(0.95, 0.73, 0.74), vec3(0.88, 0.56, 0.62), vTint * 0.34);
    vec3 pink = mix(pale, vec3(0.63, 0.265, 0.32), base * 0.48);
    float vein = exp(-abs(vPetalUv.x - 0.5) * 40.0) * (1.0 - vPetalUv.y) * 0.04;
    pink *= lighting - vein;
    gl_FragColor = vec4(pink, vOpacity);
    #include <colorspace_fragment>
  }
`;

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function petalGeometry() {
  const rings = 5, segments = 24;
  const positions = [0, 0, 0.07], uvs = [0.5, 0.5], indices = [];
  for (let ring = 1; ring <= rings; ring++) {
    const radius = ring / rings;
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const x = sine * (0.39 + cosine * 0.09) * radius;
      const notch = 0.095 * Math.exp(-Math.pow(sine / 0.20, 2)) * Math.max(0, cosine);
      const y = (cosine * 0.53 - notch) * radius;
      const z = 0.07 + 0.18 * Math.pow(x / 0.5, 2) + 0.13 * y * y - 0.09 * y;
      positions.push(x, y, z);
      uvs.push(x + 0.5, y + 0.5);
      const current = 1 + (ring - 1) * segments + segment;
      const next = 1 + (ring - 1) * segments + (segment + 1) % segments;
      if (ring === 1) indices.push(0, next, current);
      else {
        const previous = current - segments, previousNext = next - segments;
        indices.push(previous, previousNext, current, previousNext, next, current);
      }
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const random = randomGenerator(617452);
  const seeds = new Float32Array(72 * 4), motions = new Float32Array(72 * 4);
  for (let i = 0; i < 72; i++) {
    // The first instances already contain every depth, so density can adapt to
    // the viewport without losing all foreground or all distant petals.
    const depth = (i * 0.61803398875) % 1;
    seeds.set([random(), random(), depth, random()], i * 4);
    motions.set([random(), random(), random(), random()], i * 4);
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motions, 4));
  geometry.instanceCount = 36;
  return geometry;
}

function photoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale), y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

/** Accepts an external texture for deterministic rendering tests; ownership of
 *  an injected texture stays with the caller. Blossom petals need no texture. */
export async function createWoodlandScene({ id, width, height, photoUrl, photoTexture }) {
  if (id !== 'forest' && id !== 'blossom') throw new Error('Unsupported woodland scene: ' + id);
  let texture = null, ownsPhoto = false, sourceWidth = 1, sourceHeight = 1;
  if (id === 'forest') {
    ownsPhoto = !photoTexture;
    texture = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    sourceWidth = texture.image?.naturalWidth || texture.image?.width;
    sourceHeight = texture.image?.naturalHeight || texture.image?.height;
    if (!(sourceWidth > 0 && sourceHeight > 0)) {
      if (ownsPhoto) texture.dispose();
      throw new Error('Forest photograph has no dimensions');
    }
  }
  const scene = new THREE.Scene();
  scene.name = id === 'forest' ? 'Mist flowing between forest trunks' : 'Curved petals carried by the breeze';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
    uPhoto: { value: texture },
    uCover: { value: new THREE.Vector4(...photoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const geometry = id === 'forest' ? new THREE.PlaneGeometry(2, 2) : petalGeometry();
  const material = new THREE.ShaderMaterial({
    name: id === 'forest' ? 'forest-advected-mist' : 'blossom-curved-petals',
    uniforms,
    vertexShader: id === 'forest' ? SCREEN_VERTEX : PETAL_VERTEX_SHADER,
    fragmentShader: id === 'forest' ? FOREST_MIST_FRAGMENT_SHADER : PETAL_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.NormalBlending, toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let disposed = false;
  const handle = {
    scene, camera,
    update(time) { if (!disposed) uniforms.uTime.value = time; },
    resize(nextWidth, nextHeight) {
      if (disposed) return;
      uniforms.uResolution.value.set(nextWidth, nextHeight);
      uniforms.uCover.value.set(...photoCover(nextWidth, nextHeight, sourceWidth, sourceHeight));
      if (id === 'blossom') geometry.instanceCount = Math.max(26, Math.min(72, Math.round(nextWidth * nextHeight / 16500)));
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
  handle.resize(width, height);
  return handle;
}
