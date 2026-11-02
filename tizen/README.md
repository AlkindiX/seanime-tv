# Seanime Tenji for Samsung Tizen

Samsung TVs run Tizen, which, like LG's webOS, runs packaged web apps. The Tizen build is
the same web app as the [webOS build](../webos/README.md) (the TV interface rendered with
React Native Web), packaged as a Tizen widget (`.wgt`) instead of an `.ipk`. Most of the
webOS documentation applies as written: focus, playback, subtitles, the start screen.

**Status: untested on a TV.** It has only been run in a desktop browser with a stand-in for
Samsung's runtime. See [Not yet verified on a TV](#not-yet-verified-on-a-tv).

## Requirements

- **A 2022 Samsung TV or newer** (Tizen 6.5, Chromium 85). `config.xml` asks for Tizen 6.5,
  so older TVs refuse to install it. The build targets Chromium 79 for webOS, so 2022+
  Samsung browsers have everything it uses, flexbox `gap` included.
- **Maybe a server password.** Try without one first. The app runs from `file://`, and a
  Seanime server without a password refuses requests whose origin it doesn't trust. What a
  Samsung TV sends as the origin isn't known for sure (reports say `file://` on some models
  and none on others; webOS sends `null`, which is always refused). webOS works around it with
  a small background service; Samsung has no equivalent for sideloaded apps.

  If the server turns the TV away, the app says so: the setup screen when connecting, or
  Settings > Live updates ("Refused by the server") and the stream screens once the live
  connection has failed. Then set a password in the server settings or in `config.toml`:

  ```toml
  [server]
  password = "your password"
  ```
- **The server reachable from the TV**, as for webOS: listening on `0.0.0.0` and allowed
  through the computer's firewall.

## Building

```bash
npm run build:tizen
```

This writes:

- `dist/tizen/app/`: the app (`config.xml`, `index.html`, the bundle, JASSUB, the icon)
- `dist/tizen/SeanimeTenji_<version>.wgt`: the same, zipped, **unsigned**

`--skip-export` (`node tizen/build.mjs --skip-export`) reuses `dist/tizen/www` from an
earlier run. Like the webOS build, `expo export` sometimes crashes on exit on Windows after
writing everything; run it again.

### Signing

Samsung TVs only install packages signed with a Samsung certificate made for that TV (its
DUID). Two ways:

- **Apps2Samsung** (https://github.com/Apps2Samsung/Apps2Samsung, formerly
  Jellyfin2Samsung) installs a custom `.wgt` and handles the certificate (it asks you to sign
  in to a Samsung account once). Point it at the unsigned `.wgt`.
- **Tizen Studio**: create a Samsung certificate profile in its Certificate Manager (TV
  extension), put `tools/ide/bin` on PATH, and build with the profile's name:

  ```bash
  TIZEN_SECURITY_PROFILE=<profile> npm run build:tizen
  ```

  `tizen package` signs `dist/tizen/app` and writes a signed `.wgt` in `dist/tizen/`.

## Installing

1. On the TV: Apps, then type `12345` on the remote, turn **Developer mode** on and enter
   the IP address of the computer you install from. Restart the TV.
2. With Apps2Samsung: pick the TV and the `.wgt`. With Tizen Studio's CLI:

   ```bash
   sdb connect <TV IP>
   tizen install -n dist/tizen/<signed>.wgt -t <TV name from sdb devices>
   ```

The app's settings (server URL, password) live in the app's localStorage. Reinstalling with
`tizen install` reportedly keeps them; uninstalling clears them.

## Remote control

Arrows, OK and Back work as on webOS (Back is keyCode 10009; Back on the first screen closes
the app through `tizen.application`). Samsung only sends the other keys to apps that register
them, so the app registers, at start, the ones the TV has: play/pause, play, pause, stop,
rewind, fast-forward, CH+/CH-, the colour keys, Info and the digits. Their effects are the same
as on webOS. Long-pressing Back (Exit) stays the TV's. Samsung asks store apps to confirm before
closing; this sideloaded app doesn't.

## Playback

Same player as webOS (HTML5 `<video>`, libass for ASS subtitles, the server's transcode for
library files the TV can't decode). The rules for what plays directly are LG's, which
Samsung's specs for 2022+ TVs match for video (H.264 8-bit, HEVC Main/Main10, VP9, AV1).
Audio differs: Samsung TVs play no DTS, so a DTS track counts as silent, and TrueHD stays in
the track list (webOS hides it). Messages name Samsung instead of LG.

## Not yet verified on a TV

- That the app installs and starts at all, and with which signing route.
- The Origin header Samsung sends for the WebSocket and for POST requests (`file://`, `null`
  or none), and so whether a server without a password accepts the TV at all.
- Key registration (`registerKeyBatch`) and the key codes on a real remote.
- Direct play of MKV/HEVC through `<video>`, DTS and FLAC behaviour, audio track switching.
- JASSUB (WebAssembly in a blob-URL worker) speed.
- Screen saver during playback: webOS keeps the screen on during video; Samsung may need
  `webapis.appcommon.setScreenSaver`, which the app doesn't call yet.
- The device row in Settings is empty (it reads LG's system info); Samsung's `webapis.productinfo`
  isn't used yet, so a Full HD Samsung TV isn't told apart from a 4K one.
