'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleURL = name => pathToFileURL(path.join(__dirname, '..', name)).href;

test('Earth visibly turns about one degree per second with a continuous accelerated wall clock', async () => {
  const { earthRotationAt, SIDEREAL_DAY_SECONDS, EARTH_TIME_SCALE, EARTH_VISUAL_DAY_SECONDS, ORBITAL_EPOCH_MS, TAU } = await import(moduleURL('scenes/orbital-model.js'));
  const epoch = ORBITAL_EPOCH_MS;
  const angularError = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  assert.equal(EARTH_TIME_SCALE, 240);
  assert.equal(EARTH_VISUAL_DAY_SECONDS, SIDEREAL_DAY_SECONDS / EARTH_TIME_SCALE);
  assert.equal(earthRotationAt(epoch), 0);
  assert.ok(angularError(earthRotationAt(epoch + EARTH_VISUAL_DAY_SECONDS * 250), Math.PI / 2) < 1e-7);
  assert.ok(angularError(earthRotationAt(epoch + EARTH_VISUAL_DAY_SECONDS * 1000), 0) < 1e-7);
  assert.ok(angularError(earthRotationAt(epoch - EARTH_VISUAL_DAY_SECONDS * 250), Math.PI * 1.5) < 1e-7);
  const threeSeconds = earthRotationAt(epoch + 3000) / TAU * 360;
  assert.ok(threeSeconds > 2.9 && threeSeconds < 3.1, 'landmarks should move visibly during ordinary viewing');
  assert.throws(() => earthRotationAt(NaN), /finite/);
});

test('sunlight moves the terminator independently while keeping a substantial day side visible', async () => {
  const { sunlightDirectionAt, SUNLIGHT_CYCLE_SECONDS, ORBITAL_EPOCH_MS } = await import(moduleURL('scenes/orbital-model.js'));
  for (let second = -210; second <= 420; second += 3) {
    const direction = sunlightDirectionAt(ORBITAL_EPOCH_MS + second * 1000);
    assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-12);
    assert.ok(direction[2] >= .06 - 1e-12 && direction[2] <= .5 + 1e-12, 'never leave a nearly black or fully sunlit disk');
    const later = sunlightDirectionAt(ORBITAL_EPOCH_MS + (second + 10) * 1000);
    assert.ok(Math.hypot(...direction.map((value, i) => value - later[i])) > .22, 'the actual lighting boundary changes over ten seconds');
  }
  assert.deepEqual(sunlightDirectionAt(ORBITAL_EPOCH_MS + SUNLIGHT_CYCLE_SECONDS * 1000), sunlightDirectionAt(ORBITAL_EPOCH_MS));
  assert.throws(() => sunlightDirectionAt(Infinity), /finite/);
});

test('instrument content maps to actual glass corners in both photographs', async () => {
  const { orbitalScreenMaps, orbitalReadoutRects, ORBITAL_INTERIORS, displayTimeAt, ORBITAL_EPOCH_MS } = await import(moduleURL('scenes/orbital-model.js'));
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const profile of Object.values(ORBITAL_INTERIORS)) {
    const matrices = orbitalScreenMaps(profile);
    assert.equal(matrices.length, 2);
    profile.screens.forEach((quad, index) => quad.forEach(([x, y], corner) => {
      const matrix = matrices[index], px = x / profile.size[0], py = y / profile.size[1];
      const divisor = matrix[6] * px + matrix[7] * py + matrix[8];
      const u = (matrix[0] * px + matrix[1] * py + matrix[2]) / divisor;
      const v = (matrix[3] * px + matrix[4] * py + matrix[5]) / divisor;
      assert.ok(Math.abs(u - corners[corner][0]) < 1e-10 && Math.abs(v - corners[corner][1]) < 1e-10);
    }));
    for (const [left, top, right, bottom] of orbitalReadoutRects(profile)) {
      assert.ok(left > 0 && top > 0 && right < 1 && bottom < 1 && left < right && top < bottom);
    }
  }
  assert.equal(displayTimeAt(ORBITAL_EPOCH_MS + 2500), 2.5);
  assert.equal(displayTimeAt(ORBITAL_EPOCH_MS - 500), 3599.5);
  assert.throws(() => displayTimeAt(NaN), /finite/);
});

