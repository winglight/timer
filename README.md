# Timer

A calm, browser-based breathing practice timer with particle guidance, practice history, optional cloud sync, immersive animated scenes, and ambient soundscapes.

## Live demo

https://timer.broyustudio.com/

## Features

- Configure inhale, exhale, hold, and total session duration
- Follow a breathing orb surrounded by a fine-particle corona
- Reduced-motion support, phase cues, pause/resume, early finish, and screen wake lock
- Practice calendar, monthly statistics, streaks, daily goals, session details, and JSON export
- Share a high-resolution practice snapshot to X
- Browser-local persistence with migration from legacy breath_settings and breath_history data
- Optional Cloudflare R2 synchronization for settings and practice history
- Nine ambience scenes: sunset lake, ocean at dusk, sea of clouds, forest cabin, misty forest, waterfall, starry night, cherry blossoms, and desert dusk
- A three.js pilot for ocean, rainy cabin and mountain clouds: real geometric ocean waves and consistent sky reflections; layered, softly tapered rain with roof/tree occlusion; evolving cloud density behind a protected ridge
- The other six scenes retain their existing local motion. All backgrounds run before and during practice and can be switched off independently
- Seven real field recordings for waves, rain, birds, forest ambience, a brook, campfire, and breeze; no synthesized noise
- Independent scene and sound pickers, volume adjustment, saved preferences, and automatic restoration of enabled audio with a first-interaction fallback when the browser blocks autoplay
- English and Simplified Chinese UI; responsive desktop and mobile layouts

## Media credits

Background photographs are served from Unsplash under the Unsplash License: Raffaele Landi (sunset lake), Anja de Necker (ocean at dusk), ki Zhang (mountain cloud sea), and Gadiel Lazcano (forest cabin).

Ambient recordings are served from Wikimedia Commons: [Oceanwavescrushing.ogg](https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg) by Luftrum (CC BY 3.0), [Sound of light rainfall.ogg](https://commons.wikimedia.org/wiki/File:Sound_of_light_rainfall.ogg) by Mijesty (CC BY-SA 4.0), and [Birdsong morning 01.ogg](https://commons.wikimedia.org/wiki/File:Birdsong_morning_01.ogg) by Martin Thurnherr (CC BY-SA 4.0).

## Project structure

The app uses vanilla HTML, CSS, and JavaScript.

- index.html — application structure
- engine.js — deterministic breathing timer model
- corona.js — particle corona renderer
- app.js — UI interactions, session history, cues, calendar, and sync
- ambient.js — scene preferences and recorded ambient audio playback/restoration
- scene-motion.js — isolated, frame-limited environmental animation
- scene-runtime.js — lazy shared WebGL renderer, scene switching and lifecycle
- scenes/ocean.js — procedural sky and geometric ocean waves
- scenes/weather.js — photograph-aligned rain, mist and cloud shaders
- vendor/ — locally served three.js 0.187.0 and its MIT license
- assets/scenes/ — same-origin cabin/cloud photographs and source credits
- share.js — practice snapshot generation and sharing
- styles.css — visual design, ambience, and responsive layout

## Development and tests

Run the existing test suite with:

    node --test tests/*.test.cjs

## Ambient playback and motion

Choose an ambient sound once to save it with its volume. On the next visit, the app attempts to resume that recording automatically. If the browser requires user interaction, the sound picker shows a tap-to-play state; the next click, tap, or key press on the page retries playback. A blocked autoplay attempt is distinguished from a recording that failed to load. Explicitly pausing a recording or choosing Silence is also remembered.

Ocean at dusk uses a fixed-camera three.js water mesh with multiple directional waves, fine ripples and a shared sky/reflection lighting model. The rainy cabin and mountain clouds retain their stationary photographs, with source-coordinate masks for foreground occlusion and animated weather layers. These three scenes never run the previous Canvas strip-displacement or line effects in parallel.

The WebGL renderer loads only when a pilot scene is selected. It targets 30 fps, caps pixel density at 1.25 and its drawing surface near 1.2 megapixels. Other scenes retain the existing Canvas renderer. These are rendering budgets, not claims about measured mobile performance or battery life.

Motion runs while the page is visible, including before a breathing session starts. Background Off, page suspension and the operating system's reduced-motion setting stop animation. A failed module/texture load, shader error or lost WebGL context leaves the still photograph available. Scene switches discard stale asynchronous results and dispose obsolete GPU resources. The timer and independent ambient audio remain usable.

Tests cover scene routing, asynchronous load races, paused clocks, fallback and GPU resource cleanup. Visual quality is also checked using actual shader/geometry renders; movement counts alone do not establish realism. Mobile-browser sustained performance and power use require device testing.

## Language

English is the default repository README. See [简体中文](README.zh-CN.md) for the Chinese documentation.
