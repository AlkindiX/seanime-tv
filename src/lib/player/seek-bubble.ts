/**
 * The "+10s" bubble the webOS player shows when Left/Right (or ⏪/⏩) seek
 * with the controls hidden. Presses in the same direction add up while the
 * bubble is showing; the other direction starts a new one. It is a small
 * store outside React, so the player screen doesn't re-render on each press;
 * the bubble subscribes to it.
 */

export type SeekBubble = {
    /** 1 forward, -1 back. */
    direction: 1 | -1
    /** Seconds moved in that direction since the bubble appeared. */
    seconds: number
    /** New for each bubble, so it can play its entrance once. */
    id: number
}

type Timers = {
    schedule: (callback: () => void, ms: number) => unknown
    cancel: (handle: unknown) => void
}

/** How long the bubble stays after the last press. */
export const SEEK_BUBBLE_MS = 900

export function createSeekBubble(timers: Timers = {
    schedule: (callback, ms) => setTimeout(callback, ms),
    cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}) {
    let current: SeekBubble | null = null
    let timer: unknown = null
    let nextId = 0
    const listeners = new Set<() => void>()

    const emit = () => {
        for (const listener of Array.from(listeners)) listener()
    }
    const stopTimer = () => {
        if (timer !== null) timers.cancel(timer)
        timer = null
    }

    return {
        /** Shows (or adds to) the bubble for a seek of `seconds` (negative is back). */
        add(seconds: number) {
            if (!Number.isFinite(seconds) || seconds === 0) return
            const direction = seconds > 0 ? 1 : -1
            const amount = Math.abs(seconds)
            current = current && current.direction === direction
                ? { ...current, seconds: current.seconds + amount }
                : { direction, seconds: amount, id: ++nextId }
            stopTimer()
            timer = timers.schedule(() => {
                timer = null
                current = null
                emit()
            }, SEEK_BUBBLE_MS)
            emit()
        },
        clear() {
            stopTimer()
            if (current === null) return
            current = null
            emit()
        },
        subscribe(listener: () => void) {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        getSnapshot: (): SeekBubble | null => current,
    }
}

export type SeekBubbleStore = ReturnType<typeof createSeekBubble>

/** "+30s", "-1:30" past a minute. */
export function formatSeekBubble(bubble: Pick<SeekBubble, "direction" | "seconds">) {
    const total = Math.round(bubble.seconds)
    const sign = bubble.direction > 0 ? "+" : "-"
    if (total < 60) return `${sign}${total}s`
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`
}
