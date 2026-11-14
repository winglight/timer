'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleURL = name => pathToFileURL(path.join(__dirname, '..', name)).href;

test('weather masks stay attached to source photo coordinates through portrait and landscape cropping', async () => {
  const { computePhotoCover } = await import(moduleURL('scenes/weather.js'));
  for (const [sourceWidth, sourceHeight] of [[1440, 2160], [1920, 1280]]) {
    for (const [width, height] of [[390, 844], [844, 390], [1280, 800], [2560, 1080]]) {
      const [x, y, ox, oy] = computePhotoCover(width, height, sourceWidth, sourceHeight);
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const left = (width - sourceWidth * scale) / 2;
      const top = (height - sourceHeight * scale) / 2;
      for (const [sx, sy] of [[0, 0], [.5, .5], [1, 1], [.23, .71]]) {
        const actual = [sx * x + ox, sy * y + oy];
        const expected = [(sx * width - left) / (sourceWidth * scale), (sy * height - top) / (sourceHeight * scale)];
        assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-12));
      }
    }
  }
});

test('scene factories update weather and water without moving the camera or the scene objects', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createOceanScene } = await import(moduleURL('scenes/ocean.js'));
  const { createWeatherScene } = await import(moduleURL('scenes/weather.js'));
  const texture = new THREE.Texture({ width: 1440, height: 2160 });
  const handles = [
    createOceanScene({ width: 390, height: 844 }),
    await createWeatherScene({ id: 'cabin', width: 390, height: 844, photoTexture: texture }),
    await createWeatherScene({ id: 'mountain', width: 390, height: 844, photoTexture: texture })
  ];
  for (const handle of handles) {
    const transforms = [];
    handle.scene.traverse(object => transforms.push([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]));
    const cameraPosition = handle.camera.position.toArray();
    const cameraRotation = handle.camera.quaternion.toArray();
    handle.update(20, .033);
    const after = [];
    handle.scene.traverse(object => after.push([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]));
    assert.deepEqual(after, transforms, 'motion belongs to environmental material/geometry, not camera shake');
    assert.deepEqual(handle.camera.position.toArray(), cameraPosition);
    assert.deepEqual(handle.camera.quaternion.toArray(), cameraRotation);
    assert.ok(handle.scene.children.every(object => object.material.uniforms.uTime.value === 20));
    handle.dispose();
  }
  texture.dispose();
});

test('each scene releases owned geometry and materials when it is replaced', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createOceanScene } = await import(moduleURL('scenes/ocean.js'));
  const { createWeatherScene } = await import(moduleURL('scenes/weather.js'));
  for (const id of ['ocean', 'cabin', 'mountain']) {
    const texture = new THREE.Texture({ width: 1920, height: 1280 });
    const handle = id === 'ocean' ? createOceanScene({ width: 1280, height: 800 }) :
      await createWeatherScene({ id, width: 1280, height: 800, photoTexture: texture });
    const resources = new Map();
    handle.scene.traverse(object => {
      for (const resource of [object.geometry, object.material]) {
        if (!resource || resources.has(resource)) continue;
        resources.set(resource, 0);
        resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
    });
    handle.dispose();
    assert.ok(resources.size > 0);
    assert.ok([...resources.values()].every(count => count === 1), id);
    assert.equal(handle.scene.children.length, 0);
    texture.dispose();
  }
});
