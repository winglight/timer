/* Environmental scenes share one lazy WebGL renderer. UI and audio stay in DOM. */
export const GPU_SCENES = new Set(['ocean', 'cabin', 'mountain', 'sunset', 'forest', 'blossom']);

// Water needs enough physical pixels to resolve fine normals and reflections.
// Soft volumetric effects have separate budgets; the accepted cabin stays at
// its original quality. These limits describe allocation, not measured fps.
const SCENE_QUALITY = {
  ocean: { density: 2, pixels: 8000000 },
  sunset: { density: 2, pixels: 8000000 },
  mountain: { density: 1.5, pixels: 1600000 },
  forest: { density: 1.5, pixels: 2000000 },
  blossom: { density: 2, pixels: 4000000 },
  cabin: { density: 1.25, pixels: 1200000 }
};

export function scenePixelRatio(id, width, height, devicePixelRatio = 1) {
  const quality = SCENE_QUALITY[id] || SCENE_QUALITY.cabin;
  return Math.min(devicePixelRatio || 1, quality.density,
    Math.sqrt(quality.pixels / (Math.max(1, width) * Math.max(1, height))));
}

async function createThreeRenderer({ canvas, width, height, pixelRatio }) {
  const THREE = await import('./vendor/three.module.js');
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: false, powerPreference: 'low-power',
    depth: true, stencil: false, preserveDrawingBuffer: false
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.debug.onShaderError = (gl, program) => {
    throw new Error('Ambient shader compilation failed: ' + gl.getProgramInfoLog(program));
  };
  const engine = {
    setSize(w, h, ratio) { renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); },
    render(scene, camera) { renderer.render(scene, camera); },
    clear() { renderer.setRenderTarget(null); renderer.clear(true, true, true); },
    dispose() { renderer.dispose(); }
  };
  engine.setSize(width, height, pixelRatio);
  return engine;
}

async function createScene(options) {
  if (options.id === 'ocean') {
    const { createOceanScene } = await import('./scenes/ocean.js?v=20261115-1');
    return createOceanScene(options);
  }
  if (options.id === 'sunset') {
    const { createLakeScene } = await import('./scenes/lake.js?v=20261115-1');
    return createLakeScene(options);
  }
  if (options.id === 'mountain') {
    const { createCloudScene } = await import('./scenes/clouds.js?v=20261115-1');
    return createCloudScene(options);
  }
  if (options.id === 'forest' || options.id === 'blossom') {
    const { createWoodlandScene } = await import('./scenes/woodland.js?v=20261115-1');
    return createWoodlandScene(options);
  }
  const { createWeatherScene } = await import('./scenes/weather.js?v=20261114-3');
  return createWeatherScene(options);
}

export class SceneRuntime {
  constructor(world, canvas, options = {}) {
    this.world = world;
    this.canvas = canvas;
    this.window = options.window || globalThis.window;
    this.document = options.document || globalThis.document;
    const Observer = options.MutationObserver || globalThis.MutationObserver;
    this.createRenderer = options.createRenderer || createThreeRenderer;
    this.createScene = options.createScene || createScene;
    this.scene = 'none';
    this.active = null;
    this.renderer = null;
    this.rendererPromise = null;
    this.loading = null;
    this.generation = 0;
    this.failedScene = null;
    this.destroyed = false;
    this.pageSuspended = false;
    this.contextLost = false;
    this.frameId = null;
    this.elapsed = 0;
    this.lastFrame = this.lastDraw = null;
    this.renderedElapsed = 0;
    this.frameInterval = 1000 / 30;
    this.ready = Promise.resolve();
    this.reducedMotion = this.window.matchMedia('(prefers-reduced-motion: reduce)');
    this.onFrame = timestamp => this.tick(timestamp);
    this.onResize = () => this.resize();
    this.onVisibility = () => this.syncPlayback();
    this.onPageHide = () => { this.pageSuspended = true; this.syncPlayback(); };
    this.onPageShow = () => { this.pageSuspended = false; this.syncPlayback(); };
    this.onContextLost = event => {
      event.preventDefault();
      this.contextLost = true;
      this.generation++;
      this.loading = null;
      this.stop();
      this.show(false);
      this.disposeScene();
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.failedScene = null;
      // Three registers its own restoration listener after this controller.
      // Defer rebuilding until that listener has restored the renderer state.
      this.ready = new Promise(resolve => {
        setTimeout(() => {
          if (this.destroyed || this.contextLost) { resolve(); return; }
          this.resize();
          this.syncPlayback();
          resolve(this.loading);
        }, 0);
      });
    };
    this.observer = new Observer(() => this.setScene(this.world.dataset.scene));
    this.observer.observe(world, { attributes: true, attributeFilter: ['data-scene'] });
    this.window.addEventListener('resize', this.onResize);
    this.window.addEventListener('pagehide', this.onPageHide);
    this.window.addEventListener('pageshow', this.onPageShow);
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.addEventListener('change', this.onVisibility);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
    this.setScene(world.dataset.scene);
  }

  resize() {
    if (this.destroyed) return;
    const bounds = this.world.getBoundingClientRect();
    this.width = Math.max(1, Math.round(bounds.width));
    this.height = Math.max(1, Math.round(bounds.height));
    this.pixelRatio = scenePixelRatio(this.scene, this.width, this.height, this.window.devicePixelRatio);
    if (this.renderer && !this.contextLost) this.renderer.setSize(this.width, this.height, this.pixelRatio);
    if (this.active) this.active.resize(this.width, this.height);
    if (this.shouldAnimate()) this.render(0);
  }

