// Level definitions: unpainted wooden structures down the lane, the knots
// (knock-down targets) perched in them, and the queue of painted blocks you
// get to sling at them. All heights are derived from the block mm sizes so
// pieces stack exactly on top of each other.
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

// two upright planks + a plank deck across them
function plankPortal(x: number, z: number, gap = 1.8): Piece[] {
  return [
    { kind: "plank", pos: [x - gap / 2, PLANK_H / 2, z] },
    { kind: "plank", pos: [x + gap / 2, PLANK_H / 2, z] },
    { kind: "plank", orient: "deckX", pos: [x, PLANK_H + DECK / 2, z] },
  ]
}

// the smaller version built from the short planks
function shortPortal(x: number, z: number, gap = 1.4): Piece[] {
  return [
    { kind: "short", pos: [x - gap / 2, SHORT_H / 2, z] },
    { kind: "short", pos: [x + gap / 2, SHORT_H / 2, z] },
    { kind: "short", orient: "deckX", pos: [x, SHORT_H + DECK / 2, z] },
  ]
}

export const LEVELS: LevelDef[] = [
  {
    id: "first-tower",
    name: "First tower",
    pieces: [
      ...plankPortal(0, -4),
      { kind: "cube", pos: [-2.3, CUBE_H / 2, -4] },
      { kind: "cube", pos: [2.3, CUBE_H / 2, -4] },
    ],
    knots: [{ pos: [0, PLANK_H + DECK + KR, -4] }],
    shots: ["cylinder", "cube", "plank-short"],
  },
  {
    id: "two-towers",
    name: "Two towers",
    pieces: [
      ...shortPortal(-2.4, -4.5),
      ...shortPortal(2.4, -4.5),
      { kind: "slab", pos: [0, SLAB_H / 2, -5] },
      { kind: "cube", pos: [0, SLAB_H + CUBE_H / 2, -5] },
    ],
    knots: [
      { pos: [-2.4, SHORT_H + DECK + KR, -4.5] },
      { pos: [2.4, SHORT_H + DECK + KR, -4.5] },
    ],
    shots: ["plank-short", "cylinder", "cube", "plank-long"],
  },
  {
    id: "the-wall",
    name: "The wall",
    pieces: [
      // a two-story palisade shielding the knot behind it
      { kind: "plank", pos: [-1.15, PLANK_H / 2, -3] },
      { kind: "plank", pos: [0, PLANK_H / 2, -3] },
      { kind: "plank", pos: [1.15, PLANK_H / 2, -3] },
      { kind: "plank", orient: "deckX", pos: [0, PLANK_H + DECK / 2, -3] },
      { kind: "plank", pos: [-0.6, PLANK_H + DECK + PLANK_H / 2, -3] },
      { kind: "plank", pos: [0.6, PLANK_H + DECK + PLANK_H / 2, -3] },
      // the sheltered pedestal
      { kind: "slab", pos: [0, SLAB_H / 2, -5.6] },
    ],
    knots: [{ pos: [0, SLAB_H + KR, -5.6] }],
    shots: ["cylinder", "plank-long", "plank-short", "orange"],
  },
  {
    id: "pillars",
    name: "Pillars",
    pieces: [
      { kind: "post", pos: [-2.6, POST_H / 2, -5] },
      { kind: "slab", pos: [-2.6, POST_H + SLAB_H / 2, -5] },
      { kind: "post", pos: [0, POST_H / 2, -5] },
      { kind: "slab", pos: [0, POST_H + SLAB_H / 2, -5] },
      { kind: "cube", pos: [0, POST_H + SLAB_H + CUBE_H / 2, -5] },
      { kind: "post", pos: [2.6, POST_H / 2, -5] },
      { kind: "slab", pos: [2.6, POST_H + SLAB_H / 2, -5] },
      { kind: "cube", pos: [-1.3, CUBE_H / 2, -3.6] },
      { kind: "cube", pos: [1.3, CUBE_H / 2, -3.6] },
    ],
    knots: [
      { pos: [-2.6, POST_H + SLAB_H + KR, -5] },
      { pos: [2.6, POST_H + SLAB_H + KR, -5] },
    ],
    shots: ["cube", "orange", "cylinder", "plank-short"],
  },
  {
    id: "the-castle",
    name: "The castle",
    pieces: [
      // centre keep: a plank portal with a second storey of short planks
      ...plankPortal(0, -5.5, 1.9),
      { kind: "short", pos: [-0.6, PLANK_H + DECK + SHORT_H / 2, -5.5] },
      { kind: "short", pos: [0.6, PLANK_H + DECK + SHORT_H / 2, -5.5] },
      { kind: "short", orient: "deckX", pos: [0, PLANK_H + DECK + SHORT_H + DECK / 2, -5.5] },
      // side towers screening a pedestal knot tucked behind each
      ...shortPortal(-3.0, -4.5),
      ...shortPortal(3.0, -4.5),
      { kind: "slab", pos: [-3.0, SLAB_H / 2, -6.4] },
      { kind: "slab", pos: [3.0, SLAB_H / 2, -6.4] },
      // outriders
      { kind: "post", pos: [-4.6, POST_H / 2, -5.5] },
      { kind: "post", pos: [4.6, POST_H / 2, -5.5] },
    ],
    knots: [
      { pos: [0, PLANK_H + DECK + SHORT_H + DECK + KR, -5.5] }, // on the keep
      { pos: [-3.0, SLAB_H + KR, -6.4] }, // screened left
      { pos: [3.0, SLAB_H + KR, -6.4] }, // screened right
    ],
    shots: ["cube", "plank-short", "cylinder", "plank-long", "orange"],
  },
]
