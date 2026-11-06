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
- Four optional animated ambience scenes: sunset dusk, ocean beach, cloud mountain, and forest cabin
- Procedural ambient soundscapes: rain, ocean waves, forest birds, mountain wind, fireplace, white noise, and pink noise
- Independent scene and sound controls, volume adjustment, and saved preferences
- English and Simplified Chinese UI; responsive desktop and mobile layouts

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