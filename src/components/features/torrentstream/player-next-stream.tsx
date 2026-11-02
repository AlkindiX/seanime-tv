import type { Anime_Entry } from "@/api/generated/types"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { activeStreamSessionAtom, directStreamLoadingMessageAtom, torrentStreamIsPreparingAtom, torrentStreamPendingInfoAtom } from "@/lib/player"
import { useAtomValue } from "jotai"
import * as React from "react"
import { Text } from "react-native"
import { type StreamMode, useTorrentStreamController } from "./use-torrent-stream-controller"

/** The next episode's stream, started from the player instead of the show page. */
export type NextStreamRequest = {
    kind: "auto-select" | "previous-batch"
    mode: StreamMode
    mediaId: number
    episodeNumber: number
}

type PlayerNextStreamProps = {
    request: NextStreamRequest
    /** It can't start here: it needs the torrent picker, or the episode isn't listed. */
    onNeedsEntry: () => void
    /** The start went nowhere, or stopped before a stream came. */
    onFailed: () => void
    /** Set to what stops the stream being started (Back on the loading screen). */
    cancelRef: React.RefObject<(() => void) | null>
}

/** Nothing in flight this long after the start (no live connection, say): it didn't start. */
const START_TIMEOUT_MS = 2000

/**
 * Starts the next torrent or debrid episode with the show page's own stream
 * logic (webOS release checks, previous batches, kept streams). The player
 * stays open on its loading screen; the stream's "ready" event then hands it
 * the new source.
 */
export function PlayerNextStream({ request, onNeedsEntry, onFailed, cancelRef }: PlayerNextStreamProps) {
    const { data: entry, isError } = useGetAnimeEntry(request.mediaId)

    React.useEffect(() => {
        if (isError) onNeedsEntry()
    }, [isError, onNeedsEntry])

    if (!entry) return null
    return <Starter entry={entry} request={request} onNeedsEntry={onNeedsEntry} onFailed={onFailed} cancelRef={cancelRef} />
}

function Starter({ entry, request, onNeedsEntry, onFailed, cancelRef }: PlayerNextStreamProps & { entry: Anime_Entry }) {
    const torrentStream = useTorrentStreamController({ entry })
    const pendingInfo = useAtomValue(torrentStreamPendingInfoAtom)
    const isPreparing = useAtomValue(torrentStreamIsPreparingAtom)
    const inFlight = !!pendingInfo || isPreparing
    const [started, setStarted] = React.useState(false)
    const wasInFlight = React.useRef(false)

    React.useEffect(() => {
        cancelRef.current = torrentStream.stopCurrentStream
        return () => {
            cancelRef.current = null
        }
    }, [cancelRef, torrentStream.stopCurrentStream])

    // Once the episode list is in, as the show page does for a playback intent.
    React.useEffect(() => {
        if (started || torrentStream.isLoadingEpisodeCollection) return
        setStarted(true)
        const episode = torrentStream.episodes.find(item => item.episodeNumber === request.episodeNumber)
        if (!episode?.aniDBEpisode) {
            onNeedsEntry()
            return
        }
        torrentStream.setStreamMode(request.mode)
        if (request.kind === "auto-select") torrentStream.startAutoSelectedStream(episode, request.mode)
        else torrentStream.startPreviousBatchStream(episode, request.mode)
    }, [onNeedsEntry, request, started, torrentStream])

    // A previous batch whose file isn't known asks for the picker, which lives on the show page.
    React.useEffect(() => {
        if (!torrentStream.pickerOpen) return
        torrentStream.setPickerOpen(false)
        onNeedsEntry()
    }, [onNeedsEntry, torrentStream])

    React.useEffect(() => {
        if (!started) return
        if (inFlight) {
            wasInFlight.current = true
            return
        }
        // Stopped before a stream came (the player unmounts this once one does).
        if (wasInFlight.current) {
            onFailed()
            return
        }
        const timer = setTimeout(onFailed, START_TIMEOUT_MS)
        return () => clearTimeout(timer)
    }, [inFlight, onFailed, started])

    return null
}

/** What the server says it is doing, under the loading screen's title. */
export function PlayerNextStreamProgress({ fontSize }: { fontSize: number }) {
    const session = useAtomValue(activeStreamSessionAtom)
    const directMessage = useAtomValue(directStreamLoadingMessageAtom)
    const message = directMessage ?? session?.message
    const detail = session?.torrentName && session.torrentName !== "-" ? session.torrentName : null

    return (
        <>
            {message ? (
                <Text className="text-white/60 mt-3 text-center" style={{ fontSize }} accessibilityLabel={message}>
                    {message}
                </Text>
            ) : null}
            {detail ? (
                <Text className="text-white/40 mt-1 text-center" style={{ fontSize: fontSize * 0.85 }} numberOfLines={1} accessibilityLabel={detail}>
                    {detail}
                </Text>
            ) : null}
        </>
    )
}
