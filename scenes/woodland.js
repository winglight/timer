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

// Inverse deformation carries the photographed flowers and their stems
// together. The source near the lower-right branch attachment is fixed; the
// field fades through the already-defocused background instead of cutting out
// flowers and leaving a second, frozen copy behind them.
export const BLOSSOM_BRANCH_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uPhotoAspect;
  uniform float uTime;
  varying vec2 vScreenUv;

  float ellipseField(vec2 p, vec2 centre, vec2 radius) {
    float radialDistance = length((p - centre) / radius);
    return 1.0 - smoothstep(0.68, 1.16, radialDistance);
  }
  float stemField(vec2 p, vec2 a, vec2 b, float radius) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    float segmentDistance = length(p - a - t * ab);
    return 1.0 - smoothstep(radius * 0.55, radius * 1.8, segmentDistance);
  }
  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    vec2 pivot = vec2(0.576, 0.982);
    float upperBlooms = ellipseField(p, vec2(0.456, 0.498), vec2(0.160, 0.200));
    float lowerBlooms = ellipseField(p, vec2(0.600, 0.706), vec2(0.112, 0.180));
    float branch = stemField(p, pivot, vec2(0.650, 0.715), 0.030);
    branch = max(branch, stemField(p, vec2(0.650, 0.715), vec2(0.600, 0.557), 0.036));
    branch = max(branch, stemField(p, vec2(0.600, 0.557), vec2(0.435, 0.529), 0.034));
    float mask = max(max(upperBlooms, lowerBlooms), branch);
    vec2 metric = (p - pivot) * vec2(uPhotoAspect, 1.0);
    float reach = smoothstep(0.025, 0.58, length(metric));
    float breeze = sin(uTime * 0.61) * 0.019 +
                   (sin(uTime * 0.29 + 0.8) - sin(0.8)) * 0.008;
    float angle = breeze * reach;
    float c = cos(angle), s = sin(angle);
    vec2 inverseBend = mat2(c, -s, s, c) * metric;
    vec2 offset = (inverseBend - metric) / vec2(uPhotoAspect, 1.0);
    // Small stem-tip flex is coupled to the same gust. It moves the real
    // petals a fraction of the branch's travel, rather than adding confetti.
    vec2 upperOffset = vec2(sin(uTime * 1.13), cos(uTime * 0.83) - 1.0) * 0.0009;
    vec2 lowerOffset = vec2(sin(uTime * 0.93 + 0.5) - sin(0.5), sin(uTime * 1.07)) * 0.0007;
    vec2 samplePoint = p + offset * mask + upperOffset * upperBlooms + lowerOffset * lowerBlooms;
    samplePoint = clamp(samplePoint, vec2(0.0002), vec2(0.9998));
    gl_FragColor = vec4(texture2D(uPhoto, vec2(samplePoint.x, 1.0 - samplePoint.y)).rgb, 1.0);
    #include <colorspace_fragment>
  }
