import assert from "node:assert/strict"
import test from "node:test"
import {
    currentTVPlatform,
    exitTizenApp,
    isTizenDevice,
    registerTizenKeys,
    TIZEN_REMOTE_KEYS,
    tvBrand,
} from "../src/lib/webos/tizen-platform.ts"
import { tvAudioSupport, unlistedOnWebOS } from "../src/lib/webos/tv-audio.ts"

test("a Tizen TV is told apart by window.tizen", () => {
    assert.equal(isTizenDevice({}), false)
    assert.equal(isTizenDevice({ tizen: {} }), true)
    assert.equal(currentTVPlatform({}), "webos")
    assert.equal(currentTVPlatform({ tizen: {} }), "tizen")
    assert.equal(tvBrand("tizen"), "Samsung")
    assert.equal(tvBrand("webos"), "LG")
})

test("only the keys this TV has are registered, in one batch, never Exit", () => {
    const batches: string[][] = []
    const tizen = {
        tvinputdevice: {
            getSupportedKeys: () => [
                { name: "MediaPlayPause", code: 10252 },
                { name: "ChannelUp", code: 427 },
                { name: "ColorF0Red", code: 403 },
                { name: "Exit", code: 10182 },
            ],
            registerKeyBatch: (names: string[]) => {
                batches.push(names)
            },
        },
    }
    assert.deepEqual(registerTizenKeys({ tizen }), ["MediaPlayPause", "ChannelUp", "ColorF0Red"])
    assert.deepEqual(batches, [["MediaPlayPause", "ChannelUp", "ColorF0Red"]])
    assert.ok(!TIZEN_REMOTE_KEYS.includes("Exit"))
})

test("without registerKeyBatch, keys are registered one at a time and a missing one is skipped", () => {
    const registered: string[] = []
    const tizen = {
        tvinputdevice: {
            registerKey: (name: string) => {
                if (name === "Info") throw new Error("InvalidValuesError")
                registered.push(name)
            },
        },
    }
    const result = registerTizenKeys({ tizen })
    assert.ok(!result.includes("Info"))
    assert.ok(result.includes("MediaPlayPause"))
    assert.deepEqual(result, registered)
})

test("no keys outside a Tizen TV", () => {
    assert.deepEqual(registerTizenKeys({}), [])
})

test("exit goes through tizen.application when there is one", () => {
    let exited = false
    const tizen = { application: { getCurrentApplication: () => ({ exit: () => { exited = true } }) } }
    assert.equal(exitTizenApp({ tizen }), true)
    assert.ok(exited)
    assert.equal(exitTizenApp({}), false)
})

test("Samsung plays no DTS and lists TrueHD tracks; LG differs", () => {
    assert.equal(tvAudioSupport("dts", 6, "tizen"), "broken")
    assert.equal(tvAudioSupport("dts", 6, "webos"), "risky")
    assert.equal(tvAudioSupport("truehd", 8, "tizen"), "broken")
    assert.equal(tvAudioSupport("flac", 6, "tizen"), "broken")
    assert.equal(tvAudioSupport("eac3", 6, "tizen"), "plays")
    assert.equal(unlistedOnWebOS("truehd", "tizen"), false)
    assert.equal(unlistedOnWebOS("truehd", "webos"), true)
})
