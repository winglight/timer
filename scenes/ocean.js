import * as THREE from '../vendor/three.module.js';

// Photographic sunset light, a moving water mesh, and advected surf detail.
// All significant crests share the offshore wind direction. Phase modulation
// prevents the crossed, uniformly spaced ridges of the previous woven surface.
const PROJECTION = /* glsl */`
  const float CAMERA_HEIGHT = 1.18;
  const float TAN_HALF_FOV = 0.40;
  float horizon(float x) { return 0.594 - x * 0.045; }
`;
const WAVES = /* glsl */`
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise21(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), w.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), w.x), w.y);
  }
  float waveHeight(vec2 p, float footprint) {
    float envelope = 0.75 + 0.50 * noise21(p * vec2(0.08, 0.06) + vec2(0.0, uTime * 0.012));
    float warp = (noise21(p * vec2(0.10, 0.055) + 7.4) - 0.5) * 2.1;
    float swell = 1.0 - smoothstep(1.20, 3.60, footprint);
    float secondary = 1.0 - smoothstep(0.65, 2.0, footprint);
    float height = sin(p.y * 0.98 + p.x * 0.08 + warp - uTime * 0.72) * 0.063 * swell;
    height += sin(p.y * 1.85 - p.x * 0.13 + warp * 0.65 - uTime * 1.03 + 1.7) * 0.022 * secondary;
    float fine = 1.0 - smoothstep(0.10, 0.55, footprint);
    height += sin(p.y * 4.9 + p.x * 0.19 + warp * 1.8 - uTime * 1.42) * 0.0038 * fine;
    // At grazing angles, constant-height distant crests fold the projected
    // photo mesh into horizontal strips. Keep the near surf unchanged and
    // reduce distant displacement with depth so the photo surface stays ordered.
    float perspectiveAttenuation = min(1.0, 7.0 / max(7.0, -p.y));
    return height * envelope * perspectiveAttenuation * (1.0 - smoothstep(90.0, 700.0, -p.y));
  }
`;

export const OCEAN_VERTEX_SHADER = /* glsl */`
  uniform float uTime;
  uniform float uPhotoAspect;
  uniform vec4 uCover;
  varying vec3 vWaterPosition;
  varying vec2 vPhotoUv;
  varying vec2 vSurfUv;
  ${PROJECTION}
  ${WAVES}
  void main() {
    vec3 point = position;
    float sourceDepth = -point.z;
    float sourceX = 0.5 + point.x / (sourceDepth * 2.0 * TAN_HALF_FOV * uPhotoAspect);
    vSurfUv = vec2(sourceX, horizon(sourceX) + CAMERA_HEIGHT / (sourceDepth * 2.0 * TAN_HALF_FOV));
    point.y = waveHeight(point.xz, 0.0);
    // Elliptical orbital motion carries the actual foam and water texture with
    // each travelling swell. There is no whole-image scroll or reset phase.
    float attenuation = 1.0 - smoothstep(90.0, 700.0, -point.z);
    float phase = point.z * 0.98 + point.x * 0.08 - uTime * 0.72;
    point.z += cos(phase) * 0.15 * attenuation;
    point.x += cos(phase + 0.6) * 0.024 * attenuation;
    float depth = -point.z;
    float x = 0.5 + point.x / (depth * 2.0 * TAN_HALF_FOV * uPhotoAspect);
    float y = horizon(x) - (point.y - CAMERA_HEIGHT) / (depth * 2.0 * TAN_HALF_FOV);
    vPhotoUv = vec2(x, 1.0 - y);
    vWaterPosition = point;
    vec2 screen = (vPhotoUv - uCover.zw) / uCover.xy;
    gl_Position = vec4((screen * 2.0 - 1.0) * depth, 0.0, depth);
  }
`;

