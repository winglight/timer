import * as THREE from '../vendor/three.module.js';

// A fixed-camera water scene. Waves move in world space; the sky and its
// reflection use the same lighting function instead of distorting a photograph.
const SKY_GLSL = /* glsl */ `
  const vec3 SUN_DIRECTION = vec3(-0.12, 0.095, -0.9882186);

  float skyHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float skyNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(cell), skyHash(cell + vec2(1.0, 0.0)), u.x),
               mix(skyHash(cell + vec2(0.0, 1.0)), skyHash(cell + 1.0), u.x), u.y);
  }

  vec3 skyRadiance(vec3 direction, float time, float disc) {
    vec3 ray = normalize(direction);
    float height = max(ray.y, 0.0);
    vec3 horizon = vec3(0.55, 0.49, 0.435);
    vec3 zenith = vec3(0.145, 0.255, 0.38);
    vec3 color = mix(horizon, zenith, pow(clamp(height, 0.0, 1.0), 0.38));
    float alignment = max(dot(ray, SUN_DIRECTION), 0.0);
    float warmBand = exp(-abs(ray.y - 0.035) * 13.0);
    color += vec3(0.17, 0.045, 0.008) * warmBand * (0.18 + 0.82 * pow(alignment, 12.0));
    color += vec3(0.17, 0.075, 0.025) * pow(alignment, 65.0);

    // A thin high cloud layer gives the broad reflection some structure. Its
    // drift is deliberately much slower than the water underneath it.
    vec2 cloudUV = ray.xz / max(0.085, ray.y) * vec2(0.7, 0.34);
    cloudUV += vec2(time * 0.004, time * 0.0015);
    float clouds = skyNoise(cloudUV) * 0.57;
    clouds += skyNoise(cloudUV * 2.03 + 17.2) * 0.28;
    clouds += skyNoise(cloudUV * 4.11 + 43.1) * 0.15;
    float cloudMask = smoothstep(0.56, 0.78, clouds);
    cloudMask *= smoothstep(0.045, 0.14, ray.y) * (1.0 - smoothstep(0.40, 0.72, ray.y));
    color = mix(color, vec3(0.60, 0.56, 0.52), cloudMask * 0.27);

    float sun = smoothstep(0.999965, 0.999989, alignment);
    color = mix(color, vec3(1.0, 0.83, 0.59), sun * disc * 0.88);
    return color;
  }
`;

