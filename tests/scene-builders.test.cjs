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
  ocean: [2400, 1600], cabin: [1440, 2160], mountain: [2400, 1600],
  sunset: [2400, 1800], forest: [2400, 1600], blossom: [2400, 1590],
  waterfall: [2400, 1600], starlight: [2400, 1526], desert: [2400, 1590]
};

async function buildScene(id, width = 390, height = 844) {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const factories = {
    ocean: ['ocean', 'createOceanScene'], cabin: ['weather', 'createWeatherScene'],
    mountain: ['clouds', 'createCloudScene'], sunset: ['lake', 'createLakeScene'],
    forest: ['woodland', 'createWoodlandScene'], blossom: ['woodland', 'createWoodlandScene'],
    waterfall: ['waterfall', 'createWaterfallScene'],
    starlight: ['landscape', 'createLandscapeScene'], desert: ['landscape', 'createLandscapeScene']
  };
  const [file, name] = factories[id];
  const factory = (await import(moduleURL('scenes/' + file + '.js')))[name];
  const texture = new THREE.Texture({ width: sizes[id][0], height: sizes[id][1] });
  const animalTexture = id === 'forest' ? new THREE.Texture({ width: 1536, height: 1024 }) : null;
  const borrowedTextures = [texture, animalTexture].filter(Boolean);
  const handle = await factory({ id, width, height, photoTexture: texture, animalTexture });
  return { handle, texture, borrowedTextures, disposeBorrowed() { borrowedTextures.forEach(value => value.dispose()); } };
}

test('scene factories animate the environment while keeping cameras and photograph placement fixed', async () => {
  for (const id of Object.keys(sizes)) {
    const { handle, disposeBorrowed } = await buildScene(id);
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
    handle.dispose(); disposeBorrowed();
  }
});

test('each scene releases owned geometry, materials and generated textures without disposing borrowed photographs', async () => {
  for (const id of Object.keys(sizes)) {
    const { handle, borrowedTextures, disposeBorrowed } = await buildScene(id, 1280, 800);
    let borrowedDisposals = 0;
    borrowedTextures.forEach(texture => texture.addEventListener('dispose', () => borrowedDisposals++));
    const resources = new Map();
    handle.scene.traverse(object => {
      const generatedTextures = Object.values(object.material?.uniforms || {}).map(uniform => uniform.value)
        .filter(value => value?.isTexture && !borrowedTextures.includes(value));
      for (const resource of [object.geometry, object.material, ...generatedTextures]) {
        if (!resource || resources.has(resource)) continue;
        resources.set(resource, 0);
        resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
    });
    handle.dispose();
    handle.dispose();
    assert.ok(resources.size > 0);
    assert.ok([...resources.values()].every(count => count === 1), id + ' releases every generated resource once');
    assert.equal(borrowedDisposals, 0, id + ' retains caller texture ownership');
    assert.equal(handle.scene.children.length, 0);
    disposeBorrowed();
  }
});

test('a missing wildlife atlas leaves forest mist running and keeps photograph ownership intact', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createWoodlandScene } = await import(moduleURL('scenes/woodland.js'));
  const texture = new THREE.Texture({ width: 2400, height: 1600 });
  const originalLoad = THREE.TextureLoader.prototype.loadAsync;
  const originalWarn = console.warn;
  let loads = 0, warnings = 0, photoDisposals = 0;
  texture.addEventListener('dispose', () => photoDisposals++);
  THREE.TextureLoader.prototype.loadAsync = async function(url) {
    assert.ok(url.endsWith('/assets/scenes/squirrel-atlas.png'));
    loads++;
    throw new Error('Atlas unavailable');
  };
  console.warn = () => warnings++;
  let handle;
  try {
    handle = await createWoodlandScene({ id: 'forest', width: 390, height: 844, photoTexture: texture });
    handle.update(5);
    assert.equal(loads, 1);
    assert.equal(warnings, 1);
    assert.equal(handle.scene.children.length, 1);
    assert.equal(handle.scene.children[0].material.uniforms.uTime.value, 5);
    handle.dispose();
    assert.equal(photoDisposals, 0);
  } finally {
    handle?.dispose();
    THREE.TextureLoader.prototype.loadAsync = originalLoad;
    console.warn = originalWarn;
    texture.dispose();
  }
});

