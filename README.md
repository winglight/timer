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
- Nine three.js scenes with motion attached to their photographed surroundings: surf and reflections, bright cloud banks, rain, woodland wildlife, bending blossom branches, flowing falls, a drifting star field, and canyon wind
- All backgrounds run before and during practice and can be switched off independently
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
- scene-runtime.js — lazy shared WebGL renderer, scene switching and lifecycle
- scenes/ocean.js — irregular water geometry, photographed surf and sunset reflections
- scenes/lake.js — photograph-aligned wave geometry and landscape reflections
- scenes/clouds.js — sharp photographic cloud banks with drift, heave and protected mountain ridges
- scenes/weather.js — the existing photograph-aligned cabin rain
- scenes/woodland.js — woodland wildlife, light mist and wind-bent photographic blossoms
- scenes/waterfall.js — masked photographic water flow, refraction and pool ripples
- scenes/landscape.js — moving photographic stars and canyon clouds, ground wind and heat shimmer
- vendor/ — locally served three.js 0.187.0 and its MIT license
- assets/scenes/ — same-origin scene photographs and source credits
- share.js — practice snapshot generation and sharing
- styles.css — visual design, ambience, and responsive layout

## Development and tests

Run the existing test suite with:

    node --test tests/*.test.cjs

## Ambient playback and motion

Choose an ambient sound once to save it with its volume. On the next visit, the app attempts to resume that recording automatically. If the browser requires user interaction, the sound picker shows a tap-to-play state; the next click, tap, or key press on the page retries playback. A blocked autoplay attempt is distinguished from a recording that failed to load. Explicitly pausing a recording or choosing Silence is also remembered.

Ocean at dusk follows the lake's photographic reflection approach. Irregular, mostly aligned waves carry the actual photographed foam and water detail, while normals respond to the original sunset light. This replaces the old crossed wave pattern and synthetic sky. The accepted sunset lake and cabin rain retain their existing rendering parameters.

Mountain clouds use a 2400-pixel source photograph with continuous local drift and heave. The original cloud ridges supply the detail; the grey volumetric noise layer has been removed. Cloud colour and this scene's shading are lifted while mountains and sky stay fixed. Cherry blossoms bend the photographed foreground branch and blooms around their attachment point, rather than leaving them still behind falling petal particles. Forest wildlife moves along the ground and a tree trunk, with light mist as a secondary effect.

The waterfall transports the photographed water within masks, preserving rocks and foliage, with a responsive pool surface. The star field itself turns slowly and its real highlights twinkle; the mountain silhouette is fixed. Canyon clouds drift over stable rock formations, with low sand streamers and restrained distant heat shimmer. These are photographic 2.5D effects and water geometry, not a full fluid or atmospheric simulation.

All nine scenes share one WebGL renderer and one animation loop targeting 30 fps. The obsolete Canvas overlays have been removed. Water uses a higher drawing-buffer budget for reflections, and photographic detail has its own allocation limit:

| Scenes | Maximum pixel density | Drawing surface budget |
| --- | ---: | ---: |
| Ocean and sunset lake | 2 | 8 megapixels |
| Clouds, forest, blossoms, waterfall, stars and desert | 2 | 4 megapixels |
| Cabin rain | 1.25 | 1.2 megapixels |

The density never exceeds the device's own pixel ratio. A 390 × 844 viewport on a high-density phone now draws water at 780 × 1688 pixels. Quality changes reuse the same renderer, and selecting cabin rain restores its previous budget. These are allocation limits, not measured mobile performance or battery-life results.

Motion runs while the page is visible, including before a breathing session starts. Background Off, page suspension and the operating system's reduced-motion setting stop animation. A failed module/texture load, shader error or lost WebGL context leaves the still photograph available. Scene switches discard stale asynchronous results and dispose obsolete GPU resources. The timer and independent ambient audio remain usable.

Tests cover scene routing, asynchronous load races, paused clocks, fallback and GPU resource cleanup. Visual quality is also checked using actual shader/geometry renders; movement counts alone do not establish realism. Mobile-browser sustained performance and power use require device testing.

## Language

English is the default repository README. See [简体中文](README.zh-CN.md) for the Chinese documentation.
