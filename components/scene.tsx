"use client"

// The whole 3D game: the kl.oss.ete room (beige floor, warm key light, same
// post-FX), a wooden slingshot, the five painted blocks as ammo — each with a
// tap-activated mid-flight power — and unpainted wooden structures holding the
// knock-down knots.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier"
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"
import * as THREE from "three"

import {
  BLOCKS,
  BLOCK_BY_ID,
  KNOT_RADIUS,
  KNOT_TONE,
  MESH_FIT,
  RAW_DIMS,
  RAW_FREQS,
  blockBaseFreq,
  rawFreqId,
  rawTone,
  type Block,
  type RawKind,
} from "@/lib/blocks"
import type { LevelDef, Orient, Piece } from "@/lib/levels"
import { playBoom, playImpact, playPop, playWhoosh, primeBlocks } from "@/lib/impact-sound"

/* ------------------------------------------------------------------ */
/*  Tuning                                                             */
/* ------------------------------------------------------------------ */
const G = 25 // same gravity feel as kl.oss.ete
const ANCHOR = new THREE.Vector3(0, 2.6, 7) // where the loaded block hangs, at the fork's mouth
const PULL_MAX = 2.6 // how far back the sling stretches
const V_MAX = 21 // launch speed at full pull
const K = V_MAX / PULL_MAX // pull length -> launch speed
const KNOCK_SPEED = 3.0 // impact speed that defeats a knot
const CAM_FOV = 40
const HALF_W = 10.8 // half of the lane width the side camera keeps in frame

// The whole game plays in the x = 0 plane, viewed side-on like a 2D game:
// bodies may only slide in y/z and rotate about x.
const LOCK_T: [boolean, boolean, boolean] = [false, true, true]
const LOCK_R: [boolean, boolean, boolean] = [true, false, false]

export type HudState = {
  shotIdx: number
  flying: boolean
  powerUsed: boolean
  knotsLeft: number
}

export type SceneProps = {
  level: LevelDef
  onHud: (h: HudState) => void
  onWin: (stars: number) => void
  onLose: () => void
}

/* ------------------------------------------------------------------ */
/*  Small shared pieces                                                */
/* ------------------------------------------------------------------ */

BLOCKS.forEach((b) => useGLTF.preload(b.mesh.url))

function PaintedMesh({ block, scale = 1 }: { block: Block; scale?: number }) {
  const gltf = useGLTF(block.mesh.url)
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return clone
  }, [gltf.scene])
  return (
    <group scale={MESH_FIT * scale}>
      <primitive object={model} dispose={null} />
    </group>
  )
}

// impact strength from the two bodies of a collision – kl.oss.ete's formula
function impactStrength(payload: {
  target: { rigidBody?: RapierRigidBody }
  other: { rigidBody?: RapierRigidBody }
}): { strength: number; speed: number } {
  const a = payload.target.rigidBody
  if (!a || !a.isValid()) return { strength: 0, speed: 0 }
  try {
    const av = a.linvel()
    let speed = Math.hypot(av.x, av.y, av.z)
    const b = payload.other.rigidBody
    if (b && b.isValid()) {
      const bv = b.linvel()
      speed = Math.max(speed, Math.hypot(bv.x, bv.y, bv.z))
    }
    return { strength: THREE.MathUtils.clamp((speed - 0.45) / 7, 0, 1), speed }
  } catch {
    return { strength: 0, speed: 0 }
  }
}

// axis-aligned half extents for a structure piece (orient permutes the box)
function pieceHalf(kind: RawKind, orient: Orient): [number, number, number] {
  const d = RAW_DIMS[kind]
  if (d.shape === "cylinder") return [d.radius, d.halfHeight, d.radius]
  const [hx, hy, hz] = d.half // authored "up" pose
  if (orient === "deckX") return [hy, hz, hx] // long side along x, thin side up
  if (orient === "deckZ") return [hx, hz, hy] // long side along z, thin side up
  return [hx, hy, hz]
}

