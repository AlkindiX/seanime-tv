/**
 * The packaged web app both TV builds share (webos/build.mjs for LG webOS,
 * tizen/build.mjs for Samsung Tizen): export the TV interface for web with
 * Expo, make every URL relative (the TVs load the app from file://), lower JS
 * and CSS for older TV browsers, and add polyfills and libass (JASSUB, for
 * ASS subtitles). What each TV needs around it (appinfo.json and an IPK,
 * config.xml and a WGT) stays in its own build script.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildJassub } from "./jassub.mjs"

const require = createRequire(import.meta.url)
const esbuild = require("esbuild")
const { transform: transformCss } = require("lightningcss")
const coreJsCompat = require("core-js-compat")

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// The oldest browser the app is lowered for, unless a build asks for another:
// webOS 6 (2021 LG TVs) ships Chromium 79. Later releases only move forward.
export const CHROME = 79

export function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : [full]
    })
}

/** Width and height from a PNG's IHDR chunk, or null when the file isn't a PNG. */
export function pngSize(file) {
    const header = Buffer.alloc(24)
    const fd = fs.openSync(file, "r")
    try {
        fs.readSync(fd, header, 0, 24, 0)
    } finally {
        fs.closeSync(fd)
    }
    const signature = "89504e470d0a1a0a"
    if (header.subarray(0, 8).toString("hex") !== signature || header.toString("ascii", 12, 16) !== "IHDR") return null
    return [header.readUInt32BE(16), header.readUInt32BE(20)]
}

///////////////////////////////////////////////////////////////////////////////
// Export
///////////////////////////////////////////////////////////////////////////////

function exportWeb(exportDir, log) {
    log("Exporting the TV interface for web…")
    fs.rmSync(exportDir, { recursive: true, force: true })
    const result = spawnSync("npx", ["expo", "export", "--platform", "web", "--output-dir", exportDir, "--clear"], {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, EXPO_TV: "1", SEANIME_WEBOS: "1", NODE_ENV: "production" },
        // npx is npx.cmd on Windows, which Node only starts through a shell
        shell: process.platform === "win32",
    })
    if (result.status !== 0) {
        throw new Error(`expo export failed${result.error ? `: ${result.error.message}` : ""}`)
    }
}

///////////////////////////////////////////////////////////////////////////////
// Rewrites
///////////////////////////////////////////////////////////////////////////////

/** Root-relative URLs would resolve to file:///_expo/… on the TV. */
function rewriteIndexHtml(file) {
    let html = fs.readFileSync(file, "utf8")
    html = html.replace(/(src|href)="\/(?!\/)/g, "$1=\"./")
    // Polyfills must run before the (deferred) app bundle.
    html = html.replace("</title>", "</title>\n    <script src=\"./polyfills.js\"></script>")
    html = html.replace(/\s*<noscript>[\s\S]*?<\/noscript>/, "")
    fs.writeFileSync(file, html)
}

async function lowerJs(file, chrome) {
    const source = fs.readFileSync(file, "utf8").replaceAll("\"/assets/", "\"./assets/")
    const result = await esbuild.transform(source, {
        loader: "js",
        target: `chrome${chrome}`,
        // Metro's output is already minified; identifiers stay as they are.
        minifyWhitespace: true,
        minifySyntax: true,
        legalComments: "none",
        charset: "utf8",
    })
    fs.writeFileSync(file, result.code)
}

/** Index of the brace closing the one at `open`, skipping strings. */
function matchingBrace(css, open) {
    let depth = 0
    let quote = null
    for (let i = open; i < css.length; i++) {
        const char = css[i]
        if (quote) {
            if (char === "\\") i++
            else if (char === quote) quote = null
        } else if (char === "\"" || char === "'") {
            quote = char
        } else if (char === "{") {
            depth++
        } else if (char === "}" && --depth === 0) {
            return i
        }
    }
    throw new Error("Unbalanced braces in CSS")
}

