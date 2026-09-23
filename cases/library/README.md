# Case Library

Add new design case sites under this folder.

Recommended structure:

- cases/library/<case-slug>/
  - index.html (the live design concept)
  - project.html (the design case study: brief, decisions, outcome — link it from index.html's nav)
  - assets/
    - styles.css (tokens on :root, then the concept's own styles)
    - img/ (generated, see Images below)

Then add a new card to cases/index.html that links to:

viewer.html?case=cases/library/<case-slug>/index.html

Tags are set with data-tags on the card.

Conventions:
- project.html uses the same assets/styles.css as the concept so the case study feels native.
- Links back to the main site must go three levels up (e.g. ../../../contact/index.html).
- Avoid javascript:void(0); use in-page anchors or project.html for demo nav links.

## Shared files

- `_shared/base.css` — reset, reveal motion and the case-study layout. Each
  concept declares its tokens (`--bg --surface --ink --muted --line --accent
  --on-accent --font-display --font-body --radius`) on `:root` in its own
  `assets/styles.css`, loaded after this file.
- `_shared/concept.js` — scroll reveals (`data-reveal`, `data-stagger`), the
  header's `.is-scrolled` state (`data-header`), tab groups (`data-tabs` with
  `data-tab` / `data-panel`) and exclusive chip rows (`data-toggle-group`).

## Images

No concept uses photography. Every image under `<slug>/assets/img/` is
painted from seeded noise by `_art/art.js`; open `_art/index.html` for a
contact sheet. After changing a piece:

```
node tools/render-case-art.mjs [piece-prefix]    # assets/img/*.jpg
node tools/render-case-stills.mjs [slug]         # assets/hero.jpg, assets/thumb.jpg
```

`hero.jpg` and `thumb.jpg` are screenshots of the concept itself, used by the
case pages and the library grid. Both scripts need Playwright, which is not a
site dependency; set `PLAYWRIGHT_CHROMIUM` to a browser binary if the bundled
one is not installed.

## Case studies

`project.html` for the nine web concepts is generated from
`content/cases.json` by `node tools/build-case-studies.mjs`, so it always
matches the case page on the main site. Edit the JSON, not the HTML.

Current cases:

- atlas
- aurora
- ion-forge
- ishq-escape
- luna-bloom
- specimen
- lumen-stream
- starlight-kingdom
- tech-disruption
- velvet-atelier
