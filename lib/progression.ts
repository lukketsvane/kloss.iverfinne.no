// Linear progression persisted to localStorage: highest unlocked level and the
// best star count per level.
const KEY = "kloss:progress"

export type Progress = {
  unlocked: number // highest level index reachable
  stars: Record<string, number> // level id -> best stars (1..3)
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return { unlocked: 0, stars: {} }
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { unlocked: 0, stars: {} }
    const p = JSON.parse(raw) as Progress
    return { unlocked: p.unlocked ?? 0, stars: p.stars ?? {} }
  } catch {
    return { unlocked: 0, stars: {} }
  }
}

export function saveProgress(p: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // private mode / quota – progress just won't persist
  }
}
