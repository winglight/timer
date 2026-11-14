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

const sizes = {
  ocean: [2400, 1600], cabin: [1440, 2160], mountain: [1920, 1280],
  sunset: [2400, 1800], forest: [2400, 1600], blossom: [2400, 1590]
};

async function buildScene(id, width = 390, height = 844) {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const factories = {
    ocean: ['ocean', 'createOceanScene'], cabin: ['weather', 'createWeatherScene'],
    mountain: ['clouds', 'createCloudScene'], sunset: ['lake', 'createLakeScene'],
    forest: ['woodland', 'createWoodlandScene'], blossom: ['woodland', 'createWoodlandScene']
  };
  const [file, name] = factories[id];
  const factory = (await import(moduleURL('scenes/' + file + '.js')))[name];
  const texture = new THREE.Texture({ width: sizes[id][0], height: sizes[id][1] });
  const handle = await factory({ id, width, height, photoTexture: texture });
  return { handle, texture };
}

test('scene factories animate the environment while keeping cameras and photograph placement fixed', async () => {
  for (const id of Object.keys(sizes)) {
    const { handle, texture } = await buildScene(id);
    const transforms = [];
    handle.scene.traverse(object => transforms.push([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]));
    const cameraPosition = handle.camera.position.toArray();
    const cameraRotation = handle.camera.quaternion.toArray();
    handle.update(20, .033);
    const after = [];
    handle.scene.traverse(object => after.push([object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]));
    assert.deepEqual(after, transforms, id + ' must not wobble the whole picture');
    assert.deepEqual(handle.camera.position.toArray(), cameraPosition);
    assert.deepEqual(handle.camera.quaternion.toArray(), cameraRotation);
    assert.ok(handle.scene.children.every(object => object.material.uniforms.uTime.value === 20));
    handle.dispose(); texture.dispose();
  }
});

test('each scene releases owned geometry, materials and generated textures without disposing borrowed photographs', async () => {
  for (const id of Object.keys(sizes)) {
    const { handle, texture } = await buildScene(id, 1280, 800);
    let borrowedDisposals = 0;
    texture.addEventListener('dispose', () => borrowedDisposals++);
    const resources = new Map();
    handle.scene.traverse(object => {
      const generatedTextures = Object.values(object.material?.uniforms || {}).map(uniform => uniform.value)
        .filter(value => value?.isTexture && value !== texture);
      for (const resource of [object.geometry, object.material, ...generatedTextures]) {
        if (!resource || resources.has(resource)) continue;
        resources.set(resource, 0);
        resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
    });
    handle.dispose();
    assert.ok(resources.size > 0);
    assert.ok([...resources.values()].every(count => count === 1), id + ' releases every generated resource once');
    assert.equal(borrowedDisposals, 0, id + ' retains caller texture ownership');
    assert.equal(handle.scene.children.length, 0);
    texture.dispose();
  }
});

test('photo-based scenes keep mattes aligned after rotation and wide-screen cropping', async () => {
  const { computePhotoCover } = await import(moduleURL('scenes/weather.js'));
  for (const id of ['cabin', 'mountain', 'sunset', 'forest']) {
    const { handle, texture } = await buildScene(id);
    for (const [width, height] of [[390, 844], [844, 390], [1280, 800], [2560, 1080]]) {
      handle.resize(width, height);
      const expected = computePhotoCover(width, height, ...sizes[id]);
      handle.scene.traverse(object => {
        const cover = object.material?.uniforms.uCover?.value;
        if (cover) assert.deepEqual(cover.toArray(), expected, id);
      });
    }
    handle.dispose(); texture.dispose();
  }
});

test('dense water and curved petals contain finite geometry and valid triangle indices', async () => {
  for (const id of ['ocean', 'sunset', 'blossom']) {
    const { handle, texture } = await buildScene(id, 2560, 1440);
    handle.scene.traverse(object => {
      if (!object.geometry) return;
      const { attributes, index, instanceCount } = object.geometry;
      assert.ok([...attributes.position.array].every(Number.isFinite), id + ' positions are finite');
      if (attributes.normal) assert.ok([...attributes.normal.array].every(Number.isFinite), id + ' normals are finite');
      if (index) assert.ok([...index.array].every(value => value >= 0 && value < attributes.position.count), id + ' indices cannot wrap or overflow');
      if (object.geometry.isInstancedBufferGeometry) {
        for (const attribute of Object.values(attributes)) {
          if (attribute.isInstancedBufferAttribute) assert.ok(instanceCount <= attribute.count * attribute.meshPerAttribute);
        }
      }
    });
    handle.dispose(); texture.dispose();
  }
});
