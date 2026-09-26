# Section 01

A presentation model of an ordinary two-storey New Zealand house: black board
cladding, white joinery, a corrugate gable, a garage wing and a small garden,
on a board. One unit is one metre; the model reads at 1:100.

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
- **Corrugate** — a cosine across the sheet, laid down the slope. At model
  scale the ripple is what says steel.
- **Planting** — cabbage trees (a trunk forking into tufts of blades) and flax
  (a fan of blades from the ground), plus clipped shrubs.

## Art direction

`DEFAULTS` in `house.js` holds framing, sun position, spin and post values;
the `HOUSE`, `WING` and `DECK` blocks below it hold the building dimensions in
metres. Window openings are listed per face in wall-local coordinates —
`x` from the left edge, `y` from the floor — so moving a window is one line.

`setSun(azimuth, altitude)` moves the light; the slider on the page uses it.
