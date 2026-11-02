#!/usr/bin/env node
/**
 * Builds Seanime Tenji for Samsung Tizen TVs (2021 and later): `npm run build:tizen`
 *
 *   dist/tizen/app/                       the packaged web app (config.xml + files)
 *   dist/tizen/SeanimeTenji_<v>.wgt       unsigned package, for a tool that signs it (Apps2Samsung)
 *   dist/tizen/SeanimeTenji.wgt           signed package, when a Tizen signing profile is given
 *
 * Steps: build the web app (webos/web-app.mjs, the same files as the webOS
 * build), add config.xml and the icon, zip it as a WGT, and sign it with the
 * Tizen CLI when TIZEN_SECURITY_PROFILE names a profile from Tizen Studio's
 * certificate manager. No service: Tizen has no counterpart to the webOS
 * WebSocket relay, so a server that refuses the TV's origin needs a password.
 *
 * Flags: --skip-export  reuse dist/tizen/www from a previous run
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { buildWebApp, pngSize, root, walk } from "../webos/web-app.mjs"

const tizenDir = path.join(root, "tizen")
const outDir = path.join(root, "dist", "tizen")
const exportDir = path.join(outDir, "www")
const appDir = path.join(outDir, "app")
// Samsung's 2021 TVs (Tizen 6.0) ship Chromium 76, older than webOS 6's 79;
// config.xml's required_version keeps earlier TVs out.
const CHROME = 76
// Samsung shows any square icon; the app's own 512x512 one is sharp on a 4K launcher.
const ICON = path.join(root, "src", "assets", "images", "icon.png")

const args = new Set(process.argv.slice(2))

function log(message) {
    console.log(`\x1b[35m[tizen]\x1b[0m ${message}`)
}

///////////////////////////////////////////////////////////////////////////////
// WGT (a zip)
///////////////////////////////////////////////////////////////////////////////

/** DOS date and time fields of a zip entry. */
function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    return { time, day }
}

/** entries: [{ name: "config.xml", data: Buffer }]; deflated, no directory entries. */
function zip(entries) {
    const { time, day } = dosDateTime(new Date())
    const local = []
    const central = []
    let offset = 0
    for (const { name, data } of entries) {
        const nameBytes = Buffer.from(name, "utf8")
        const deflated = zlib.deflateRawSync(data, { level: 9 })
        // Stored when deflating doesn't help (wasm, fonts, images).
        const stored = deflated.length >= data.length
        const body = stored ? data : deflated
        const crc = zlib.crc32(data)

        const header = Buffer.alloc(30)
        header.writeUInt32LE(0x04034b50, 0)
        header.writeUInt16LE(20, 4)
        header.writeUInt16LE(0x0800, 6) // UTF-8 names
        header.writeUInt16LE(stored ? 0 : 8, 8)
        header.writeUInt16LE(time, 10)
        header.writeUInt16LE(day, 12)
        header.writeUInt32LE(crc, 14)
        header.writeUInt32LE(body.length, 18)
        header.writeUInt32LE(data.length, 22)
        header.writeUInt16LE(nameBytes.length, 26)
        local.push(header, nameBytes, body)

        const entry = Buffer.alloc(46)
        entry.writeUInt32LE(0x02014b50, 0)
        entry.writeUInt16LE(20, 4)
        entry.writeUInt16LE(20, 6)
        entry.writeUInt16LE(0x0800, 8)
        entry.writeUInt16LE(stored ? 0 : 8, 10)
        entry.writeUInt16LE(time, 12)
        entry.writeUInt16LE(day, 14)
        entry.writeUInt32LE(crc, 16)
        entry.writeUInt32LE(body.length, 20)
        entry.writeUInt32LE(data.length, 24)
        entry.writeUInt16LE(nameBytes.length, 28)
        entry.writeUInt32LE(offset, 42)
        central.push(entry, nameBytes)

        offset += header.length + nameBytes.length + body.length
    }

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...local, ...central, end])
}

function writeWgt(version) {
    const entries = walk(appDir).sort().map(file => ({
        name: path.relative(appDir, file).split(path.sep).join("/"),
        data: fs.readFileSync(file),
    }))
    const wgtPath = path.join(outDir, `SeanimeTenji_${version}.wgt`)
    fs.writeFileSync(wgtPath, zip(entries))
    return wgtPath
}

/** `tizen package` signs with a profile from Tizen Studio's certificate manager (author + Samsung distributor). */
function signWgt(profile) {
    log(`Signing with the Tizen CLI (profile "${profile}")…`)
    const result = spawnSync("tizen", ["package", "-t", "wgt", "-s", profile, "-o", outDir, "--", appDir], {
        cwd: root,
        stdio: "inherit",
        // tizen is tizen.bat on Windows, which Node only starts through a shell
        shell: process.platform === "win32",
    })
    if (result.status !== 0) {
        throw new Error(`tizen package failed${result.error ? `: ${result.error.message}` : ""}; is Tizen Studio's tools/ide/bin on PATH?`)
    }
    // The CLI signs the app directory in place and names the package after <name>.
    return fs.readdirSync(outDir).filter(name => name.endsWith(".wgt") && !name.startsWith("SeanimeTenji_"))
}

///////////////////////////////////////////////////////////////////////////////

async function main() {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    const version = pkg.version
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Tizen wants an x.y.z version, package.json has ${version}`)
    const iconSize = pngSize(ICON)
    if (!iconSize) throw new Error(`${path.relative(root, ICON)} is not a PNG`)

    await buildWebApp({ exportDir, appDir, skipExport: args.has("--skip-export"), chrome: CHROME, log })

    const config = fs.readFileSync(path.join(tizenDir, "config.xml"), "utf8").replace("{{VERSION}}", version)
    fs.writeFileSync(path.join(appDir, "config.xml"), config)
    fs.copyFileSync(ICON, path.join(appDir, "icon.png"))

    const wgtPath = writeWgt(version)
    log(`App directory: ${path.relative(root, appDir)}`)
    log(`Package:       ${path.relative(root, wgtPath)} (unsigned)`)

    const profile = process.env.TIZEN_SECURITY_PROFILE
    if (profile) {
        for (const name of signWgt(profile)) log(`Signed:        ${path.relative(root, path.join(outDir, name))}`)
    } else {
        log("Not signed: set TIZEN_SECURITY_PROFILE to sign with the Tizen CLI, or install the unsigned WGT with Apps2Samsung (see tizen/README.md).")
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
