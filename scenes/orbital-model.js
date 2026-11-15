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

/** Screen-space layout keeps the full globe inside the unobstructed window. */
export function orbitalLayout(width, height) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  return { aspect, center: [.5, .555], radius: Math.min(.315, aspect * .355) };
}
