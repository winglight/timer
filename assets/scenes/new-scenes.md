# Cabin fireplace and orbital observatory assets

The room interiors are original generated photographic artwork, created with
the built-in OpenAI image-generation tool on 2026-11-15. They depict fictional
spaces; they are not documentary photographs of a cabin or an actual ISS module.

## Cabin fireplace

- `hearth-natural.jpg`: final 1672 × 941 generated photograph with an ordinary
  small wood fire, charred bark, ash and ember detail. The source PNG was
  converted to quality-94 JPEG without changing its framing.
- `hearth-still.jpg`: the same approved photograph, used for static,
  reduced-motion and unavailable-WebGL fallback.
- `hearth-thumb.jpg`: 240 × 150 menu thumbnail.
- `hearth.jpg`: earlier unlit room plate, retained as the generation source.
  The live scene no longer loads it.

The live shader moves only small regions of the photographed flames. Both ends
of a displaced lookup must stay above the measured log silhouette. The logs,
bark, stonework and furniture retain their original source coordinates. Existing
flame pixels and reflected room light vary gently in brightness; no synthetic
flame, glowing rectangular log or artificial crack layer is added.

Four small existing floor-shadow regions use a low-frequency difference mask,
limited to 3.5 source pixels of motion and ±1.6% modulation. This is an artistic
photographic light effect, not three-dimensional combustion, wood-fracture or
ray-traced shadow simulation.

### Final fire generation prompt

The original unlit `hearth.jpg` was supplied as the editing reference:

> Use case: precise-object-edit. Edit the supplied wooden cabin photograph. Keep the room, camera framing, stone fireplace surround, chair, table, plants and wall exactly in place. Replace ONLY the wood inside the central dark fireplace with a small natural burning wood fire photographed in real life. Three irregular split hardwood logs resting in a loose natural cross arrangement on ash; dark rough bark, exposed wood end grain, small naturally charred cracks, a modest red-orange bed of embers underneath. A handful of thin translucent yellow-orange flames curl between and just above the logs, realistic very detailed fire photography, crisp varied edges, black gaps between flames. It is a QUIET ordinary domestic hearth fire, NOT a roaring blaze, bonfire, fireball or wall of flame. The tallest flame should extend at most about ONE THIRD of the opening's height above the log bed; leave the upper half of the firebox clearly dark and empty. Preserve realistic wood texture; no uniformly glowing rectangular logs, no wire grids or artificial crack patterns. Very subtle warm light from this small fire reaches the fireplace stones and nearby floor; retain the existing gentle ambient room lighting and fixed geometry. Photorealistic camera capture, high photographic detail, natural exposure preserves flame detail and dark charred wood. No people, no text, no added objects. Original landscape aspect ratio, maximum available detail. The result is the COMPLETE finished still photograph of a real-looking small fire in this cozy room, to be gently animated afterward.

## Orbital observatory

- `orbital-interior.jpg`: generated bright-white landscape cabin, 1672 × 941,
  quality-94 JPEG.
- `orbital-interior-portrait.jpg`: matching portrait cabin, 1086 × 1448,
  quality-94 JPEG. Its narrower window and repositioned equipment preserve
  white walls and blue handrails through the central phone crop.
- `orbital.jpg`: 1920 × 1080 rendered landscape fallback.
- `orbital-portrait.jpg`: 780 × 1688 rendered phone fallback.
- `orbital-thumb.jpg`: 240 × 150 menu thumbnail.

The room is sampled as an undistorted photograph. A mask follows the measured
inner window; a source-brightness holdout preserves the foreground handrail and
window seals. The complete globe and its atmosphere fit both the aperture and
the visible viewport. No procedural consoles, wall panels or floor grids remain.

Earth, atmosphere, stars and simulated cyclones remain live shader effects.
Earth rotation uses wall-clock time and a sidereal day of 86,164.0905 seconds.
The surface, cloud and city-light images use historical NASA composites;
their sources and processing are in [earth-attribution.md](earth-attribution.md).
Cyclones are fictional evolving effects, not current weather observations.
This is an artistic observatory at geosynchronous altitude with an inertial
viewing orientation, not a literal ground-locked geostationary camera.

