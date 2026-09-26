# Section 01

A presentation model of a modern two-storey New Zealand house: two black
board-clad volumes under a flat roof, the upper one cantilevered over the
entrance front, a front door beside the garage, a terrace on the garage roof
and a small garden, on a board. One unit is one metre; the model reads at
1:100.

Everything is generated at load — no model files, no textures, no CDN.

## Run it

```
python3 -m http.server 8000
```

Then open `/cases/library/house/`.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept: part index, callout, sun slider |
| `project.html` | The case study |
| `house.js` | The site: materials, sun, house, garden, interaction |
| `parts.js` | Cladding, corrugate, joinery, fence and planting factories |

## The parts that matter

- **Cladding** — vertical shiplap built as boards with a shadow gap between
  them. Openings are cut by splitting each board column into the vertical runs
  the windows leave behind, so a window is a hole in the boards.
- **Corrugate** — a cosine across the sheet, laid at three degrees behind the
  parapet. At model scale the ripple is what says steel.
- **Planting** — cabbage trees (a trunk forking into tufts of blades) and flax
  (a fan of blades from the ground), plus clipped shrubs.

## After dark

`setNight(true)` fades the scene to evening over about a second — sky,
environment, sun, bloom and exposure all lerp from the values the scene was
*built* with, captured once at startup rather than repeated as constants.

The fitting geometry always exists; only its brightness follows the dimmer.
Beams (`lightCone`) and ground pools (`lightPool`) are additive geometry; the
only real lights added at night are two spots per wall washer and one room
light. Windows light up through the glass material's emissive, and openings
marked `unlit: true` keep a separate material so a few rooms stay dark.

## Art direction

`DEFAULTS` in `house.js` holds framing, sun position, spin and post values;
the `HOUSE`, `WING` and `DECK` blocks below it hold the building dimensions in
metres, including the `cantilever` and `over` reaches of the upper floor. Window openings are listed per face in wall-local coordinates —
`x` from the left edge, `y` from the floor — so moving a window is one line.

`setSun(azimuth, altitude)` moves the light; the slider on the page uses it.
