/**
 * The DOM-free part of the remote input in remote.ts: which key is which
 * react-native-tvos event, and how Magic Remote wheel turns become focus
 * steps. Kept apart so it can be unit tested in Node.
 */

/**
 * LG remotes report these keyCodes on every webOS version. Event names are
 * the ones react-native-tvos uses on Android TV, so the same handler works
 * on both (digits included: Android TV sends "0" to "9").
 */
const KEY_CODES: Record<number, string> = {
    37: "left",
    38: "up",
    39: "right",
    40: "down",
    13: "select",
    415: "play",
    19: "pause",
    179: "playPause",
    413: "stop",
    417: "fastForward",
    412: "rewind",
    // CH+/CH-; PageUp/PageDown on a desktop keyboard.
    33: "channelUp",
    34: "channelDown",
    457: "info",
    403: "red",
    404: "green",
    405: "yellow",
    406: "blue",
}

// The number row and the numpad.
for (let digit = 0; digit <= 9; digit++) {
    KEY_CODES[48 + digit] = String(digit)
    KEY_CODES[96 + digit] = String(digit)
}

const KEY_NAMES: Record<string, string> = {
    ArrowLeft: "left",
    ArrowUp: "up",
    ArrowRight: "right",
    ArrowDown: "down",
    Enter: "select",
    MediaPlayPause: "playPause",
    MediaPlay: "play",
    MediaPause: "pause",
    MediaStop: "stop",
    MediaFastForward: "fastForward",
    MediaRewind: "rewind",
}

export function remoteEventType(keyCode: number, key: string): string | undefined {
    return KEY_CODES[keyCode] ?? KEY_NAMES[key]
}

export function isDigitEventType(type: string) {
    return type.length === 1 && type >= "0" && type <= "9"
}

/** Wheel deltas in lines (`deltaMode` 1) are converted at this many pixels per line. */
const LINE_HEIGHT = 40

export type WheelStepperOptions = {
    /** Pixels of wheel travel per focus step. */
    step: number
    /** Minimum milliseconds between two steps. */
    interval: number
}

/**
 * Turns wheel deltas into at most one focus step per `interval`: -1 (up),
 * 1 (down) or 0. Travel adds up between steps, and reversing the wheel
 * starts over so a step never goes the wrong way.
 */
export function createWheelStepper({ step, interval }: WheelStepperOptions) {
    let travel = 0
    let lastStep = Number.NEGATIVE_INFINITY

    return (deltaY: number, deltaMode: number, now: number): -1 | 0 | 1 => {
        // deltaMode 2 (pages) never comes from a TV remote; treat it like lines.
        const pixels = deltaMode === 0 ? deltaY : deltaY * LINE_HEIGHT
        if (pixels === 0 || !Number.isFinite(pixels)) return 0
        if (Math.sign(pixels) !== Math.sign(travel)) travel = 0
        travel += pixels

        if (Math.abs(travel) < step || now - lastStep < interval) return 0
        const direction = travel > 0 ? 1 : -1
        travel -= direction * step
        // A fast spin would otherwise queue up steps for later.
        if (Math.abs(travel) >= step) travel = direction * (step - 1)
        lastStep = now
        return direction
    }
}

/**
 * Holds back held-key repeats while the last focus step hasn't reached the
 * screen. A held arrow repeats every 30-50 ms; when a step (focus, the
 * re-render it causes, the scroll) takes longer on the TV, repeats queued up
 * and focus kept moving after the key was let go. `stepped` returns the
 * function to call once a frame has drawn the step; past `maxWait` a repeat
 * goes through anyway, so a page without frames can't swallow them.
 */
export function createRepeatGate(maxWait: number) {
    let pendingSince: number | null = null

    return {
        blocked(now: number) {
            return pendingSince !== null && now - pendingSince < maxWait
        },
        stepped(now: number) {
            pendingSince = now
            return () => {
                if (pendingSince === now) pendingSince = null
            }
        },
    }
}
