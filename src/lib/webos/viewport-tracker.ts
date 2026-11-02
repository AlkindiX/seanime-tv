/**
 * Tells card images whether they are on (or close to) the screen, for the
 * webOS and Tizen builds.
 *
 * Shelves keep two screens of cards mounted on each side, and Discover mounts
 * every row, so well over a hundred covers were downloaded, decoded and kept
 * while twenty or so showed. Cards here get their image only near the screen
 * and drop it again once well past it, in every scroll direction.
 *
 * IntersectionObserver can't do this: its margin only widens the window,
 * while every row clips its cards at its own edges, so a card one step to the
 * right of a row would load only once it slid in. The rows and the page fill
 * the screen, so measuring against the screen itself is enough.
 */

export type Box = { left: number; top: number; right: number; bottom: number }
export type Screen = { width: number; height: number }

/** A card this close to the screen (a share of its size) gets its image: four covers ahead in a row, a row above and below. */
export const LOAD_MARGIN = 0.5
/** And keeps it until this far, so a card at the edge doesn't flip at every step. */
export const UNLOAD_MARGIN = 1

/** Whether a card should have its image; `near` is what it has now. */
export function isNearScreen(box: Box, screen: Screen, near: boolean) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) return near
    const margin = near ? UNLOAD_MARGIN : LOAD_MARGIN
    const x = screen.width * margin
    const y = screen.height * margin
    return box.right > -x && box.left < screen.width + x && box.bottom > -y && box.top < screen.height + y
}

type Entry = {
    node: Element
    near: boolean
    onChange: (near: boolean) => void
}

const entries = new Set<Entry>()
let frame: number | null = null
let fallback: ReturnType<typeof setTimeout> | null = null
let listening = false

function check() {
    if (frame !== null) cancelAnimationFrame(frame)
    if (fallback !== null) clearTimeout(fallback)
    frame = null
    fallback = null

    const screen = { width: window.innerWidth, height: window.innerHeight }
    // Measure everything first, then notify: a re-render between reads would force a layout per card.
    const changed: Entry[] = []
    for (const entry of Array.from(entries)) {
        const near = isNearScreen(entry.node.getBoundingClientRect(), screen, entry.near)
        if (near !== entry.near) {
            entry.near = near
            changed.push(entry)
        }
    }
    for (const entry of changed) entry.onChange(entry.near)
}

/** Once per frame at most; the timer covers a page that draws no frames (rAF paused). */
function schedule() {
    if (frame !== null) return
    frame = requestAnimationFrame(check)
    fallback = setTimeout(check, 250)
}

function listen() {
    if (listening) return
    listening = true
    // Scroll events don't bubble; capturing sees every list's.
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule)
}

/**
 * Tracks `node` and calls `onChange` when it comes near the screen or goes
 * well past it. Returns whether it is near now (measured at once, so a card
 * mounting on screen shows its image without an empty frame) and the cleanup.
 */
export function trackNearScreen(node: Element, onChange: (near: boolean) => void) {
    listen()
    const entry: Entry = { node, near: false, onChange }
    entry.near = isNearScreen(node.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, false)
    entries.add(entry)
    // Mounting cards (a new row, the list rendering further) can push others into view.
    schedule()
    return {
        near: entry.near,
        stop: () => {
            entries.delete(entry)
        },
    }
}
