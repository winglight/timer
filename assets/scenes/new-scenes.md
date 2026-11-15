# Cabin fireplace and orbital observatory assets

## Cabin fireplace

`hearth.jpg` is an original generated interior plate, created with the built-in
OpenAI image-generation tool on 2026-11-15. It is not a location photograph.
The generated 1672 × 941 PNG was converted to a quality-93 JPEG without changing
its framing. The runtime adds its own flame, glowing fuel, firelight and shadows.

`hearth-still.jpg` is a native-rendered frame of that live scene. It is used only
for static/reduced-motion/error fallback; `hearth-thumb.jpg` is its small menu
thumbnail. The still is not sampled as the live shader's source texture.

Final generation prompt (built-in tool mode):

> Use case: photorealistic-natural. Asset type: high-resolution 16:9 background plate for a calming interactive timer, wooden cabin fireplace interior. Primary request: an exceptionally realistic cozy wooden cabin interior at night, viewed front-on from a seated eye level, natural aged timber walls with precise grain, an inviting stone fireplace in the center, warm wood table and chair at the sides. Broad floorboards and a small woven wool rug in foreground. Composition: wide landscape 16:9, a dark rectangular fireplace opening centered at x=0.50, opening approximately x=0.39..0.61 and y=0.43..0.73 measured from the top. Charred textured firewood resting at the bottom of this opening, logs around y=0.70. Dark sooty stone inside the hearth. No visible flame, no smoke, no glowing embers: the fire is added by animation later. Dim amber ambient bounce lighting on stone surround, walls, chair legs, table edges and floor, with gentle shadows; don't make the whole room bright. A low wooden chair and modest wooden table visible around the left and right edges but no furniture covering the central opening. Camera perfectly still, straight-on horizontal photograph with no Dutch angle. Extremely detailed natural photographic material textures, cinematic yet believable subdued warm light, quiet inviting intimate room. No people, no text, no interface, no logos, no television, no extra light source competing with the central fireplace. Preserve clear central hearth within the central portrait crop. 2560x1440 or highest supported landscape resolution.

## Orbital observatory

The station interior, Earth projection, lighting, atmosphere, stars and simulated
cyclones are rendered by the application's shader. The surface, cloud and city
light textures use historical NASA composites; their original source URLs,
credits and processing are recorded in [earth-attribution.md](earth-attribution.md).

`orbital.jpg` (1920 × 1080) and `orbital-portrait.jpg` (780 × 1688) are native-rendered
frames of the same scene at 2026-11-15 12:00:02 UTC, used as static fallbacks.
`orbital-thumb.jpg` is the menu thumbnail. The portrait image keeps the complete
globe in view. No synthetic storm is presented as a real weather observation.

## Verification scope

The new scene shaders were compiled and rendered with EGL/OpenGL using the
actual three.js geometry, texture inputs and shader uniforms. Desktop and phone
aspect ratios and multiple animation times were inspected. This checks scene
output, not an end-to-end browser screenshot or physical-phone performance.

The unit suite covers scene selection and persistence, WebGL lifecycle and
fallback routing, source-plate selection, resource cleanup, clock continuity,
cyclone bounds and responsive globe layout.
