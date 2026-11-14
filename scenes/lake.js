import * as THREE from '../vendor/three.module.js';

// The landscape stays in the photographic layer. A real, shallow wave mesh
// replaces only the lake; the upper photograph supplies its reflection.
// Projection is expressed in source-photo coordinates, then cropped with the
// same object-fit: cover transform as the DOM image.
const LAKE_PROJECTION = /* glsl */`
  const float HORIZON = 0.654;
  const float CAMERA_HEIGHT = 0.52;
  const float TAN_HALF_FOV = 0.364;
`;

const LAKE_WAVES = /* glsl */`
  void lakeWave(vec2 source, vec2 direction, float wavelength,
                float amplitude, float speed, float phaseOffset,
                float attenuation, float footprint, inout float height, inout vec2 slope) {
    vec2 d = normalize(direction);
    float k = 6.28318530718 / wavelength;
    float phase = dot(source, d) * k - uTime * speed + phaseOffset;
    float resolved = 1.0 - smoothstep(wavelength * 0.15, wavelength * 0.60, footprint);
    float a = amplitude * attenuation * resolved;
    height += a * sin(phase);
    slope += d * a * k * cos(phase);
  }
  void lakeSurface(vec2 source, float footprint, out float height, out vec2 slope) {
    height = 0.0;
    slope = vec2(0.0);
    float attenuation = 1.0 - smoothstep(24.0, 140.0, -source.y);
    lakeWave(source, vec2(0.22, 1.0), 3.6, 0.012, 0.58, 0.0, attenuation, footprint, height, slope);
    lakeWave(source, vec2(-0.68, 0.74), 1.8, 0.0055, 0.76, 1.4, attenuation, footprint, height, slope);
    lakeWave(source, vec2(0.85, 0.53), 0.86, 0.0022, 1.02, 2.8, attenuation, footprint, height, slope);
    lakeWave(source, vec2(-0.15, 1.0), 0.43, 0.0008, 1.22, 4.1, attenuation, footprint, height, slope);
  }
`;

export const LAKE_VERTEX_SHADER = /* glsl */`
  uniform float uTime;
  uniform float uPhotoAspect;
  uniform vec4 uCover;
  varying vec3 vWaterPosition;
  varying vec2 vPhotoUv;
  ${LAKE_PROJECTION}
  ${LAKE_WAVES}
  void main() {
    vec3 point = position;
    float height;
    vec2 slope;
    lakeSurface(point.xz, 0.0, height, slope);
    point.y = height;
    float depth = -point.z;
    vec2 source = vec2(
      0.5 + point.x / (depth * 2.0 * TAN_HALF_FOV * uPhotoAspect),
      HORIZON - (point.y - CAMERA_HEIGHT) / (depth * 2.0 * TAN_HALF_FOV)
    );
    vPhotoUv = vec2(source.x, 1.0 - source.y);
    vWaterPosition = point;
    vec2 screen = (vPhotoUv - uCover.zw) / uCover.xy;
    // Preserve perspective-correct interpolation of world positions even
    // though the projection is aligned to the source photograph's horizon.
    gl_Position = vec4((screen * 2.0 - 1.0) * depth, 0.0, depth);
  }
`;

