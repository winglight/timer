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
  float flowNoise(vec2 p, float speed, float scale) {
    vec2 flow = vec2(p.x * scale + 0.18 * sin(p.y * 8.0 + uTime * 0.7),
      p.y * (scale * 0.23) - uTime * speed);
    float broad = noise21(flow * 0.42);
    float fine = noise21(flow * 1.7 + 13.4);
    return broad * 0.42 + fine * 0.58;
  }
  float waterfallHighlight(vec2 p) {
    float n = flowNoise(p, 3.0, 190.0);
    float threads = smoothstep(0.48, 0.78, n);
    float glints = pow(max(0.0, sin(p.y * 105.0 - uTime * 4.2 +
      sin(p.x * 34.0) * 1.4)), 10.0);
    return 0.10 + threads * 0.20 + glints * 0.12;
  }
  float poolRipple(vec2 p, vec2 impact, float phase, float scale) {
    vec2 d = (p - impact) * vec2(1.0, 3.8);
    float distance = length(d);
    float radius = 0.003 + fract(uTime * 0.075 + phase) * 0.075;
    float ring = exp(-pow((distance - radius) * scale, 2.0));
    float fade = 1.0 - smoothstep(0.055, 0.085, distance);
    return ring * fade;
  }
  void main() {
    vec2 uvPhoto = vScreenUv * uCover.xy + uCover.zw;
    vec2 p = vec2(uvPhoto.x, 1.0 - uvPhoto.y);
    // The source photograph is sampled at its exact, undistorted coordinate.
    // Motion is drawn as light/shadow detail over water, never by shifting the
    // cliffs, stream banks or the waterfall photograph itself.
    vec3 original = texture2D(uPhoto, uvPhoto).rgb;
    float falls = fallsMatte(p, original);
    float lower = 0.790 + 0.008 * smoothstep(0.66, 0.94, p.x);
    float pool = smoothstep(0.735, 0.754, p.y) *
      (1.0 - smoothstep(lower - 0.010, lower, p.y));
    pool *= smoothstep(0.23, 0.33, p.x) * (1.0 - smoothstep(0.91, 0.98, p.x));
    float stone = smoothstep(0.12, 0.25, dot(original, vec3(0.2126, 0.7152, 0.0722)));
    pool *= 1.0 - stone;
    float alpha = max(falls, pool);
    if (alpha < 0.002) discard;

    float fallingGlints = waterfallHighlight(p);
    float poolGlints = 0.0;
    poolGlints += poolRipple(p, vec2(0.425, 0.738), 0.0, 165.0);
    poolGlints += poolRipple(p, vec2(0.512, 0.738), 0.23, 155.0);
    poolGlints += poolRipple(p, vec2(0.606, 0.738), 0.51, 145.0);
    poolGlints += poolRipple(p, vec2(0.782, 0.738), 0.72, 135.0);

    // A restrained moving sheen follows the real falling-water columns.
    // Expanding elliptical rings suggest water spreading across the pool.
    vec3 overlay = vec3(0.72, 0.86, 0.92) * (fallingGlints * falls * 0.72);
    overlay += vec3(0.52, 0.72, 0.78) * (poolGlints * pool * 0.22);
    gl_FragColor = vec4(original + overlay, alpha);
    #include <colorspace_fragment>
  }