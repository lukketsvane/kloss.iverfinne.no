"use client"

// Game shell: mounts the 3D scene with no chrome at all — no icons, no text.
// The only HUD is a faint column of level dots. Victory advances by itself,
// defeat retries by itself; the toy speaks for itself.
import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"

import { LEVELS } from "@/lib/levels"
import { loadProgress, saveProgress } from "@/lib/progression"
import { unlockAudio } from "@/lib/impact-sound"
import type { HudState } from "@/components/scene"

const Scene = dynamic(() => import("@/components/scene"), { ssr: false })

export default function KlossGame() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [unlocked, setUnlocked] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<null | { kind: "win"; stars: number } | { kind: "lose" }>(null)
  const [hud, setHud] = useState<HudState>({ shotIdx: 0, flying: false, powerUsed: false, knotsLeft: 0 })

  useEffect(() => {
    const p = loadProgress()
    setUnlocked(p.unlocked)
    setLevelIdx(Math.min(p.unlocked, LEVELS.length - 1))
  }, [])

  // dev aid: expose live game state for automated checks
  useEffect(() => {
    ;(window as unknown as { __hud?: unknown }).__hud = { ...hud, levelIdx, result: result?.kind ?? null }
  }, [hud, levelIdx, result])

  const level = LEVELS[levelIdx]

  const onWin = useCallback(
    (stars: number) => {
      setResult({ kind: "win", stars })
      const p = loadProgress()
      const next = {
        unlocked: Math.max(p.unlocked, Math.min(levelIdx + 1, LEVELS.length - 1)),
        stars: { ...p.stars, [LEVELS[levelIdx].id]: Math.max(p.stars[LEVELS[levelIdx].id] ?? 0, stars) },
      }
      saveProgress(next)
      setUnlocked(next.unlocked)
    },
    [levelIdx],
  )

  const onLose = useCallback(() => setResult({ kind: "lose" }), [])

  const restart = useCallback(() => {
    setResult(null)
    setAttempt((a) => a + 1)
  }, [])

  const nextLevel = useCallback(() => {
    setResult(null)
    setAttempt((a) => a + 1)
    setLevelIdx((i) => (i + 1) % LEVELS.length)
  }, [])

  // no buttons: a solved level flows into the next one, a failed one replays
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => (result.kind === "win" ? nextLevel() : restart()), 1600)
    return () => clearTimeout(t)
  }, [result, nextLevel, restart])

  const jumpTo = useCallback(
    (i: number) => {
      if (i > unlocked) return
      setResult(null)
      setAttempt((a) => a + 1)
      setLevelIdx(i)
    },
    [unlocked],
  )

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-white" onPointerDown={() => unlockAudio()}>
      <div className="absolute inset-0" key={`${levelIdx}:${attempt}`}>
        <Scene level={level} onHud={setHud} onWin={onWin} onLose={onLose} />
      </div>

      {/* level dots – tap the current one to replay it */}
      <div className="absolute left-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 opacity-40 transition-opacity duration-300 hover:opacity-90">
        {LEVELS.map((l, i) => (
          <button
            key={l.id}
            aria-label={`level ${i + 1}`}
            onClick={() => jumpTo(i)}
            disabled={i > unlocked}
            className="h-2.5 w-2.5 rounded-full transition-all"
            style={{
              backgroundColor: i === levelIdx ? "#2b2620" : i <= unlocked ? "#a8a29a" : "#e4e1db",
              transform: i === levelIdx ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* a quiet white breath between levels */}
      <div
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-700"
        style={{ opacity: result ? 1 : 0 }}
      />
    </div>
  )
}
