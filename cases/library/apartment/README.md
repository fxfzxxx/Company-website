# Level 26

A first-person walkthrough of a two-bedroom apartment on the 26th floor of a
residential tower. One unit is one metre, and the unit is built to the
dimensions it would be built to: 2.8 m clear ceiling, 2.1 m door heads,
0.9 m sills, 0.86 m benches. The eye is at 1.6 m and the walk is 1.4 m/s.

Everything is generated at load — no model files, no image textures, no CDN.

## Run it

```
python3 -m http.server 8000
```

Then open `/cases/library/apartment/`. Click **Step inside**, then
<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to walk, the mouse to
look and <kbd>Esc</kbd> to leave. Pointer lock does not work inside some
embedded previews; open the page in its own tab. On a touch screen you can
drag to look around but not walk.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept: intro plate, room label, plan |
| `project.html` | The case study |
| `apartment.js` | The unit, the tower, the city, lighting, collision and walking |

## The parts that matter

- **Walls** — `wall()` takes an axis, a length, a thickness and a list of
  openings in wall-local coordinates (`a`/`b` along the wall, `bottom`/`top`
  from the floor). It cuts the openings, adds lintels and sills, dresses doors
  and windows, and emits the collision boxes and the plan's wall rectangles
  from the same declaration. Moving a window is one line.
- **Collision** — the walker is a 0.22 m circle pushed out of axis-aligned
  boxes, so it slides along walls and furniture. Open door leaves collide too.
- **Orientation** — +z is north. The glazed living room and main bedroom face
  the sun, as they would in New Zealand, and the plan is drawn north-up.

## Stills

`hero.jpg` and `thumb.jpg` are screenshots of `index.html`; `kitchen.jpg` and
`bedroom.jpg` use `?hud=0&view=x,z,lookX,lookY,lookZ` to hide the plate and
set the camera:

```
index.html?hud=0&view=7.6,2.3,5.9,1.1,0.4    # kitchen
index.html?hud=0&view=3.0,4.9,0.5,1.0,7.2    # main bedroom
```
