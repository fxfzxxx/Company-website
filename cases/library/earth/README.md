# Terra 01

A lit globe: coastlines and cities from vector data, everything else — ocean
depth, biome colour, the cloud deck, night lights, the atmosphere — made at
load. The sun is fixed in world space and the planet turns under it, so the
terminator sweeps.

## Run it

Any static server rooted at the repository:

```
python3 -m http.server 8000
```

Then open `/cases/library/earth/`. Modules and the import map need a real
origin; `file://` will not work.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept |
| `project.html` | The case study |
| `earth.js` | Scene, shaders (surface, cloud, atmosphere, routes), interaction |
| `textures.js` | Canvas and GPU map generation |
| `assets/land.json` | Natural Earth 1:50m coastlines, simplified — public domain |
| `assets/cities.json` | Settlements over 200,000 people as [lon, lat, log₁₀ pop] |

## The data

Both JSON files are baked from public sources at build time, not fetched at
runtime:

- `land.json` — `world-atlas` land-50m (Natural Earth, public domain), run
  through Douglas-Peucker at 0.1° and rounded to two decimals. 823 rings,
  161 kB.
- `cities.json` — `all-the-cities` (GeoNames, CC-BY), filtered to population
  ≥ 200,000. 2,181 entries, 41 kB.

To regenerate them, see the bake script in the case study; the source packages
are dev-only and are not vendored.

## Reuse

```js
import { createEarth } from "/cases/library/earth/earth.js";

const view = await createEarth(element, {
	background: 0x05070d, // or null for a transparent canvas
	stars: true,
	arcs: 26,
	mapSize: 1024,   // cloud, night and terrain maps
	landSize: 2048,  // coastline mask
	post: true,      // bloom and grade; ignored when the canvas is transparent
});
// view.dispose() when the section unmounts
```

The homepage hero uses exactly this, with smaller maps and lighter bloom.
