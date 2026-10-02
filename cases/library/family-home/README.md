# Family Home

A first-person walkthrough of a two-storey, four-bedroom house, built to the
room sizes on its floor plan and dressed from its listing photographs. One unit is one metre: 2.7 m ground
ceiling, 3.0 m floor to floor, 2.55 m upstairs ceiling, 2.1 m door heads and a
U-shaped stair of sixteen 187.5 mm risers. The eye is at 1.6 m, the walk is
2.2 m/s and the view keeps a horizontal field of about 92°.

Everything is generated at load — no model files, no image textures, no CDN.

## Run it

```
python3 -m http.server 8000
```

Then open `/cases/library/family-home/`. Click **Step inside** (it goes full
screen), then:

| Key | Does |
| --- | --- |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>, mouse | walk, look |
| <kbd>Shift</kbd> | run (3.6 m/s) |
| <kbd>Ctrl</kbd> or <kbd>C</kbd> | crouch (eye 1.0 m, half pace) |
| <kbd>Space</kbd> | jump (about 1.1 m, capped by the ceiling) — you can land on and walk across sofas, beds, tables and benches |
| <kbd>E</kbd> | open / shut the door you are facing — every hinged door, both bifolds, the garage door |
| left click | fire: hitscan from the crosshair, a tracer from the muzzle, a hole where it lands; ornaments — vases, lamps, pot plants, mirrors, the TV screen, bottles, the fruit bowl, the orchids — shatter; any glass (windows, bifolds, shower screens, the landing balustrade, the fire) cracks, and goes on the fifth hit |
| <kbd>Esc</kbd> | leave |

Crouching on Ctrl while walking on W is Ctrl+W, which closes a tab. In full
screen the Keyboard Lock API (Chrome, Edge) sends those keys to the page
instead; elsewhere use <kbd>C</kbd>.

A broken window is a way out: crouch-jump onto the sill or the furniture
under it, then walk through crouched. Upstairs, most windows open onto the
single-storey roofs, which you can walk on and drop off.

Two cats live downstairs — a calico ragdoll and a slightly bigger ginger
tabby. They wander the ground floor and the patio on a graph of open floor,
only through doors that are open, and sit for a while now and then. Shoot
one and it jumps, cries and bolts away from you for a few seconds.

You start in the entrance hall with the front door shut. The stair is through
the back passage; the bifolds in the family and living rooms are open to the
patio.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The live concept: intro plate, room label, plan of the floor you are on |
| `house.js` | Both floors, the stair, doors, roofs, site, lighting, collision, walking and the pistol |

## The parts that matter

- **Plan** — +x is east and +z is south, so coordinates read straight off the
  listing plan (north up). Rooms are set out on centre lines to the sizes
  printed on the plan (kitchen 4.8 × 4.7, living 6.1 × 5.8, garage 6.0 × 6.3,
  master 4.9 × 3.2 …), and the doors sit where the plan draws them. The
  layout is the plan's; where the drawing is tighter than the house, the
  house is made bigger rather than rearranged: the back passage is 1.5 m (the
  powder room, hall, living room and study sit 0.6 m further east than
  drawn), the laundry is 1.6 m deep (the garage sits 0.55 m further south),
  the entrance hall is 2.2 m, each stair flight is 1.2 m with a 1.2 m landing
  (the stair box pushes 0.6 m further west), and doors are 0.9–1.2 m. Two
  small liberties: the walk-in robe's doors swing into the robe so they clear
  the bed, and the angled doors to bedrooms 2 and 4 are squared up.
- **Doors** — each door is an entry in `doors` with a state from 0 to 1 and a
  collision box that follows the leaf, so a shut door blocks the doorway and
  an open one blocks where it swung to. Bullet holes are parented to what they
  hit, so holes in a door swing with it.
- **Standing on things** — a furniture box is as tall as the piece (measured
  from its geometry). You stand on the highest box top within a step of your
  feet, fall when there is nothing under you, and bump into anything taller.
- **Two floors** — every collision box carries a height range, and the walker
  only collides with boxes between 0.35 m and 1.85 m above their feet. The
  same list then serves both floors, the stair and the understair cupboard.
- **Stair** — `stairY()` gives floor height on the two flights and the
  landing; off the stair you stay on the floor you were on.
- **Walls** — as in Level 26, `wall()` takes openings in wall-local
  coordinates and emits geometry, collision and plan lines together; `inside`
  picks the face that gets paint, so the other takes weatherboard (ground) or
  plaster (upper).

## Stills

`?hud=0&view=x,z,lookX,lookY,lookZ[,floor]` hides the plate and sets the
camera; `floor` 1 puts it upstairs.

```
index.html?hud=0&view=8.3,6.0,13.8,0.9,9.5       # living
index.html?hud=0&view=6.0,4.4,8.0,0.9,1.8,1      # master bedroom
index.html?hud=0&view=10,19.5,5,3.5,8            # front
```