export const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vSkyDirection;
  void main() {
    vSkyDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec3 vSkyDirection;
  ${SKY_GLSL}
  void main() {
    gl_FragColor = vec4(skyRadiance(vSkyDirection, uTime, 1.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export const OCEAN_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWidthScale;
  varying vec3 vWorldPosition;
  varying vec3 vSurfaceNormal;

  void addWave(in vec2 source, in vec2 direction, in float wavelength,
               in float amplitude, in float speed, in float phaseOffset,
               in float attenuation, inout vec3 point,
               inout vec3 tangentX, inout vec3 tangentZ) {
    vec2 d = normalize(direction);
    float k = 6.28318530718 / wavelength;
    float phase = k * dot(d, source) - sqrt(9.81 * k) * uTime * speed + phaseOffset;
    float a = amplitude * attenuation;
    float s = sin(phase), c = cos(phase);
    float horizontal = 0.52 * a;
    point.xz += d * horizontal * c;
    point.y += a * s;
    tangentX += vec3(-horizontal * k * d.x * d.x * s,
                     a * k * d.x * c,
                    -horizontal * k * d.x * d.y * s);
    tangentZ += vec3(-horizontal * k * d.x * d.y * s,
                     a * k * d.y * c,
                    -horizontal * k * d.y * d.y * s);
  }

  void main() {
    vec3 point = position;
    point.x *= uWidthScale;
    vec2 source = point.xz;
    vec3 tangentX = vec3(1.0, 0.0, 0.0);
    vec3 tangentZ = vec3(0.0, 0.0, 1.0);
    // Fade sub-pixel geometry into the horizon. The near grid carries the real
    // wave shape while distant water remains stable instead of sparkling.
    float attenuation = 1.0 - smoothstep(160.0, 680.0, -point.z);
    addWave(source, vec2(0.25, 1.0), 25.0, 0.24, 0.53, 0.0, attenuation, point, tangentX, tangentZ);
    addWave(source, vec2(-0.48, 1.0), 12.0, 0.105, 0.48, 1.6, attenuation, point, tangentX, tangentZ);
    addWave(source, vec2(0.79, 0.62), 6.7, 0.047, 0.52, 3.1, attenuation, point, tangentX, tangentZ);
    addWave(source, vec2(-0.22, 1.0), 3.6, 0.020, 0.46, 4.2, attenuation, point, tangentX, tangentZ);
    vSurfaceNormal = normalize(cross(tangentZ, tangentX));
    vWorldPosition = (modelMatrix * vec4(point, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
  }
`;

export const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec3 vSurfaceNormal;
  ${SKY_GLSL}

  vec2 smallWave(vec2 point, vec2 direction, float wavelength, float strength,
                 float phaseOffset, float speed, float footprint) {
    vec2 d = normalize(direction);
    float frequency = 6.28318530718 / wavelength;
    float phase = dot(point, d) * frequency - uTime * speed + phaseOffset;
    // Suppress frequencies which are smaller than a screen pixel. This also
    // avoids the high-contrast horizon shimmer common in procedural oceans.
    float visibility = 1.0 - smoothstep(wavelength * 0.15, wavelength * 0.60, footprint);
    return d * cos(phase) * strength * visibility;
  }

  void main() {
    vec2 point = vWorldPosition.xz;
    float footprint = max(length(dFdx(point)), length(dFdy(point)));
    vec2 ripples = smallWave(point, vec2(0.42, 1.0), 1.75, 0.048, 0.4, 1.00, footprint);
    ripples += smallWave(point, vec2(-0.65, 0.86), 0.93, 0.037, 1.6, 1.43, footprint);
    ripples += smallWave(point, vec2(0.91, 0.42), 0.51, 0.024, 3.1, 1.74, footprint);
    ripples += smallWave(point, vec2(-0.13, 1.0), 0.28, 0.012, 4.7, 2.04, footprint);
    vec3 normal = normalize(vSurfaceNormal + vec3(-ripples.x, 0.0, -ripples.y));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facing = max(dot(normal, viewDirection), 0.001);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-viewDirection, normal);
    reflected.y = max(reflected.y, 0.008);
    vec3 reflection = skyRadiance(reflected, uTime, 0.0);
    float waveLight = clamp(vWorldPosition.y * 0.8 + 0.45, 0.0, 1.0);
    vec3 body = mix(vec3(0.009, 0.040, 0.053), vec3(0.018, 0.073, 0.082), waveLight);
    vec3 color = mix(body, reflection, fresnel);

    // A broad, restrained microfacet sun reflection follows the same normals
    // as the geometry and fine ripples. No painted-on bright wave outlines.
    vec3 halfDirection = normalize(viewDirection + SUN_DIRECTION);
    float nh = max(dot(normal, halfDirection), 0.0);
    float nl = max(dot(normal, SUN_DIRECTION), 0.0);
    float vh = max(dot(viewDirection, halfDirection), 0.0);
    float roughness = 0.16;
    float a2 = roughness * roughness;
    float denominator = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / (3.14159265 * denominator * denominator);
    float visibility = facing / (facing * 0.84 + 0.16);
    visibility *= nl / (nl * 0.84 + 0.16);
    float sunFresnel = 0.0204 + 0.9796 * pow(1.0 - vh, 5.0);
    float sunSpecular = distribution * visibility * sunFresnel / max(4.0 * facing, 0.04);
    color += vec3(0.96, 0.67, 0.38) * (1.0 - exp(-sunSpecular * 0.75)) * 0.30;

    float distanceFade = 1.0 - exp(-length(vWorldPosition.xz - cameraPosition.xz) * 0.0024);
    vec3 horizon = skyRadiance(normalize(vec3(reflected.x, 0.012, reflected.z)), uTime, 0.0);
    color = mix(color, horizon, distanceFade * 0.88);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function createWaterGeometry() {
  const columns = 128, rows = 160;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint16Array(columns * rows * 6);
  let cursor = 0;
  // Logarithmic depth puts most vertices into the visible foreground rather
  // than spending the same mesh density on the almost-flat far horizon.
  for (let row = 0; row <= rows; row++) {
    const depth = Math.expm1(row / rows * Math.log1p(1800));
    const halfWidth = 24 + depth * 1.7;
    for (let column = 0; column <= columns; column++) {
      positions[cursor++] = (column / columns * 2 - 1) * halfWidth;
      positions[cursor++] = 0;
      positions[cursor++] = 14 - depth;
    }
  }
  cursor = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1, c = a + columns + 1, d = c + 1;
      indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = c;
      indices[cursor++] = b; indices[cursor++] = d; indices[cursor++] = c;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createOceanScene({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, width / Math.max(height, 1), 0.1, 2400);
  camera.position.set(0, 4.2, 9);
  camera.lookAt(0, 0, -65);
  camera.updateMatrixWorld();

  const time = { value: 0 };
  const widthScale = { value: Math.max(1, camera.aspect / 2.4) };
  const skyGeometry = new THREE.SphereGeometry(2100, 32, 20);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.position.copy(camera.position);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const waterGeometry = createWaterGeometry();
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uWidthScale: widthScale },
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    toneMapped: false
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.frustumCulled = false;
  scene.add(water);

  return {
    scene,
    camera,
    update(elapsed) { time.value = elapsed; },
    resize(nextWidth, nextHeight) {
      camera.aspect = nextWidth / Math.max(nextHeight, 1);
      camera.updateProjectionMatrix();
      widthScale.value = Math.max(1, camera.aspect / 2.4);
    },
    dispose() {
      waterGeometry.dispose();
      waterMaterial.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      scene.clear();
    }
  };
}
