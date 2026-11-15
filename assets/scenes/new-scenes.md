# Cabin fireplace and orbital observatory assets

The room interiors are original generated photographic artwork, created with
the built-in OpenAI image-generation tool on 2026-11-15. They depict fictional
spaces; they are not documentary photographs of a cabin or an actual ISS module.

## Cabin fireplace

- `hearth-lively.jpg`: final 1672 × 941 generated photograph, with several
  thinner split logs, red embers and a substantially taller natural fire. The
  PNG was converted to quality-94 JPEG without changing its framing.
- `hearth-still.jpg`: completed static scene for reduced motion or unavailable
  WebGL; `hearth-thumb.jpg` is its 240 × 150 menu thumbnail.
- `hearth-natural.jpg` and `hearth.jpg`: earlier generation references. The
  live renderer no longer uses those earlier small-fire/unlit plates.

The live shader animates different photographed flame tongues with upward
turbulence and independent height changes. A six-point wood silhouette protects
the smaller logs and the central upright piece, and both ends of a displaced
lookup must stay above that silhouette. Wood, masonry and furniture retain
their source coordinates.

The former barely visible 2-pixel flame displacement and ±1.6% floor-shadow
patch have been replaced with visible flame motion and stronger irregular
reflected light. Nearby stone, timber and floor brighten and dim with the fire;
the dark outdoor window is excluded. Existing soft floor shadows shift by up
to 18 source pixels using a bounded difference mask (±16%), including a hearth
floor region that remains visible on phones. This is photographic animation,
not a combustion, wood-fracture or ray-traced shadow simulation.

### Final fire generation prompt

The previous `hearth-natural.jpg` was the edit target. The built-in image
generation tool received this prompt:

> Use case: precise-object-edit. Edit target: the supplied photorealistic wooden cabin fireplace photograph. CHANGE THE WOOD AND FIRE INSIDE THE FIREPLACE ONLY, keep the entire room, walls, stone surround, chair, table, rug, baskets, camera framing and composition exactly in place. The two massive logs and very small flames are wrong. Replace them with FOUR OR FIVE SMALLER slender split pieces of firewood in a low, loose natural arrangement on the ash. Each piece is much thinner than the current logs, roughly one third of their diameter, with irregular bark, charred ends and realistic end grain. The whole low wood pile should occupy about 55% of the firebox width, and only the bottom 12–15% of the firebox height; avoid a huge log diagonally blocking the fire. Make a HEALTHY, MEDIUM domestic hearth fire burning among these smaller pieces: many natural translucent orange-yellow flame tongues, a few pale hot cores, separated by dark gaps, curling in several directions, detailed irregular slender edges. Flames should be about TWICE the current height and more substantial than the current tiny fire, filling the central lower HALF TO TWO THIRDS of the opening while still leaving a clear dark gap to the top of the firebox. Relative to the complete landscape image, flame tips can reach approximately y=44–47% and their base approximately y=66%; source fireplace opening starts around y=35% and ends y=71%. Do not fill the entire fireplace with a solid wall of flame. The fire should look like a normal lively wood fire photographed with a fast shutter, not a giant bonfire or blast. Natural red embers visible between slender logs and warm light on the adjacent stone, wood floor and furniture. Photographic texture, believable real flame shape and fine detail, natural exposure, no cartoon, no synthetic crack grid, no uniformly glowing logs, no duplicated patterns. Preserve fixed room geometry and all objects outside the firebox. 16:9 landscape at the same framing as the input, maximum available detail.

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
the visible viewport. The physical consoles, wall panels and floor remain
photographic. Only the measured screen glass and existing small readout panels
receive changing telemetry, scrolling waveforms and status graphics; their
projective coordinates remain attached to the source image through cropping.

Earth, atmosphere, stars and simulated cyclones remain live shader effects.
Earth rotation is now deliberately accelerated to 240 times the mean sidereal
rate: one turn in approximately 359 seconds. A separate 210-second sunlight
cycle visibly moves the day/night boundary while keeping part of Earth lit.
Both phases use the wall clock and remain continuous across scene switches.
The surface, cloud and city-light images use historical NASA composites;
their sources and processing are in [earth-attribution.md](earth-attribution.md).
Cyclones are fictional evolving effects, not current weather observations.
This is an accelerated artistic observatory at geosynchronous altitude, not a
real-time orbit, current solar-illumination model or ground-locked camera.

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

Normal-speed motion sequences were inspected separately from still images:
six seconds for the fire and twelve seconds for the observatory. The fireplace
check includes the dim orange outer silhouette as well as the bright core, and
the room-light check excludes the fire itself. The observatory check separates
Earth movement, changing illumination and instrument content. These sequences
use production shaders and uniform updates without additional playback speedup.

The Chromium/WebGL2 CI regression also requires perceptible pixel changes in
those individual regions at desktop and phone viewport sizes. Frozen flame and
screen controls must be rejected even if other regions are moving; a separate
frozen-sun comparison detects a static day/night boundary. See
[the WebGL test guide](../../tests/README-webgl.md) for the runner and its scope.
