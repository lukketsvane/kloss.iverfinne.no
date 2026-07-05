// The block catalogue shared with kl.oss.ete: the five painted wooden blocks
// (same GLB meshes, same mm dimensions) — here they are the AMMO. Each block
// carries its own mid-flight power. Unpainted structure pieces reuse the same
// shapes without the painted meshes.
import * as THREE from "three"

export const S = 0.036 // 1 mm -> scene units (same scale as kl.oss.ete)
// The GLB meshes were authored against a 0.045 scale; the visual is rescaled so
// mesh and collider always match (see kl.oss.ete's blocks.ts for the history).
const MESH_DESIGN_S = 0.045
export const MESH_FIT = S / MESH_DESIGN_S

export type PowerId = "spin" | "split" | "dash" | "slam" | "blast"

export type BlockMeshAsset = { url: string }

export type BlockBase = {
  id: string
  name: string
  color: string
  dims: string
  mesh: BlockMeshAsset
  power: PowerId
  powerName: string
  powerHint: string
}

export type BoxBlock = { shape: "box"; half: [number, number, number] } & BlockBase
export type CylBlock = { shape: "cylinder"; radius: number; halfHeight: number } & BlockBase
export type Block = BoxBlock | CylBlock

const MESHES = {
  cube: { url: "/block_lightblue_cube.glb" },
  orange: { url: "/block_orange.glb" },
  blueLong: { url: "/block_blue_02.glb" },
  blueShort: { url: "/block_blue_01.glb" },
  cylinder: { url: "/block_red_cylinder.glb" },
} satisfies Record<string, BlockMeshAsset>

export const BLOCKS: Block[] = [
  {
    id: "cylinder",
    name: "Red Cylinder",
    color: "#c83a2e",
    shape: "cylinder",
    radius: (30 * S) / 2,
    halfHeight: (60 * S) / 2,
    dims: "Ø 30 mm · H 60 mm",
    mesh: MESHES.cylinder,
    power: "slam",
    powerName: "Slam",
    powerHint: "tap: dive straight down",
  },
  {
    id: "cube",
    name: "Light Blue Cube",
    color: "#3f9ec9",
    shape: "box",
    half: [(30 * S) / 2, (30 * S) / 2, (30 * S) / 2],
    dims: "30 × 30 × 30 mm",
    mesh: MESHES.cube,
    power: "split",
    powerName: "Split",
    powerHint: "tap: split into three",
  },
  {
    id: "plank-short",
    name: "Dark Blue Short",
    color: "#2f63cc",
    shape: "box",
    // 30 × 60 × 15 flying flat: 30 across, 15 high, 60 along the flight line
    half: [(30 * S) / 2, (15 * S) / 2, (60 * S) / 2],
    dims: "30 × 60 × 15 mm",
    mesh: MESHES.blueShort,
    power: "dash",
    powerName: "Dash",
    powerHint: "tap: burst of speed",
  },
  {
    id: "plank-long",
    name: "Dark Blue Plank",
    color: "#2f63cc",
    shape: "box",
    // 30 × 75 × 15 flying flat, long side along the flight line (a javelin whose
    // spin power sweeps that length sideways). Matches the GLB's authored pose.
    half: [(30 * S) / 2, (15 * S) / 2, (75 * S) / 2],
    dims: "30 × 75 × 15 mm",
    mesh: MESHES.blueLong,
    power: "spin",
    powerName: "Sweep",
    powerHint: "tap: spin like a sawblade",
  },
  {
    id: "orange",
    name: "Orange Block",
    color: "#e07b22",
    shape: "box",
    half: [(45 * S) / 2, (24 * S) / 2, (45 * S) / 2],
    dims: "45 × 45 × 24 mm",
    mesh: MESHES.orange,
    power: "blast",
    powerName: "Blast",
    powerHint: "tap: shockwave",
  },
]

export const BLOCK_BY_ID: Record<string, Block> = Object.fromEntries(BLOCKS.map((b) => [b.id, b]))

// Largest real dimension of a block in mm – longer pieces knock at a lower pitch.
function blockMaxMm(b: Block) {
  const u = b.shape === "cylinder" ? Math.max(b.radius * 2, b.halfHeight * 2) : Math.max(...b.half) * 2
  return u / S
}

// Fundamental impact frequency: bigger block -> lower knock.
export function blockBaseFreq(b: Block) {
  return THREE.MathUtils.clamp(2600 / Math.sqrt(blockMaxMm(b)), 230, 680)
}

/* ------------------------------------------------------------------ */
/*  Unpainted structure pieces – the same shapes, raw wood             */
/* ------------------------------------------------------------------ */

export type RawKind = "plank" | "short" | "cube" | "slab" | "post"

// Same five silhouettes as the painted set, in bare wood.
export const RAW_DIMS: Record<RawKind, { shape: "box"; half: [number, number, number] } | { shape: "cylinder"; radius: number; halfHeight: number }> = {
  plank: { shape: "box", half: [(30 * S) / 2, (75 * S) / 2, (15 * S) / 2] }, // stood upright by default
  short: { shape: "box", half: [(30 * S) / 2, (60 * S) / 2, (15 * S) / 2] },
  cube: { shape: "box", half: [(30 * S) / 2, (30 * S) / 2, (30 * S) / 2] },
  slab: { shape: "box", half: [(45 * S) / 2, (24 * S) / 2, (45 * S) / 2] },
  post: { shape: "cylinder", radius: (30 * S) / 2, halfHeight: (60 * S) / 2 },
}

// Bare birch tones – a small palette cycled per piece so the raw wood reads
// hand-cut rather than cloned.
export const RAW_TONES = ["#dcc7a2", "#d5bd94", "#e2cfae", "#d0b78e", "#d9c29c"]

export function rawTone(i: number) {
  return RAW_TONES[((i % RAW_TONES.length) + RAW_TONES.length) % RAW_TONES.length]
}

export function rawFreqId(kind: RawKind) {
  return `raw-${kind}`
}

export const RAW_FREQS = (Object.keys(RAW_DIMS) as RawKind[]).map((kind) => {
  const d = RAW_DIMS[kind]
  const maxU = d.shape === "cylinder" ? Math.max(d.radius * 2, d.halfHeight * 2) : Math.max(...d.half) * 2
  const mm = maxU / S
  return { id: rawFreqId(kind), freq: THREE.MathUtils.clamp(2600 / Math.sqrt(mm), 230, 680) }
})

// The knock-down target: an unpainted wooden knob perched in the structure.
export const KNOT_RADIUS = (42 * S) / 2
export const KNOT_TONE = "#c9a97b"
