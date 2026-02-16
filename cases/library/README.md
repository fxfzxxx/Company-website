# Case Library

Add new design case sites under this folder.

Recommended structure:

- cases/library/<case-slug>/
  - index.html
  - project.html (optional)
  - assets/
    - styles.css
    - images/

Then add a new card to cases/index.html that links to:

viewer.html?case=cases/library/<case-slug>/index.html

Tags are set with data-tags on the card.
