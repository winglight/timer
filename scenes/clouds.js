import * as THREE from '../vendor/three.module.js';
import { computePhotoCover } from './weather.js';

// World-space advection and vertical breathing are independent. The camera,
// mountain photograph and its mattes never move with the cloud field.
export const CLOUD_MOTION = Object.freeze({
  windX: 0.34, windZ: 0.11, heaveAmplitude: 0.34,
  heaveAngularSpeed: 0.22, raySteps: 64
});

export const CLOUD_VERTEX_SHADER = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const CLOUD_VOLUME_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform highp sampler3D uNoise;
  uniform vec4 uCover;
  uniform float uTime;
  varying vec2 vScreenUv;

  float cloudDensity(vec3 position, float sampleLod) {
    vec3 p = position;
    p.x -= uTime * ${CLOUD_MOTION.windX.toFixed(2)};
    p.z += uTime * ${CLOUD_MOTION.windZ.toFixed(2)};
    float heave = ${CLOUD_MOTION.heaveAmplitude.toFixed(2)} *
      sin(uTime * ${CLOUD_MOTION.heaveAngularSpeed.toFixed(2)} + p.x * 0.21 + p.z * 0.16);
    p.y -= heave;
    vec3 shape = textureLod(uNoise, p * vec3(0.075, 0.075, 0.075) + vec3(0.0, 0.38, 0.0), sampleLod).rgb;
    float billow = shape.r * 0.64 + shape.g * 0.24 + shape.b * 0.12;
    return clamp((billow - 0.50 + (2.35 - p.y) * 0.20) * 3.0, 0.0, 1.0);
  }

  float cloudBoundary(vec2 p) {
    // The far cloud bank follows the feet of the original distant mountains.
    // Only this narrow atmospheric transition retains any photograph below it;
    // the near cloud sea is opaque, so a static photographed contour cannot
    // overwhelm the animated volume as it did in the old mist overlay.
    float edge = mix(0.615, 0.632, smoothstep(0.0, 0.17, p.x));
    edge = mix(edge, 0.592, smoothstep(0.17, 0.43, p.x));
    edge = mix(edge, 0.588, smoothstep(0.43, 0.69, p.x));
    edge = mix(edge, 0.605, smoothstep(0.69, 1.0, p.x));
    return smoothstep(edge - 0.017, edge + 0.032, p.y);
  }

  float ridgeMatte(vec2 p, vec3 color) {
    float ridge = mix(0.815, 0.775, clamp((p.x - 0.835) / 0.065, 0.0, 1.0));
    ridge = mix(ridge, 0.720, clamp((p.x - 0.90) / 0.10, 0.0, 1.0));
    float outline = smoothstep(0.828, 0.845, p.x) * smoothstep(ridge - 0.004, ridge + 0.004, p.y);
    float foot = 1.0 - smoothstep(ridge + 0.055, ridge + 0.10, p.y);
    float rock = 1.0 - smoothstep(0.075, 0.16, dot(color, vec3(0.2126, 0.7152, 0.0722)));
    return outline * foot * rock;
  }

  void main() {
    vec2 sourceUv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(sourceUv.x, 1.0 - sourceUv.y);
    float boundary = cloudBoundary(p);
    if (boundary < 0.001) discard;
    vec3 photograph = texture2D(uPhoto, sourceUv).rgb;
    float visible = boundary * (1.0 - ridgeMatte(p, photograph));
    if (visible < 0.001) discard;

    // Rays live in the original photograph's coordinate system. Resizing or
    // portrait cover crops therefore cannot change the perspective of clouds.
    vec3 origin = vec3(0.0, 7.2, 0.0);
    vec3 ray = normalize(vec3((p.x - 0.5) * 1.50, 0.48 - p.y, -1.0));
    float begin = max(0.0, (origin.y - 5.4) / -ray.y);
    float end = min(120.0, (origin.y + 0.8) / -ray.y);
    float stepLength = (end - begin) / float(${CLOUD_MOTION.raySteps});
    // Fixed subpixel jitter softens march slices without temporal sparkling.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float travel = begin + stepLength * jitter;
    float sampleLod = clamp(log2(stepLength * 64.0 * 0.075) - 0.5, 0.0, 3.0);
    vec3 lightDirection = normalize(vec3(-0.65, 0.42, 0.64));
    vec3 scattered = vec3(0.0);
    float opacity = 0.0;
    for (int i = 0; i < ${CLOUD_MOTION.raySteps}; i++) {
      vec3 point = origin + ray * travel;
      float density = cloudDensity(point, sampleLod);
      if (density > 0.002) {
        // A second density lookup towards the light gives each billow a lit
        // crown and a cool self-shadow instead of painting noise onto a plane.
        float nearLight = cloudDensity(point + lightDirection * 0.8, sampleLod);
        float farLight = cloudDensity(point + lightDirection * 2.2, sampleLod);
        float sun = exp(-(nearLight * 0.8 + farLight * 1.2) * 2.0);
        vec3 shade = mix(vec3(0.035, 0.085, 0.145), vec3(0.56, 0.63, 0.66),
                         clamp(0.10 + sun * 0.80, 0.0, 1.0));
        // Distant clouds converge to the blue atmospheric light of the photo.
        float haze = 1.0 - exp(-max(0.0, travel - 18.0) * 0.022);
        shade = mix(shade, vec3(0.235, 0.345, 0.410), haze * 0.75);
        float alpha = 1.0 - exp(-density * stepLength * 1.20);
        scattered += (1.0 - opacity) * alpha * shade;
        opacity += (1.0 - opacity) * alpha;
        if (opacity > 0.9995) break;
      }
      travel += stepLength;
    }
    if (opacity < 0.001) discard;
    gl_FragColor = vec4(scattered / opacity, opacity * visible);
    #include <colorspace_fragment>
  }
