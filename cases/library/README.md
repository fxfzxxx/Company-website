# Case Library

Add new design case sites under this folder.

Recommended structure:

- cases/library/<case-slug>/
  - index.html (the live design concept)
  - project.html (the design case study: brief, decisions, outcome — link it from index.html's nav)
  - assets/
    - styles.css
    - images/

Then add a new card to cases/index.html that links to:

viewer.html?case=cases/library/<case-slug>/index.html

Tags are set with data-tags on the card.

Conventions:
- Style project.html with the same assets/styles.css as the concept so the case study feels native.
- Links back to the main site must go three levels up (e.g. ../../../contact/index.html).
- Avoid javascript:void(0); use in-page anchors or project.html for demo nav links.

## Shared effects (`_effects/`)

Optional animated effects, inspired by Inspira UI but written in plain CSS/JS so
they work in these static pages (Inspira UI itself is Vue + Tailwind only).

Opt in per showcase:

```html
<link rel="stylesheet" href="../_effects/effects.css" />  <!-- after your own styles.css -->
<script src="../_effects/effects.js"></script>            <!-- after your own main.js -->
```

Then add classes in markup:

| Class | Effect | Options |
| --- | --- | --- |
| `fx-meteors` | diagonal streaks falling through the section | `data-meteors="16"` |
| `fx-sparkles` | twinkling starfield | `data-sparkles="70"` |
| `fx-aurora` | slow drifting gradient blobs behind content | — |
| `fx-spotlight` | glow that follows the cursor across a card | — |
| `fx-beam` | light travelling around the card border on hover | — |
| `fx-shimmer` | highlight sweeping across a headline | `--fx-shimmer-color` |
| `fx-tilt` | 3D tilt toward the cursor | `data-tilt="8"` |

Every effect inherits the showcase's own `--accent` (and `--text`, `--glow`), so
the same class blends into each palette automatically. Override per element with
`style="--fx-shimmer-color: var(--gold);"`.

Notes:
- All decorative motion is disabled under `prefers-reduced-motion: reduce`.
- `fx-meteors` / `fx-sparkles` need a positioned container; both set it themselves.
- `fx-spotlight` sets `overflow: hidden` and lifts direct children to `z-index: 2`.
- Skip these on deliberately restrained concepts (atlas, tech-disruption) — the
  restraint is the design point there.

Current cases:

- atlas
- aurora
- ion-forge
- ishq-escape
- luna-bloom
- lumen-stream
- starlight-kingdom
- tech-disruption
- velvet-atelier
