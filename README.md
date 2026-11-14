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
- Nine photographic ambience scenes: sunset lake, ocean at dusk, sea of clouds, forest cabin, misty forest, waterfall, starry night, cherry blossoms, and desert dusk
- Gentle water movement, falling rain, drifting clouds and mist, and other scene-specific motion, available before and during practice; backgrounds can be switched off independently
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
- share.js — practice snapshot generation and sharing
- styles.css — visual design, ambience, and responsive layout

## Development and tests

Run the existing test suite with:

    node --test tests/*.test.cjs

## Ambient playback and motion

Choose an ambient sound once to save it with its volume. On the next visit, the app attempts to resume that recording automatically. If the browser requires user interaction, the sound picker shows a tap-to-play state; the next click, tap, or key press on the page retries playback. A blocked autoplay attempt is distinguished from a recording that failed to load. Explicitly pausing a recording or choosing Silence is also remembered.

The photographic background stays fixed while a separate canvas animates local environmental details. Motion runs while the page is visible, including before a breathing session starts. Switching the background off, leaving the tab, or enabling the operating system's reduced-motion setting stops the animation loop. The renderer limits its frame rate and drawing resolution to keep the timer and controls responsive.

## Language

English is the default repository README. See [简体中文](README.zh-CN.md) for the Chinese documentation.
