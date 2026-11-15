import * as THREE from '../vendor/three.module.js';
import { earthRotationAt, sunlightDirectionAt, displayTimeAt, cycloneStatesAt, orbitalLayout, orbitalWindowPlanes, orbitalScreenMaps, orbitalReadoutRects, interiorForAspect, ORBITAL_INTERIORS, MAX_CYCLONES } from './orbital-model.js?v=20261115-visible-motion-1';

const VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const ORBITAL_FRAGMENT_SHADER = /* glsl */`
  precision highp float;
  uniform sampler2D uInterior;
  uniform vec4 uCover;
  uniform vec2 uPhotoSize;
  uniform vec3 uWindowPlanes[8];
  uniform mat3 uScreenMaps[2];
  uniform vec4 uReadoutRects[4];
  uniform sampler2D uEarth;
  uniform sampler2D uClouds;
  uniform sampler2D uNight;
  uniform float uTime;
  uniform float uRotation;
  uniform vec3 uSunlight;
  uniform float uDisplayTime;
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
  float panelBox(vec2 p, vec2 center, vec2 halfSize, float aa) {
    vec2 outside = abs(p - center) - halfSize;
    return 1.0 - smoothstep(0.0, aa, max(outside.x, outside.y));
  }
  float digitSegment(float pattern, float bit) {
    return mod(floor(pattern / exp2(bit)), 2.0);
  }
  float telemetryDigit(vec2 p, float digit, float aa) {
    float pattern = 63.0;
    if (digit > .5) pattern = 6.0;
    if (digit > 1.5) pattern = 91.0;
    if (digit > 2.5) pattern = 79.0;
    if (digit > 3.5) pattern = 102.0;
    if (digit > 4.5) pattern = 109.0;
    if (digit > 5.5) pattern = 125.0;
    if (digit > 6.5) pattern = 7.0;
    if (digit > 7.5) pattern = 127.0;
    if (digit > 8.5) pattern = 111.0;
    float value = panelBox(p, vec2(.5, .08), vec2(.25, .027), aa) * digitSegment(pattern, 0.0);
    value += panelBox(p, vec2(.80, .28), vec2(.025, .15), aa) * digitSegment(pattern, 1.0);
    value += panelBox(p, vec2(.80, .72), vec2(.025, .15), aa) * digitSegment(pattern, 2.0);
    value += panelBox(p, vec2(.5, .92), vec2(.25, .027), aa) * digitSegment(pattern, 3.0);
    value += panelBox(p, vec2(.20, .72), vec2(.025, .15), aa) * digitSegment(pattern, 4.0);
    value += panelBox(p, vec2(.20, .28), vec2(.025, .15), aa) * digitSegment(pattern, 5.0);
    value += panelBox(p, vec2(.5, .50), vec2(.25, .027), aa) * digitSegment(pattern, 6.0);
    return min(value, 1.0);
  }
  float telemetryNumber(vec2 p, vec2 origin, vec2 digitSize, float reading, float aa) {
    vec2 local = (p - origin) / digitSize;
    float column = floor(local.x);
    if (column < 0.0 || column > 2.0 || local.y < 0.0 || local.y > 1.0) return 0.0;
    float digit = mod(floor(reading / pow(10.0, 2.0 - column)), 10.0);
    return telemetryDigit(vec2(fract(local.x), local.y), digit, aa / min(digitSize.x, digitSize.y));
  }
  vec3 monitorContent(vec2 p, int index) {
    float aa = min(.025, max(.004, max(fwidth(p.x), fwidth(p.y)) * .65));
    float time = uDisplayTime + float(index) * 17.0;
    vec3 cyan = vec3(.06, .50, .67), green = vec3(.17, .53, .23);
    vec3 color = vec3(.003, .014, .024);
    vec2 grid = abs(fract(p * vec2(10.0, 12.0)) - .5);
    float lines = 1.0 - smoothstep(.025, .055, min(grid.x, grid.y));
    color += vec3(.004, .021, .028) * lines;
    float reading = floor(mod(time * 1.25 + 278.0, 1000.0));
    color += cyan * telemetryNumber(p, vec2(.10, .055), vec2(.22, .12), reading, aa);

    if (index == 0) {
      // A continuously scrolling waveform and a second slower channel.
      float wave = .40 + sin(p.x * TAU * 1.7 - time * 2.2) * .080 +
        sin(p.x * TAU * 4.2 - time * 3.7) * .026;
      float second = .58 + sin(p.x * TAU * 2.5 - time * 1.4 + 2.0) * .045;
      float graph = step(.05, p.x) * step(p.x, .95) * step(.24, p.y) * step(p.y, .68);
      color += cyan * (1.0 - smoothstep(.007, .007 + aa, abs(p.y - wave))) * graph;
      color += green * (1.0 - smoothstep(.006, .006 + aa, abs(p.y - second))) * graph;
      // Scrolling event rows update independently, like a real telemetry feed.
      float row = floor((p.y - .73) * 23.0);
      float progress = fract(time * .72);
      float width = .20 + hash(vec2(row + floor(time * .72), 4.0)) * .57;
      float feed = step(0.0, row) * step(row, 4.0) *
        panelBox(p, vec2(.06 + width * .5, .744 + row / 23.0), vec2(width * .5, .006), aa);
      color += cyan * feed * (.30 + .50 * (1.0 - progress));
    } else {
      // A small sensor sweep, bounded entirely by the photographed LCD glass.
      vec2 q = (p - vec2(.5, .48)) * vec2(1.0, 1.12);
      float radius = length(q);
      float circles = 1.0 - smoothstep(.006, .006 + aa, abs(fract(radius * 10.0 + .5) - .5) / 10.0);
      float disk = 1.0 - smoothstep(.32, .33, radius);
      float angle = atan(q.y, q.x);
      float behindSweep = mod(time * .68 - angle + TAU, TAU);
      float sweep = exp(-behindSweep * 4.5) * disk;
      color += green * (circles * .16 + sweep * .72) * disk;
      vec2 target = vec2(cos(time * .24 + 1.2), sin(time * .24 + 1.2)) * .19;
      color += vec3(.55, .38, .04) * exp(-dot(q - target, q - target) * 3500.0);
      color += cyan * telemetryNumber(p, vec2(.14, .81), vec2(.21, .10),
        floor(mod(time * 2.0 + 82.0, 1000.0)), aa);
    }
    float scan = exp(-pow((p.y - fract(time * .24)) * 55.0, 2.0));
    color += cyan * scan * .10;
    return color;
  }
  vec3 monitorInstruments(vec2 sourcePoint, vec3 photograph) {
    vec3 color = photograph;
    for (int i = 0; i < 2; i++) {
      vec3 projected = uScreenMaps[i] * vec3(sourcePoint, 1.0);
      vec2 p = projected.xy / projected.z;
      float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
      if (edge > 0.0) {
        float glass = smoothstep(0.0, .035, edge);
        color = mix(color, monitorContent(p, i) + photograph * .10, glass * .96);
      }
    }
    // The small amber readouts beside the window also remain visible in the
    // narrow phone crop, where the larger side screens are partly off-screen.
    for (int i = 0; i < 4; i++) {
      vec4 bounds = uReadoutRects[i];
      vec2 p = (sourcePoint - bounds.xy) / (bounds.zw - bounds.xy);
      float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
      if (edge > 0.0) {
        float digit = mod(floor(uDisplayTime * (.65 + float(i) * .13)) + float(i) * 3.0, 10.0);
        float glyph = telemetryDigit(p, digit, .055);
        vec3 readout = vec3(.004, .008, .009) + vec3(.75, .38, .025) * glyph;
        color = mix(color, readout, smoothstep(0.0, .10, edge) * .92);
      }
    }
    return color;
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
    vec3 sunlight = uSunlight;
    vec3 color = behind;
    // A thin optical limb with a separate faint outer scattering halo.
    float halo = exp(-max(radius - 1.0, 0.0) * 95.0) *
      (1.0 - smoothstep(1.0, 1.065, radius));
    float sideLight = clamp(.44 + dot(q, sunlight.xy) * .42, .10, 1.0);
    color += vec3(.035, .19, .48) * halo * sideLight * .62;
    if (radius > 1.0) return color;

    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));
    float tilt = .4091; // 23.44 degrees: a readable, gently tilted Earth axis.
    vec3 local = vec3(n.x * cos(tilt) + n.y * sin(tilt),
      -n.x * sin(tilt) + n.y * cos(tilt), n.z);
    float longitude = atan(local.x, local.z) - uRotation;
    float latitude = asin(clamp(local.y, -1.0, 1.0));
    // RepeatWrapping performs longitude wrap in the sampler. Keeping this UV
    // continuous avoids a false derivative spike and coarse mip stripe at 0/1.
    vec2 uv = vec2(longitude / TAU + .5, latitude / PI + .5);
    vec3 surface = texture2D(uEarth, uv).rgb;
    float ocean = smoothstep(.004, .05, surface.b - max(surface.r, surface.g * .9));
    float diffuse = dot(n, sunlight);
    float daylight = smoothstep(-.075, .10, diffuse);
    float illumination = .024 + max(diffuse, 0.0) * 1.1;

    // The NASA cloud composite is a separate layer. Drift is wall-clock based,
    // small and seamless, independent of the accelerated solid-Earth rotation.
    vec2 cloudUv = vec2(uv.x + uCloudDrift, uv.y);
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

  float windowMask(vec2 photoUv) {
    // All planes use the source photograph, so the matte cannot drift when
    // the viewport rotates or object-fit: cover crops the image.
    vec2 p = vec2(photoUv.x * uPhotoSize.x / uPhotoSize.y, 1.0 - photoUv.y);
    float distanceToFrame = 100.0;
    for (int i = 0; i < 8; i++) {
      distanceToFrame = min(distanceToFrame, dot(uWindowPlanes[i].xy, p) + uWindowPlanes[i].z);
    }
    return smoothstep(0.0, 1.2 / uPhotoSize.y, distanceToFrame);
  }

  void main() {
    vec2 photoUv = vUv * uCover.xy + uCover.zw;
    // The room is sampled once at its exact, undistorted photographic position.
    vec3 photograph = texture2D(uInterior, photoUv).rgb;
    float aperture = windowMask(photoUv);
    // The black observation glass is behind the photographed metal handrail.
    // Preserve the actual rail and its antialiasing with a source-pixel holdout;
    // the image itself is never shifted or repainted with synthetic geometry.
    float foreground = smoothstep(.0003, .0025, max(photograph.r, max(photograph.g, photograph.b)));
    aperture *= 1.0 - foreground;
    vec3 color = photograph;
    if (aperture > 0.0) {
      float aspect = uResolution.x / uResolution.y;
      vec2 p = (vUv - .5) * vec2(aspect, 1.0);
      vec3 space = planet(vUv, starfield(p));
      // Keep only a faint hint of the photograph's real glass reflections.
      space += photograph * .075;
      color = mix(photograph, space, aperture);
    }
    color = monitorInstruments(vec2(photoUv.x, 1.0 - photoUv.y), color);
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }

`;

