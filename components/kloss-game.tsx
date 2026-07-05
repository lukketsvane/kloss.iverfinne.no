"use client"

// Game shell: mounts the 3D scene and draws the minimal kl.oss.ete-style HUD –
// level dots, restart + mute, the ammo queue with each block's power icon, and
// the victory / defeat overlays. No text walls: the toy speaks for itself.
import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { ArrowDown, ChevronRight, Copy, RefreshCw, RotateCcw, Star, Sun, Volume2, VolumeX, Zap } from "lucide-react"

import { BLOCK_BY_ID, type PowerId } from "@/lib/blocks"
import { LEVELS } from "@/lib/levels"
import { loadProgress, saveProgress } from "@/lib/progression"
import { setMuted as setAudioMuted, unlockAudio } from "@/lib/impact-sound"
import type { HudState } from "@/components/scene"

const Scene = dynamic(() => import("@/components/scene"), { ssr: false })

const POWER_ICON: Record<PowerId, typeof Zap> = {
  spin: RefreshCw,
  split: Copy,
  dash: Zap,
  slam: ArrowDown,
  blast: Sun,
}

export default function KlossGame() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [unlocked, setUnlocked] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [muted, setMuted] = useState(false)
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

  const jumpTo = useCallback(
    (i: number) => {
      if (i > unlocked) return
      setResult(null)
      setAttempt((a) => a + 1)
      setLevelIdx(i)
    },
    [unlocked],
  )

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      setAudioMuted(!m)
      return !m
    })
  }, [])

  const queueChips = useMemo(
    () =>
      level.shots.map((id, i) => {
        const b = BLOCK_BY_ID[id]
        const Icon = POWER_ICON[b.power]
        const spent = i < hud.shotIdx || (i === hud.shotIdx && hud.flying)
        const active = i === hud.shotIdx
        return (
          <div
            key={`${level.id}-${i}`}
            className="flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-all duration-300"
            style={{
              backgroundColor: b.color,
              opacity: spent && !active ? 0.22 : active ? 1 : 0.65,
              transform: active && !hud.flying ? "scale(1.15)" : "scale(1)",
              boxShadow: active && !hud.flying ? "0 0 0 3px rgba(43,38,32,0.35)" : undefined,
            }}
          >
            <Icon className="h-4 w-4 text-white/90" strokeWidth={2.4} />
          </div>
        )
      }),
    [level, hud.shotIdx, hud.flying],
  )

  const activeBlock = hud.flying && hud.shotIdx < level.shots.length ? BLOCK_BY_ID[level.shots[hud.shotIdx]] : null
  const PowerHintIcon = activeBlock ? POWER_ICON[activeBlock.power] : null

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#f6f2ea]"
      onPointerDown={() => unlockAudio()}
    >
      <div className="absolute inset-0" key={`${levelIdx}:${attempt}`}>
        <Scene level={level} onHud={setHud} onWin={onWin} onLose={onLose} />
      </div>

      {/* control cluster – faint until hovered, kl.oss.ete style */}
      <div className="absolute left-4 top-4 flex flex-col gap-3 opacity-50 transition-opacity duration-300 hover:opacity-100 pt-[env(safe-area-inset-top)]">
        <button
          aria-label="restart level"
          onClick={restart}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#2b2620] active:scale-95"
        >
          <RotateCcw className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <button
          aria-label={muted ? "unmute" : "mute"}
          onClick={toggleMute}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#2b2620] active:scale-95"
        >
          {muted ? <VolumeX className="h-6 w-6" strokeWidth={2.2} /> : <Volume2 className="h-6 w-6" strokeWidth={2.2} />}
        </button>
        <div className="mt-1 flex flex-col items-center gap-2">
          {LEVELS.map((l, i) => (
            <button
              key={l.id}
              aria-label={`level ${i + 1}`}
              onClick={() => jumpTo(i)}
              disabled={i > unlocked}
              className="h-2.5 w-2.5 rounded-full transition-all"
              style={{
                backgroundColor: i === levelIdx ? "#2b2620" : i <= unlocked ? "#8a8171" : "#d5cfc2",
                transform: i === levelIdx ? "scale(1.3)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>

      {/* ammo queue */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2.5 pb-[env(safe-area-inset-bottom)]">
        {queueChips}
      </div>

      {/* tap-for-power hint while a block is flying */}
      {activeBlock && !hud.powerUsed && PowerHintIcon && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
              style={{ backgroundColor: activeBlock.color }}
            />
            <span
              className="relative flex h-10 w-10 items-center justify-center rounded-full shadow-md"
              style={{ backgroundColor: activeBlock.color }}
            >
              <PowerHintIcon className="h-5 w-5 text-white" strokeWidth={2.4} />
            </span>
          </div>
        </div>
      )}

      {/* victory / defeat overlays */}
      {result && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f6f2ea]/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-6 rounded-3xl bg-[#f6f2ea]/90 px-10 py-8 shadow-xl">
            {result.kind === "win" ? (
              <>
                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <Star
                      key={i}
                      className="h-9 w-9"
                      strokeWidth={1.6}
                      fill={i < result.stars ? "#e07b22" : "none"}
                      color={i < result.stars ? "#e07b22" : "#c9c2b3"}
                    />
                  ))}
                </div>
                <div className="flex gap-4">
                  <button
                    aria-label="replay level"
                    onClick={restart}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[#c7c0b1] text-[#2b2620] shadow-md active:scale-95"
                  >
                    <RotateCcw className="h-7 w-7" strokeWidth={2.2} />
                  </button>
                  <button
                    aria-label="next level"
                    onClick={nextLevel}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2f63cc] text-white shadow-md active:scale-95"
                  >
                    <ChevronRight className="h-8 w-8" strokeWidth={2.4} />
                  </button>
                </div>
              </>
            ) : (
              <button
                aria-label="try again"
                onClick={restart}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c83a2e] text-white shadow-md active:scale-95"
              >
                <RotateCcw className="h-8 w-8" strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
