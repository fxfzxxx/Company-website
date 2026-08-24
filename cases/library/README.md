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