`;

// Cache only the 1 MiB CPU array. Each scene owns a separate GPU texture, so
// disposing a scene/context never invalidates another handle's resources.
let cachedNoiseData;

function cloudNoiseData(size) {
  if (cachedNoiseData) return cachedNoiseData;
  const data = new Uint8Array(size * size * size * 4);
  function lattice(x, y, z, period) {
    x = (x + period) % period;
    y = (y + period) % period;
    z = (z + period) % period;
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function sample(x, y, z, period) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy); fz *= fz * (3 - 2 * fz);
    const mix = (a, b, t) => a + (b - a) * t;
    return mix(mix(mix(lattice(ix, iy, iz, period), lattice(ix + 1, iy, iz, period), fx),
                   mix(lattice(ix, iy + 1, iz, period), lattice(ix + 1, iy + 1, iz, period), fx), fy),
               mix(mix(lattice(ix, iy, iz + 1, period), lattice(ix + 1, iy, iz + 1, period), fx),
                   mix(lattice(ix, iy + 1, iz + 1, period), lattice(ix + 1, iy + 1, iz + 1, period), fx), fy), fz);
  }
  let offset = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++, offset += 4) {
        data[offset] = Math.round(sample(x / 8, y / 8, z / 8, 8) * 255);
        data[offset + 1] = Math.round(sample(x / 4 + 3, y / 4 + 7, z / 4 + 1, 16) * 255);
        data[offset + 2] = Math.round(sample(x / 2 + 7, y / 2 + 9, z / 2 + 11, 32) * 255);
        data[offset + 3] = 255;
      }
    }
  }
  cachedNoiseData = data;
  return data;
}

function noiseVolume() {
  const size = 64;
  const texture = new THREE.Data3DTexture(cloudNoiseData(size), size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** The injected photo texture is retained by its caller, as in cabin weather. */
export async function createCloudScene({ width, height, photoUrl, photoTexture }) {
  const ownsPhoto = !photoTexture;
  const photo = photoTexture || await new THREE.TextureLoader().loadAsync(photoUrl);
  photo.colorSpace = THREE.SRGBColorSpace;
  photo.minFilter = photo.magFilter = THREE.LinearFilter;
  photo.generateMipmaps = false;
  const sourceWidth = photo.image.naturalWidth || photo.image.width;
  const sourceHeight = photo.image.naturalHeight || photo.image.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) {
    if (ownsPhoto) photo.dispose();
    throw new Error('Cloud photograph has no dimensions');
  }
  const volume = noiseVolume();
  const uniforms = {
    uTime: { value: 0 },
    uPhoto: { value: photo },
    uNoise: { value: volume },
    uCover: { value: new THREE.Vector4(...computePhotoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const material = new THREE.ShaderMaterial({
    name: 'advecting-cloud-volume', uniforms,
    vertexShader: CLOUD_VERTEX_SHADER, fragmentShader: CLOUD_VOLUME_FRAGMENT_SHADER,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.name = 'Drifting and billowing cloud sea';
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
      geometry.dispose(); material.dispose(); volume.dispose();
      if (ownsPhoto) photo.dispose();
      scene.clear();
    }
  };
}