test('random cyclone generations stay in warm ocean basins and turn according to hemisphere', async () => {
  const { cycloneStatesAt, CYCLONE_BASINS, ORBITAL_EPOCH_MS } = await import(moduleURL('scenes/orbital-model.js'));
  const positions = new Set();
  let births = 0, mature = 0;
  for (let second = -1000; second < 24000; second += 31) {
    const states = cycloneStatesAt(ORBITAL_EPOCH_MS + second * 1000);
    assert.equal(states.length, 6);
    states.forEach((state, index) => {
      const basin = CYCLONE_BASINS[index];
      assert.ok(state.longitude >= basin.longitude[0] && state.longitude <= basin.longitude[1]);
      assert.ok(state.latitude >= basin.latitude[0] && state.latitude <= basin.latitude[1]);
      assert.ok(Math.abs(state.latitude) >= 12 && Math.abs(state.latitude) <= 26);
      assert.equal(state.direction, state.latitude > 0 ? 1 : -1);
      assert.ok(state.radius >= .056 && state.radius <= .125);
      assert.ok(state.strength >= 0 && state.strength <= 1);
      assert.ok(Number.isFinite(state.phase));
      if (state.strength === 0) births++;
      if (state.strength > .95) mature++;
      positions.add(state.longitude.toFixed(5));
    });
  }
  assert.ok(positions.size > 200, 'successive events change positions');
  assert.ok(births > 0 && mature > 0, 'events grow and dissipate instead of popping at full strength');
  assert.deepEqual(cycloneStatesAt(ORBITAL_EPOCH_MS + 400_000), cycloneStatesAt(ORBITAL_EPOCH_MS + 400_000));
});

test('complete Earth and atmosphere fit the visible photographic aperture after every cover crop', async () => {
  const { orbitalLayout, orbitalWindowPlanes, ORBITAL_INTERIORS, interiorForAspect } = await import(moduleURL('scenes/orbital-model.js'));
  for (const [width, height] of [[320, 720], [390, 844], [844, 390], [1024, 1024], [1200, 900], [1440, 900], [2560, 1080]]) {
    const profile = ORBITAL_INTERIORS[interiorForAspect(width, height)];
    const { center, radius, aspect, cover } = orbitalLayout(width, height);
    const sourceAspect = profile.size[0] / profile.size[1];
    const planes = orbitalWindowPlanes(profile, ...profile.size);
    assert.ok(Math.abs((radius / aspect) * width - radius * height) < 1e-10);
    // Probe the atmosphere's outer edge against original-photo coordinates.
    for (let step = 0; step < 360; step += 3) {
      const angle = step * Math.PI / 180;
      const screenX = center[0] + Math.cos(angle) * radius * 1.065 / aspect;
      const screenY = center[1] + Math.sin(angle) * radius * 1.065;
      assert.ok(screenX > 0 && screenX < 1 && screenY > 0 && screenY < 1);
      const sourceX = (screenX * cover[0] + cover[2]) * sourceAspect;
      const sourceY = (1 - screenY) * cover[1] + cover[3];
      assert.ok(planes.every(([nx, ny, d]) => nx * sourceX + ny * sourceY + d > 0), `${width}x${height} atmosphere stays within window`);
      if (profile.globeBottom !== undefined) {
        assert.ok(sourceY < profile.globeBottom, 'whole Earth and halo remain above the photographed handrail');
      }
    }
  }
});