export const LAKE_FRAGMENT_SHADER = /* glsl */`
  uniform float uTime;
  uniform float uPhotoAspect;
  uniform sampler2D uPhoto;
  varying vec3 vWaterPosition;
  varying vec2 vPhotoUv;
  ${LAKE_PROJECTION}
  ${LAKE_WAVES}

  vec2 capillary(vec2 p, vec2 direction, float wavelength,
                 float strength, float speed, float phase, float footprint) {
    vec2 d = normalize(direction);
    float visible = 1.0 - smoothstep(wavelength * 0.15, wavelength * 0.60, footprint);
    return d * cos(dot(p, d) * 6.28318530718 / wavelength - uTime * speed + phase) * strength * visible;
  }

  void main() {
    vec2 p = vec2(vPhotoUv.x, 1.0 - vPhotoUv.y);
    // The bank slopes slightly towards the central inlet. Keep it fixed and
    // ease the generated water into the existing distant reflection.
    float shore = HORIZON + 0.025 * pow(1.0 - p.x, 2.0);
    float alpha = smoothstep(shore + 0.002, shore + 0.026, p.y);
    if (alpha < 0.002) discard;

    float height;
    vec2 slope;
    float footprint = max(length(dFdx(vWaterPosition.xz)), length(dFdy(vWaterPosition.xz)));
    lakeSurface(vWaterPosition.xz, footprint, height, slope);
    slope += capillary(vWaterPosition.xz, vec2(0.47, 1.0), 0.22, 0.0060, 1.48, 0.7, footprint);
    slope += capillary(vWaterPosition.xz, vec2(-0.70, 0.70), 0.12, 0.0038, 1.85, 2.5, footprint);
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 viewDirection = normalize(vec3(0.0, CAMERA_HEIGHT, 0.0) - vWaterPosition);
    vec3 reflected = reflect(-viewDirection, normal);
    float reflectedDepth = max(0.08, -reflected.z);
    vec2 environmentUv = vec2(
      0.5 + reflected.x / (reflectedDepth * 2.0 * TAN_HALF_FOV * uPhotoAspect),
      1.0 - HORIZON + reflected.y / (reflectedDepth * 2.0 * TAN_HALF_FOV)
    );
    environmentUv = clamp(environmentUv, vec2(0.001, 1.0 - HORIZON), vec2(0.999));
    vec3 reflection = texture2D(uPhoto, environmentUv).rgb;
    // A tiny reflection roughness avoids an unnaturally perfect moving mirror
    // while retaining the mountain silhouette and sunset color.
    vec2 blur = vec2(0.0007, 0.00035);
    reflection = reflection * 0.70 +
      (texture2D(uPhoto, environmentUv + blur).rgb + texture2D(uPhoto, environmentUv - blur).rgb) * 0.15;
    float facing = max(dot(normal, viewDirection), 0.0);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
    vec3 waterBody = vec3(0.009, 0.016, 0.017);
    vec3 color = mix(waterBody, reflection, 0.68 + 0.32 * fresnel);
    // Atmospheric depth makes the very distant lake blend into its shoreline.
    float distanceFade = 1.0 - exp(-max(0.0, -vWaterPosition.z - 25.0) * 0.012);
    vec3 original = texture2D(uPhoto, vPhotoUv).rgb;
    color = mix(color, original, distanceFade * 0.8);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function photoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale), y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

function createLakeGeometry(photoAspect) {
  const columns = 160, rows = 176;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let cursor = 0;
  for (let row = 0; row <= rows; row++) {
    const depth = 1.35 * Math.pow(600 / 1.35, row / rows);
    const halfWidth = depth * 0.364 * photoAspect * 1.12;
    for (let column = 0; column <= columns; column++) {
      positions[cursor++] = (column / columns * 2 - 1) * halfWidth;
      positions[cursor++] = 0;
      positions[cursor++] = -depth;
    }
  }
  cursor = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column, b = a + 1;
      const c = a + columns + 1, d = c + 1;
      indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = c;
      indices[cursor++] = b; indices[cursor++] = d; indices[cursor++] = c;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

/** photoTexture can be supplied by native rendering QA; caller retains ownership. */
export async function createLakeScene({ width, height, photoUrl, photoTexture }) {
  const ownsPhoto = !photoTexture;
  const texture = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const sourceWidth = texture.image.naturalWidth || texture.image.width;
  const sourceHeight = texture.image.naturalHeight || texture.image.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    if (ownsPhoto) texture.dispose();
    throw new Error('Lake photograph has no dimensions');
  }
  const scene = new THREE.Scene();
  scene.name = 'Sunset reflected in gently moving lake water';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uTime: { value: 0 },
    uPhoto: { value: texture },
    uPhotoAspect: { value: sourceWidth / sourceHeight },
    uCover: { value: new THREE.Vector4(...photoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const geometry = createLakeGeometry(sourceWidth / sourceHeight);
  const material = new THREE.ShaderMaterial({
    name: 'lake-wave-reflections', uniforms,
    vertexShader: LAKE_VERTEX_SHADER, fragmentShader: LAKE_FRAGMENT_SHADER,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.NormalBlending, toneMapped: false
  });
  const water = new THREE.Mesh(geometry, material);
  water.frustumCulled = false;
  scene.add(water);
  let disposed = false;
  return {
    scene, camera,
    update(time) { if (!disposed) uniforms.uTime.value = time; },
    resize(nextWidth, nextHeight) {
      if (!disposed) uniforms.uCover.value.set(...photoCover(nextWidth, nextHeight, sourceWidth, sourceHeight));
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
