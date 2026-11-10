import { playerErrorAtom, playerLoadingMessageAtom } from "@/lib/player"
import type { MobilePlaybackSource, PlayerState } from "@/lib/player"
import { logger } from "@/lib/utils/logger"
import type {
    MpvPlayerViewRef,
    MpvVideoSource,
    NowPlayingMetadata,
    OnErrorEventPayload,
    OnLoadEventPayload,
    OnPictureInPictureChangeEventPayload,
    OnPlaybackStateChangePayload,
    OnProgressEventPayload,
    SubtitleHorizontalAlignment,
    SubtitleVerticalAlignment,
} from "expo-mpv-player"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"
import { findFallbackTrack, findPreferredTrack, getPlayerPreferences, setPlayerPreferences } from "./player-preferences"
import { useActivePlaybackSource } from "./session"
import { useWebPlaybackPlan } from "./web-playback-plan"

const log = logger("use-mpv-player")

type NativeEvent<T> = { nativeEvent: T }

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function isMissingMpvViewError(error: unknown) {
    const message = getErrorMessage(error)
    return message.includes("MpvSurfaceExpoView")
        && (message.includes("Unable to find") || message.includes("cannot be cast"))
}

function getMediaTitle(source: MobilePlaybackSource): string | undefined {
    return source.media?.title?.userPreferred
        ?? source.media?.title?.english
        ?? source.media?.title?.romaji
        ?? source.media?.title?.native
}

function getEpisodeLabel(source: MobilePlaybackSource): string | undefined {
    const displayTitle = source.episode?.displayTitle?.trim()
    const episodeTitle = source.episode?.episodeTitle?.trim()

    if (displayTitle && episodeTitle) return `${displayTitle} - ${episodeTitle}`
    return displayTitle || episodeTitle || undefined
}

function getPlayerLogData(source: MobilePlaybackSource | null) {
    if (!source) return {}
    return {
        sourceId: source.id,
        streamKind: source.streamKind,
        mediaId: source.mediaId,
        episodeNumber: source.episodeNumber,
    }
}

/** Same length and the same fields in each item: a fresh list from the player that changed nothing. */
function sameItems<T extends object>(a: readonly T[], b: readonly T[]) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        const left = a[i] as Record<string, unknown>
        const right = b[i] as Record<string, unknown>
        const keys = Object.keys(left)
        if (keys.length !== Object.keys(right).length) return false
        for (const key of keys) {
            if (left[key] !== right[key]) return false
        }
    }
    return true
}

const INITIAL_STATE: PlayerState = {
    status: "idle",
    paused: true,
    currentTime: 0,
    duration: 0,
    cacheSeconds: 0,
    eofReached: false,
    chapters: [],
    audioTracks: [],
    subtitleTracks: [],
    activeAudioTrackId: null,
    activeSubtitleTrackId: null,
    speed: 1.0,
    subtitleDelay: 0,
    audioDelay: 0,
    isPiPActive: false,
}

/**
 * A React hook that bridges the native ExpoMpvPlayer view to the UI.
 *
 * It:
 * - Builds a `MpvVideoSource` from the `currentPlaybackSourceAtom`
 * - Provides event handlers to pass as props to `<MpvPlayerView>`
 * - Manages React state from native events (no polling)
 * - Provides imperative control callbacks via the view ref
 * - Handles auto track selection, preferences, and cleanup
 */
