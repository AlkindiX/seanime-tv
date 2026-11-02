import assert from "node:assert/strict"
import test from "node:test"
import { createKeyBatcher } from "../src/lib/utils/key-batcher.ts"

function fakeTimers() {
    const queue: Array<{ run: () => void, at: number }> = []
    return {
        schedule: (run: () => void, ms: number) => {
            const entry = { run, at: ms }
            queue.push(entry)
            return entry
        },
        cancel: (timer: unknown) => {
            const index = queue.indexOf(timer as never)
            if (index >= 0) queue.splice(index, 1)
        },
        fire: () => queue.splice(0).forEach(entry => entry.run()),
        get size() {
            return queue.length
        },
    }
}

test("a burst of keys is flushed once, without duplicates", () => {
    const timers = fakeTimers()
    const flushed: string[][] = []
    const batcher = createKeyBatcher(keys => flushed.push(keys), 1000, timers.schedule, timers.cancel)

    batcher.add(["library", "anilist"])
    batcher.add(["library", "missing"])
    batcher.add(["library"])
    assert.equal(timers.size, 1)
    assert.deepEqual(flushed, [])

    timers.fire()
    assert.deepEqual(flushed, [["library", "anilist", "missing"]])
})

test("keys after a flush start a new batch", () => {
    const timers = fakeTimers()
    const flushed: string[][] = []
    const batcher = createKeyBatcher(keys => flushed.push(keys), 1000, timers.schedule, timers.cancel)

    batcher.add(["a"])
    timers.fire()
    batcher.add(["b"])
    timers.fire()
    assert.deepEqual(flushed, [["a"], ["b"]])
})

test("dispose drops waiting keys", () => {
    const timers = fakeTimers()
    const flushed: string[][] = []
    const batcher = createKeyBatcher(keys => flushed.push(keys), 1000, timers.schedule, timers.cancel)

    batcher.add(["a"])
    batcher.dispose()
    timers.fire()
    assert.deepEqual(flushed, [])
    assert.equal(timers.size, 0)
})
