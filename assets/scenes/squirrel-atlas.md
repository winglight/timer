# Forest squirrel animation asset

`squirrel-atlas.png` is a generated photorealistic animal sprite atlas created for
this project's forest scene with the built-in `image_gen` tool on 2026-11-15.
It is a generated asset, not an external wildlife photograph.

- Image: 1536 × 1024 RGBA PNG, original generated alpha preserved.
- Layout: 3 columns × 2 rows; six consecutive poses, left to right, top to bottom.
- Direction: side view facing right; the renderer mirrors for return travel and
  rotates the same articulated poses to follow the photographed trunk.
- Paws: baseline approximately 84% down each cell.
- The shader blends premultiplied alpha at pose changes, applies the local forest
  lighting and preserves fixed source-image coordinates for foreground foliage.

## Generation prompt

Use case: photorealistic-natural. Asset type: transparent six-frame animal animation
sprite atlas for a realistic forest background in a website. Create one 1536 x 1024
PNG canvas arranged as an exact 3 columns x 2 rows grid of equally sized 512 x 512
cells, invisible grid with no drawn borders. Each cell contains the SAME small
realistic Eurasian red squirrel seen perfectly from its left side, facing RIGHT,
whole body and bushy tail fully visible, natural adult anatomy and fine mottled
reddish-brown/gray fur, dark small eyes, fine whiskers, pale belly. This must look
like wildlife photography, NOT illustration, cartoon, icon or a plastic 3D render.
The six cells are consecutive phases of a gentle four-legged scurrying/walking
cycle, ordered left-to-right then top-to-bottom: legs alternately reach forward and
tuck under the body, modest realistic backbone and bushy tail flex. Exact same
camera, body proportions, orientation, lighting, scale and body position in every
cell; paws contact the same baseline at 78 percent of cell height and the body stays
centered horizontally. Tail is bushy and curves upward behind the body, fully inside
each cell with clear transparent margins; the squirrel including tail should occupy
approximately 70 percent of cell width and 60 percent of cell height. Soft cool
woodland daylight from upper right, natural muted fur with no saturated orange, no
hard studio rim light. Actual transparent alpha background everywhere outside all
six squirrels, no background, no ground, no shadows, no text, no frame numbers, no
checkerboard, no borders.
