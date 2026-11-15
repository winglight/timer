# Ambient WebGL regression tests

Run the unit suite:

```sh
node --test tests/*.test.cjs
```

Run actual Chromium/WebGL2 shader compilation and rendering, using the repository's vendored Three.js and production scene loaders:

```sh
python -m pip install -r tests/requirements-webgl.txt
python -m playwright install --with-deps chromium
python tests/webgl-smoke.py
```

The runner serves this checkout on a loopback-only HTTP server. It reads scene IDs from `GPU_SCENES`, the versioned runtime URL and photograph/source-plate URLs from `index.html`, and exercises both 1280x720 and 390x844 viewports. Every scene must initialize without falling back, render non-empty pixels, produce changed pixels at different animation times, and have no WebGL or browser errors. The original `luminance` helper collision and reserved `active` identifier are also compiled as intentionally invalid controls; accepting either control fails the test.

Reports and live-buffer PNGs are written under `.webgl-results/`, which is ignored by Git. The GitHub Actions workflow runs these checks on main pushes and pull requests and keeps the artifacts for seven days. To run only selected scenes:

```sh
python tests/webgl-smoke.py --scenes starlight desert waterfall
```

`CHROMIUM_PATH` may select an already installed Chromium executable. The default uses Playwright's pinned browser. Chromium uses SwiftShader in this test, so a physical GPU is not required. Portrait viewport coverage is not an iOS/Safari hardware test, and successful compilation/motion checks do not certify photorealism or visual quality.
