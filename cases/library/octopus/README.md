# Benthos-8 octopod (case 08)

A live 3D concept: an original jet-driven mechanical octopus you can take
apart. Everything is built from three.js primitives at load; nothing is
downloaded but code and fonts.

- `index.html` — the live concept (panels, dock, callouts, tour cursor)
- `octopus.js` — model, machine, console, tour, quality tiers
- `assets/styles.css` — tokens, the concept overlay and the case-study layout
- `project.html` — the in-concept case study (hand-written)
- `assets/*.jpg` — stills: `hero` (2000 × 1333), `thumb` (800 × 600),
  `drive`, `mantle`, `suckers`

## The model

One jet pump in real units (`P` at the top of `octopus.js`) drives every
part, chart and callout. Change a number there and the machine follows.
Gears turn at their real ratios (`DRV`), drawn at 12 % of real speed (`VIS`).

## Stills

The page takes URL parameters for screenshots:

- `?at=<s>` fast-forwards the auto tour to that second
- `?cam=x,y,z,tx,ty,tz` places the camera
- `?hud=0` hides the panels, cursor and tour badge
- `?still` renders one frame and stops (`body[data-ready="1"]` when done)
- `?ao=0` turns ambient occlusion off

The library stills were shot with headless Chromium, e.g.
`index.html?still&at=3&hud=0&cam=2.05,1.25,2.6,0,0.8,0` at 1500 × 1000,
device scale 2000/1500, JPEG quality 84.

## Site build note

`node tools/build.mjs` regenerates `index.html`, `en/index.html` and
`zh/index.html` without the structured data and root description added by
hand in 32cf7e2. After a rebuild, restore those three files from git and
reapply only the content change.
