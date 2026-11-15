'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// This inexpensive guard supplements, but never replaces, the real browser
// compilation/render tests in webgl-smoke.py.
test('scene shaders avoid engine helper collisions and GLSL reserved active', async () => {
  const directory = path.join(__dirname, '..', 'scenes');
  let checked = 0;
  for (const file of await fs.readdir(directory)) {
    if (!file.endsWith('.js')) continue;
    const module = await import(pathToFileURL(path.join(directory, file)).href);
    for (const [name, value] of Object.entries(module)) {
      if (!name.includes('SHADER') || typeof value !== 'string') continue;
      const source = value.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      const label = file + ':' + name;
      assert.doesNotMatch(source, /\bfloat\s+luminance\s*\(/, label + ' redefines the Three.js helper');
      assert.doesNotMatch(source, /\bactive\b/, label + ' uses a reserved GLSL identifier');
      checked++;
    }
  }
  assert.ok(checked > 10, 'inspect the exported shaders, not an empty file list');
});
