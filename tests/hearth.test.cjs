'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const source = name => pathToFileURL(path.join(__dirname, '..', name)).href;

test('firelight is continuous, bounded and reproducible through pauses', async () => {
  const { firelightAt } = await import(source('scenes/hearth.js'));
  const intensities = [], lateralPositions = [];
  for (let i = 0; i <= 600; i++) {
    const time = i / 10;
    const value = firelightAt(time);
    const nearby = firelightAt(time + 0.001);
    assert.ok(value.every(Number.isFinite));
    assert.ok(value[0] >= 0.42 && value[0] <= 1.56);
    assert.ok(Math.abs(value[1]) <= 0.007 && Math.abs(value[2]) <= 0.0085);
    assert.ok(value.every((v, component) => Math.abs(v - nearby[component]) < 0.009));
    assert.deepEqual(value, firelightAt(time));
    intensities.push(value[0]); lateralPositions.push(value[1]);
  }
  assert.ok(Math.max(...intensities) - Math.min(...intensities) > 0.25);
  assert.ok(Math.max(...lateralPositions) - Math.min(...lateralPositions) > 0.008);
  assert.deepEqual(firelightAt(NaN), firelightAt(0));
});

test('portrait crop keeps the hearth centred and photo-space masks aligned', async () => {
  const THREE = await import(source('vendor/three.module.js'));
  const { createHearthScene, HEARTH_LAYOUT, firelightAt } = await import(source('scenes/hearth.js'));
  const texture = new THREE.Texture({ width: 1672, height: 941 });
  const handle = await createHearthScene({ width: 1440, height: 900, photoTexture: texture });
  const material = handle.scene.children[0].material;
  const cameraMatrix = handle.camera.matrix.toArray();
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900], [2560, 1080]]) {
    handle.resize(width, height);
    const cover = material.uniforms.uCover.value.toArray();
    const scale = Math.max(width / 1672, height / 941);
    assert.ok(Math.abs(cover[0] - width / (1672 * scale)) < 1e-12);
    assert.ok(Math.abs(cover[1] - height / (941 * scale)) < 1e-12);
    const screenFireX = (HEARTH_LAYOUT.fire[0] - cover[2]) / cover[0];
    assert.ok(screenFireX > 0.45 && screenFireX < 0.55);
  }
  handle.update(23.4, 0.033);
  assert.deepEqual(material.uniforms.uFireLight.value.toArray(), firelightAt(23.4));
  assert.deepEqual(handle.camera.matrix.toArray(), cameraMatrix);
  handle.dispose(); texture.dispose();
});

test('hearth releases generated resources exactly once and retains borrowed photographs', async () => {
  const THREE = await import(source('vendor/three.module.js'));
  const { createHearthScene } = await import(source('scenes/hearth.js'));
  const texture = new THREE.Texture({ width: 1672, height: 941 });
  let photographDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
  texture.addEventListener('dispose', () => photographDisposals++);
  const handle = await createHearthScene({ width: 390, height: 844, photoTexture: texture });
  const mesh = handle.scene.children[0];
  mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  mesh.material.addEventListener('dispose', () => materialDisposals++);
  handle.dispose(); handle.dispose();
  handle.resize(1920, 1080); handle.update(1000);
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(photographDisposals, 0);
  assert.equal(handle.scene.children.length, 0);
  texture.dispose();
});