`;

export const WILDLIFE_VERTEX_SHADER = /* glsl */`
  attribute float aAnimal;
  uniform float uTime;
  uniform float uPhotoAspect;
  uniform vec4 uCover;
  varying vec2 vSpriteUv;
  varying vec2 vSourceUv;
  varying float vActivity;
  varying float vAnimal;
  varying float vFade;
  void main() {
    float animal = aAnimal;
    vec2 centre;
    float rotation = 0.0, facing = 1.0;
    float activity, fade = 1.0;
    float size;
    if (animal < 0.5) {
      float cycle = mod(uTime, 20.0);
      float outward = smoothstep(0.0, 6.5, cycle);
      float homeward = smoothstep(10.0, 16.5, cycle);
      float progress = outward - homeward;
      centre = vec2(mix(0.395, 0.606, progress),
                    mix(0.816, 0.768, progress) + sin(progress * 6.283185) * 0.006);
      activity = (1.0 - smoothstep(5.8, 6.5, cycle)) * smoothstep(0.0, 0.4, cycle) +
                 smoothstep(10.0, 10.4, cycle) * (1.0 - smoothstep(15.8, 16.5, cycle));
      facing = cycle > 8.2 && cycle < 18.2 ? -1.0 : 1.0;
      size = 0.030;
    } else {
      float cycle = mod(uTime, 16.0);
      float progress = smoothstep(0.0, 4.0, cycle) * 0.44 + smoothstep(6.0, 11.0, cycle) * 0.56;
      centre = vec2(0.517 + sin(progress * 3.141593) * 0.0015, mix(0.662, 0.416, progress));
      rotation = 1.5707963;
      activity = (1.0 - smoothstep(3.6, 4.0, cycle)) * smoothstep(0.0, 0.3, cycle) +
                 smoothstep(6.0, 6.3, cycle) * (1.0 - smoothstep(10.6, 11.0, cycle));
      fade = smoothstep(0.0, 0.45, cycle) * (1.0 - smoothstep(11.0, 11.8, cycle));
      size = 0.026;
    }
    vec2 local = (uv - vec2(0.5, 0.16)) * 2.6;
    vSpriteUv = uv;
    vec2 bodyPoint = local * vec2(facing, 1.0);
    float c = cos(rotation), s = sin(rotation);
    vec2 posed = mat2(c, s, -s, c) * bodyPoint * size;
    vec2 sourcePoint = centre + vec2(posed.x / uPhotoAspect, -posed.y);
    vSourceUv = vec2(sourcePoint.x, 1.0 - sourcePoint.y);
    vec2 screen = (vSourceUv - uCover.zw) / uCover.xy;
    gl_Position = vec4(screen * 2.0 - 1.0, 0.0, 1.0);
    vActivity = clamp(activity, 0.0, 1.0);
    vAnimal = animal;
    vFade = fade;
  }
`;

export const WILDLIFE_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform sampler2D uAnimal;
  uniform float uTime;
  varying vec2 vSpriteUv;
  varying vec2 vSourceUv;
  varying float vActivity;
  varying float vAnimal;
  varying float vFade;

  vec4 pose(float frame, vec2 uv) {
    float column = mod(frame, 3.0);
    float row = floor(frame / 3.0);
    return texture2D(uAnimal, (vec2(column, 1.0 - row) + clamp(uv, vec2(0.001), vec2(0.999))) / vec2(3.0, 2.0));
  }
  void main() {
    if (vFade < 0.002) discard;
    vec2 uv = vSpriteUv;
    // A small tail flex continues during pauses. Paws and the lower body are
    // fixed to the sprite baseline so the creature never slides vertically.
    float tail = (1.0 - smoothstep(0.28, 0.45, uv.x)) * smoothstep(0.35, 0.70, uv.y);
    uv.x += sin(uTime * 1.8 + vAnimal) * 0.008 * tail;
    float phase = uTime * 10.0 + vAnimal * 2.0;
    float frame = mod(floor(phase), 6.0);
    float blend = smoothstep(0.65, 1.0, fract(phase));
    vec4 current = pose(frame, uv), next = pose(mod(frame + 1.0, 6.0), uv);
    // Blend premultiplied samples, retaining the generated fur's soft alpha.
    vec4 moving = mix(vec4(current.rgb * current.a, current.a), vec4(next.rgb * next.a, next.a), blend);
    vec4 resting = pose(0.0, uv);
    resting.rgb *= resting.a;
    vec4 animal = mix(resting, moving, vActivity);
    vec3 photo = texture2D(uPhoto, vSourceUv).rgb;
    float illumination = 0.62 + smoothstep(0.015, 0.18, dot(photo, vec3(0.2126, 0.7152, 0.0722))) * 0.24;
    vec3 color = animal.rgb / max(animal.a, 0.001) * illumination;
    // Cool reflected woodland light keeps the sprite in the photograph's
    // lighting rather than looking like a bright studio cutout.
    color *= vec3(0.87, 0.96, 0.93);
    float leaves = smoothstep(0.007, 0.033, photo.g - photo.r) * smoothstep(0.009, 0.045, photo.g - photo.b);
    float groundCover = (1.0 - smoothstep(0.22, 0.39, uv.y)) * leaves * (1.0 - step(0.5, vAnimal)) * 0.65;
    float alpha = animal.a * (1.0 - groundCover);
    if (vAnimal < 0.5) {
      float shadow = exp(-pow((uv.x - 0.54) / 0.27, 2.0) - pow((uv.y - 0.151) / 0.026, 2.0)) * 0.27;
      color = (color * alpha + photo * 0.32 * shadow * (1.0 - alpha)) / max(alpha + shadow * (1.0 - alpha), 0.001);
      alpha = alpha + shadow * (1.0 - alpha);
    }
    if (alpha * vFade < 0.002) discard;
    gl_FragColor = vec4(color, alpha * vFade);
    #include <colorspace_fragment>
  }
`;

