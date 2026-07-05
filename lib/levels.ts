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
    // 1 — meet the basic block: one cyan cube, one wobbly pillar. Just throw.
    id: "meet-the-cube",
    name: "The cube",
    pieces: [{ kind: "short", pos: [0, SHORT_H / 2, -3] }],
    knots: [{ pos: [0, SHORT_H + KR, -3] }],
    shots: ["cube"],
  },
  {
    // 2 — the red cylinder is dynamite: the knot hides between two walls, so
    // land nearby and tap to blow everything over.
    id: "dynamite",
    name: "Dynamite",
    pieces: [
      { kind: "plank", pos: [0, PLANK_H / 2, -3.6] },
      { kind: "cube", pos: [0, CUBE_H / 2, -5] },
      { kind: "plank", pos: [0, PLANK_H / 2, -6.4] },
    ],
    knots: [{ pos: [0, CUBE_H + KR, -5] }],
    shots: ["cylinder", "cylinder"],
  },
  {
    // 3 — the short plank dashes: the target stands far away, tap for speed.
    id: "dash",
    name: "Dash",
    pieces: [
      { kind: "short", pos: [0, SHORT_H / 2, -2.5] },
      { kind: "post", pos: [0, POST_H / 2, -8.5] },
      { kind: "slab", pos: [0, POST_H + SLAB_H / 2, -8.5] },
    ],
    knots: [{ pos: [0, POST_H + SLAB_H + KR, -8.5] }],
    shots: ["plank-short", "plank-short"],
  },
  {
    // 4 — the long plank sweeps: a row of uprights between you and the knot,
    // tap to spin straight through them.
    id: "sweep",
    name: "Sweep",
    pieces: [
      { kind: "plank", pos: [0, PLANK_H / 2, -3] },
      { kind: "plank", pos: [0, PLANK_H / 2, -4.2] },
      { kind: "plank", pos: [0, PLANK_H / 2, -5.4] },
      { kind: "slab", pos: [0, SLAB_H / 2, -7] },
    ],
    knots: [{ pos: [0, SLAB_H + KR, -7] }],
    shots: ["plank-long", "plank-long"],
  },
  {
    // 5 — the orange block slams: a wall too tall to shoot through, so lob it
    // over and tap to drop it straight onto the knot.
    id: "slam",
    name: "Slam",
    pieces: [
      { kind: "plank", pos: [0, PLANK_H / 2, -3] },
      { kind: "plank", pos: [0, PLANK_H + PLANK_H / 2, -3] },
      { kind: "slab", pos: [0, SLAB_H / 2, -5.4] },
    ],
    knots: [{ pos: [0, SLAB_H + KR, -5.4] }],
    shots: ["orange", "orange"],
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
