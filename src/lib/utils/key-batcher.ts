type Timer = unknown

/**
 * Collects query keys and hands them over together, `wait` ms after the
 * first one arrived. A library scan or a folder being copied sends a burst
 * of watcher events; refetching the big collections once per event (each
 * one restarting the request before it) cost every device, the TV most.
 */
export function createKeyBatcher(
    flush: (keys: string[]) => void,
    wait: number,
    schedule: (run: () => void, ms: number) => Timer = setTimeout,
    cancel: (timer: Timer) => void = timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
) {
    const pending = new Set<string>()
    let timer: Timer | null = null

    const run = () => {
        timer = null
        const keys = Array.from(pending)
        pending.clear()
        if (keys.length > 0) flush(keys)
    }

    return {
        add(keys: readonly string[]) {
            for (const key of keys) pending.add(key)
            if (timer === null) timer = schedule(run, wait)
        },
        /** Drops what is waiting (the listener is going away). */
        dispose() {
            if (timer !== null) cancel(timer)
            timer = null
            pending.clear()
        },
    }
}