function wildlifeGeometry() {
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes.position = plane.attributes.position;
  geometry.attributes.uv = plane.attributes.uv;
  geometry.setAttribute('aAnimal', new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1));
  geometry.instanceCount = 2;
  return geometry;
}

function photoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale), y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

/** Both scenes use the original photograph. Injected textures stay owned by
 * their caller; geometries, materials and loaded textures belong to the scene. */
export async function createWoodlandScene({ id, width, height, photoUrl, photoTexture, animalTexture }) {
  if (id !== 'forest' && id !== 'blossom') throw new Error('Unsupported woodland scene: ' + id);
  const ownsPhoto = !photoTexture;
  const texture = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const sourceWidth = texture.image?.naturalWidth || texture.image?.width;
  const sourceHeight = texture.image?.naturalHeight || texture.image?.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    if (ownsPhoto) texture.dispose();
    throw new Error('Woodland photograph has no dimensions');
  }
  let animal = null, ownsAnimal = false;
  if (id === 'forest' && animalTexture !== null) {
    if (animalTexture) animal = animalTexture;
    else {
      try {
        animal = await new THREE.TextureLoader().loadAsync(new URL('../assets/scenes/squirrel-atlas.png', import.meta.url).href);
        ownsAnimal = true;
      } catch (error) {
        // Wildlife is optional; a missing sprite must not disable the forest.
        console.warn('Forest wildlife could not load; mist remains available.', error);
      }
    }
    if (animal) {
      animal.colorSpace = THREE.SRGBColorSpace;
      animal.minFilter = THREE.LinearMipmapLinearFilter;
      animal.magFilter = THREE.LinearFilter;
      animal.generateMipmaps = true;
    }
  }
  const scene = new THREE.Scene();
  scene.name = id === 'forest' ? 'Squirrels exploring the misty forest' : 'Photographed cherry branches moving in a breeze';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
    uPhoto: { value: texture },
    uAnimal: { value: animal },
    uPhotoAspect: { value: sourceWidth / sourceHeight },
    uCover: { value: new THREE.Vector4(...photoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const resources = [];
  function addMesh(name, geometry, vertexShader, fragmentShader, transparent, order) {
    const material = new THREE.ShaderMaterial({ name, uniforms, vertexShader, fragmentShader,
      side: THREE.DoubleSide, transparent, depthTest: false, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    scene.add(mesh);
    resources.push(geometry, material);
  }
  if (id === 'forest') {
    addMesh('forest-advected-mist', new THREE.PlaneGeometry(2, 2), SCREEN_VERTEX, FOREST_MIST_FRAGMENT_SHADER, true, 0);
    if (animal) addMesh('forest-grounded-wildlife', wildlifeGeometry(), WILDLIFE_VERTEX_SHADER, WILDLIFE_FRAGMENT_SHADER, true, 1);
  } else {
    addMesh('blossom-anchored-branch-bend', new THREE.PlaneGeometry(2, 2), SCREEN_VERTEX, BLOSSOM_BRANCH_FRAGMENT_SHADER, false, 0);
  }
  let disposed = false;
  return {
    scene, camera,
    update(time) { if (!disposed) uniforms.uTime.value = time; },
    resize(nextWidth, nextHeight) {
      if (disposed) return;
      uniforms.uResolution.value.set(nextWidth, nextHeight);
      uniforms.uCover.value.set(...photoCover(nextWidth, nextHeight, sourceWidth, sourceHeight));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.forEach(resource => resource.dispose());
      if (ownsPhoto) texture.dispose();
      if (ownsAnimal) animal.dispose();
      scene.clear();
    }
  };
}
