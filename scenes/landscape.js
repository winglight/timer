import * as THREE from '../vendor/three.module.js';
import { computePhotoCover } from './weather.js';

const VERTEX_SHADER = /* glsl */`
  varying vec2 vScreenUv;
  void main() {
    vScreenUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PHOTO_UNIFORMS = /* glsl */`
  uniform sampler2D uPhoto;
  uniform vec4 uCover;
  uniform vec2 uPhotoSize;
  uniform float uTime;
  varying vec2 vScreenUv;
  vec3 photo(vec2 p) { return texture2D(uPhoto, vec2(p.x, 1.0 - p.y)).rgb; }
  float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const STARLIGHT_FRAGMENT_SHADER = PHOTO_UNIFORMS + /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
  }
  vec3 skyPhoto(vec2 p) {
    vec3 color = photo(p);
    // The source exposure includes a stationary aircraft trail. Reconstruct
    // this narrow strip from neighbouring sky before animating the star field.
    float trail = 1.0 - smoothstep(0.0022, 0.0040,
      segmentDistance(p, vec2(0.4400, 0.47395), vec2(0.5750, 0.51068)));
    if (trail > 0.0) {
      vec2 normal = vec2(-0.0025, 0.0080);
      color = mix(color, (photo(p + normal) + photo(p - normal)) * 0.5, trail);
    }
    return color;
  }
  void main() {
    vec2 uv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(uv.x, 1.0 - uv.y);
    // The photographic mountain silhouette and the sunset horizon never move.
    float sky = 1.0 - smoothstep(0.70, 0.805, p.y);
    if (sky < 0.001) discard;
    // A bounded, slow arc keeps the photographed atmospheric glow and stars
    // within their original sky. Unbounded rotation eventually folds the
    // horizon into the upper sky during a long focus session.
    float angle = 0.024 * sin(uTime * 0.055) + 0.010 * sin(uTime * 0.019);
    float aspect = uPhotoSize.x / uPhotoSize.y;
    vec2 center = vec2(0.43, 0.29);
    vec2 q = (p - center) * vec2(aspect, 1.0);
    q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * q;
    q = q / vec2(aspect, 1.0) + center;
    // Ease the small displacement to zero at the source edges and horizon.
    // There are no mirrored star fields or duplicate static stars underneath.
    float edge = smoothstep(0.0, 0.06, p.x) * (1.0 - smoothstep(0.94, 1.0, p.x)) *
      smoothstep(0.0, 0.055, p.y);
    q = mix(p, q, sky * edge);
    vec3 color = skyPhoto(q);

    // Each sky cell independently decides whether to host a star. Position,
    // radius, hue, pulse speed and phase are seeded per cell, so the field is
    // irregular and never flashes in sync.
    vec2 grid = floor(q * vec2(92.0, 54.0));
    float stars = 0.0;
    vec3 starTint = vec3(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cell = grid + vec2(float(x), float(y));
        float seed = hash(cell + 17.31);
        if (seed < 0.16) {
          vec2 jitter = vec2(hash(cell + 3.7), hash(cell + 8.9));
          vec2 starPosition = (cell + 0.16 + 0.68 * jitter) / vec2(92.0, 54.0);
          float sizeSeed = hash(cell + 29.4);
          float radius = mix(0.00115, 0.0032, sizeSeed);
          float distanceToStar = length((q - starPosition) * vec2(1.0, 0.82));
          float core = exp(-distanceToStar * distanceToStar / (radius * radius * 1.7));
          float pulseSpeed = mix(0.65, 2.9, hash(cell + 43.2));
          float pulsePhase = hash(cell + 61.8) * 6.2831853;
          float pulse = 0.20 + 0.80 * (0.5 + 0.5 * sin(uTime * pulseSpeed + pulsePhase));
          float brightness = mix(0.32, 1.0, hash(cell + 79.1)) * pulse;
          float present = 1.0;
          stars += core * brightness * present;
          starTint += core * brightness * mix(vec3(0.72, 0.82, 1.0),
            vec3(1.0, 0.91, 0.76), hash(cell + 97.6)) * present;
        }
      }
    }
    float starVisibility = sky * (1.0 - smoothstep(0.69, 0.78, p.y));
    color += starTint * starVisibility * 1.55;

    // One brief meteor at a time; the entire sky keeps its photographic detail.
    float phase = mod(uTime + 5.0, 29.0);
    if (phase < 1.25) {
      float progress = phase / 1.25;
      vec2 start = vec2(0.32, 0.25);
      vec2 travel = vec2(0.25, 0.14);
      vec2 head = start + travel * progress;
      vec2 d = (p - head) * vec2(aspect, 1.0);
      vec2 axis = normalize(travel * vec2(aspect, 1.0));
      float along = dot(d, axis);
      float across = abs(dot(d, vec2(-axis.y, axis.x)));
      float streak = exp(-across * across / 0.0000011) *
        smoothstep(-0.11, -0.008, along) * (1.0 - smoothstep(-0.002, 0.003, along));
      float fade = smoothstep(0.0, 0.16, progress) * (1.0 - smoothstep(0.70, 1.0, progress));
      color += vec3(0.50, 0.58, 0.69) * streak * fade;
    }
    // The UV displacement already fades to the original horizon. Opaque
    // replacement preserves one star image instead of crossfading two.
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export const DESERT_FRAGMENT_SHADER = PHOTO_UNIFORMS + /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }
  float dustNoise(vec2 p) { return noise(p) * 0.68 + noise(p * 2.13 + 7.4) * 0.32; }
  float skyColor(vec3 c) {
    // Even blue-lit cliff shadows are much darker than this daylight sky.
    // Chroma alone would copy their silhouettes into the drifting clouds.
    float warmth = (c.r - c.b) / max(c.r + c.b, 0.025);
    float blue = 1.0 - smoothstep(-0.025, 0.065, warmth);
    return blue * smoothstep(0.17, 0.21, luminance(c));
  }
  float skyMask(vec2 p, vec3 c) {
    // Leave a few source pixels around each rock outline intact, including
    // its antialiased blue fringe. Apply the same guard to the source UV.
    vec2 margin = 7.0 / uPhotoSize;
    float clear = min(skyColor(c), skyColor(photo(p + vec2(margin.x, 0.0))));
    clear = min(clear, skyColor(photo(p - vec2(margin.x, 0.0))));
    clear = min(clear, skyColor(photo(p + vec2(0.0, margin.y))));
    clear = min(clear, skyColor(photo(p - vec2(0.0, margin.y))));
    return clear * (1.0 - smoothstep(0.52, 0.57, p.y));
  }
  float outsideBox(vec2 p, vec2 lo, vec2 hi) {
    return length(max(max(lo - p, p - hi), vec2(0.0)));
  }
  float skyClearance(vec2 p) {
    // Conservative photo-space envelopes protect the whole canyon, including
    // its blue-lit shadows. A broad, smooth distance fade makes clouds settle
    // beside the rocks before their source UV could ever reach a rock pixel.
    float gap = max(0.53 - p.y, 0.0);
    gap = min(gap, outsideBox(p, vec2(-0.1, 0.20), vec2(0.14, 1.1)));
    gap = min(gap, outsideBox(p, vec2(0.135, 0.40), vec2(0.405, 1.1)));
    gap = min(gap, outsideBox(p, vec2(0.189, 0.349), vec2(0.223, 1.1)));
    gap = min(gap, outsideBox(p, vec2(0.481, 0.447), vec2(0.516, 1.1)));
    gap = min(gap, outsideBox(p, vec2(0.736, 0.387), vec2(0.818, 1.1)));
    gap = min(gap, max((1.409 - 1.059 * p.x - p.y) / 1.457, 0.0));
    return smoothstep(0.0, 0.085, gap);
  }
  float gustDust(vec2 p, float seed) {
    float interval = mix(4.5, 11.5, hash(vec2(seed, 2.7)));
    float offset = hash(vec2(seed, 8.1)) * interval;
    float eventTime = mod(uTime + offset, interval);
    float duration = mix(0.9, 2.8, hash(vec2(seed, 5.1)));
    float active = smoothstep(0.0, 0.16, eventTime) *
      (1.0 - smoothstep(duration - 0.28, duration, eventTime));
    float progress = clamp(eventTime / duration, 0.0, 1.0);
    float startX = mix(-0.28, 0.58, hash(vec2(seed, 11.3)));
    float speed = mix(0.10, 0.34, hash(vec2(seed, 14.9)));
    float centerX = startX + progress * speed;
    float centerY = mix(0.635, 0.755, hash(vec2(seed, 19.7)));
    float width = mix(0.018, 0.064, hash(vec2(seed, 23.1)));
    float height = mix(0.0022, 0.0085, hash(vec2(seed, 27.5)));
    float curve = centerY + 0.0045 * sin((p.x - centerX) * 13.0 + progress * 5.0);
    vec2 local = vec2((p.x - centerX) / width, (p.y - curve) / height);
    float body = exp(-local.x * local.x * 1.35 - local.y * local.y * 1.8);
    float wisps = dustNoise(vec2((p.x - centerX) * 42.0 + uTime * 0.9,
      p.y * 175.0 + seed * 17.0));
    return body * smoothstep(0.28, 0.62, wisps) * active *
      mix(0.35, 1.0, hash(vec2(seed, 31.9)));
  }
  void main() {
    vec2 uv = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(uv.x, 1.0 - uv.y);
    vec3 original = photo(p), color = original;
    float sky = skyMask(p, original);
    // The actual pale clouds drift across the canyon. Red rock and its outline
    // are selected out by source colour, so cliffs cannot wobble with the sky.
    float wind = 0.025 * sin(uTime * 0.085) + 0.009 * sin(uTime * 0.037);
    float edge = smoothstep(0.0, 0.06, p.x) * (1.0 - smoothstep(0.94, 1.0, p.x));
    vec2 cloudPoint = p + vec2(-wind, 0.0018 * sin(p.x * 9.0 + uTime * 0.11)) *
      edge * sky * skyClearance(p);
    vec3 drifting = photo(cloudPoint);
    color = mix(color, drifting, sky * skyMask(cloudPoint, drifting));

    // A tiny refractive shimmer occupies the hot distant valley. Nearby rocks,
    // bushes and foreground stay sharp; the camera and whole photo stay fixed.
    float distanceBand = smoothstep(0.53, 0.61, p.y) * (1.0 - smoothstep(0.71, 0.78, p.y));
    float bareGround = smoothstep(0.055, 0.13, luminance(original));
    float heat = (noise(vec2(p.x * 47.0, p.y * 68.0 - uTime * 0.72)) - 0.5) * 0.0017;
    vec3 refracted = photo(p + vec2(heat, heat * 0.32) * distanceBand * bareGround);
    color = mix(color, refracted, distanceBand * bareGround);

    // Distant gusts are separate events with independent random intervals,
    // launch points, heights, widths, durations and speeds. They cross the
    // valley as soft, broken veils instead of three permanent horizontal bands.
    float dust = 0.0;
    for (int i = 0; i < 5; i++) dust += gustDust(p, float(i) + 1.0);
    float openGround = smoothstep(0.030, 0.11, luminance(original));
    float distantValley = smoothstep(0.565, 0.625, p.y) *
      (1.0 - smoothstep(0.775, 0.835, p.y));
    float dustAlpha = clamp(dust * edge * distantValley *
      (0.24 + openGround * 0.76) * 0.78, 0.0, 0.22);
    color = mix(color, vec3(0.67, 0.43, 0.24), dustAlpha);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export async function createLandscapeScene({ id, width, height, photoUrl, photoTexture }) {
  if (id !== 'starlight' && id !== 'desert') throw new Error('Unknown landscape scene: ' + id);
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
    throw new Error('Landscape photograph has no dimensions');
  }
  const uniforms = {
    uTime: { value: 0 }, uPhoto: { value: texture },
    uPhotoSize: { value: new THREE.Vector2(sourceWidth, sourceHeight) },
    uCover: { value: new THREE.Vector4(...computePhotoCover(width, height, sourceWidth, sourceHeight)) }
  };
  const material = new THREE.ShaderMaterial({
    name: id === 'starlight' ? 'photographic-starfield' : 'canyon-clouds-and-ground-wind',
    uniforms, vertexShader: VERTEX_SHADER,
    fragmentShader: id === 'starlight' ? STARLIGHT_FRAGMENT_SHADER : DESERT_FRAGMENT_SHADER,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
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
      if (ownsPhoto) texture.dispose();
      scene.clear();
    }
  };
}