/* ------------------------------------------------------------------ */
/*  Room – floor, distant walls, lights, contact shadows                */
/* ------------------------------------------------------------------ */
function Room() {
  return (
    <>
      <ambientLight intensity={0.7} color="#ffffff" />
      <pointLight position={[8, 12, 0]} intensity={10} distance={60} decay={2} color="#ffffff" />
      <directionalLight
        position={[6, 11, 7]}
        intensity={1.7}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.00015}
        shadow-normalBias={0.04}
      />

      {/* white-studio ground: a shadow-only material lets the pure-white
          background show through, so floor and sky are one seamless white and
          only the soft grey shadows remain */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[240, 240]} />
        {/* heavy opacity: the shadow must knock the HDR-white ground below the
            tone-mapping shoulder before it reads as grey at all */}
        <shadowMaterial opacity={0.85} color="#000000" />
      </mesh>

      {/* physical floor */}
      <RigidBody type="fixed" colliders={false} friction={0.85} restitution={0}>
        <CuboidCollider args={[60, 1, 60]} position={[0, -1, 0]} />
      </RigidBody>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Camera – behind the sling, easing toward the action                */
/* ------------------------------------------------------------------ */
// Side-on camera: looks straight down the -x axis so the lane reads like a 2D
// stage — slingshot screen-left, structures screen-right. Distance is derived
// from the aspect ratio so the whole lane always fits. It opens zoomed in on
// the painted blocks waiting at the sling, and glides out on the first touch.
const INTRO_LOOK = new THREE.Vector3(0, 1.6, 8.6)
function CameraRig({
  followRef,
  introRef,
}: {
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  introRef: React.MutableRefObject<boolean>
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const look = useRef(INTRO_LOOK.clone())

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = CAM_FOV
    cam.aspect = size.width / size.height
    cam.updateProjectionMatrix()
  }, [camera, size])

  useFrame((_, dt) => {
    const a = size.width / size.height
    const halfV = Math.tan((CAM_FOV / 2) * (Math.PI / 180))
    let posGoal: THREE.Vector3
    let lookGoal: THREE.Vector3
    if (introRef.current) {
      // close-up on the ammo line-up, framed centre-screen
      const dist = THREE.MathUtils.clamp(4.0 / (halfV * Math.min(a, 1.6)), 4, 28)
      posGoal = new THREE.Vector3(dist, 2.0, INTRO_LOOK.z)
      lookGoal = INTRO_LOOK
    } else {
      // wide screens fit the whole lane; narrow (portrait) screens keep a
      // sensible zoom and PAN instead – resting on the sling for the next
      // shot, following the block toward the target once it flies
      const dist = THREE.MathUtils.clamp(HALF_W / (halfV * a), 14, 34)
      const halfVisible = dist * halfV * a // lane half-width actually on screen
      const idleZ = Math.max(-0.8, ANCHOR.z + 2.4 - halfVisible)
      posGoal = new THREE.Vector3(dist, 3.6, 0)
      const target = followRef.current
      lookGoal = target
        ? new THREE.Vector3(
            0,
            THREE.MathUtils.clamp(target.y * 0.3, 0.5, 2.2) + 1.4,
            THREE.MathUtils.clamp(target.z * 0.5, -4, idleZ),
          )
        : new THREE.Vector3(0, 2.8, idleZ)
      posGoal.z = lookGoal.z // keep the view square-on while panning
    }
    // the position eases slower than the gaze so the reveal feels like a
    // gentle pull-back rather than a cut
    camera.position.lerp(posGoal, 1 - Math.exp(-1.8 * dt))
    look.current.lerp(lookGoal, 1 - Math.exp(-2.6 * dt))
    camera.lookAt(look.current)
  })
  return null
}

/* ------------------------------------------------------------------ */
/*  Structures + knots                                                 */
/* ------------------------------------------------------------------ */
function StructurePiece({
  piece,
  index,
  register,
}: {
  piece: Piece
  index: number
  register: (key: string, rb: RapierRigidBody | null) => void
}) {
  const orient = piece.orient ?? "up"
  const dims = RAW_DIMS[piece.kind]
  const tone = rawTone(index)
  const isPost = dims.shape === "cylinder"
  const rot: [number, number, number] =
    isPost && orient === "rollX" ? [0, 0, Math.PI / 2] : isPost && orient === "rollZ" ? [Math.PI / 2, 0, 0] : [0, 0, 0]

  const handleImpact = (payload: Parameters<typeof impactStrength>[0]) => {
    const { strength } = impactStrength(payload)
    if (strength > 0.02) playImpact(rawFreqId(piece.kind), strength)
  }

  return (
    <RigidBody
      ref={(rb) => register(`piece-${index}`, rb)}
      position={piece.pos}
      rotation={rot}
      colliders={false}
      friction={0.85}
      restitution={0.05}
      density={5}
      linearDamping={0.15}
      angularDamping={0.6}
      enabledTranslations={LOCK_T}
      enabledRotations={LOCK_R}
      onCollisionEnter={handleImpact}
    >
      {isPost ? (
        <>
          <CylinderCollider args={[dims.halfHeight, dims.radius]} />
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[dims.radius, dims.radius, dims.halfHeight * 2, 28]} />
            <meshStandardMaterial color={tone} roughness={0.88} metalness={0} />
          </mesh>
        </>
      ) : (
        (() => {
          const half = pieceHalf(piece.kind, orient)
          return (
            <>
              <CuboidCollider args={half} />
              <mesh castShadow receiveShadow>
                <boxGeometry args={[half[0] * 2, half[1] * 2, half[2] * 2]} />
                <meshStandardMaterial color={tone} roughness={0.88} metalness={0} />
              </mesh>
            </>
          )
        })()
      )}
    </RigidBody>
  )
}

