# Specimen 03

A three.js study of the dispersive glass specimen: a refracting body with
splash lobes around a sedimentary core, crossed by iridescent filament orbits,
on a grained near-black ground.

Everything is generated in the browser — no model file, no textures, no CDN.
three.js is vendored at `/assets/vendor/three` (r185 minified build plus five
postprocessing addons), so the showcase stays a plain static page like the rest
of the library.

## Run it

Any static server rooted at the repository:

```
python3 -m http.server 8000
```

Then open `/cases/library/specimen/` directly, or through the library viewer at
`/cases/viewer.html?case=cases/library/specimen/index.html`. Modules and the
import map need a real origin; `file://` will not work.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept: plate chrome, import map, parameter panel |
| `project.html` | The case study |
| `specimen.js` | The scene: geometry fields, materials, environment, post chain, input |
| `noise.js` | Seeded 3D Perlin noise with fBm and ridged fBm |
| `assets/styles.css` | Shared by both pages |
| `assets/cover.jpg` | Card image for `cases/index.html`, rendered from this scene |

## How the look is made

- **Dispersion is real, not a post effect.** The core is an opaque mesh, so
  three renders it into the transmission backdrop; the shell
  (`MeshPhysicalMaterial` with `transmission: 1`, `dispersion: 13`) then
  refracts it per wavelength. The spectral rim comes out of the refraction.
- **The environment does the lighting.** A procedural dark room with a few
  broad panels and three narrow bright strips is pre-filtered through
  `PMREMGenerator`. The strips are what smear into spectra; without them glass
  has nothing to bend.
- **The wings are the body.** Rather than separate membranes (which read as
  grey plastic against a dark ground), the shell's displacement field adds a
  handful of cosine lobes, so one continuous refracting surface carries the
  spectrum out to the silhouette.
- **Surfaces are displaced icospheres** with normals taken analytically from
  two tangent probes of the same field — smooth normals without welding or a
  faceting pass.
- **Grade last.** Bloom on the spectral highlights, then vignette, lens chroma
  and animated grain after tone mapping.

## Art direction

`DEFAULTS` in `specimen.js` is the whole control surface, and the **Parameters**
panel on the page drives the same handles live — settle values by eye, then
write them back into the file. `seed` is stable: the same number rebuilds the
same rock, the same lobes, the same dust.

## Embedding elsewhere

```html
<div id="specimen" style="height: 70vh"></div>
<script type="importmap">
	{ "imports": { "three": "/assets/vendor/three/three.module.min.js",
	               "three/addons/": "/assets/vendor/three/addons/" } }
</script>
<script type="module">
	import { createSpecimen } from "/cases/library/specimen/specimen.js";
	const view = createSpecimen(document.getElementById("specimen"), {
		shell: { dispersion: 9 },
		background: 0x0b0b0c,
	});
	// view.dispose() when the section unmounts
</script>
```

The container is sized by CSS; the canvas follows it through a `ResizeObserver`.

## Performance

One transmission pass plus bloom is the cost here. Mitigations already in
place: `transmissionResolutionScale` at 0.75, pixel ratio capped at 1.75, the
loop parked while the tab is hidden, and a compact tier (small screens or
coarse pointers) that drops shell subdivision to 26, halves the transmission
target and thins the dust. `prefers-reduced-motion` freezes the tumble, the
orbits and the grain.