/** Replaces `@layer x { … }` with its rules (layers are declared in source order) and drops `@layer x, y;`. */
function flattenLayers(css) {
    let out = ""
    let index = 0
    const pattern = /@layer\b[^;{]*([;{])/g
    for (let match = pattern.exec(css); match; match = pattern.exec(css)) {
        out += css.slice(index, match.index)
        if (match[1] === ";") {
            index = pattern.lastIndex
            continue
        }
        const open = pattern.lastIndex - 1
        const close = matchingBrace(css, open)
        out += flattenLayers(css.slice(open + 1, close))
        index = close + 1
        pattern.lastIndex = index
    }
    return out + css.slice(index)
}

/** Physical sides of the logical shorthands, for the app's left-to-right layout. */
const LOGICAL_SIDES = { inline: ["left", "right"], block: ["top", "bottom"] }
const LOGICAL_SHORTHAND = /([{;])(padding|margin|inset|border)-(inline|block)(-(?:style|width|color))?:([^;}]+)/g

/**
 * `padding-inline`, `margin-block`, `inset-inline`, `border-inline-style`…
 * as physical properties. They need Chromium 87, and lightningcss only lowers
 * values it can parse, so Tailwind's `calc(var(--spacing) * N)` is left as is.
 */
function lowerLogicalShorthands(css, splitTopLevel) {
    return css.replace(LOGICAL_SHORTHAND, (whole, lead, property, axis, part = "", rawValue) => {
        const important = /\s*!important\s*$/i.exec(rawValue)
        const value = important ? rawValue.slice(0, important.index) : rawValue
        const suffix = important ? "!important" : ""
        // `border-inline: 1px solid` sets both sides alike; the others take "start end".
        const parts = property === "border" && !part ? [value.trim()] : splitTopLevel(value)
        if (parts.length < 1 || parts.length > 2) return whole
        const [start, end = parts[0]] = parts
        const [first, second] = LOGICAL_SIDES[axis]
        const name = side => property === "inset" ? side : `${property}-${side}${part}`
        return `${lead}${name(first)}:${start}${suffix};${name(second)}:${end}${suffix}`
    })
}

/**
 * Tailwind v4 puts every rule in cascade layers and uses `@property` and the
 * individual `translate`/`scale`/`rotate` properties, none of which exist
 * before Chromium 99/85/104. Layers are flattened (in their declared order,
 * which is source order), `@property` initial values become plain custom
 * property defaults, the transform properties become `transform`, and the
 * logical shorthands (Chromium 87) become physical properties.
 */
function lowerCss(file, chrome) {
    const source = fs.readFileSync(file, "utf8")

    const defaults = []
    for (const match of source.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)) {
        const initial = /initial-value\s*:\s*([^;}]+)/.exec(match[2])
        if (initial) defaults.push(`${match[1]}:${initial[1].trim()}`)
    }

    const { code } = transformCss({
        filename: path.basename(file),
        code: Buffer.from(flattenLayers(source)),
        minify: true,
        targets: { chrome: chrome << 16 },
    })

    const splitTopLevel = (value) => {
        const parts = []
        let depth = 0
        let current = ""
        for (const char of value.trim()) {
            if (char === "(") depth++
            if (char === ")") depth--
            if (char === " " && depth === 0) {
                if (current) parts.push(current)
                current = ""
            } else {
                current += char
            }
        }
        if (current) parts.push(current)
        return parts
    }

    let css = code.toString().replace(/([{;])(translate|scale|rotate):([^;}]+)/g, (whole, lead, property, value) => {
        if (value.trim() === "none") return `${lead}transform:none`
        const parts = splitTopLevel(value)
        if (property === "rotate" && parts.length !== 1) return whole
        return `${lead}transform:${property}(${parts.slice(0, 2).join(",")})`
    })
    css = lowerLogicalShorthands(css, splitTopLevel)
    const left = css.match(LOGICAL_SHORTHAND)
    if (left) throw new Error(`Logical shorthands Chromium ${chrome} drops are still in ${path.basename(file)}: ${left.slice(0, 5).join(" ")}`)

    if (defaults.length > 0) {
        css = `*,:before,:after{${defaults.join(";")}}${css}`
    }
    fs.writeFileSync(file, css)
}

/**
 * Polyfills that replace a builtin every TV already has, only to add an edge
 * case or a newer proposal the app never uses. Each turns a native fast path
 * into JavaScript: `JSON.stringify` (for `JSON.rawJSON`, missing before
 * Chromium 114) became a replacer called per value on every query cache
 * write and WebSocket send, `push` a JS function, and the Error constructors
 * wrappers. A redefined `RegExp.prototype.flags` also takes V8's regexps off
 * their fast path.
 */
const SKIPPED_POLYFILLS = /^(es\.json\.|es\.array\.push$|es\.error\.cause$|es\.aggregate-error\.cause$|web\.dom-exception\.stack$|es\.regexp\.flags$)/

async function buildPolyfills(file, chrome, log) {
    const { list: all } = coreJsCompat({
        targets: { chrome: String(chrome) },
        modules: ["core-js/stable"],
        version: require("core-js/package.json").version,
    })
    const list = all.filter(name => !SKIPPED_POLYFILLS.test(name))
    log(`Bundling ${list.length} core-js polyfills for Chromium ${chrome}…`)
    await esbuild.build({
        stdin: {
            contents: list.map(name => `import "core-js/modules/${name}.js"`).join("\n"),
            resolveDir: root,
        },
        bundle: true,
        minify: true,
        format: "iife",
        target: `chrome${chrome}`,
        legalComments: "none",
        outfile: file,
    })
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Exports (unless `skipExport`) into `exportDir`, then fills `appDir` with the
 * web app ready for a TV: relative URLs, JS and CSS lowered for Chromium
 * `chrome`, polyfills, JASSUB.
 */
export async function buildWebApp({ exportDir, appDir, skipExport = false, chrome = CHROME, log }) {
    if (!skipExport) exportWeb(exportDir, log)
    if (!fs.existsSync(path.join(exportDir, "index.html"))) {
        throw new Error(`No web export at ${exportDir}; run without --skip-export`)
    }

    log("Preparing the app directory…")
    fs.rmSync(appDir, { recursive: true, force: true })
    fs.cpSync(exportDir, appDir, { recursive: true })
    fs.rmSync(path.join(appDir, "metadata.json"), { force: true })

    rewriteIndexHtml(path.join(appDir, "index.html"))
    for (const file of walk(appDir)) {
        if (file.endsWith(".js")) await lowerJs(file, chrome)
        else if (file.endsWith(".css")) lowerCss(file, chrome)
    }
    await buildPolyfills(path.join(appDir, "polyfills.js"), chrome, log)
    log("Bundling libass (JASSUB) for ASS subtitles…")
    await buildJassub(path.join(appDir, "jassub"), `chrome${chrome}`)
}
