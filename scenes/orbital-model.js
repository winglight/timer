// Ambient scene, not an orbit propagator or a live weather product.
// The Earth turns at its mean sidereal rate in an inertial presentation.
// A literal Earth-fixed geostationary observer would see the same longitude.
export const SIDEREAL_DAY_SECONDS = 86164.0905;
export const ORBITAL_EPOCH_MS = Date.UTC(2026, 0, 1);
export const TAU = Math.PI * 2;
export const MAX_CYCLONES = 6;

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;
const clamp = value => Math.min(1, Math.max(0, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const radians = degrees => degrees * Math.PI / 180;

/** One full turn per mean sidereal day, independent of frames and tab visibility. */
export function earthRotationAt(timestampMs) {
  if (!Number.isFinite(timestampMs)) throw new TypeError('Earth time must be finite');
  return positiveModulo((timestampMs - ORBITAL_EPOCH_MS) / 1000, SIDEREAL_DAY_SECONDS) /
    SIDEREAL_DAY_SECONDS * TAU;
}

// The origin stays well out at sea, including the full radius of the visible
// cloud system. The shader also clips all simulated storm clouds to the day
// map's ocean mask, so even outer rain bands cannot appear over land.
export const CYCLONE_BASINS = Object.freeze([
  { name: 'northwest-pacific', longitude: [139, 158], latitude: [16, 25] },
  { name: 'central-pacific', longitude: [-170, -147], latitude: [15, 24] },
  { name: 'northeast-pacific', longitude: [-138, -122], latitude: [12, 20] },
  { name: 'north-atlantic', longitude: [-55, -38], latitude: [17, 26] },
  { name: 'south-indian', longitude: [67, 88], latitude: [-25, -16] },
  { name: 'south-pacific', longitude: [-151, -127], latitude: [-26, -16] }
]);

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Reproducible, bounded ocean weather vignettes. Their evolution is intentionally
 * compressed to minutes for an ambient background; these are not current storms.
 */
export function cycloneStatesAt(timestampMs) {
  if (!Number.isFinite(timestampMs)) throw new TypeError('Weather time must be finite');
  const seconds = (timestampMs - ORBITAL_EPOCH_MS) / 1000;
  return CYCLONE_BASINS.map((basin, index) => {
    const period = 260 + index * 41;
    const local = seconds + index * 173.37;
    const generation = Math.floor(local / period);
    const age = positiveModulo(local, period);
    const random = seeded((generation ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
    const longitude = basin.longitude[0] + random() * (basin.longitude[1] - basin.longitude[0]);
    const latitude = basin.latitude[0] + random() * (basin.latitude[1] - basin.latitude[0]);
    const delay = 7 + random() * 34;
    const lifetime = period - delay - 15 - random() * 28;
    const progress = (age - delay) / lifetime;
    const strength = smooth(progress / .17) * smooth((1 - progress) / .25);
    const radius = .075 + random() * .05;
    const direction = latitude > 0 ? 1 : -1;
    const phase = random() * TAU + age * (.030 + random() * .019) * direction;
    return {
      basin: basin.name, longitude, latitude, direction, phase, strength,
      radius: radius * (.75 + .25 * smooth(progress / .5)),
      longitudeRadians: radians(longitude), latitudeRadians: radians(latitude),
      seed: random() * 100
    };
  });
}

// Aperture vertices use the original photograph's top-left coordinate system.
// They are calibrated to the inner glass, never to the white structural frame.
// Separate portrait framing preserves visible cabin equipment on narrow screens.
export const ORBITAL_INTERIORS = Object.freeze({
  landscape: {
    filename: 'orbital-interior.jpg',
    size: [1672, 941],
    aperture: [[299/1672, 194/941], [1375/1672, 194/941], [1408/1672, 233/941], [1406/1672, 644/941], [1358/1672, 695/941], [307/1672, 695/941], [261/1672, 644/941], [261/1672, 233/941]],
    // A real handrail crosses the lower glass. Stars can show through its gaps,
    // but fit the full Earth and atmosphere above the top edge of the rail.
    globeBottom: 665/941
  },
  portrait: {
    filename: 'orbital-interior-portrait.jpg',
    size: [1086, 1448],
    aperture: [[375/1086, 307/1448], [710/1086, 307/1448], [742/1086, 345/1448], [742/1086, 1059/1448], [710/1086, 1099/1448], [376/1086, 1099/1448], [342/1086, 1059/1448], [342/1086, 345/1448]]
  }
});

export const interiorForAspect = (width, height) => width / height <= 1 ? 'portrait' : 'landscape';

/** Centered cover transform for the undistorted photographic interior plate. */
export function orbitalPhotoCover(width, height, sourceWidth, sourceHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const x = width / (sourceWidth * scale), y = height / (sourceHeight * scale);
  return [x, y, (1 - x) / 2, (1 - y) / 2];
}

function polygonPlanes(polygon) {
  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const dx = next[0] - point[0], dy = next[1] - point[1];
    const length = Math.hypot(dx, dy);
    const nx = -dy / length, ny = dx / length;
    return [nx, ny, -(nx * point[0] + ny * point[1])];
  });
}

/** Source-image half planes keep the window matte attached to the exact pixels. */
export function orbitalWindowPlanes(profile, sourceWidth, sourceHeight) {
  const sourceAspect = sourceWidth / sourceHeight;
  return polygonPlanes(profile.aperture.map(([x, y]) => [x * sourceAspect, y]));
}

/**
 * Fit a complete circular Earth inside both the visible aperture and viewport.
 * Grid refinement maximizes clearance to the convex aperture's half-planes;
 * even extreme phone/ultrawide crops retain the entire globe and its atmosphere.
 */
export function orbitalLayout(width, height, profile, sourceSize) {
  width = Math.max(1, width); height = Math.max(1, height);
  const aspect = width / height;
  profile ||= ORBITAL_INTERIORS[interiorForAspect(width, height)];
  const [sourceWidth, sourceHeight] = sourceSize || profile.size;
  const cover = orbitalPhotoCover(width, height, sourceWidth, sourceHeight);
  const polygon = profile.aperture.map(([x, y]) => [
    (x - cover[2]) / cover[0] * aspect,
    (y - cover[3]) / cover[1]
  ]);
  const planes = polygonPlanes(polygon).concat([
    [1, 0, -.025 * aspect], [-1, 0, .975 * aspect],
    [0, 1, -.035], [0, -1, .965]
  ]);
  if (profile.globeBottom !== undefined) {
    planes.push([0, -1, (profile.globeBottom - cover[3]) / cover[1]]);
  }
  const clearance = (x, y) => Math.min(...planes.map(([nx, ny, d]) => nx * x + ny * y + d));
  let bestX = aspect * .5, bestY = .5, bestRadius = -Infinity;
  let left = 0, right = aspect, top = 0, bottom = 1;
  for (let level = 0; level < 5; level++) {
    const dx = (right - left) / 12, dy = (bottom - top) / 12;
    for (let row = 0; row <= 12; row++) {
      for (let col = 0; col <= 12; col++) {
        const x = left + col * dx, y = top + row * dy;
        const r = clearance(x, y);
        // Prefer central framing when a rectangular opening has many equally
        // good circle centers. This also avoids one-pixel resize jitter.
        const score = r - Math.hypot(x - aspect * .5, y - .47) * .0001;
        const previous = bestRadius - Math.hypot(bestX - aspect * .5, bestY - .47) * .0001;
        if (score > previous) { bestX = x; bestY = y; bestRadius = r; }
      }
    }
    left = Math.max(0, bestX - dx); right = Math.min(aspect, bestX + dx);
    top = Math.max(0, bestY - dy); bottom = Math.min(1, bestY + dy);
  }
  return {
    aspect, center: [bestX / aspect, 1 - bestY],
    radius: Math.max(.01, bestRadius * .86), cover,
    profile: interiorForAspect(width, height)
  };
}
