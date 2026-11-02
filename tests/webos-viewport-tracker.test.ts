import assert from "node:assert/strict"
import test from "node:test"
import { isNearScreen, LOAD_MARGIN, UNLOAD_MARGIN } from "../src/lib/webos/viewport-tracker.ts"

const screen = { width: 1920, height: 1080 }

function card(left: number, top: number) {
    return { left, top, right: left + 220, bottom: top + 380 }
}

test("a card on screen gets its image", () => {
    assert.ok(isNearScreen(card(64, 500), screen, false))
})

test("cards load a little ahead in every direction, not further", () => {
    const x = screen.width * LOAD_MARGIN
    const y = screen.height * LOAD_MARGIN
    // Just inside the load margin: right, left, below, above.
    assert.ok(isNearScreen(card(screen.width + x - 10, 500), screen, false))
    assert.ok(isNearScreen(card(-x - 210, 500), screen, false))
    assert.ok(isNearScreen(card(64, screen.height + y - 10), screen, false))
    assert.ok(isNearScreen(card(64, -y - 370), screen, false))
    // Past it.
    assert.ok(!isNearScreen(card(screen.width + x + 10, 500), screen, false))
    assert.ok(!isNearScreen(card(-x - 230, 500), screen, false))
    assert.ok(!isNearScreen(card(64, screen.height + y + 10), screen, false))
    assert.ok(!isNearScreen(card(64, -y - 390), screen, false))
})

test("a loaded card keeps its image until it is well past the screen", () => {
    const between = screen.width * (LOAD_MARGIN + UNLOAD_MARGIN) / 2
    // Not loaded there yet, but not dropped there either: no flipping at the edge.
    assert.ok(!isNearScreen(card(screen.width + between, 500), screen, false))
    assert.ok(isNearScreen(card(screen.width + between, 500), screen, true))
    assert.ok(!isNearScreen(card(screen.width * (1 + UNLOAD_MARGIN) + 10, 500), screen, true))
    assert.ok(!isNearScreen(card(64, -screen.height * UNLOAD_MARGIN - 400), screen, true))
})

test("a card with no size (not laid out, display none) keeps what it has", () => {
    const empty = { left: 0, top: 0, right: 0, bottom: 0 }
    assert.equal(isNearScreen(empty, screen, true), true)
    assert.equal(isNearScreen(empty, screen, false), false)
})