export function useMpvPlayer() {
    const source = useActivePlaybackSource()
    const playbackPlan = useWebPlaybackPlan(source)
    const loadingMessage = useAtomValue(playerLoadingMessageAtom)
    const error = useAtomValue(playerErrorAtom)
    const setPlayerError = useSetAtom(playerErrorAtom)

    const viewRef = React.useRef<MpvPlayerViewRef>(null)
    const [state, setState] = React.useState(INITIAL_STATE)
    const loadedSourceId = React.useRef<string | null>(null)
    const durationRef = React.useRef(0)
    const positionRef = React.useRef(0)
    const loadedUrlRef = React.useRef<{ sourceId: string; url: string } | null>(null)
    const bufferingStartedAtRef = React.useRef<number | null>(null)
    const readyLoggedRef = React.useRef(false)
    const eofLoggedRef = React.useRef(false)
    const tracksLogRef = React.useRef<string | null>(null)
    const statsTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    // track whether we've applied auto-track + auto-play for the current source
    const hasAppliedDefaultTracks = React.useRef(false)
    const hasAppliedPrefs = React.useRef(false)
    // external subtitles are added after the file loads, so the preferred track is checked again as they appear
    const checkedSubtitleTrackCount = React.useRef(0)
    const hasUserChosenSubtitle = React.useRef(false)
    // Audio tracks are checked again whenever their languages change (see the auto-select effect)
    const checkedAudioTracks = React.useRef("")
    const hasUserChosenAudio = React.useRef(false)

    // debounce isLoading -> "buffering" to avoid spinner flashing during seeks
    const bufferingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    // ---------------------------------------------------------------------------
    // Build the video source prop from the atom
    // ---------------------------------------------------------------------------
    const videoSource = React.useMemo<MpvVideoSource | undefined>(() => {
        // undefined while the web build is still asking the server about the file
        if (!source || !playbackPlan) return undefined

        const prefs = getPlayerPreferences()
        const externalSubtitles = playbackPlan.sourceSubtitles ?? source.externalSubtitles?.map(s => ({
            url: s.url,
            title: s.language || undefined,
        }))
        const extractedSubtitles = playbackPlan.externalSubtitles

        const videoSource: MpvVideoSource = {
            url: playbackPlan.url ?? source.url,
            headers: playbackPlan.headers ?? source.headers,
            externalSubtitles: extractedSubtitles.length > 0
                ? [...externalSubtitles ?? [], ...extractedSubtitles]
                : externalSubtitles,
            startPosition: playbackPlan.startPosition ?? source.resumePositionSec,
            autoplay: prefs.autoPlay,
        }
        // Web player only; native plans never set these.
        if (playbackPlan.preferMse) videoSource.preferMse = true
        if (playbackPlan.isHls) videoSource.isHls = true
        if (playbackPlan.maxVideoHeight) videoSource.maxVideoHeight = playbackPlan.maxVideoHeight
        if (playbackPlan.chapters?.length) videoSource.chapters = playbackPlan.chapters
        if (playbackPlan.mediaInfoSummary) videoSource.mediaInfoSummary = playbackPlan.mediaInfoSummary
        if (playbackPlan.streamedSubtitles) videoSource.streamedSubtitles = playbackPlan.streamedSubtitles
        if (playbackPlan.onMediaEvent) videoSource.onMediaEvent = playbackPlan.onMediaEvent
        if (playbackPlan.subtitleFonts?.length) videoSource.subtitleFonts = playbackPlan.subtitleFonts
        if (playbackPlan.audioTracks?.length) videoSource.audioTracks = playbackPlan.audioTracks
        if (playbackPlan.onAudioTrackFallback) videoSource.onAudioTrackFallback = playbackPlan.onAudioTrackFallback
        if (!prefs.assRendering) videoSource.assRendering = false
        return videoSource
    }, [playbackPlan, source])
    const shouldAutoplay = videoSource?.autoplay ?? true

    const nowPlayingMetadata = React.useMemo<NowPlayingMetadata | undefined>(() => {
        if (!source) return undefined

        const mediaTitle = getMediaTitle(source)
        const episodeLabel = getEpisodeLabel(source)
        const artworkUri = source.media?.coverImage?.extraLarge
            ?? source.media?.coverImage?.large
            ?? source.media?.coverImage?.medium
            ?? source.media?.bannerImage

        const title = episodeLabel ?? mediaTitle ?? `Episode ${source.episodeNumber}`
        const artist = episodeLabel ? mediaTitle : undefined

        if (!title && !artist && !artworkUri) return undefined

        return {
            title,
            artist,
            albumTitle: mediaTitle,
            artworkUri,
        }
    }, [source])

    // ---------------------------------------------------------------------------
    // Reset state when source changes
    // ---------------------------------------------------------------------------
    React.useLayoutEffect(() => {
        if (!source) return
        if (source.id === loadedSourceId.current) return

        loadedSourceId.current = source.id
        durationRef.current = 0
        positionRef.current = 0
        bufferingStartedAtRef.current = null
        readyLoggedRef.current = false
        eofLoggedRef.current = false
        tracksLogRef.current = null
        hasAppliedDefaultTracks.current = false
        hasAppliedPrefs.current = false
        checkedSubtitleTrackCount.current = 0
        hasUserChosenSubtitle.current = false
        checkedAudioTracks.current = ""
        hasUserChosenAudio.current = false
        if (bufferingTimerRef.current !== null) {
            clearTimeout(bufferingTimerRef.current)
            bufferingTimerRef.current = null
        }
        if (statsTimerRef.current !== null) {
            clearTimeout(statsTimerRef.current)
            statsTimerRef.current = null
        }
        log.info("Loading player source", {
            ...getPlayerLogData(source),
            autoplay: shouldAutoplay,
            resumePositionSec: source.resumePositionSec ?? 0,
            subtitleCount: source.externalSubtitles?.length ?? 0,
        })
        setState({ ...INITIAL_STATE, status: "loading", paused: !shouldAutoplay })
    }, [shouldAutoplay, source])

    // The web plan can swap the URL of the same source (direct play that the
    // TV could not decode -> the server's transcode): load it like a new one.
    React.useLayoutEffect(() => {
        if (!source || !videoSource) return
        const previous = loadedUrlRef.current
        loadedUrlRef.current = { sourceId: source.id, url: videoSource.url }
        if (!previous || previous.sourceId !== source.id || previous.url === videoSource.url) return

        log.info("Player source URL changed", getPlayerLogData(source))
        readyLoggedRef.current = false
        tracksLogRef.current = null
        hasAppliedDefaultTracks.current = false
        hasAppliedPrefs.current = false
        checkedAudioTracks.current = ""
        setState(s => ({ ...s, status: "loading", audioTracks: [], subtitleTracks: [], chapters: [] }))
    }, [source, videoSource])

    // cleanup buffering debounce timer on unmount
    React.useEffect(() => {
        return () => {
            if (bufferingTimerRef.current !== null) {
                clearTimeout(bufferingTimerRef.current)
            }
            if (statsTimerRef.current !== null) {
                clearTimeout(statsTimerRef.current)
            }
        }
    }, [])

    // ---------------------------------------------------------------------------
    // Native event handlers (passed as props to MpvPlayerView)
    // ---------------------------------------------------------------------------
    const onNativeLoad = React.useCallback((event: NativeEvent<OnLoadEventPayload>) => {
        if (event.nativeEvent.url !== videoSource?.url) {
            log.warning("Ignored native load event for a stale source")
            return
        }

        log.info("Native player accepted source", getPlayerLogData(source))

        setState(current => {
            const nextPaused = !shouldAutoplay
            if (current.paused === nextPaused) return current
            return { ...current, paused: nextPaused }
        })
    }, [shouldAutoplay, source, videoSource?.url])

    const onNativeProgress = React.useCallback((event: NativeEvent<OnProgressEventPayload>) => {
        const { position, duration, cacheSeconds } = event.nativeEvent
        durationRef.current = duration
        positionRef.current = position

        setState(s => {
            if (s.currentTime === position && s.duration === duration && s.cacheSeconds === cacheSeconds) return s
            return { ...s, currentTime: position, duration, cacheSeconds }
        })
    }, [])

    const onNativePlaybackStateChange = React.useCallback((event: NativeEvent<OnPlaybackStateChangePayload>) => {
        const payload = event.nativeEvent

        // Handle isLoading with debounce to avoid spinner flashing during seeks.
        if (payload.isLoading !== undefined) {
            if (payload.isLoading) {
                // delay showing buffering by 300ms
                if (bufferingTimerRef.current === null && bufferingStartedAtRef.current === null) {
                    bufferingTimerRef.current = setTimeout(() => {
                        bufferingTimerRef.current = null
                        bufferingStartedAtRef.current = Date.now()
                        log.info("Player buffering started", getPlayerLogData(source))
                        setState(s => s.status === "buffering" ? s : { ...s, status: "buffering" })
                    }, 300)
                }
            } else {
                // loading resolved, cancel pending timer and set ready immediately
                if (bufferingTimerRef.current !== null) {
                    clearTimeout(bufferingTimerRef.current)
                    bufferingTimerRef.current = null
                }
                if (bufferingStartedAtRef.current !== null) {
                    log.info("Player buffering ended", {
                        ...getPlayerLogData(source),
                        durationMs: Date.now() - bufferingStartedAtRef.current,
                    })
                    bufferingStartedAtRef.current = null
                }
                setState(s => {
                    if (s.status !== "buffering" && s.status !== "idle" && s.status !== "loading") return s
                    return { ...s, status: "ready" }
                })
            }
        }

        if (!readyLoggedRef.current && (payload.isReadyToSeek === true || payload.isLoading === false)) {
            readyLoggedRef.current = true
            log.success("Player ready", getPlayerLogData(source))

            const sourceId = source?.id ?? null
            statsTimerRef.current = setTimeout(() => {
                statsTimerRef.current = null
                if (loadedSourceId.current !== sourceId) return

                const ref = viewRef.current
                if (!ref) return

                void ref.getTechnicalInfo()
                    .then(info => log.info("Player diagnostics", {
                        ...getPlayerLogData(source),
                        ...info,
                    }))
                    .catch(error => log.warning("Could not read player diagnostics", error))
            }, 1500)
        }

        if (payload.eofReached === true && !eofLoggedRef.current) {
            eofLoggedRef.current = true
            log.info("Playback reached the end", getPlayerLogData(source))
        }

        setState(s => {
            const next = { ...s }

            if (payload.isPaused !== undefined) {
                next.paused = payload.isPaused
            }
            if (payload.isReadyToSeek !== undefined && payload.isReadyToSeek) {
                if (next.status === "idle" || next.status === "loading") {
                    next.status = "ready"
                }
            }
            if (payload.eofReached !== undefined) {
                next.eofReached = payload.eofReached
            }
            if (payload.isPiPActive !== undefined) {
                next.isPiPActive = payload.isPiPActive
            }
            if (payload.speed !== undefined) {
                next.speed = payload.speed
            }
            if (payload.subtitleDelay !== undefined) {
                next.subtitleDelay = payload.subtitleDelay
            }
            if (payload.audioDelay !== undefined) {
                next.audioDelay = payload.audioDelay
            }

            // Most events repeat what the state says already (the web player reports
            // on every media event); the same object skips re-rendering the player.
            const changed = next.paused !== s.paused
                || next.status !== s.status
                || next.eofReached !== s.eofReached
                || next.isPiPActive !== s.isPiPActive
                || next.speed !== s.speed
                || next.subtitleDelay !== s.subtitleDelay
                || next.audioDelay !== s.audioDelay
            return changed ? next : s
        })
    }, [source])

    const onPlaybackError = playbackPlan?.onPlaybackError
    const onNativeError = React.useCallback((event: NativeEvent<OnErrorEventPayload>) => {
        log.error("Native player error", getPlayerLogData(source), event.nativeEvent.error)

        // Web only: the plan may retry through the server's transcode, or explain the error.
        const handled = onPlaybackError?.({
            message: event.nativeEvent.error,
            code: event.nativeEvent.code,
            position: positionRef.current,
        })
        if (handled === true) {
            setState(s => ({ ...s, status: "loading" }))
            return
        }
        if (typeof handled === "string") setPlayerError(handled)
        setState(s => ({ ...s, status: "error" }))
    }, [onPlaybackError, setPlayerError, source])

    const onNativePictureInPictureChange = React.useCallback((event: NativeEvent<OnPictureInPictureChangeEventPayload>) => {
        const { isActive } = event.nativeEvent
        setState(s => s.isPiPActive === isActive ? s : { ...s, isPiPActive: isActive })
    }, [])

    const onNativeTracksReady = React.useCallback(async () => {
        const ref = viewRef.current
        if (!ref) return

        try {
            const [subTracks, audioTracks, rawChapters] = await Promise.all([
                ref.getSubtitleTracks(),
                ref.getAudioTracks(),
                ref.getChapters ? ref.getChapters() : Promise.resolve([]),
            ])

            const mappedSubs = subTracks.map(t => ({
                id: t.id,
                type: "subtitle" as const,
                title: t.title,
                language: t.lang,
                codec: t.codec,
                selected: t.selected,
            }))
            const mappedAudio = audioTracks.map(t => ({
                id: t.id,
                type: "audio" as const,
                title: t.title,
                language: t.lang,
                codec: t.codec,
                selected: t.selected,
                unplayable: t.unplayable,
            }))
            const mappedChapters = (rawChapters || []).map(c => ({
                id: c.id,
                start: c.time,
                title: c.title,
            }))

            const tracksSignature = `${mappedAudio.length}:${mappedSubs.length}:${mappedChapters.length}`
            if (tracksLogRef.current !== tracksSignature) {
                tracksLogRef.current = tracksSignature
                log.info("Player tracks loaded", {
                    ...getPlayerLogData(source),
                    audioTracks: mappedAudio.length,
                    subtitleTracks: mappedSubs.length,
                    chapters: mappedChapters.length,
                })
            }

            setState(s => {
                const prefs = getPlayerPreferences()
                const showSubtitles = prefs.showSubtitles
                const activeSubId = showSubtitles ? (mappedSubs.find(t => t.selected)?.id ?? null) : null
                const updatedSubs = mappedSubs.map(t => ({
                    ...t,
                    selected: showSubtitles ? t.selected : false,
                }))

                // This runs on every track event (several at startup on the web); lists
                // that didn't change keep their identity, so what depends on them
                // (track auto-selection, skip times from chapters) doesn't run again.
                const subtitleTracks = sameItems(s.subtitleTracks, updatedSubs) ? s.subtitleTracks : updatedSubs
                const audioTracks = sameItems(s.audioTracks, mappedAudio) ? s.audioTracks : mappedAudio
                const chapters = sameItems(s.chapters, mappedChapters) ? s.chapters : mappedChapters
                const activeAudioTrackId = mappedAudio.find(t => t.selected)?.id ?? null
                if (subtitleTracks === s.subtitleTracks && audioTracks === s.audioTracks && chapters === s.chapters
                    && activeSubId === s.activeSubtitleTrackId && activeAudioTrackId === s.activeAudioTrackId) {
                    return s
                }

                return {
                    ...s,
                    subtitleTracks,
                    audioTracks,
                    chapters,
                    activeSubtitleTrackId: activeSubId,
                    activeAudioTrackId,
                }
            })
        }
        catch (e) {
            if (!isMissingMpvViewError(e)) {
                log.warning("Failed to fetch tracks", e)
            }
        }
    }, [source])

    const handleNativeCommandError = React.useCallback((command: string, error: unknown) => {
        if (isMissingMpvViewError(error)) return
        log.warning(`Native command failed: ${command}`, error)
    }, [])

    const runNativeCommand = React.useCallback((
        command: string,
        invoke: (ref: MpvPlayerViewRef) => Promise<void>,
    ) => {
        const ref = viewRef.current
        if (!ref) return

        void invoke(ref).catch(error => handleNativeCommandError(command, error))
    }, [handleNativeCommandError])

    // ---------------------------------------------------------------------------
    // Auto-apply preferences after load
    // ---------------------------------------------------------------------------
    React.useEffect(() => {
        if (hasAppliedPrefs.current) return
        if (state.status !== "ready" && state.status !== "buffering") return
        if (!viewRef.current) return

        hasAppliedPrefs.current = true
        const prefs = getPlayerPreferences()
        runNativeCommand("setSpeed", ref => ref.setSpeed(prefs.speed))
        runNativeCommand("setSubtitleDelay", ref => ref.setSubtitleDelay(prefs.subtitleDelay))
        runNativeCommand("setAudioDelay", ref => ref.setAudioDelay(prefs.audioDelay))
        runNativeCommand("setSubtitleFontSize", ref => ref.setSubtitleFontSize(prefs.subtitleFontSize))
        runNativeCommand("setSubtitleVisibility", ref => ref.setSubtitleVisibility(prefs.showSubtitles))
        if (!prefs.showSubtitles) {
            runNativeCommand("disableSubtitles", ref => ref.disableSubtitles())
        }
        runNativeCommand("setSubtitlePosition", ref => ref.setSubtitlePosition(100))
    }, [runNativeCommand, state.status])

    // ---------------------------------------------------------------------------
    // Auto-select preferred audio/subtitle tracks once tracks appear
    // ---------------------------------------------------------------------------
    React.useEffect(() => {
        if (state.audioTracks.length === 0 && state.subtitleTracks.length === 0) return
        if (!viewRef.current) return

        const prefs = getPlayerPreferences()

        if (!hasAppliedDefaultTracks.current) {
            hasAppliedDefaultTracks.current = true
            if (!prefs.showSubtitles) {
                runNativeCommand("disableSubtitles", ref => ref.disableSubtitles())
            }
        }

        // Checked again whenever the audio tracks change, until one is picked by hand:
        // the web player can report subtitles before the file's audio tracks, or a
        // track before its language, and checking only the first time left the
        // file's default track playing (often English) on webOS.
        const audioKey = state.audioTracks.map(track => `${track.id}:${track.language ?? ""}:${track.title ?? ""}`).join("|")
        if (!hasUserChosenAudio.current && audioKey !== checkedAudioTracks.current) {
            checkedAudioTracks.current = audioKey
            // Not a track the TV plays no sound for (the web player has left it already).
            const preferredAudio = findPreferredTrack(state.audioTracks.filter(track => !track.unplayable), prefs.preferredAudioLanguages)
            if (preferredAudio !== null) {
                const currentAudio = state.audioTracks.find(t => t.selected)
                if (currentAudio?.id !== preferredAudio) {
                    log.info(`Auto-selecting preferred audio track: ${preferredAudio}`)
                    runNativeCommand("setAudioTrack", nativeRef => nativeRef.setAudioTrack(preferredAudio))
                }
            }
        }

        if (!prefs.showSubtitles || hasUserChosenSubtitle.current) return
        if (state.subtitleTracks.length <= checkedSubtitleTrackCount.current) return
        checkedSubtitleTrackCount.current = state.subtitleTracks.length

        const currentSub = state.subtitleTracks.find(t => t.selected)
        // mpv selects the file's default track by itself; the web player selects none.
        // So when no track is in a preferred language, show the first one that isn't signs & songs.
        const preferredSub = findPreferredTrack(state.subtitleTracks, prefs.preferredSubtitleLanguages, prefs.ignoredSubtitleLabels)
            ?? (currentSub ? null : findFallbackTrack(state.subtitleTracks, prefs.ignoredSubtitleLabels))
        if (preferredSub === null) return

        if (currentSub?.id !== preferredSub) {
            log.info(`Auto-selecting preferred subtitle track: ${preferredSub}`)
            runNativeCommand("setSubtitleTrack", nativeRef => nativeRef.setSubtitleTrack(preferredSub))
        }
    }, [runNativeCommand, state.audioTracks, state.subtitleTracks])

    // ---------------------------------------------------------------------------
    // Control callbacks
    // ---------------------------------------------------------------------------
    const play = React.useCallback(() => {
        runNativeCommand("play", ref => ref.play())
    }, [runNativeCommand])

    const pause = React.useCallback(() => {
        runNativeCommand("pause", ref => ref.pause())
    }, [runNativeCommand])

    const togglePlayPause = React.useCallback(() => {
        if (state.paused) {
            runNativeCommand("play", ref => ref.play())
        } else {
            runNativeCommand("pause", ref => ref.pause())
        }
    }, [runNativeCommand, state.paused])

    const seekTo = React.useCallback((sec: number) => {
        const maxDuration = durationRef.current > 0 ? durationRef.current : Number.POSITIVE_INFINITY
        const target = Math.max(0, Math.min(sec, maxDuration))
        runNativeCommand("seekTo", ref => ref.seekTo(target))
    }, [runNativeCommand])

    const seekRelative = React.useCallback((deltaSec: number) => {
        runNativeCommand("seekBy", ref => ref.seekBy(deltaSec))
    }, [runNativeCommand])

    const setVideoZoom = React.useCallback((scale: number) => {
        runNativeCommand("setVideoZoom", ref => ref.setVideoZoom(scale))
    }, [runNativeCommand])

    const setZoomedToFill = React.useCallback((zoomed: boolean) => {
        runNativeCommand("setZoomedToFill", ref => ref.setZoomedToFill(zoomed))
    }, [runNativeCommand])

    const setAudioTrack = React.useCallback((trackId: number) => {
        hasUserChosenAudio.current = true
        runNativeCommand("setAudioTrack", ref => ref.setAudioTrack(trackId))
        setState(s => ({
            ...s,
            activeAudioTrackId: trackId,
            audioTracks: s.audioTracks.map(t => ({ ...t, selected: t.id === trackId })),
        }))
    }, [runNativeCommand])

    const setSubtitleTrack = React.useCallback((trackId: number) => {
        const visible = trackId >= 0
        hasUserChosenSubtitle.current = true
        if (trackId < 0) {
            runNativeCommand("disableSubtitles", ref => ref.disableSubtitles())
        } else {
            runNativeCommand("setSubtitleTrack", ref => ref.setSubtitleTrack(trackId))
        }
        runNativeCommand("setSubtitleVisibility", ref => ref.setSubtitleVisibility(visible))
        setPlayerPreferences({ showSubtitles: visible })

        setState(s => ({
            ...s,
            activeSubtitleTrackId: visible ? trackId : null,
            subtitleTracks: s.subtitleTracks.map(t => ({
                ...t,
                selected: visible ? t.id === trackId : false,
            })),
        }))
    }, [runNativeCommand])

    const setAssRendering = React.useCallback((enabled: boolean) => {
        setPlayerPreferences({ assRendering: enabled })
        runNativeCommand("setAssRendering", ref => ref.setAssRendering?.(enabled) ?? Promise.resolve())
    }, [runNativeCommand])

    const stop = React.useCallback(() => {
        const ref = viewRef.current
        if (ref) {
            void ref.stopPictureInPicture().catch(() => undefined)
            void ref.pause().catch(() => undefined)
        }

        durationRef.current = 0
        hasAppliedDefaultTracks.current = false
        hasAppliedPrefs.current = false
        checkedSubtitleTrackCount.current = 0
        hasUserChosenSubtitle.current = false
        checkedAudioTracks.current = ""
        hasUserChosenAudio.current = false
        if (bufferingTimerRef.current !== null) {
            clearTimeout(bufferingTimerRef.current)
            bufferingTimerRef.current = null
        }
        setState(INITIAL_STATE)
        loadedSourceId.current = null
    }, [])

    const setSpeed = React.useCallback((speed: number) => {
        runNativeCommand("setSpeed", ref => ref.setSpeed(speed))
    }, [runNativeCommand])

    const setSubtitleDelay = React.useCallback((delaySec: number) => {
        runNativeCommand("setSubtitleDelay", ref => ref.setSubtitleDelay(delaySec))
    }, [runNativeCommand])

    const setAudioDelay = React.useCallback((delaySec: number) => {
        runNativeCommand("setAudioDelay", ref => ref.setAudioDelay(delaySec))
    }, [runNativeCommand])

    const setSubtitleFontSize = React.useCallback((size: number) => {
        runNativeCommand("setSubtitleFontSize", ref => ref.setSubtitleFontSize(size))
    }, [runNativeCommand])

    const setSubtitleVisibility = React.useCallback((visible: boolean) => {
        runNativeCommand("setSubtitleVisibility", ref => ref.setSubtitleVisibility(visible))
    }, [runNativeCommand])

    const setSubtitlePosition = React.useCallback((positionPercent: number) => {
        runNativeCommand("setSubtitlePosition", ref => ref.setSubtitlePosition(positionPercent))
    }, [runNativeCommand])

    const setSubtitleScale = React.useCallback((scale: number) => {
        runNativeCommand("setSubtitleScale", ref => ref.setSubtitleScale(scale))
    }, [runNativeCommand])

    const setSubtitleMarginY = React.useCallback((margin: number) => {
        runNativeCommand("setSubtitleMarginY", ref => ref.setSubtitleMarginY(margin))
    }, [runNativeCommand])

    const setSubtitleAlignX = React.useCallback((alignment: SubtitleHorizontalAlignment) => {
        runNativeCommand("setSubtitleAlignX", ref => ref.setSubtitleAlignX(alignment))
    }, [runNativeCommand])

    const setSubtitleAlignY = React.useCallback((alignment: SubtitleVerticalAlignment) => {
        runNativeCommand("setSubtitleAlignY", ref => ref.setSubtitleAlignY(alignment))
    }, [runNativeCommand])

    const startPiP = React.useCallback(() => {
        const ref = viewRef.current
        if (!ref) return

        setState(s => s.isPiPActive ? s : { ...s, isPiPActive: true })
        void ref.startPictureInPicture().catch(error => {
            handleNativeCommandError("startPictureInPicture", error)
            setState(s => s.isPiPActive ? { ...s, isPiPActive: false } : s)
        })
    }, [handleNativeCommandError])

    const stopPiP = React.useCallback(() => {
        runNativeCommand("stopPictureInPicture", ref => ref.stopPictureInPicture())
    }, [runNativeCommand])

    const addSubtitleFile = React.useCallback(async (url: string, select: boolean) => {
        const ref = viewRef.current
        if (!ref) return

        hasUserChosenSubtitle.current = true
        try {
            await ref.addSubtitleFile(url, select)
            // re-fetch tracks so the UI reflects the newly added subtitle
            await onNativeTracksReady()
        }
        catch (error) {
            handleNativeCommandError("addSubtitleFile", error)
        }
    }, [handleNativeCommandError, onNativeTracksReady])

    return {
        // view integration
        viewRef,
        videoSource,
        nowPlayingMetadata,
        onNativeLoad,
        onNativeProgress,
        onNativePlaybackStateChange,
        onNativeError,
        onNativeTracksReady,
        onNativePictureInPictureChange,

        // existing interface
        source,
        state,
        loadingMessage,
        error,

        play,
        pause,
        togglePlayPause,
        seekTo,
        setVideoZoom,
        setZoomedToFill,
        seekRelative,
        setAudioTrack,
        setSubtitleTrack,
        setAssRendering,
        stop,
        setSpeed,
        setSubtitleDelay,
        setAudioDelay,
        setSubtitleFontSize,
        setSubtitleVisibility,
        setSubtitlePosition,
        setSubtitleScale,
        setSubtitleMarginY,
        setSubtitleAlignX,
        setSubtitleAlignY,
        startPiP,
        stopPiP,
        addSubtitleFile,
    }
}