  show(visible) {
    this.canvas.classList.toggle('is-ready', visible);
  }

  disposeScene() {
    const active = this.active;
    this.active = null;
    if (active) active.dispose();
  }

  setScene(id) {
    if (this.destroyed) return this.ready;
    const next = GPU_SCENES.has(id) ? id : 'none';
    if (next === this.scene && this.failedScene !== next) {
      this.syncPlayback();
      return this.ready;
    }
    this.generation++;
    this.loading = null;
    this.stop();
    this.show(false);
    this.disposeScene();
    if (this.renderer && !this.contextLost) this.renderer.clear();
    this.scene = next;
    this.resize();
    this.failedScene = null;
    this.ready = Promise.resolve();
    this.elapsed = this.renderedElapsed = 0;
    this.syncPlayback();
    return this.ready;
  }

  canRun() {
    return !this.destroyed && !this.contextLost && this.scene !== 'none' &&
      !this.document.hidden && !this.pageSuspended && !this.reducedMotion.matches;
  }

  shouldAnimate() { return this.canRun() && !!this.active; }

  async getRenderer() {
    if (this.renderer) return this.renderer;
    if (!this.rendererPromise) {
      this.rendererPromise = Promise.resolve().then(() => this.createRenderer({
        canvas: this.canvas, width: this.width, height: this.height, pixelRatio: this.pixelRatio
      })).then(renderer => {
        if (this.destroyed) { renderer.dispose(); return null; }
        this.renderer = renderer;
        renderer.setSize(this.width, this.height, this.pixelRatio);
        return renderer;
      }).catch(error => { this.rendererPromise = null; throw error; });
    }
    return this.rendererPromise;
  }

  prepare() {
    if (!this.canRun() || this.loading || this.active || this.failedScene === this.scene) return this.ready;
    const generation = this.generation, id = this.scene;
    // Capture the selected image before any asynchronous import or texture load.
    const image = this.world.querySelector('[data-scene-layer="' + id + '"] img');
    const photoUrl = image ? (image.currentSrc || image.src) : '';
    const task = (async () => {
      let handle = null;
      try {
        const renderer = await this.getRenderer();
        if (!renderer || this.destroyed || generation !== this.generation || this.contextLost) return;
        handle = await this.createScene({ id, width: this.width, height: this.height, photoUrl });
        if (this.destroyed || generation !== this.generation || this.contextLost) {
          handle.dispose();
          return;
        }
        handle.resize(this.width, this.height);
        this.active = handle;
        handle = null;
        if (this.shouldAnimate()) {
          this.render(0);
          this.start();
        }
      } catch (error) {
        if (handle) handle.dispose();
        if (generation === this.generation && !this.destroyed) this.fail(error);
      } finally {
        if (generation === this.generation) this.loading = null;
      }
    })();
    this.loading = task;
    this.ready = task;
    return task;
  }

  fail(error) {
    this.failedScene = this.scene;
    this.stop();
    this.show(false);
    this.disposeScene();
    if (this.renderer && !this.contextLost) this.renderer.clear();
    // Keep the photographic fallback and all timer controls usable.
    this.window.console?.warn('The ambient scene is using its still photograph.', error);
  }

  syncPlayback() {
    if (!this.canRun()) {
      this.stop();
      if (this.scene === 'none' || this.reducedMotion.matches || this.contextLost || this.destroyed) {
        this.show(false);
      }
      return this.ready;
    }
    if (this.active) {
      this.render(0);
      this.start();
    } else {
      this.prepare();
    }
    return this.ready;
  }

  start() {
    if (this.shouldAnimate() && this.frameId === null) this.frameId = this.window.requestAnimationFrame(this.onFrame);
  }

  stop() {
    if (this.frameId !== null) this.window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.lastFrame = this.lastDraw = null;
  }

  render(delta) {
    if (!this.shouldAnimate()) return;
    try {
      this.active.update(this.elapsed, delta);
      this.renderer.render(this.active.scene, this.active.camera);
      this.renderedElapsed = this.elapsed;
      this.show(true);
    } catch (error) { this.fail(error); }
  }

  tick(timestamp) {
    this.frameId = null;
    if (!this.shouldAnimate()) return;
    if (this.lastFrame === null) {
      this.lastFrame = this.lastDraw = timestamp;
    } else {
      this.elapsed += Math.min(Math.max(0, (timestamp - this.lastFrame) / 1000), .1);
      this.lastFrame = timestamp;
      const interval = timestamp - this.lastDraw;
      // Preserve cadence on 60/90/120Hz screens instead of dropping the remainder.
      if (interval + .5 >= this.frameInterval) {
        this.lastDraw += Math.max(1, Math.floor((interval + .5) / this.frameInterval)) * this.frameInterval;
        this.render(Math.min(this.elapsed - this.renderedElapsed, .1));
      }
    }
    this.start();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation++;
    this.stop();
    this.show(false);
    this.disposeScene();
    this.observer.disconnect();
    this.window.removeEventListener('resize', this.onResize);
    this.window.removeEventListener('pagehide', this.onPageHide);
    this.window.removeEventListener('pageshow', this.onPageShow);
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.removeEventListener('change', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
  }
}

if (typeof document !== 'undefined') {
  const world = document.getElementById('ambient-world');
  const canvas = document.getElementById('scene-webgl');
  if (world && canvas) new SceneRuntime(world, canvas);
}
