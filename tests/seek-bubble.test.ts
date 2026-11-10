import assert from "node:assert/strict"
import test from "node:test"
import { createSeekBubble, formatSeekBubble, SEEK_BUBBLE_MS } from "../src/lib/player/seek-bubble.ts"

function fakeTimers() {
    const pending = new Map<number, { run: () => void; ms: number }>()
    let next = 0
    return {
        timers: {
            schedule: (run: () => void, ms: number) => {
                pending.set(++next, { run, ms })
                return next
            },
            cancel: (handle: unknown) => {
                pending.delete(handle as number)
            },
        },
        fire() {
            for (const [handle, timer] of Array.from(pending)) {
                pending.delete(handle)
                timer.run()
            }
        },
        pending,
    }
}

test("presses in one direction add up while the bubble shows", () => {
    const clock = fakeTimers()
    const bubble = createSeekBubble(clock.timers)
    bubble.add(10)
    bubble.add(10)
    bubble.add(10)
    const shown = bubble.getSnapshot()
    assert.equal(shown?.direction, 1)
    assert.equal(shown?.seconds, 30)
    // Only the last press's timer is left.
    assert.equal(clock.pending.size, 1)
    assert.equal([...clock.pending.values()][0].ms, SEEK_BUBBLE_MS)
})

test("the other direction starts a new bubble", () => {
    const bubble = createSeekBubble(fakeTimers().timers)
    bubble.add(10)
    const first = bubble.getSnapshot()!.id
    bubble.add(-10)
    const shown = bubble.getSnapshot()!
    assert.equal(shown.direction, -1)
    assert.equal(shown.seconds, 10)
    assert.notEqual(shown.id, first)
})

test("the bubble goes after the timer and tells subscribers", () => {
    const clock = fakeTimers()
    const bubble = createSeekBubble(clock.timers)
    let calls = 0
    const unsubscribe = bubble.subscribe(() => calls++)
    bubble.add(-5)
    assert.equal(calls, 1)
    clock.fire()
    assert.equal(bubble.getSnapshot(), null)
    assert.equal(calls, 2)
    unsubscribe()
    bubble.add(5)
    assert.equal(calls, 2)
})

test("a zero or invalid seek shows nothing", () => {
    const bubble = createSeekBubble(fakeTimers().timers)
    bubble.add(0)
    bubble.add(Number.NaN)
    assert.equal(bubble.getSnapshot(), null)
})

test("labels", () => {
    assert.equal(formatSeekBubble({ direction: 1, seconds: 10 }), "+10s")
    assert.equal(formatSeekBubble({ direction: -1, seconds: 3.4 }), "-3s")
    assert.equal(formatSeekBubble({ direction: 1, seconds: 90 }), "+1:30")
})
