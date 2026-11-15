'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleURL = name => pathToFileURL(path.join(__dirname, '..', name)).href;

test('Earth completes one real sidereal revolution, including before the reference epoch', async () => {
  const { earthRotationAt, SIDEREAL_DAY_SECONDS, ORBITAL_EPOCH_MS, TAU } = await import(moduleURL('scenes/orbital-model.js'));
  const epoch = ORBITAL_EPOCH_MS;
  assert.equal(earthRotationAt(epoch), 0);
  assert.ok(Math.abs(earthRotationAt(epoch + SIDEREAL_DAY_SECONDS * 250) - Math.PI / 2) < 1e-10);
  assert.ok(Math.abs(earthRotationAt(epoch + SIDEREAL_DAY_SECONDS * 1000)) < 1e-10);
  assert.ok(Math.abs(earthRotationAt(epoch - SIDEREAL_DAY_SECONDS * 250) - Math.PI * 1.5) < 1e-10);
  const minute = earthRotationAt(epoch + 60_000) / TAU * 360;
  assert.ok(minute > .25 && minute < .251, 'real-time rotation must remain imperceptibly slow over a few seconds');
  assert.throws(() => earthRotationAt(NaN), /finite/);
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

test('full circular Earth fits inside the window through portrait, landscape and ultra-wide resizes', async () => {
  const { orbitalLayout } = await import(moduleURL('scenes/orbital-model.js'));
  for (const [width, height] of [[320, 720], [390, 844], [844, 390], [1440, 900], [2560, 1080]]) {
    const { center, radius, aspect } = orbitalLayout(width, height);
    assert.ok(center[0] - radius / aspect > .065);
    assert.ok(center[0] + radius / aspect < .935);
    assert.ok(center[1] - radius > .175);
    assert.ok(center[1] + radius < .905);
    assert.ok(Math.abs((radius / aspect) * width - radius * height) < 1e-10);
  }
});

test('scene resumes at wall-clock Earth orientation without resetting to animation elapsed', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createOrbitalScene } = await import(moduleURL('scenes/orbital.js'));
  const { ORBITAL_EPOCH_MS, earthRotationAt } = await import(moduleURL('scenes/orbital-model.js'));
  const earthTexture = new THREE.Texture({ width: 4096, height: 2048 });
  const cloudTexture = new THREE.Texture({ width: 2048, height: 1024 });
  const nightTexture = new THREE.Texture({ width: 2048, height: 1024 });
  let clock = ORBITAL_EPOCH_MS + 60_000;
  const handle = await createOrbitalScene({ width: 1440, height: 900, earthTexture, cloudTexture, nightTexture, now: () => clock });
  const uniforms = handle.scene.children[0].material.uniforms;
  handle.update(60);
  const initial = uniforms.uRotation.value;
  handle.update(10000);
  assert.equal(uniforms.uRotation.value, initial);
  clock += 3_600_000;
  handle.update(0);
  assert.equal(uniforms.uRotation.value, earthRotationAt(clock));
  assert.notEqual(uniforms.uRotation.value, initial);
  const camera = handle.camera.position.toArray();
  handle.resize(390, 844);
  assert.deepEqual(handle.camera.position.toArray(), camera);
  assert.equal(uniforms.uResolution.value.x, 390);
  assert.equal(uniforms.uResolution.value.y, 844);
  let ownedDisposals = 0, borrowedDisposals = 0;
  handle.scene.children[0].geometry.addEventListener('dispose', () => ownedDisposals++);
  handle.scene.children[0].material.addEventListener('dispose', () => ownedDisposals++);
  for (const texture of [earthTexture, cloudTexture, nightTexture]) texture.addEventListener('dispose', () => borrowedDisposals++);
  handle.dispose(); handle.dispose(); handle.update(10); handle.resize(1, 1);
  assert.equal(ownedDisposals, 2);
  assert.equal(borrowedDisposals, 0);
  assert.equal(handle.scene.children.length, 0);
  for (const texture of [earthTexture, cloudTexture, nightTexture]) texture.dispose();
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
    assert.equal(disposed.length, 2);
    assert.ok(disposed.some(url => url.endsWith('earth-day.jpg')));
    assert.ok(disposed.some(url => url.endsWith('earth-night.jpg')));
  } finally {
    THREE.TextureLoader.prototype.loadAsync = load;
  }
});
