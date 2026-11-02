/**
 * Small wrappers around the Samsung Tizen runtime (`window.tizen`), which
 * runs the same web build as webOS. Samsung's runtime injects `tizen` into
 * packaged apps; everywhere else these do nothing.
 */

type TizenKey = { name: string; code: number }

type TizenInputDevice = {
    getSupportedKeys?: () => TizenKey[]
    registerKey?: (name: string) => void
    registerKeyBatch?: (names: string[], onSuccess?: () => void, onError?: (error: unknown) => void) => void
}

type TizenApi = {
    tvinputdevice?: TizenInputDevice
    application?: { getCurrentApplication?: () => { exit?: () => void } }
}

export type TizenWindow = { tizen?: TizenApi }

function tizenApi(w: TizenWindow = typeof window === "undefined" ? {} : (window as TizenWindow)) {
    return w.tizen
}

export function isTizenDevice(w?: TizenWindow) {
    return !!tizenApi(w)
}

/** Which TV the web build runs on; a desktop browser counts as webOS, the build's first target. */
export type TVPlatform = "webos" | "tizen"

export function currentTVPlatform(w?: TizenWindow): TVPlatform {
    return isTizenDevice(w) ? "tizen" : "webos"
}

/** The TV maker, for messages about what its TVs play. */
export function tvBrand(platform: TVPlatform = currentTVPlatform()) {
    return platform === "tizen" ? "Samsung" : "LG"
}

/**
 * Arrows, Enter and Back always reach the app; Samsung delivers every other
 * key only after the app registers it. Exit is the TV's and is never taken.
 */
export const TIZEN_REMOTE_KEYS = [
    "MediaPlayPause",
    "MediaPlay",
    "MediaPause",
    "MediaStop",
    "MediaRewind",
    "MediaFastForward",
    "ChannelUp",
    "ChannelDown",
    "ColorF0Red",
    "ColorF1Green",
    "ColorF2Yellow",
    "ColorF3Blue",
    "Info",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]

/**
 * Registers the keys this TV has. A batch with one unknown name fails as a
 * whole, so the list is narrowed to the supported keys first.
 */
export function registerTizenKeys(w?: TizenWindow): string[] {
    const input = tizenApi(w)?.tvinputdevice
    if (!input) return []

    let names = TIZEN_REMOTE_KEYS
    try {
        const supported = input.getSupportedKeys?.()
        if (supported) {
            const available = new Set(supported.map((key) => key.name))
            names = names.filter((name) => available.has(name))
        }
    } catch (error) {
        console.warn("[Tizen] getSupportedKeys failed", error)
    }

    if (input.registerKeyBatch) {
        try {
            input.registerKeyBatch(names, undefined, (error) => console.warn("[Tizen] registerKeyBatch failed", error))
            return names
        } catch (error) {
            console.warn("[Tizen] registerKeyBatch failed, registering one at a time", error)
        }
    }

    const registered: string[] = []
    for (const name of names) {
        try {
            input.registerKey?.(name)
            registered.push(name)
        } catch {
            // This TV has no such key.
        }
    }
    return registered
}

/** Closes the app the way Samsung asks; false when not on a Tizen TV. */
export function exitTizenApp(w?: TizenWindow) {
    const app = tizenApi(w)?.application?.getCurrentApplication?.()
    if (!app?.exit) return false
    app.exit()
    return true
}