export const OCEAN_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform float uTime;
  uniform float uPhotoAspect;
  varying vec3 vWaterPosition;
  varying vec2 vPhotoUv;
  varying vec2 vSurfUv;
  ${PROJECTION}
  ${WAVES}

  vec3 photograph(vec2 topDown) {
    vec2 mirrored = 1.0 - abs(mod(topDown, 2.0) - 1.0);
    return texture2D(uPhoto, vec2(clamp(mirrored.x, 0.001, 0.999), 1.0 - clamp(mirrored.y, 0.001, 0.999))).rgb;
  }
  vec3 movingSurf(vec2 source, float depth) {
    // The fixed texture coordinates are carried by the wave mesh above.
    // Small local eddies add water motion without a periodic photo dissolve,
    // which would otherwise make the photographed foam jump backwards.
    float flow = smoothstep(0.008, 0.30, depth);
    float phase = source.x * 21.0 + source.y * 15.0 - uTime * 0.41;
    vec2 drift = vec2(sin(phase * 0.73 + 1.2) * 0.0014,
                      sin(phase) * 0.0018) * flow;
    source += drift;
    source.y = max(source.y, horizon(source.x) + 0.002);
    return photograph(source);
  }

  void main() {
    vec2 p = vec2(vPhotoUv.x, 1.0 - vPhotoUv.y);
    float depth = p.y - horizon(p.x);
    float alpha = smoothstep(0.001, 0.022, depth);
    if (alpha < 0.001) discard;
    vec2 world = vWaterPosition.xz;
    float footprint = max(length(dFdx(world)), length(dFdy(world)));
    float epsilon = max(0.055, footprint * 0.55);
    float h = waveHeight(world, footprint);
    vec2 slope = vec2(waveHeight(world + vec2(epsilon, 0.0), footprint) - h,
                      waveHeight(world + vec2(0.0, epsilon), footprint) - h) / epsilon;
    // Non-periodic capillary normals break the broad crests without adding
    // another crossing sine lattice. Pixel filtering removes unresolved grain.
    float detail = 1.0 - smoothstep(0.035, 0.15, footprint);
    vec2 q = world * vec2(2.7, 7.8) + vec2(uTime * 0.11, -uTime * 0.66);
    slope += vec2(noise21(q + 13.1) - 0.5, noise21(q + 29.7) - 0.5) * vec2(0.016, 0.027) * detail;
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 viewDirection = normalize(vec3(0.0, CAMERA_HEIGHT, 0.0) - vWaterPosition);
    vec3 reflected = reflect(-viewDirection, normal);
    float reflectedDepth = max(0.08, -reflected.z);
    float reflectionX = 0.5 + reflected.x / (reflectedDepth * 2.0 * TAN_HALF_FOV * uPhotoAspect);
    float reflectionY = horizon(reflectionX) - reflected.y / (reflectedDepth * 2.0 * TAN_HALF_FOV);
    reflectionY = clamp(reflectionY, 0.01, horizon(reflectionX) - 0.003);
    vec3 reflection = photograph(vec2(reflectionX, reflectionY));
    float facing = max(dot(normal, viewDirection), 0.0);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
    vec3 litWater = mix(vec3(0.012, 0.035, 0.043), reflection, 0.66 + 0.30 * fresnel);
    vec3 surf = movingSurf(vSurfUv, depth);
    // Keep the photographed foam and small-scale water structure. The light
    // response comes from the same photographed sunset rather than a generic
    // flat sky, which was the source of the old cloth-like appearance.
    float foam = smoothstep(0.12, 0.30, dot(surf, vec3(0.2126, 0.7152, 0.0722)));
    float reflectionWeight = 0.14 * smoothstep(0.025, 0.11, depth) * (1.0 - foam * 0.65);
    vec3 color = mix(surf, litWater, reflectionWeight);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function photoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale), y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

function waterGeometry(aspect) {
  const columns = 192, rows = 240;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let offset = 0;
  for (let row = 0; row <= rows; row++) {
    const depth = 3.1 * Math.pow(1600 / 3.1, row / rows);
    const halfWidth = depth * 0.40 * aspect * 1.15;
    for (let column = 0; column <= columns; column++) {
      positions[offset++] = (column / columns * 2 - 1) * halfWidth;
      positions[offset++] = 0;
      positions[offset++] = -depth;
    }
  }
  offset = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column, b = a + 1;
      const c = a + columns + 1, d = c + 1;
      indices[offset++] = a; indices[offset++] = b; indices[offset++] = c;
      indices[offset++] = b; indices[offset++] = d; indices[offset++] = c;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

/** Injected photos stay caller-owned; the runtime supplies the same local photo as the DOM. */
export async function createOceanScene({ width, height, photoUrl, photoTexture }) {
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
    throw new Error('Ocean photograph has no dimensions');
  }
  const scene = new THREE.Scene();
  scene.name = 'Photographic sunset reflected in irregular moving surf';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
  const uniforms = {
    uTime: { value: 0 }, uPhoto: { value: photo },
    uPhotoAspect: { value: sourceWidth / sourceHeight },
    uCover: { value: new THREE.Vector4(...photoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const geometry = waterGeometry(sourceWidth / sourceHeight);
  const material = new THREE.ShaderMaterial({
    name: 'photographic-ocean-surface', uniforms,
    vertexShader: OCEAN_VERTEX_SHADER, fragmentShader: OCEAN_FRAGMENT_SHADER,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let disposed = false;
  return {
    scene, camera,
    update(time) { if (!disposed) uniforms.uTime.value = time; },
    resize(w, h) { if (!disposed) uniforms.uCover.value.set(...photoCover(w, h, sourceWidth, sourceHeight)); },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose(); material.dispose();
      if (ownsPhoto) photo.dispose();
      scene.clear();
    }
  };
}