test('scene resumes at wall-clock Earth orientation without resetting to animation elapsed', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createOrbitalScene } = await import(moduleURL('scenes/orbital.js'));
  const { ORBITAL_EPOCH_MS, earthRotationAt, sunlightDirectionAt, displayTimeAt, ORBITAL_INTERIORS, orbitalPhotoCover, orbitalScreenMaps, orbitalReadoutRects } = await import(moduleURL('scenes/orbital-model.js'));
  const earthTexture = new THREE.Texture({ width: 4096, height: 2048 });
  const cloudTexture = new THREE.Texture({ width: 2048, height: 1024 });
  const nightTexture = new THREE.Texture({ width: 2048, height: 1024 });
  const interiorTexture = new THREE.Texture({ width: ORBITAL_INTERIORS.landscape.size[0], height: ORBITAL_INTERIORS.landscape.size[1] });
  const interiorPortraitTexture = new THREE.Texture({ width: ORBITAL_INTERIORS.portrait.size[0], height: ORBITAL_INTERIORS.portrait.size[1] });
  const borrowed = [earthTexture, cloudTexture, nightTexture, interiorTexture, interiorPortraitTexture];
  let clock = ORBITAL_EPOCH_MS + 60_000;
  const handle = await createOrbitalScene({ width: 1440, height: 900, earthTexture, cloudTexture, nightTexture, interiorTexture, interiorPortraitTexture, now: () => clock });
  const uniforms = handle.scene.children[0].material.uniforms;
  assert.equal(uniforms.uInterior.value, interiorTexture);
  handle.update(60);
  const initial = uniforms.uRotation.value;
  const initialSun = uniforms.uSunlight.value.toArray();
  const initialScreenClock = uniforms.uDisplayTime.value;
  handle.update(10000);
  assert.equal(uniforms.uRotation.value, initial);
  assert.deepEqual(uniforms.uSunlight.value.toArray(), initialSun);
  assert.equal(uniforms.uDisplayTime.value, initialScreenClock, 'all independent scene motion survives elapsed-clock resets');
  clock += 3_600_000;
  handle.update(0);
  assert.equal(uniforms.uRotation.value, earthRotationAt(clock));
  assert.notEqual(uniforms.uRotation.value, initial);
  assert.deepEqual(uniforms.uSunlight.value.toArray(), sunlightDirectionAt(clock));
  assert.equal(uniforms.uDisplayTime.value, displayTimeAt(clock));
  const camera = handle.camera.position.toArray();
  handle.resize(390, 844);
  assert.deepEqual(handle.camera.position.toArray(), camera);
  assert.equal(uniforms.uResolution.value.x, 390);
  assert.equal(uniforms.uResolution.value.y, 844);
  assert.equal(uniforms.uInterior.value, interiorPortraitTexture);
  assert.deepEqual(uniforms.uScreenMaps.value.map(matrix => matrix.toArray()), orbitalScreenMaps(ORBITAL_INTERIORS.portrait).map(values => new THREE.Matrix3().set(...values).toArray()));
  assert.deepEqual(uniforms.uReadoutRects.value.map(rect => rect.toArray()), orbitalReadoutRects(ORBITAL_INTERIORS.portrait));
  assert.deepEqual(uniforms.uCover.value.toArray(), orbitalPhotoCover(390, 844, ...ORBITAL_INTERIORS.portrait.size));
  handle.resize(1024, 1024);
  assert.equal(uniforms.uInterior.value, interiorPortraitTexture, 'matches the CSS max-aspect-ratio: 1/1 source');
  handle.resize(2560, 1080);
  assert.equal(uniforms.uInterior.value, interiorTexture);
  assert.deepEqual(uniforms.uCover.value.toArray(), orbitalPhotoCover(2560, 1080, ...ORBITAL_INTERIORS.landscape.size));
  let ownedDisposals = 0, borrowedDisposals = 0;
  handle.scene.children[0].geometry.addEventListener('dispose', () => ownedDisposals++);
  handle.scene.children[0].material.addEventListener('dispose', () => ownedDisposals++);
  for (const texture of borrowed) texture.addEventListener('dispose', () => borrowedDisposals++);
  handle.dispose(); handle.dispose(); handle.update(10); handle.resize(1, 1);
  assert.equal(ownedDisposals, 2);
  assert.equal(borrowedDisposals, 0);
  assert.equal(handle.scene.children.length, 0);
  for (const texture of borrowed) texture.dispose();
});

test('failed asset loading releases other textures even when they finish later', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createOrbitalScene } = await import(moduleURL('scenes/orbital.js'));
  const load = THREE.TextureLoader.prototype.loadAsync;
  const disposed = [];
  THREE.TextureLoader.prototype.loadAsync = async function(url) {
    if (url.endsWith('earth-clouds.jpg')) throw new Error('Cloud image unavailable');
    await new Promise(resolve => setTimeout(resolve, url.endsWith('earth-night.jpg') ? 5 : 1));
    const texture = new THREE.Texture({ width: 2048, height: 1024 });
    texture.addEventListener('dispose', () => disposed.push(url));
    return texture;
  };
  try {
    await assert.rejects(createOrbitalScene({ width: 390, height: 844 }), /Cloud image unavailable/);
    assert.equal(disposed.length, 4);
    assert.ok(disposed.some(url => url.endsWith('earth-day.jpg')));
    assert.ok(disposed.some(url => url.endsWith('earth-night.jpg')));
    assert.ok(disposed.some(url => url.endsWith('orbital-interior.jpg')));
    assert.ok(disposed.some(url => url.endsWith('orbital-interior-portrait.jpg')));
  } finally {
    THREE.TextureLoader.prototype.loadAsync = load;
  }
});