const textureURL = filename => new URL('../assets/scenes/' + filename, import.meta.url).href;

/** Injected textures remain caller-owned, enabling deterministic rendering QA. */
export async function createOrbitalScene({
  width, height, earthTexture, cloudTexture, nightTexture,
  interiorTexture, interiorPortraitTexture, now = () => Date.now()
}) {
  const owned = new Set();
  const loader = new THREE.TextureLoader();
  async function acquire(borrowed, filename, colorSpace, repeat = true) {
    const texture = borrowed || await loader.loadAsync(textureURL(filename));
    if (!borrowed) owned.add(texture);
    texture.colorSpace = colorSpace;
    texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
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
    acquire(nightTexture, 'earth-night.jpg', THREE.NoColorSpace),
    acquire(interiorTexture, ORBITAL_INTERIORS.landscape.filename, THREE.SRGBColorSpace, false),
    acquire(interiorPortraitTexture, ORBITAL_INTERIORS.portrait.filename, THREE.SRGBColorSpace, false)
  ]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    owned.forEach(texture => texture.dispose());
    throw failure.reason;
  }
  const [day, clouds, night, landscape, portrait] = results.map(result => result.value);
  const plates = { landscape, portrait };
  const photoSize = texture => [texture.image.naturalWidth || texture.image.width, texture.image.naturalHeight || texture.image.height];
  for (const texture of [landscape, portrait]) {
    if (!photoSize(texture).every(value => value > 0 && Number.isFinite(value))) {
      owned.forEach(value => value.dispose());
      throw new Error('Orbital interior photograph has no dimensions');
    }
  }
  const scene = new THREE.Scene();
  scene.name = 'Photographic orbital observatory — visible Earth, moving daylight and live instruments';
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10);
  camera.position.z = 2;
  const initialProfile = interiorForAspect(width, height);
  const initialTexture = plates[initialProfile];
  const initialSize = photoSize(initialTexture);
  const layout = orbitalLayout(width, height, ORBITAL_INTERIORS[initialProfile], initialSize);
  const uniforms = {
    uInterior: { value: initialTexture },
    uCover: { value: new THREE.Vector4(...layout.cover) },
    uPhotoSize: { value: new THREE.Vector2(...initialSize) },
    uWindowPlanes: { value: orbitalWindowPlanes(ORBITAL_INTERIORS[initialProfile], ...initialSize).map(plane => new THREE.Vector3(...plane)) },
    uScreenMaps: { value: orbitalScreenMaps(ORBITAL_INTERIORS[initialProfile]).map(values => new THREE.Matrix3().set(...values)) },
    uReadoutRects: { value: orbitalReadoutRects(ORBITAL_INTERIORS[initialProfile]).map(bounds => new THREE.Vector4(...bounds)) },
    uEarth: { value: day }, uClouds: { value: clouds }, uNight: { value: night },
    uTime: { value: 0 }, uRotation: { value: 0 }, uCloudDrift: { value: 0 },
    uSunlight: { value: new THREE.Vector3() }, uDisplayTime: { value: 0 },
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
      uniforms.uSunlight.value.set(...sunlightDirectionAt(timestamp));
      uniforms.uDisplayTime.value = displayTimeAt(timestamp);
      uniforms.uCloudDrift.value = (((timestamp / 1000) * .0000011) % 1 + 1) % 1;
      cycloneStatesAt(timestamp).forEach((storm, index) => {
        uniforms.uCyclones.value[index].set(storm.longitudeRadians, storm.latitudeRadians, storm.radius, storm.strength);
        uniforms.uStormMotion.value[index].set(storm.phase, storm.direction, storm.seed, 0);
      });
    },
    resize(nextWidth, nextHeight) {
      if (disposed) return;
      const profileName = interiorForAspect(nextWidth, nextHeight);
      const selected = plates[profileName];
      const size = photoSize(selected);
      const profile = ORBITAL_INTERIORS[profileName];
      const next = orbitalLayout(nextWidth, nextHeight, profile, size);
      uniforms.uInterior.value = selected;
      uniforms.uPhotoSize.value.set(...size);
      uniforms.uCover.value.set(...next.cover);
      orbitalWindowPlanes(profile, ...size).forEach((plane, index) => uniforms.uWindowPlanes.value[index].set(...plane));
      orbitalScreenMaps(profile).forEach((values, index) => uniforms.uScreenMaps.value[index].set(...values));
      orbitalReadoutRects(profile).forEach((bounds, index) => uniforms.uReadoutRects.value[index].set(...bounds));
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
