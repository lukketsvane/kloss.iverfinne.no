# kloss.iverfinne.no

A physics slingshot game built from the same wooden blocks, graphics and room
as [kl.oss.ete](https://klossete.iverfinne.no) — but angry. Sling the five
painted blocks at unpainted wooden structures and knock the knots off their
perches.

## The five blocks — each its own power

Tap while a block is in flight to trigger its power (once per shot):

| Block | Size | Power |
| --- | --- | --- |
| Light Blue Cube | 30 × 30 × 30 mm | **Split** — becomes three cubes |
| Red Cylinder | Ø 30 mm · H 60 mm | **Dynamite** — explodes |
| Dark Blue Short | 30 × 60 × 15 mm | **Dash** — a burst of speed |
| Dark Blue Plank | 30 × 75 × 15 mm | **Sweep** — spins like a sawblade |
| Orange Block | 45 × 45 × 24 mm | **Slam** — dives straight down |

The first five levels introduce the blocks one at a time — starting with a
single cyan cube — and the finale throws all five at a castle.

## How to play

- **Drag** the loaded block back to aim — the dotted arc previews the flight.
- **Release** to launch.
- **Tap** mid-flight for the block's power.
- Knock every wooden knot down (a hard hit or a fall to the floor counts).
- Leftover shots become stars. Five levels, linear progression, saved locally.

## Stack

Next.js + react-three-fiber + Rapier physics + the kl.oss.ete GLB block
models, room palette, post-FX stack and synthesised wooden impact sounds.

```bash
pnpm install
pnpm dev    # develop
pnpm build  # production build
```
