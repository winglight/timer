import * as THREE from '../vendor/three.module.js';
import { earthRotationAt, cycloneStatesAt, orbitalLayout, MAX_CYCLONES } from './orbital-model.js';

const VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const ORBITAL_FRAGMENT_SHADER = /* glsl */`
  precision highp float;
  uniform sampler2D uEarth;
  uniform sampler2D uClouds;
  uniform sampler2D uNight;
  uniform float uTime;
  uniform float uRotation;
  uniform float uCloudDrift;
  uniform vec2 uResolution;
  uniform vec3 uLayout;
  uniform vec4 uCyclones[6];
  uniform vec4 uStormMotion[6];
  varying vec2 vUv;
  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
      mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    float result = .50 * noise(p);
    p = mat2(.80, -.60, .60, .80) * p * 2.03;
    result += .25 * noise(p);
    p = mat2(.80, -.60, .60, .80) * p * 2.01;
    result += .125 * noise(p);
    return result / .875;
  }
  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  float chamferBox(vec2 p, vec2 b, float corner) {
    vec2 q = abs(p) - b;
    return max(max(q.x, q.y), (q.x + q.y + corner) * .70710678);
  }
  float line(vec2 p, vec2 a, vec2 b, float thickness) {
    vec2 d = b - a;
    float t = clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0);
    return 1.0 - smoothstep(thickness, thickness + .0012, length(p - a - t * d));
  }
  float ring(vec2 p, float radius, float thickness) {
    return 1.0 - smoothstep(thickness, thickness + .002, abs(length(p) - radius));
  }

  vec3 starfield(vec2 p) {
    vec3 color = vec3(.00065, .0010, .0022);
    // A restrained, broad galactic haze; stars stay fixed in vacuum.
    float band = exp(-pow((p.y - p.x * .23 - .14) * 4.4, 2.0));
    float haze = fbm(p * 5.0 + 4.0) * fbm(p * 12.0);
    color += vec3(.004, .006, .011) * band * haze;
    for (int layer = 0; layer < 3; layer++) {
      float scale = 82.0 + float(layer) * 53.0;
      vec2 cell = floor(p * scale), f = fract(p * scale);
      float seed = hash(cell + float(layer) * 167.8);
      vec2 center = vec2(hash(cell + 31.8), hash(cell + 97.2)) * .76 + .12;
      float d = length(f - center);
      float radius = mix(.025, .082, pow(seed, 8.0));
      float point = exp(-pow(d / radius, 2.0) * 2.0);
      float visible = step(.78 + float(layer) * .05, seed);
      vec3 tint = mix(vec3(.46, .64, 1.0), vec3(1.0, .84, .60), hash(cell + 48.0));
      color += tint * point * visible * mix(.22, 1.1, pow(seed, 6.0));
    }
    return color;
  }

  vec3 planet(vec2 screen, vec3 behind) {
    float aspect = uResolution.x / uResolution.y;
    vec2 q = (screen - uLayout.xy) * vec2(aspect, 1.0) / uLayout.z;
    float radius = length(q);
    float aa = 1.4 / (uResolution.y * uLayout.z);
    vec3 sunlight = normalize(vec3(-.78, .43, .83));
    vec3 color = behind;
    // A thin optical limb with a separate faint outer scattering halo.
    float halo = exp(-max(radius - 1.0, 0.0) * 95.0) *
      (1.0 - smoothstep(1.0, 1.065, radius));
    float sideLight = clamp(.52 - q.x * .34 + q.y * .20, .12, 1.0);
    color += vec3(.035, .19, .48) * halo * sideLight * .62;
    if (radius > 1.0) return color;

    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));
    float tilt = .4091; // 23.44 degrees: a readable, gently tilted Earth axis.
    vec3 local = vec3(n.x * cos(tilt) + n.y * sin(tilt),
      -n.x * sin(tilt) + n.y * cos(tilt), n.z);
    float longitude = atan(local.x, local.z) - uRotation;
    float latitude = asin(clamp(local.y, -1.0, 1.0));
    vec2 uv = vec2(fract(longitude / TAU + .5), latitude / PI + .5);
    vec3 surface = texture2D(uEarth, uv).rgb;
    float ocean = smoothstep(.004, .05, surface.b - max(surface.r, surface.g * .9));
    float diffuse = dot(n, sunlight);
    float daylight = smoothstep(-.075, .10, diffuse);
    float illumination = .024 + max(diffuse, 0.0) * 1.1;

    // The NASA cloud composite is a separate layer. Drift is wall-clock based,
    // small and seamless, independent of the real-time solid-Earth rotation.
    vec2 cloudUv = vec2(fract(uv.x + uCloudDrift), uv.y);
    float clouds = texture2D(uClouds, cloudUv).r;
    clouds = smoothstep(.12, .85, clouds) * .76;
    float shade = texture2D(uClouds, cloudUv + vec2(.0015, -.0010)).r;
    surface *= 1.0 - smoothstep(.20, .80, shade) * .17;

    // Every storm has independent seeded timing, diameter and phase. The cloud
    // eye, eyewall and rain bands share the same spherical Earth coordinates.
    for (int i = 0; i < 6; i++) {
      vec4 storm = uCyclones[i];
      if (storm.w < .001) continue;
      float dl = mod(longitude - storm.x + PI, TAU) - PI;
      vec2 delta = vec2(dl * cos(storm.y), latitude - storm.y) / storm.z;
      float stormDistance = length(delta);
      if (stormDistance > 1.08) continue;
      vec4 motion = uStormMotion[i];
      float angle = atan(delta.y, delta.x);
      float textureNoise = fbm(delta * 12.0 + motion.z);
      float curling = angle * 3.0 + stormDistance * 11.5 * motion.y - motion.x * 3.0;
      float bands = pow(.5 + .5 * cos(curling + textureNoise * 1.8), 2.8);
      float envelope = 1.0 - smoothstep(.57, 1.04, stormDistance);
      float eye = smoothstep(.065, .15, stormDistance);
      float eyewall = exp(-pow((stormDistance - .18) * 12.0, 2.0));
      float cloudMass = (bands * .66 + .21 + eyewall * .48) *
        envelope * eye * mix(.72, 1.12, textureNoise);
      float influence = (1.0 - smoothstep(.82, 1.08, stormDistance)) * storm.w * ocean;
      clouds = mix(clouds, clamp(cloudMass, 0.0, 1.0), influence);
    }

    vec3 dayColor = surface * illumination;
    float specular = pow(max(dot(reflect(-sunlight, n), vec3(0, 0, 1)), 0.0), 95.0);
    dayColor += vec3(.53, .65, .74) * specular * ocean * .34 * (1.0 - clouds);
    vec3 cloudColor = vec3(.80, .87, .95) * (.05 + max(diffuse, 0.0) * 1.1);
    dayColor = mix(dayColor, cloudColor, clouds * .94);
    float night = texture2D(uNight, uv).r;
    float cityLights = smoothstep(.025, .70, night) * (1.0 - daylight);
    dayColor += vec3(1.0, .54, .17) * cityLights * .88 * (1.0 - clouds * .75);
    float fresnel = pow(1.0 - n.z, 3.5);
    dayColor += vec3(.035, .22, .50) * fresnel * (.13 + .8 * daylight);
    dayColor += vec3(.015, .028, .042) * (1.0 - daylight) * .16;
    return mix(color, dayColor, 1.0 - smoothstep(1.0 - aa, 1.0, radius));
  }

  vec3 instrument(vec2 uv, vec3 color, float side) {
    // Two slanted control desks flank the window without crossing the globe.
    vec2 p = vec2((uv.x - .5) * side, uv.y);
    vec2 q = (p - vec2(.390, .285)) / vec2(.110, .092);
    q.y += q.x * .16;
    float shell = roundedBox(q, vec2(1.04, .98), .12);
    float mask = 1.0 - smoothstep(-.018, .012, shell);
    if (mask > .001) {
      vec3 casing = mix(vec3(.013, .022, .033), vec3(.05, .071, .087), .5 + q.y * .23);
      casing += vec3(.038, .067, .081) * exp(-abs(shell + .025) * 95.0);
      color = mix(color, casing, mask);
      float display = 1.0 - smoothstep(-.005, .012, roundedBox(q, vec2(.88, .78), .035));
      vec3 pixels = vec3(.0018, .012, .018);
      vec2 grid = abs(fract((q + 1.0) * vec2(8.0, 7.0)) - .5);
      pixels += vec3(.002, .010, .014) * (1.0 - smoothstep(.015, .04, min(grid.x, grid.y)));
      vec2 dial = (q - vec2(-.35, .14));
      pixels += vec3(.025, .29, .38) * ring(dial, .34, .014);
      pixels += vec3(.018, .11, .14) * ring(dial, .26, .008);
      float scanAngle = uTime * .11 + side * .8;
      pixels += vec3(.055, .43, .44) * line(dial, vec2(0), vec2(cos(scanAngle), sin(scanAngle)) * .32, .009);
      for (int j = 0; j < 5; j++) {
        float y = .43 - float(j) * .18;
        float lengthValue = .17 + .11 * sin(float(j) * 2.7 + side + uTime * .075);
        float bar = (1.0 - smoothstep(.016, .029, abs(q.y - y))) *
          step(.18, q.x) * (1.0 - step(.18 + lengthValue * 1.7, q.x));
        pixels += mix(vec3(.025, .22, .31), vec3(.29, .17, .045), step(3.5, float(j))) * bar;
      }
      float trace = -.43 + .05 * sin(q.x * 8.0 + uTime * .5) + .025 * sin(q.x * 23.0);
      pixels += vec3(.020, .34, .26) * (1.0 - smoothstep(.006, .021, abs(q.y - trace))) * step(-.78, q.x) * step(q.x, .78);
      color = mix(color, pixels, display);
      color += vec3(.008, .055, .070) * exp(-abs(shell - .02) * 28.0);
    }
    // Pedestal and recessed foot lights beneath the display.
    float stalk = step(.355, p.x) * step(p.x, .418) * step(.095, uv.y) * step(uv.y, .196);
    color = mix(color, vec3(.018, .029, .039), stalk);
    color += vec3(.026, .17, .21) * line(vec2(p.x, uv.y), vec2(.35, .102), vec2(.425, .102), .0015);
    return color;
  }

  vec3 station(vec2 uv, vec3 outside) {
    float aspect = uResolution.x / uResolution.y;
    float small = min(aspect, 1.0);
    vec2 p = (uv - vec2(.5, .54)) * vec2(aspect, 1.0);
    float pane = chamferBox(p, vec2(aspect * .435, .365), .048 * small);
    float pixel = 1.0 / uResolution.y;
    float inside = 1.0 - smoothstep(-pixel, pixel, pane);

    // Brushed, beveled architecture catches blue earthshine from the window.
    float grain = hash(floor(uv * uResolution / vec2(1.0, 2.0))) - .5;
    vec3 metal = mix(vec3(.010, .017, .025), vec3(.039, .058, .071), uv.y);
    metal += vec3(.021, .047, .062) * exp(-max(pane, 0.0) * 20.0 / small);
    metal += grain * .002;
    float seam = abs(fract(uv.y * 8.0 + uv.x * .18) - .5);
    metal *= 1.0 - (1.0 - smoothstep(.006, .012, seam)) * .35;
    vec3 color = mix(metal, outside, inside);

    float rim = smoothstep(-.001, .002, pane) * (1.0 - smoothstep(.033 * small, .037 * small, pane));
    float bevel = clamp(pane / (.035 * small), 0.0, 1.0);
    vec3 frame = mix(vec3(.075, .103, .122), vec3(.021, .032, .044), bevel);
    frame += vec3(.017, .045, .061) * exp(-abs(pane - .005 * small) * 180.0 / small);
    color = mix(color, frame, rim);
    color += vec3(.055, .25, .32) * exp(-abs(pane - .039 * small) * 1050.0 / small);
    color += vec3(.008, .035, .053) * exp(-abs(pane - .04 * small) * 95.0 / small);

    // Window jambs extend toward the viewer; slim in portrait, broad on desktop.
    float leftJamb = line(uv, vec2(.0, .02), vec2(.072, .173), .006 * small);
    float rightJamb = line(uv, vec2(1.0, .02), vec2(.928, .173), .006 * small);
    color += vec3(.035, .095, .12) * (leftJamb + rightJamb);
    float upperRail = line(uv, vec2(.22, .953), vec2(.78, .953), .0019);
    color += vec3(.19, .32, .36) * upperRail;
    color += vec3(.022, .043, .054) * exp(-abs(uv.y - .952) * 160.0) * step(.20, uv.x) * step(uv.x, .80);

    // Perspective floor panels and a broad, dim reflection of the globe.
    if (uv.y < .171) {
      float depth = max(.025, .198 - uv.y);
      vec2 floorUv = vec2((uv.x - .5) * aspect, .13) / depth;
      vec2 f = abs(fract(floorUv * vec2(.34, 1.6)) - .5);
      float joints = 1.0 - smoothstep(.006, .015, min(f.x, f.y));
      vec3 floorColor = mix(vec3(.009, .015, .024), vec3(.028, .042, .055), uv.y / .171);
      floorColor *= 1.0 - joints * .48;
      floorColor += vec3(.018, .048, .079) * exp(-pow((uv.x - .5) * 4.1, 2.0)) * exp(-pow((uv.y - .113) * 10.0, 2.0));
      color = floorColor;
      float track = abs(abs((uv.x - .5) * aspect) - (.12 + (.171 - uv.y) * 2.8));
      color += vec3(.04, .23, .28) * exp(-track * 650.0);
      color += vec3(.008, .035, .044) * exp(-track * 80.0);
    }

    // Small ceiling fasteners and wall service indicators add scale without UI text.
    float boltCell = fract(uv.x * 16.0);
    float bolts = (1.0 - smoothstep(.04, .08, abs(boltCell - .5))) *
      (1.0 - smoothstep(.0012, .0025, abs(uv.y - .923))) * step(.13, uv.x) * step(uv.x, .87);
    color += vec3(.11, .14, .15) * bolts;
    float wallLight = exp(-abs(abs(uv.x - .5) - .469) * 1400.0) *
      smoothstep(.30, .34, uv.y) * (1.0 - smoothstep(.72, .76, uv.y));
    color += vec3(.055, .23, .29) * wallLight;
    color = instrument(uv, color, -1.0);
    color = instrument(uv, color, 1.0);
    return color;
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (vUv - .5) * vec2(aspect, 1.0);
    vec3 color = starfield(p);
    color = planet(vUv, color);
    color = station(vUv, color);
    // Camera stays still; the only bright movement is inside the physical scene.
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

const textureURL = filename => new URL('../assets/scenes/' + filename, import.meta.url).href;

/** Injected textures remain caller-owned, enabling deterministic rendering QA. */
export async function createOrbitalScene({
  width, height, earthTexture, cloudTexture, nightTexture, now = () => Date.now()
}) {
  const owned = new Set();
  const loader = new THREE.TextureLoader();
  async function acquire(borrowed, filename, colorSpace) {
    const texture = borrowed || await loader.loadAsync(textureURL(filename));
    if (!borrowed) owned.add(texture);
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    return texture;
  }

  // allSettled is deliberate: dispose late successes too if another asset fails.
  const results = await Promise.allSettled([
    acquire(earthTexture, 'earth-day.jpg', THREE.SRGBColorSpace),
    acquire(cloudTexture, 'earth-clouds.jpg', THREE.NoColorSpace),
    acquire(nightTexture, 'earth-night.jpg', THREE.NoColorSpace)
  ]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    owned.forEach(texture => texture.dispose());
    throw failure.reason;
  }
  const [day, clouds, night] = results.map(result => result.value);
  const scene = new THREE.Scene();
  scene.name = 'Orbital observatory — real-time Earth and simulated ocean weather';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10);
  camera.position.z = 2;
  const layout = orbitalLayout(width, height);
  const uniforms = {
    uEarth: { value: day }, uClouds: { value: clouds }, uNight: { value: night },
    uTime: { value: 0 }, uRotation: { value: 0 }, uCloudDrift: { value: 0 },
    uResolution: { value: new THREE.Vector2(Math.max(1, width), Math.max(1, height)) },
    uLayout: { value: new THREE.Vector3(...layout.center, layout.radius) },
    uCyclones: { value: Array.from({ length: MAX_CYCLONES }, () => new THREE.Vector4()) },
    uStormMotion: { value: Array.from({ length: MAX_CYCLONES }, () => new THREE.Vector4()) }
  };
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    name: 'orbital-observatory', uniforms, vertexShader: VERTEX_SHADER,
    fragmentShader: ORBITAL_FRAGMENT_SHADER, depthTest: false, depthWrite: false,
    transparent: false, toneMapped: false
  });
  const viewport = new THREE.Mesh(geometry, material);
  viewport.frustumCulled = false;
  scene.add(viewport);
  let disposed = false;
  const handle = {
    scene, camera,
    update(time) {
      if (disposed) return;
      const timestamp = now();
      uniforms.uTime.value = time;
      uniforms.uRotation.value = earthRotationAt(timestamp);
      uniforms.uCloudDrift.value = (((timestamp / 1000) * .0000011) % 1 + 1) % 1;
      cycloneStatesAt(timestamp).forEach((storm, index) => {
        uniforms.uCyclones.value[index].set(storm.longitudeRadians, storm.latitudeRadians, storm.radius, storm.strength);
        uniforms.uStormMotion.value[index].set(storm.phase, storm.direction, storm.seed, 0);
      });
    },
    resize(nextWidth, nextHeight) {
      if (disposed) return;
      const next = orbitalLayout(nextWidth, nextHeight);
      uniforms.uResolution.value.set(Math.max(1, nextWidth), Math.max(1, nextHeight));
      uniforms.uLayout.value.set(...next.center, next.radius);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      owned.forEach(texture => texture.dispose());
      scene.clear();
    }
  };
  handle.update(0);
  return handle;
}