function KnotBody({
  pos,
  index,
  register,
  onDown,
}: {
  pos: [number, number, number]
  index: number
  register: (key: string, rb: RapierRigidBody | null) => void
  onDown: (index: number) => void
}) {
  const handleImpact = (payload: Parameters<typeof impactStrength>[0]) => {
    const { speed, strength } = impactStrength(payload)
    if (strength > 0.02) playImpact("knot", strength)
    if (speed > KNOCK_SPEED) onDown(index)
  }
  return (
    <RigidBody
      ref={(rb) => register(`knot-${index}`, rb)}
      position={pos}
      colliders={false}
      friction={0.6}
      restitution={0.15}
      density={3}
      linearDamping={0.2}
      angularDamping={0.5}
      enabledTranslations={LOCK_T}
      enabledRotations={LOCK_R}
      onCollisionEnter={handleImpact}
    >
      <BallCollider args={[KNOT_RADIUS]} />
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[KNOT_RADIUS, 32, 24]} />
        <meshStandardMaterial color={KNOT_TONE} roughness={0.85} metalness={0} />
      </mesh>
      {/* a darker end-grain swirl so the knob reads as a wooden knot */}
      <mesh position={[0, KNOT_RADIUS * 0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[KNOT_RADIUS * 0.42, 24]} />
        <meshStandardMaterial color="#a58a63" roughness={0.9} metalness={0} />
      </mesh>
    </RigidBody>
  )
}

/* ------------------------------------------------------------------ */
/*  Slingshot – wooden fork, bands, held block, trajectory dots         */
/* ------------------------------------------------------------------ */
// Prongs spread along z so the fork reads as a Y in the side view. The fork is
// sized like a real sprettert next to the blocks: taller than the tallest
// block, with the loaded piece nesting in its mouth.
const PRONG_L = new THREE.Vector3(ANCHOR.x, ANCHOR.y + 0.25, ANCHOR.z - 0.85)
const PRONG_R = new THREE.Vector3(ANCHOR.x, ANCHOR.y + 0.25, ANCHOR.z + 0.85)

function SlingFork() {
  return (
    <group>
      {/* trunk */}
      <mesh position={[ANCHOR.x, 0.8, ANCHOR.z]} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.23, 1.6, 20]} />
        <meshStandardMaterial color="#c4a87e" roughness={0.85} />
      </mesh>
      {/* prongs, reaching from the trunk top out to the band tips */}
      <mesh
        position={[ANCHOR.x, 2.17, ANCHOR.z - 0.42]}
        rotation={[-0.56, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.13, 0.16, 1.65, 16]} />
        <meshStandardMaterial color="#c4a87e" roughness={0.85} />
      </mesh>
      <mesh
        position={[ANCHOR.x, 2.17, ANCHOR.z + 0.42]}
        rotation={[0.56, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.13, 0.16, 1.65, 16]} />
        <meshStandardMaterial color="#c4a87e" roughness={0.85} />
      </mesh>
    </group>
  )
}

