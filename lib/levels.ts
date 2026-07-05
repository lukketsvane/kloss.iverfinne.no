// Level definitions: unpainted wooden structures down the lane, the knots
// (knock-down targets) perched in them, and the queue of painted blocks you
// get to sling at them. The game is viewed side-on like a 2D stage: the sling
// stands at z = 7 (screen-left) and every structure lives on the x = 0 plane,
// spread along z (screen-right). Heights are derived from the block mm sizes
// so pieces stack exactly on top of each other.
import { KNOT_RADIUS, type RawKind } from "./blocks"

// A structure piece is axis-aligned: `orient` picks which way the block lies
// so no euler bookkeeping is needed. Boxes permute their extents; posts roll.
export type Orient = "up" | "deckX" | "deckZ" | "rollX" | "rollZ"

export type Piece = {
  kind: RawKind
  orient?: Orient // default "up"
  pos: [number, number, number]
}

export type Knot = { pos: [number, number, number] }

export type LevelDef = {
  id: string
  name: string
  pieces: Piece[]
  knots: Knot[]
  shots: string[] // painted-block ids, fired in order
}

/* stacking heights in scene units (mm * S) ------------------------------- */
const PLANK_H = 2.7 // 75 mm upright
const SHORT_H = 2.16 // 60 mm upright
const CUBE_H = 1.08 // 30 mm
const SLAB_H = 0.864 // 24 mm lying flat
const POST_H = 2.16 // 60 mm upright
const DECK = 0.54 // a plank lying flat is 15 mm thick
const KR = KNOT_RADIUS

// two upright planks + a plank deck across them, spanning along the lane (z)
function plankPortal(z: number, gap = 1.8): Piece[] {
  return [
    { kind: "plank", pos: [0, PLANK_H / 2, z - gap / 2] },
    { kind: "plank", pos: [0, PLANK_H / 2, z + gap / 2] },
    { kind: "plank", orient: "deckZ", pos: [0, PLANK_H + DECK / 2, z] },
  ]
}

// the smaller version built from the short planks
function shortPortal(z: number, gap = 1.4): Piece[] {
  return [
    { kind: "short", pos: [0, SHORT_H / 2, z - gap / 2] },
    { kind: "short", pos: [0, SHORT_H / 2, z + gap / 2] },
    { kind: "short", orient: "deckZ", pos: [0, SHORT_H + DECK / 2, z] },
  ]
}

export const LEVELS: LevelDef[] = [
  {
    id: "first-tower",
    name: "First tower",
    pieces: [
      ...plankPortal(-3),
      { kind: "cube", pos: [0, CUBE_H / 2, -0.8] },
      { kind: "cube", pos: [0, CUBE_H / 2, -5.2] },
    ],
    knots: [{ pos: [0, PLANK_H + DECK + KR, -3] }],
    shots: ["cylinder", "cube", "plank-short"],
  },
  {
    id: "two-towers",
    name: "Two towers",
    pieces: [
      ...shortPortal(-1.4),
      ...shortPortal(-6.2),
      { kind: "slab", pos: [0, SLAB_H / 2, -3.8] },
      { kind: "cube", pos: [0, SLAB_H + CUBE_H / 2, -3.8] },
    ],
    knots: [
      { pos: [0, SHORT_H + DECK + KR, -1.4] },
      { pos: [0, SHORT_H + DECK + KR, -6.2] },
    ],
    shots: ["plank-short", "cylinder", "cube", "plank-long"],
  },
  {
    id: "the-wall",
    name: "The wall",
    pieces: [
      // a two-storey palisade shielding the knot behind it
      { kind: "cube", pos: [0, CUBE_H / 2, -1.1] },
      { kind: "plank", pos: [0, PLANK_H / 2, -2] },
      { kind: "plank", pos: [0, PLANK_H + PLANK_H / 2, -2] },
      { kind: "short", pos: [0, SHORT_H / 2, -2.8] },
      // the sheltered pedestal
      { kind: "slab", pos: [0, SLAB_H / 2, -4.6] },
      // rear guard
      { kind: "cube", pos: [0, CUBE_H / 2, -6.2] },
      { kind: "cube", pos: [0, CUBE_H + CUBE_H / 2, -6.2] },
    ],
    knots: [{ pos: [0, SLAB_H + KR, -4.6] }],
    shots: ["cylinder", "plank-long", "plank-short", "orange"],
  },
  {
    id: "pillars",
    name: "Pillars",
    pieces: [
      { kind: "post", pos: [0, POST_H / 2, -2.2] },
      { kind: "slab", pos: [0, POST_H + SLAB_H / 2, -2.2] },
      { kind: "post", pos: [0, POST_H / 2, -4.7] },
      { kind: "slab", pos: [0, POST_H + SLAB_H / 2, -4.7] },
      { kind: "cube", pos: [0, POST_H + SLAB_H + CUBE_H / 2, -4.7] },
      { kind: "post", pos: [0, POST_H / 2, -7.2] },
      { kind: "slab", pos: [0, POST_H + SLAB_H / 2, -7.2] },
      { kind: "cube", pos: [0, CUBE_H / 2, -0.6] },
    ],
    knots: [
      { pos: [0, POST_H + SLAB_H + KR, -2.2] },
      { pos: [0, POST_H + SLAB_H + KR, -7.2] },
    ],
    shots: ["cube", "orange", "cylinder", "plank-short"],
  },
  {
    id: "the-castle",
    name: "The castle",
    pieces: [
      // gatehouse screening a pedestal knot tucked behind it
      ...shortPortal(-0.8),
      { kind: "cube", pos: [0, CUBE_H / 2, -2.9] },
      // centre keep: a plank portal with a second storey of short planks
      ...plankPortal(-5.2, 1.9),
      { kind: "short", pos: [0, PLANK_H + DECK + SHORT_H / 2, -4.6] },
      { kind: "short", pos: [0, PLANK_H + DECK + SHORT_H / 2, -5.8] },
      { kind: "short", orient: "deckZ", pos: [0, PLANK_H + DECK + SHORT_H + DECK / 2, -5.2] },
      // rear tower screening the last knot
      ...shortPortal(-7.7),
      { kind: "slab", pos: [0, SLAB_H / 2, -9.6] },
      // front outrider
      { kind: "post", pos: [0, POST_H / 2, 0.6] },
    ],
    knots: [
      { pos: [0, PLANK_H + DECK + SHORT_H + DECK + KR, -5.2] }, // on the keep
      { pos: [0, CUBE_H + KR, -2.9] }, // behind the gatehouse
      { pos: [0, SLAB_H + KR, -9.6] }, // behind the rear tower
    ],
    shots: ["cube", "plank-short", "cylinder", "plank-long", "orange"],
  },
]
