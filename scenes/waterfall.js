import * as THREE from '../vendor/three.module.js';

// Source-coordinate flow follows the photographed waterfalls and their pool.
// Rocks, roots, foliage and the lip of the falls are outside the moving matte.
export const WATERFALL_VERTEX_SHADER = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const WATERFALL_FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform float uTime;
  varying vec2 vScreenUv;
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
  vec3 photo(vec2 p) {
    return texture2D(uPhoto, vec2(clamp(p.x, 0.001, 0.999), 1.0 - clamp(p.y, 0.001, 0.999))).rgb;
  }
  float ribbon(vec2 p, float x0, float x1, float width0, float width1, float top) {
    float t = clamp((p.y - top) / (0.734 - top), 0.0, 1.0);
    float center = mix(x0, x1, smoothstep(0.0, 0.28, t));
    float width = mix(width0, width1, t);
    return (1.0 - smoothstep(width * 0.65, width, abs(p.x - center))) *
      smoothstep(top, top + 0.025, p.y) * (1.0 - smoothstep(0.710, 0.744, p.y));
  }
  float fallsMatte(vec2 p, vec3 original) {
    float band = ribbon(p, 0.365, 0.365, 0.020, 0.023, 0.238);
    band = max(band, ribbon(p, 0.429, 0.425, 0.025, 0.037, 0.231));
    band = max(band, ribbon(p, 0.513, 0.512, 0.040, 0.047, 0.226));
    band = max(band, ribbon(p, 0.604, 0.606, 0.020, 0.031, 0.230));
    band = max(band, ribbon(p, 0.746, 0.782, 0.020, 0.031, 0.244));
    // Green moss inside a wide column still belongs to the cliff. Bright/cool
    // falling water supplies the finer silhouette within each geometric matte.
    float cool = smoothstep(0.69, 0.98, original.b / max(0.008, original.g));
    float luminance = dot(original, vec3(0.2126, 0.7152, 0.0722));
    return band * cool * smoothstep(0.025, 0.105, luminance);
  }
  vec3 fallingWater(vec2 p) {
    float phase = fract(uTime * 0.48);
    float other = fract(phase + 0.5);
    float weight = 1.0 - abs(phase * 2.0 - 1.0);
    float envelope = smoothstep(0.236, 0.32, p.y) * (1.0 - smoothstep(0.69, 0.744, p.y));
    float bend = (noise21(vec2(p.x * 90.0, p.y * 12.0 - uTime * 1.7)) - 0.5) * 0.0023 * envelope;
    vec2 a = vec2(p.x + bend, p.y - phase * 0.13 * envelope);
    vec2 b = vec2(p.x + bend, p.y - other * 0.13 * envelope);
    vec3 water = mix(photo(b), photo(a), weight);
    // Advected thin structure modulates the real water exposure. This moves
    // continuously down each fall instead of drawing detached white strokes.
    float pulse = noise21(vec2(p.x * 240.0, p.y * 23.0 - uTime * 3.8));
    pulse = pulse * 0.70 + noise21(vec2(p.x * 110.0 + 4.7, p.y * 14.0 - uTime * 2.0)) * 0.30;
    water *= mix(0.77, 1.19, smoothstep(0.15, 0.88, pulse));
    return water;
  }
  vec2 impactRipples(vec2 p, vec2 impact, float seed) {
    vec2 d = (p - impact) * vec2(1.0, 5.0);
    float distance = length(d);
    float envelope = exp(-distance * 17.0);
    float ripple = sin(distance * 190.0 - uTime * 2.5 + seed);
    vec2 direction = normalize(d + vec2(0.0001));
    return direction * vec2(0.0020, 0.0007) * ripple * envelope;
  }
  void main() {
    vec2 uvPhoto = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(uvPhoto.x, 1.0 - uvPhoto.y);
    vec3 original = texture2D(uPhoto, uvPhoto).rgb;
    float falls = fallsMatte(p, original);
    // The pool ends before the foreground rocks. A narrow, irregular lower
    // boundary and the original water colour protect the stones and fallen log.
    float lower = 0.790 + 0.008 * smoothstep(0.66, 0.94, p.x);
    float pool = smoothstep(0.735, 0.754, p.y) * (1.0 - smoothstep(lower - 0.010, lower, p.y));
    pool *= smoothstep(0.23, 0.33, p.x) * (1.0 - smoothstep(0.91, 0.98, p.x));
    float stone = smoothstep(0.12, 0.25, dot(original, vec3(0.2126, 0.7152, 0.0722)));
    pool *= 1.0 - stone;
    float alpha = max(falls, pool);
    if (alpha < 0.002) discard;
    vec3 fallColor = fallingWater(p);
    vec2 ripples = impactRipples(p, vec2(0.425, 0.738), 0.0);
    ripples += impactRipples(p, vec2(0.512, 0.738), 1.4);
    ripples += impactRipples(p, vec2(0.606, 0.738), 2.7);
    ripples += impactRipples(p, vec2(0.782, 0.738), 4.1);
    ripples.x += (noise21(vec2(p.x * 35.0 - uTime * 0.16, p.y * 95.0)) - 0.5) * 0.0025;
    vec3 poolColor = photo(p + ripples);
    vec3 color = mix(fallColor, poolColor, pool / max(0.001, falls + pool));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function photoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale), y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

export async function createWaterfallScene({ width, height, photoUrl, photoTexture }) {
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
    throw new Error('Waterfall photograph has no dimensions');
  }
  const uniforms = {
    uTime: { value: 0 }, uPhoto: { value: photo },
    uCover: { value: new THREE.Vector4(...photoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const material = new THREE.ShaderMaterial({
    name: 'photographic-waterfall-flow', uniforms,
    vertexShader: WATERFALL_VERTEX_SHADER, fragmentShader: WATERFALL_FRAGMENT_SHADER,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.name = 'Water descending over the photographed falls into a rippling pool';
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.position.z = 2;
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