Both fallback views are rendered at 2026-11-15 12:00:02 UTC. The generated
compositing plates have empty windows; users see a completed Earth view in the
fallback as well as in the running scene.

### Interior references

The following primary-source images were inspected for white panels, practical
scientific equipment, clipped wiring, blue handrails and window hardware:

- NASA Destiny laboratory image `iss074e0620142`:
  https://images-assets.nasa.gov/image/iss074e0620142/iss074e0620142~large.jpg
- NASA Cupola interior `ISS064-E-5541`:
  https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=ISS064&roll=E&frame=5541
- NASA, Interior View From International Space Station Cupola:
  https://www.nasa.gov/image-article/interior-view-from-international-space-station-cupola/
- ESA, Inside the Columbus laboratory:
  https://www.esa.int/articles/inside-the-columbus-laboratory

The enormous uninterrupted window and spacious observation deck are fictional
design choices. The artwork does not claim to reproduce an actual ISS module.

### Station generation briefs

Landscape prompt summary (NASA Destiny and Cupola pictures were supplied as
visual references): a photorealistic bright-white advanced observation bay,
landscape 16:9, one enormous unobstructed black window with chamfered corners;
white powder-coated equipment panels, racks, bolts, ventilation grilles, secured
cabling and blue handrails; layered window seals, gray metal floor and neutral
diffused overhead lighting. The window must have no baked Earth or stars.
No people, holograms, neon, cartoon geometry, text overlays or logos.

The first portrait was a matching photographic reframe. Its initial wide
window lost nearly all side equipment in a phone crop, so it was replaced by
the following final edit:

> Edit this photorealistic bright white spacecraft room for a center-cropped smartphone background. Keep the SAME PORTRAIT 3:4 canvas, room, bright neutral lighting, white and light-gray mechanical panels, blue handrails, and photographic realism. The current clear window is too wide for the phone crop. NARROW AND REBUILD THE ENTIRE WINDOW, frame and lower rail coherently so the clear black window aperture spans ONLY x=27% to x=73% of the full image, and y=20% to y=77%. It is a tall rectangular observation window with small chamfered corners, perfectly centered, straight architectural perspective. Move the detailed white equipment and blue handrail from the far sides into the newly available vertical wall strips: practical instrument racks, small functional screens, bolts and neat clipped cable bundles should be clearly visible in x=19%..26% and x=74%..81%. The central 62% of this photograph will be cropped on a phone, and MUST still show the white room, a realistic frame, side equipment and the entire clear window. Do not merely resize or crop the current image: make the window narrower within the same room and fill the sides with matching white spacecraft equipment panels. Keep the black window entirely empty and dark: NO planet, no stars, no scenery, no reflected lights. Keep its black clear area unobstructed. Keep the silver safety rail entirely BELOW the window, not across it. Bright white ceiling and pale metal floor remain visible. White interior stays bright and photographic, detailed real material texture and mechanical plausibility; no blue mood lighting, cartoon shapes or generated geometric decoration. No people, text overlays, logos or watermarks. Output portrait 3:4 at maximum detail. CRITICAL: the window sides must be at 27% and 73% of the total image width, not 20% and 80%.

Masks use the actual generated window boundaries, not the approximate requested
coordinates. The scene-specific dark screen shade is disabled for the white
cabin; supporting interface text uses a darker color on the ceiling and floor.

## Verification scope

Actual shaders, geometry, textures, color spaces, mipmaps and uniforms were
compiled and rendered with native EGL/OpenGL. Desktop, phone, square and
ultrawide aspect ratios were inspected. Earth longitude sampling retains
continuous derivatives through the repeating seam to prevent a mipmap artifact.
This checks scene output; it is not an end-to-end browser screenshot,
physical-phone performance measurement or online deployment check.

The unit suite covers scene selection and persistence, WebGL lifecycle and
fallback routing, source-plate selection, resource cleanup, clock continuity,
cyclone bounds, portrait selection and fitting the full globe within the
photographic window after cropping.