test('forest disposal releases a successfully loaded wildlife atlas only once', async () => {
  const THREE = await import(moduleURL('vendor/three.module.js'));
  const { createWoodlandScene } = await import(moduleURL('scenes/woodland.js'));
  const texture = new THREE.Texture({ width: 2400, height: 1600 });
  const animal = new THREE.Texture({ width: 1536, height: 1024 });
  const originalLoad = THREE.TextureLoader.prototype.loadAsync;
  let disposals = 0;
  animal.addEventListener('dispose', () => disposals++);
  THREE.TextureLoader.prototype.loadAsync = async () => animal;
  let handle;
  try {
    handle = await createWoodlandScene({ id: 'forest', width: 390, height: 844, photoTexture: texture });
    assert.equal(handle.scene.children.length, 2);
    handle.dispose(); handle.dispose();
    assert.equal(disposals, 1);
  } finally {
    handle?.dispose();
    THREE.TextureLoader.prototype.loadAsync = originalLoad;
    texture.dispose();
  }
});

test('photo-based scenes keep mattes aligned after rotation and wide-screen cropping', async () => {
  const { computePhotoCover } = await import(moduleURL('scenes/weather.js'));
  for (const id of Object.keys(sizes)) {
    const { handle, disposeBorrowed } = await buildScene(id);
    for (const [width, height] of [[390, 844], [844, 390], [1280, 800], [2560, 1080]]) {
      handle.resize(width, height);
      const expected = computePhotoCover(width, height, ...sizes[id]);
      handle.scene.traverse(object => {
        const cover = object.material?.uniforms.uCover?.value;
        if (cover) assert.deepEqual(cover.toArray(), expected, id);
      });
    }
    handle.dispose(); disposeBorrowed();
  }
});

test('scene geometry has finite positions, valid indices and bounded instance attributes', async () => {
  for (const id of Object.keys(sizes)) {
    const { handle, disposeBorrowed } = await buildScene(id, 2560, 1440);
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
    handle.dispose(); disposeBorrowed();
  }
});


test('star field uses independently seeded random positions, sizes and twinkle timing', async () => {
  const { STARLIGHT_FRAGMENT_SHADER } = await import(moduleURL('scenes/landscape.js'));
  assert.match(STARLIGHT_FRAGMENT_SHADER, /floor\(q \* vec2\(92\.0, 54\.0\)\)/);
  assert.match(STARLIGHT_FRAGMENT_SHADER, /mix\(0\.00115, 0\.0032, sizeSeed\)/);
  assert.match(STARLIGHT_FRAGMENT_SHADER, /mix\(0\.65, 2\.9/);
  assert.match(STARLIGHT_FRAGMENT_SHADER, /pulsePhase/);
});

test('desert sand gusts have randomized event intervals, duration, size and velocity', async () => {
  const { DESERT_FRAGMENT_SHADER } = await import(moduleURL('scenes/landscape.js'));
  assert.match(DESERT_FRAGMENT_SHADER, /mix\(4\.5, 11\.5/);
  assert.match(DESERT_FRAGMENT_SHADER, /mix\(0\.9, 2\.8/);
  assert.match(DESERT_FRAGMENT_SHADER, /mix\(0\.018, 0\.064/);
  assert.match(DESERT_FRAGMENT_SHADER, /mix\(0\.10, 0\.34/);
  assert.match(DESERT_FRAGMENT_SHADER, /distantValley/);
});

test('waterfall animation never displaces the source photograph and uses moving overlay details', async () => {
  const { WATERFALL_FRAGMENT_SHADER } = await import(moduleURL('scenes/waterfall.js'));
  assert.match(WATERFALL_FRAGMENT_SHADER, /exact, undistorted coordinate/);
  assert.match(WATERFALL_FRAGMENT_SHADER, /waterfallHighlight\(p\)/);
  assert.match(WATERFALL_FRAGMENT_SHADER, /poolRipple\(p/);
  assert.doesNotMatch(WATERFALL_FRAGMENT_SHADER, /photo\(p\s*\+/);
  assert.doesNotMatch(WATERFALL_FRAGMENT_SHADER, /p\.y\s*-\s*phase\s*\*\s*0\.13/);
});

test('star field has visible random stars at multiple pixel sizes and independent twinkle phases', async () => {
  const { STARLIGHT_FRAGMENT_SHADER } = await import(moduleURL('scenes/landscape.js'));
  assert.match(STARLIGHT_FRAGMENT_SHADER, /mix\(0\.00115, 0\.0032, sizeSeed\)/);
  assert.match(STARLIGHT_FRAGMENT_SHADER, /pulseSpeed/);
  assert.match(STARLIGHT_FRAGMENT_SHADER, /pulsePhase/);
  assert.match(STARLIGHT_FRAGMENT_SHADER, /starTint \* starVisibility \* 1\.55/);
});