// stretchy band drawn from a prong tip to the held block
function Band({ tip }: { tip: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null)
  return (
    <mesh ref={ref} name={`band-${tip.z < ANCHOR.z ? "l" : "r"}`} visible={false}>
      <cylinderGeometry args={[0.045, 0.045, 1, 10]} />
      <meshStandardMaterial color="#7a5c40" roughness={0.7} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/*  Launched shots + split debris + effects                             */
/* ------------------------------------------------------------------ */
type ShotInst = {
  uid: string
  blockId: string
  pos: [number, number, number]
  vel: [number, number, number]
  angvel: [number, number, number]
  hidden?: boolean
}
type DebrisInst = { uid: string; pos: [number, number, number]; vel: [number, number, number] }
type EffectInst = { id: string; type: "pop" | "ring"; pos: [number, number, number]; color?: string }

function LaunchedShot({
  shot,
  register,
}: {
  shot: ShotInst
  register: (key: string, rb: RapierRigidBody | null) => void
}) {
  const block = BLOCK_BY_ID[shot.blockId]
  const handleImpact = (payload: Parameters<typeof impactStrength>[0]) => {
    const { strength } = impactStrength(payload)
    if (strength > 0.02) playImpact(block.id, strength)
  }
  return (
    <RigidBody
      ref={(rb) => register(shot.uid, rb)}
      position={shot.pos}
      linearVelocity={shot.vel}
      angularVelocity={shot.angvel}
      colliders={false}
      friction={0.7}
      restitution={0.1}
      density={6}
      linearDamping={0.05}
      angularDamping={0.8}
      enabledTranslations={LOCK_T}
      enabledRotations={LOCK_R}
      ccd
      onCollisionEnter={handleImpact}
    >
      {block.shape === "box" ? (
        <CuboidCollider args={block.half} />
      ) : (
        <CylinderCollider args={[block.halfHeight, block.radius]} />
      )}
      <PaintedMesh block={block} />
    </RigidBody>
  )
}

const MINI_SCALE = 0.62
function MiniCube({
  debris,
  register,
}: {
  debris: DebrisInst
  register: (key: string, rb: RapierRigidBody | null) => void
}) {
  const block = BLOCK_BY_ID.cube as Block & { shape: "box"; half: [number, number, number] }
  const half = block.half.map((h) => h * MINI_SCALE) as [number, number, number]
  const handleImpact = (payload: Parameters<typeof impactStrength>[0]) => {
    const { strength } = impactStrength(payload)
    if (strength > 0.02) playImpact("cube", strength)
  }
  return (
    <RigidBody
      ref={(rb) => register(debris.uid, rb)}
      position={debris.pos}
      linearVelocity={debris.vel}
      angularVelocity={[Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3]}
      colliders={false}
      friction={0.7}
      restitution={0.1}
      density={6}
      enabledTranslations={LOCK_T}
      enabledRotations={LOCK_R}
      ccd
      onCollisionEnter={handleImpact}
    >
      <CuboidCollider args={half} />
      <PaintedMesh block={block} scale={MINI_SCALE} />
    </RigidBody>
  )
}

// short-lived pop / shockwave-ring visuals
function Effect({ fx, onDone }: { fx: EffectInst; onDone: (id: string) => void }) {
  const ref = useRef<THREE.Mesh>(null)
  const born = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (born.current === null) born.current = clock.elapsedTime
    const t = (clock.elapsedTime - born.current) / (fx.type === "ring" ? 0.55 : 0.45)
    if (t >= 1) {
      onDone(fx.id)
      return
    }
    const m = ref.current
    if (!m) return
    const mat = m.material as THREE.MeshBasicMaterial
    if (fx.type === "ring") {
      const s = 0.5 + t * 5.5
      m.scale.set(s, s, s)
      mat.opacity = 0.55 * (1 - t)
    } else {
      const s = 0.4 + t * 1.6
      m.scale.set(s, s, s)
      mat.opacity = 0.7 * (1 - t)
    }
  })
  return fx.type === "ring" ? (
    // the shockwave ring faces the side camera (it lives in the play plane)
    <mesh ref={ref} position={fx.pos} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[1, 0.07, 10, 48]} />
      <meshBasicMaterial color={fx.color ?? "#c83a2e"} transparent opacity={0.55} toneMapped={false} />
    </mesh>
  ) : (
    <mesh ref={ref} position={fx.pos}>
      <sphereGeometry args={[0.5, 20, 14]} />
      <meshBasicMaterial color="#f6f2ea" transparent opacity={0.7} toneMapped={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/*  The playable scene                                                  */
/* ------------------------------------------------------------------ */
let uidCounter = 0
const uid = () => `u${++uidCounter}`

function GameWorld({ level, onHud, onWin, onLose }: SceneProps) {
  const { camera, gl } = useThree()

  /* ---- registries -------------------------------------------------- */
  const bodies = useRef(new Map<string, RapierRigidBody>())
  const register = useCallback((key: string, rb: RapierRigidBody | null) => {
    if (rb) bodies.current.set(key, rb)
    else bodies.current.delete(key)
  }, [])

  /* ---- game state --------------------------------------------------- */
  const [shotIdx, setShotIdx] = useState(0)
  const [flying, setFlying] = useState(false)
  const [powerUsed, setPowerUsed] = useState(false)
  const [shots, setShots] = useState<ShotInst[]>([])
  const [debris, setDebris] = useState<DebrisInst[]>([])
  const [effects, setEffects] = useState<EffectInst[]>([])
  const [knotsAlive, setKnotsAlive] = useState<boolean[]>(() => level.knots.map(() => true))

  const flyingRef = useRef(false)
  const powerUsedRef = useRef(false)
  const flightUids = useRef<string[]>([])
  const flightGrace = useRef(0) // seconds to wait for newly-spawned bodies to mount
  const activeBlockRef = useRef<Block | null>(null)
  const slowTime = useRef(0)
  const flightTime = useRef(0)
  const launchGuardUntil = useRef(0) // wall-clock ms: ignore taps right after launch
  const loseTime = useRef(0)
  const endedRef = useRef(false)
  const followRef = useRef<THREE.Vector3 | null>(null)
  const introRef = useRef(true) // opens on the ammo close-up until first touch
  const knotsAliveRef = useRef(knotsAlive)
  knotsAliveRef.current = knotsAlive

  const queue = level.shots
  const heldBlock = !flying && shotIdx < queue.length ? BLOCK_BY_ID[queue[shotIdx]] : null

  /* ---- audio priming ------------------------------------------------ */
  useEffect(() => {
    primeBlocks([
      ...BLOCKS.map((b) => ({ id: b.id, freq: blockBaseFreq(b) })),
      ...RAW_FREQS,
      { id: "knot", freq: 620 },
    ])
  }, [])

  /* ---- HUD mirror --------------------------------------------------- */
  const knotsLeft = knotsAlive.filter(Boolean).length
  useEffect(() => {
    onHud({ shotIdx, flying, powerUsed, knotsLeft })
  }, [shotIdx, flying, powerUsed, knotsLeft, onHud])

  /* ---- knot defeat --------------------------------------------------- */
  const knotDown = useCallback(
    (index: number) => {
      if (!knotsAliveRef.current[index] || endedRef.current) return
      const rb = bodies.current.get(`knot-${index}`)
      const p = rb?.isValid() ? rb.translation() : null
      const pos: [number, number, number] = p ? [p.x, p.y, p.z] : level.knots[index].pos
      playPop()
      setEffects((fx) => [...fx, { id: uid(), type: "pop", pos }])
      setKnotsAlive((prev) => {
        const next = prev.slice()
        next[index] = false
        if (next.every((a) => !a) && !endedRef.current) {
          endedRef.current = true
          const used = shotIdxRef.current + (flyingRef.current ? 1 : 0)
          const remaining = queue.length - used
          const stars = THREE.MathUtils.clamp(remaining + 1, 1, 3)
          setTimeout(() => onWin(stars), 800)
        }
        return next
      })
    },
    [level.knots, onWin, queue.length],
  )
  const shotIdxRef = useRef(0)
  shotIdxRef.current = shotIdx

  /* ---- aiming ------------------------------------------------------- */
  const aiming = useRef(false)
  const pull = useRef(new THREE.Vector3())
  const heldGroup = useRef<THREE.Group>(null)
  const dotsRef = useRef<THREE.Group>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const pointerToPlane = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const o = raycaster.ray.origin
      const d = raycaster.ray.direction
      // aim in the vertical play plane (x = 0) the side camera looks at
      if (Math.abs(d.x) < 1e-4) return null
      const t = (ANCHOR.x - o.x) / d.x
      if (t <= 0) return null
      return o.clone().addScaledVector(d, t)
    },
    [camera, gl, raycaster],
  )

  const launch = useCallback(() => {
    const block = activeBlockRef.current
    if (!block) return
    const p = pull.current
    const len = p.length()
    if (len < 0.35) {
      pull.current.set(0, 0, 0)
      return // too weak – re-seat the block
    }
    const s = len / PULL_MAX
    // launch straight opposite the pull, in the play plane – pull down-left,
    // fly up-right, exactly like the classic slingshot
    const vel: [number, number, number] = [0, -p.y * K, -p.z * K]
    const pos = ANCHOR.clone().add(p)
    const shotUid = uid()
    setShots((prev) => [
      ...prev,
      {
        uid: shotUid,
        blockId: block.id,
        pos: [pos.x, pos.y, pos.z],
        vel,
        angvel: [-(2 + s * 3), 0, 0],
      },
    ])
    flightUids.current = [shotUid]
    flightGrace.current = 0.5
    introRef.current = false // the stage only reveals itself once the block flies
    flyingRef.current = true
    powerUsedRef.current = false
    slowTime.current = 0
    flightTime.current = 0
    launchGuardUntil.current = performance.now() + 180
    setFlying(true)
    setPowerUsed(false)
    playWhoosh(s)
    pull.current.set(0, 0, 0)
  }, [])

  // drag listeners – attached for the whole life of the scene
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!aiming.current) return
      const hit = pointerToPlane(e.clientX, e.clientY)
      if (!hit) return
      const p = hit.sub(ANCHOR)
      p.x = 0
      p.z = Math.max(p.z, 0.15) // always pull back, never past the fork
      p.y = Math.max(p.y, -ANCHOR.y + 1.1) // don't drag the block into the ground
      if (p.length() > PULL_MAX) p.setLength(PULL_MAX)
      pull.current.copy(p)
    }
    const onUp = () => {
      if (!aiming.current) return
      aiming.current = false
      launch()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [gl, pointerToPlane, launch])

  /* ---- powers -------------------------------------------------------- */
  const firePower = useCallback(() => {
    const block = activeBlockRef.current
    if (!block || powerUsedRef.current) return
    const rb = bodies.current.get(flightUids.current[0] ?? "")
    if (!rb || !rb.isValid()) return
    powerUsedRef.current = true
    setPowerUsed(true)
    const t = rb.translation()
    const v = rb.linvel()

    switch (block.power) {
      case "spin": {
        // sawblade sweep: violent forward roll + a nudge onward
        rb.setAngvel({ x: v.z >= 0 ? 34 : -34, y: 0, z: 0 }, true)
        rb.setLinvel({ x: 0, y: Math.max(v.y, 0.5), z: v.z * 1.15 }, true)
        playWhoosh(1)
        break
      }
      case "dash": {
        // burst of speed, arc flattens
        rb.setLinvel({ x: 0, y: 1.2, z: v.z * 2.3 }, true)
        playWhoosh(1)
        break
      }
      case "slam": {
        // dive straight down like a dropped hammer
        rb.setLinvel({ x: 0, y: -30, z: v.z * 0.25 }, true)
        rb.setAngvel({ x: 6, y: 0, z: 0 }, true)
        playWhoosh(0.8)
        break
      }
      case "blast": {
        // radial shockwave shoving every loose body away
        const R = 4.2
        const c = new THREE.Vector3(t.x, t.y, t.z)
        bodies.current.forEach((body) => {
          if (!body.isValid() || body.isFixed()) return
          const bt = body.translation()
          const d = new THREE.Vector3(bt.x - c.x, bt.y - c.y, bt.z - c.z)
          const dist = d.length()
          if (dist > R || dist < 1e-3) return
          const falloff = 1 - dist / R
          const dv = d.normalize().multiplyScalar(13 * falloff)
          dv.y += 4.5 * falloff
          const m = body.mass()
          body.applyImpulse({ x: dv.x * m, y: dv.y * m, z: dv.z * m }, true)
        })
        rb.setLinvel({ x: v.x * 0.2, y: -6, z: v.z * 0.2 }, true)
        setEffects((fx) => [
          ...fx,
          { id: uid(), type: "ring", pos: [t.x, Math.max(t.y, 0.4), t.z], color: block.color },
        ])
        playBoom()
        break
      }
      case "split": {
        // one cube becomes three, fanning out in the play plane like the trio
        const shotUid = flightUids.current[0]
        setShots((prev) => prev.map((sh) => (sh.uid === shotUid ? { ...sh, hidden: true } : sh)))
        const minis: DebrisInst[] = [-1, 0, 1].map((i) => {
          // rotate the velocity a touch up / down around the x axis
          const a = i * 0.22
          const vy = v.y * Math.cos(a) - v.z * Math.sin(a) * 0.6 + 0.8
          const vz = v.z * Math.cos(a) * 1.05
          return {
            uid: uid(),
            pos: [0, t.y + 0.05 + i * 0.78, t.z + i * 0.12],
            vel: [0, vy, vz],
          }
        })
        flightUids.current = minis.map((m) => m.uid)
        flightGrace.current = 0.5 // let the minis mount before spent-tracking resumes
        setDebris((prev) => [...prev, ...minis])
        playPop()
        break
      }
    }
  }, [])

  // tap-for-power listener
  useEffect(() => {
    const el = gl.domElement
    const onDown = () => {
      // dev aid: record why a tap did / didn't trigger the power
      ;(window as unknown as { __tap?: unknown }).__tap = {
        aiming: aiming.current,
        flying: flyingRef.current,
        powerUsed: powerUsedRef.current,
        guard: Math.max(0, launchGuardUntil.current - performance.now()),
        t: Date.now(),
      }
      if (aiming.current || !flyingRef.current || powerUsedRef.current) return
      if (performance.now() < launchGuardUntil.current) return
      firePower()
    }
    el.addEventListener("pointerdown", onDown)
    return () => el.removeEventListener("pointerdown", onDown)
  }, [gl, firePower])

  /* ---- held block bookkeeping ---------------------------------------- */
  useEffect(() => {
    activeBlockRef.current = heldBlock ?? activeBlockRef.current
  }, [heldBlock])

  const startAim = useCallback(
    (e: { stopPropagation: () => void }) => {
      if (flyingRef.current || endedRef.current || !heldBlock) return
      e.stopPropagation()
      aiming.current = true
    },
    [heldBlock],
  )

  /* ---- per-frame game loop -------------------------------------------- */
  useFrame((state, dt) => {
    // seat the held block at anchor + pull, ease the visual
    const g = heldGroup.current
    if (g) {
      const target = ANCHOR.clone().add(pull.current)
      g.position.lerp(target, 1 - Math.exp(-18 * dt))
      g.visible = !!heldBlock
    }

    // trajectory dots while aiming
    const dots = dotsRef.current
    if (dots) {
      const show = aiming.current && pull.current.length() > 0.3
      dots.visible = show
      if (show) {
        const p = pull.current
        const v = new THREE.Vector3(0, -p.y * K, -p.z * K)
        const p0 = ANCHOR.clone().add(p)
        dots.children.forEach((dot, i) => {
          const t = 0.08 * (i + 1)
          dot.position.set(p0.x + v.x * t, p0.y + v.y * t - 0.5 * G * t * t, p0.z + v.z * t)
          dot.visible = dot.position.y > 0.1
        })
      }
    }

    // rubber bands
    const seat = g ? g.position : ANCHOR
    state.scene.traverse((obj) => {
      if (!obj.name.startsWith("band-")) return
      const mesh = obj as THREE.Mesh
      const show = !!heldBlock
      mesh.visible = show
      if (!show) return
      const tip = obj.name === "band-l" ? PRONG_L : PRONG_R
      const to = seat
      const mid = tip.clone().add(to).multiplyScalar(0.5)
      const delta = to.clone().sub(tip)
      const lenB = Math.max(delta.length(), 0.001)
      mesh.position.copy(mid)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
      mesh.scale.set(1, lenB, 1)
    })

    // a knot is down when it reaches the floor OR falls well below its perch
    // (landing on toppled debris still counts as knocked down)
    knotsAliveRef.current.forEach((alive, i) => {
      if (!alive) return
      const rb = bodies.current.get(`knot-${i}`)
      if (!rb || !rb.isValid()) return
      const y = rb.translation().y
      if (y < KNOT_RADIUS + 0.08 || y < level.knots[i].pos[1] - 1.5) knotDown(i)
    })

    // flight tracking → shot spent → next block
    if (flyingRef.current) {
      flightTime.current += dt
      if (flightGrace.current > 0) flightGrace.current -= dt
      let maxSpeed = 0
      let tracked = 0
      let focus: THREE.Vector3 | null = null
      for (const id of flightUids.current) {
        const rb = bodies.current.get(id)
        if (!rb || !rb.isValid()) continue
        tracked++
        const v = rb.linvel()
        maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z))
        const p = rb.translation()
        if (!focus || p.y > focus.y) focus = new THREE.Vector3(p.x, p.y, p.z)
      }
      followRef.current = focus
      if (maxSpeed < 0.4) slowTime.current += dt
      else slowTime.current = 0
      const spent =
        flightGrace.current <= 0 &&
        (tracked === 0 || slowTime.current > 1.1 || flightTime.current > 9 || (focus !== null && focus.y < -3))
      if (spent) {
        flyingRef.current = false
        followRef.current = null
        setFlying(false)
        setTimeout(() => setShotIdx((i) => i + 1), 700)
      }
    } else {
      followRef.current = null
    }

    // out of shots, knots still standing → defeat
    if (!endedRef.current && !flyingRef.current && shotIdxRef.current >= queue.length && knotsAliveRef.current.some(Boolean)) {
      loseTime.current += dt
      if (loseTime.current > 2.0) {
        endedRef.current = true
        onLose()
      }
    } else {
      loseTime.current = 0
    }
  })

  const removeEffect = useCallback((id: string) => {
    setEffects((fx) => fx.filter((f) => f.id !== id))
  }, [])

  /* ---- render ---------------------------------------------------------- */
  return (
    <>
      <Room />
      <CameraRig followRef={followRef} introRef={introRef} />
      <SlingFork />
      <Band tip={PRONG_L} />
      <Band tip={PRONG_R} />

      {/* trajectory preview */}
      <group ref={dotsRef} visible={false}>
        {Array.from({ length: 14 }).map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.09 - i * 0.003, 10, 8]} />
            <meshBasicMaterial color="#8a8171" transparent opacity={0.55 - i * 0.03} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* the loaded block, waiting in the sling */}
      <group ref={heldGroup} position={ANCHOR.toArray()} onPointerDown={startAim}>
        {heldBlock && (
          <Suspense fallback={null}>
            <PaintedMesh block={heldBlock} />
          </Suspense>
        )}
        {/* a generous invisible grab handle so the block is easy to catch */}
        <mesh visible={false}>
          <sphereGeometry args={[0.9, 8, 8]} />
          <meshBasicMaterial />
        </mesh>
      </group>

      {/* blocks waiting their turn, lined up behind the sling (screen-left),
          spaced by each block's real footprint so they never overlap */}
      {(() => {
        const scale = 0.55
        const gap = 0.3
        let zc = ANCHOR.z + 1.6
        const row: React.ReactNode[] = []
        queue.forEach((id, i) => {
          if (i <= shotIdx) return
          const b = BLOCK_BY_ID[id]
          const depth = (b.shape === "cylinder" ? b.radius * 2 : b.half[2] * 2) * scale
          const y = (b.shape === "cylinder" ? b.halfHeight : b.half[1]) * scale
          const z = zc + depth / 2
          zc += depth + gap
          row.push(
            // a step back in depth (-x) so a fully-pulled block never clips them
            <group key={`wait-${i}`} position={[-1.2, y, z]} scale={scale}>
              <Suspense fallback={null}>
                <PaintedMesh block={b} />
              </Suspense>
            </group>,
          )
        })
        return row
      })()}

      {/* launched blocks stay in the world */}
      <Suspense fallback={null}>
        {shots.filter((s) => !s.hidden).map((s) => (
          <LaunchedShot key={s.uid} shot={s} register={register} />
        ))}
        {debris.map((d) => (
          <MiniCube key={d.uid} debris={d} register={register} />
        ))}
      </Suspense>

      {/* the unpainted structures + knots */}
      {level.pieces.map((piece, i) => (
        <StructurePiece key={`p-${i}`} piece={piece} index={i} register={register} />
      ))}
      {level.knots.map((k, i) =>
        knotsAlive[i] ? <KnotBody key={`k-${i}`} pos={k.pos} index={i} register={register} onDown={knotDown} /> : null,
      )}

      {/* transient effects */}
      {effects.map((fx) => (
        <Effect key={fx.id} fx={fx} onDone={removeEffect} />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Canvas shell                                                        */
/* ------------------------------------------------------------------ */
export default function Scene(props: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }}
      camera={{ position: [7, 1.7, 8.2], fov: CAM_FOV, near: 0.1, far: 200 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.shadowMap.type = THREE.BasicShadowMap // hard-edged toy-box shadows
      }}
      style={{ touchAction: "none" }}
    >
      {/* HDR white so the sky stays 100% white through ACES tone mapping –
          kept just past saturation so ground shadows can still cut through */}
      <color attach="background" args={[3, 3, 3]} />
      <Physics gravity={[0, -G, 0]} timeStep={1 / 60} numSolverIterations={8} maxCcdSubsteps={2} interpolate>
        <Suspense fallback={null}>
          <GameWorld {...props} />
        </Suspense>
      </Physics>
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={0.8} intensity={1.3} distanceFalloff={1} halfRes color="#1c160e" />
        <Vignette offset={0.3} darkness={0.08} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  )
}
