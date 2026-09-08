# Movement 01

A three.js study of an instrument: cut wheels running on real gear ratios, an
engine-turned plate, rhodium bridges with perlage, ruby jewels, a hand-wound
coil, set in a turned walnut dish. Hover any part to name it.

Everything is generated in the browser — no model files, no image files, no
CDN. three.js is vendored at `/assets/vendor/three`, shared with the other
showcases in this library.

## Run it

Any static server rooted at the repository:

```
python3 -m http.server 8000
```

Then open `/cases/library/movement/`, or the library viewer at
`/cases/viewer.html?case=cases/library/movement/index.html`. Modules and the
import map need a real origin; `file://` will not work.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept: plate chrome, part index, callout |
| `project.html` | The case study |
| `movement.js` | The assembly: materials, lighting, train, interaction, post |
| `parts.js` | Geometry and canvas-engraving factories |
| `assets/styles.css` | Shared by both pages |
| `assets/thumb.jpg`, `assets/hero.jpg` | Stills rendered from the scene itself |

## The parts

Wheels are extruded tooth profiles with bevelled edges and annular crossings.
Turned parts (plate, dish, bobbin, screw heads, lens bezel) are lathe profiles.
The bezel and crown knurls are two opposing helical waves on a displaced
cylinder. The hairspring is a tube swept along an Archimedean spiral.

The going train uses one module across the wheel and pinions, so the pinions
sit at the correct centre distance and turn at `-greatTeeth / pinionTeeth`
times the wheel's rate.

## The finishes

Three canvases are drawn at load and used as roughness and bump maps:

- **Guilloché** — a family of epitrochoids, engraved into the main plate.
- **Perlage** — overlapping ground circles, on the bridges.
- **Walnut** — oval growth rings with a wobble summed from nine harmonics.

## Art direction

`DEFAULTS` in `movement.js` holds the framing, exposure, gear counts, motion
and post values. Materials are built just below it. The tooth counts in
`train` propagate through the geometry, the rotation rates and the copy on the
page, so changing the calibre is one edit.
