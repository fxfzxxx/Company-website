# Rainy Night Drive-Thru

A live 3D scene of a drive-thru restaurant on a wet night. Nothing is driven
by the viewer: cars queue round the building through the order board, the
pay window and the pickup window; customers walk in from the car park and
the street under umbrellas; rain, splashes, canopy drips and lightning run
throughout. The viewer orbits, zooms and switches between nine camera
presets.

Everything is generated at load — no model files, no image textures, no CDN.
three.js comes from `assets/vendor/three` (r185), including the four addons
this case added there: `controls/OrbitControls.js`, `objects/Reflector.js`,
`geometries/RoundedBoxGeometry.js` and `utils/BufferGeometryUtils.js`.

## Run it

```
python3 -m http.server 8000
```

Then open `/cases/library/drive-thru/`. Drag to orbit, scroll to zoom,
right-drag to pan. The panel switches cameras, rain, rain amount, lightning,
glow and auto-orbit, and **中 / EN** switches the language of the panel and of
every sign in the scene (English by default; the choice is remembered).

| Parameter | Does |
| --- | --- |
| `?lang=en` / `?lang=zh` | open in that language |
| `?view=<name>` | open on a camera preset with no fly-in, and no lightning (`overview`, `door`, `inside`, `window`, `top`, `street`, `order`, `pylon`) |
| `?hud=0` | hide the panel |

The stills were taken with `?hud=0&view=overview` (hero 1500 × 1000 at
4⁄3 scale, thumb 1200 × 900 at 2⁄3), `?hud=0&view=window` and
`?hud=0&view=door`. The page sets `document.body.dataset.ready = "1"` after
its third frame, which is what to wait for before a screenshot.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept: canvas, control panel, import map |
| `project.html` | The case study |
| `drive-thru.js` | Textures, building, site, cars, people, rain, cameras, language switch |
| `assets/styles.css` | Tokens, the panel and the case-study layout |

## The parts that matter

- **The lane is one spline** (`curve`). Stops, arrows, lane lines and the
  concrete lane surface are placed by distance along it (`sAt`), so moving a
  window means moving one point.
- **Cars** are three side profiles (`TYPES`) extruded across their width,
  merged once per type; each car adds only its own paint, lights, plate and
  wipers. Cars are pooled, never disposed.
- **People** are jointed (hip, knee, shoulder, elbow), fade in and out at the
  ends of their routes, close their umbrellas under a roof and yield to
  moving cars; cars yield to people in their path.
- **Signage** is drawn by `dtex`, which registers a redraw; the language
  switch calls every redraw. Add a sign there and it is bilingual for free —
  the strings live in `S.en` / `S.zh`, the panel's in `UI.en` / `UI.zh`.
- **Lights are budgeted.** There are seven real lights: three downward
  spotlights under the canopies, one each in the dining room and on the pylon,
  and two street lamps. Every lit shader is compiled against every light, and
  with seventeen of them Chrome on Windows (ANGLE / Direct3D) could stall
  long enough to lose the WebGL context: a black page. Everything else that
  glows is an emissive surface or a `lightPool` on the ground. The scene also
  compiles its shaders with `compileAsync` before the first frame, and the
  loading plate reports a failed file, a script error or a lost context
  instead of staying black.
- **Static geometry** is built into `world` and `decals` and merged by
  material (`mergeGroup`) at the end of the build: about sixty meshes for the
  building, the site and the city.
