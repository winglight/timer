import * as THREE from '../vendor/three.module.js';
import { computePhotoCover } from './weather.js';

// The original bright cloud banks supply the fine structure. A continuous,
// bounded flow field carries that structure in photo coordinates. Only clouds
// move; the sky, mountains and foreground ridge remain in the fixed DOM photo.
export const CLOUD_MOTION = Object.freeze({
  windAmplitude: 0.042, windAngularSpeed: 0.15,
  heaveAmplitude: 0.012, heaveAngularSpeed: 0.31
});

export const CLOUD_VERTEX_SHADER = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const CLOUD_PHOTO_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform vec2 uPhotoTexel;
  uniform float uTime;
  varying vec2 vScreenUv;

  float cloudHorizon(float x) {
    float edge = mix(0.615, 0.632, smoothstep(0.0, 0.17, x));
    edge = mix(edge, 0.592, smoothstep(0.17, 0.43, x));
    edge = mix(edge, 0.588, smoothstep(0.43, 0.69, x));
    return mix(edge, 0.605, smoothstep(0.69, 1.0, x));
  }
  float ridgeHeight(float x) {
    float ridge = mix(0.815, 0.775, clamp((x - 0.835) / 0.065, 0.0, 1.0));
    return mix(ridge, 0.720, clamp((x - 0.90) / 0.10, 0.0, 1.0));
  }
  float ridgeMatte(vec2 p, vec3 color) {
    float ridge = ridgeHeight(p.x);
    float outline = smoothstep(0.828, 0.845, p.x) * smoothstep(ridge - 0.004, ridge + 0.004, p.y);
    float foot = 1.0 - smoothstep(ridge + 0.055, ridge + 0.10, p.y);
    float rock = 1.0 - smoothstep(0.075, 0.16, dot(color, vec3(0.2126, 0.7152, 0.0722)));
    return outline * foot * rock;
  }

  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    float horizon = cloudHorizon(p.x);
    float cloud = smoothstep(horizon - 0.006, horizon + 0.035, p.y);
    if (cloud < 0.001) discard;
    vec3 fixedPhoto = texture2D(uPhoto, sourceUv).rgb;
    float visible = cloud * (1.0 - ridgeMatte(p, fixedPhoto));
    if (visible < 0.001) discard;

    // Near banks travel farther than the distant veil. The slow wind varies
    // continuously rather than resetting UVs or crossfading two blurry copies.
    float depth = smoothstep(horizon + 0.015, 0.92, p.y);
    float flowDepth = mix(0.16, 1.0, depth) * cloud;
    float wind = ${CLOUD_MOTION.windAmplitude.toFixed(3)} * sin(uTime * ${CLOUD_MOTION.windAngularSpeed.toFixed(2)}) +
                 0.012 * (sin(uTime * 0.047 + 1.1) - sin(1.1));
    float heave = ${CLOUD_MOTION.heaveAmplitude.toFixed(3)} *
      (sin(p.x * 10.0 + uTime * ${CLOUD_MOTION.heaveAngularSpeed.toFixed(2)}) - sin(p.x * 10.0));
    heave += 0.0045 * (sin(p.x * 19.0 + p.y * 5.0 + uTime * 0.19) - sin(p.x * 19.0 + p.y * 5.0));
    vec2 displacement = vec2(-wind * flowDepth, heave * flowDepth);
    displacement.x += 0.003 * (sin(p.y * 17.0 + uTime * 0.23) - sin(p.y * 17.0)) * depth;

    // Taper before source edges and the original ridge, so no mountain pixels
    // can be pulled into the moving cloud layer and no repeated edge appears.
    float sides = smoothstep(0.0, 0.065, p.x) * (1.0 - smoothstep(0.935, 1.0, p.x));
    float bottom = 1.0 - smoothstep(0.960, 1.0, p.y);
    float ridge = ridgeHeight(p.x);
    float ridgeGuard = smoothstep(0.775, 0.840, p.x) *
      smoothstep(ridge - 0.070, ridge - 0.022, p.y) *
      (1.0 - smoothstep(ridge + 0.12, ridge + 0.18, p.y));
    displacement *= sides * bottom * (1.0 - ridgeGuard);
    vec2 samplePoint = p + displacement;
    samplePoint.y = max(samplePoint.y, cloudHorizon(samplePoint.x) + 0.002);
    vec2 bankUv = vec2(samplePoint.x, 1.0 - samplePoint.y);
    vec3 bank = texture2D(uPhoto, bankUv).rgb;
    // A restrained detail reconstruction preserves wispy photographic edges
    // at high-density display sizes. It cannot invent repeated cloud blobs.
    vec2 detailRadius = uPhotoTexel * 1.6;
    vec3 neighbours = (texture2D(uPhoto, bankUv + vec2(detailRadius.x, 0.0)).rgb +
      texture2D(uPhoto, bankUv - vec2(detailRadius.x, 0.0)).rgb +
      texture2D(uPhoto, bankUv + vec2(0.0, detailRadius.y)).rgb +
      texture2D(uPhoto, bankUv - vec2(0.0, detailRadius.y)).rgb) * 0.25;
    bank = max(vec3(0.0), bank + clamp(bank - neighbours, vec3(-0.020), vec3(0.020)) * 0.85);

    // Lift cool dawn cloud shadows towards daylight white while keeping the
    // photographed ridges and fine tonal structure. No procedural blur/shadow
    // volume is layered on top of those details.
    float luminance = dot(bank, vec3(0.2126, 0.7152, 0.0722));
    vec3 daylight = vec3(luminance * 1.80 + 0.095) * vec3(1.015, 1.0, 0.97);
    bank = mix(bank, daylight, 0.88);
    // The distant veil gradually rejoins the unchanged atmospheric mountains.
    bank = mix(fixedPhoto, bank, smoothstep(horizon + 0.002, horizon + 0.075, p.y));
    gl_FragColor = vec4(bank, visible);
    #include <colorspace_fragment>
  }
`;

/** Injected photographs retain caller ownership; no generated volume is needed. */
export async function createCloudScene({ width, height, photoUrl, photoTexture }) {
  const ownsPhoto = !photoTexture;
  const photo = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
  photo.colorSpace = THREE.SRGBColorSpace;
  photo.minFilter = THREE.LinearMipmapLinearFilter;
  photo.magFilter = THREE.LinearFilter;
  photo.generateMipmaps = true;
  const sourceWidth = photo.image?.naturalWidth || photo.image?.width;
  const sourceHeight = photo.image?.naturalHeight || photo.image?.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    if (ownsPhoto) photo.dispose();
    throw new Error('Cloud photograph has no dimensions');
  }
  const uniforms = {
    uTime: { value: 0 },
    uPhoto: { value: photo },
    uPhotoTexel: { value: new THREE.Vector2(1 / sourceWidth, 1 / sourceHeight) },
    uCover: { value: new THREE.Vector4(...computePhotoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const material = new THREE.ShaderMaterial({
    name: 'photographic-cloud-flow', uniforms,
    vertexShader: CLOUD_VERTEX_SHADER, fragmentShader: CLOUD_PHOTO_FRAGMENT_SHADER,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.name = 'Bright cloud banks drifting and rising';
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  let disposed = false;
  return {
    scene, camera,
    update(time) { if (!disposed) uniforms.uTime.value = time; },
    resize(nextWidth, nextHeight) {
      if (!disposed) uniforms.uCover.value.set(...computePhotoCover(nextWidth, nextHeight, sourceWidth, sourceHeight));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose(); material.dispose();
      if (ownsPhoto) photo.dispose();
      scene.clear();
    }
  };
}
