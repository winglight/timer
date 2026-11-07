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
- Four photographic ambience scenes: sunset lake, ocean at dusk, sea of clouds, and a forest cabin
- Slow camera drift and subtle scene-specific motion, with a dedicated off state
- Real field recordings for ocean waves, soft rainfall, and morning birdsong; no synthesized noise
- Independent one-click scene and sound pickers, volume adjustment, and saved preferences (audio requires a user gesture after reload)
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
- ambient.js — ambience scene selection and Web Audio sound generation
- share.js — practice snapshot generation and sharing
- styles.css — visual design, ambience, and responsive layout

## Development and tests

Run the existing test suite with:

    node --test tests/*.test.cjs

## Language

English is the default repository README. See [简体中文](README.zh-CN.md) for the Chinese documentation.