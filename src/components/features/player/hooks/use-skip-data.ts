import type { PlayerChapter, PlayerStatus } from "@/lib/player"
import type { MobilePlaybackSource } from "@/lib/player/types"
import { toast } from "@/lib/utils/toast"
import React from "react"

interface SkipInterval {
    startTime: number
    endTime: number
}

interface SkipData {
    op: { interval: SkipInterval } | null
    ed: { interval: SkipInterval } | null
}

function getChapterType(name: string | null | undefined) {
    if (!name) return null
    const normalized = name.trim().toLowerCase()
    if (/opening$|^opening\s|^op$/i.test(normalized)) return "op"
    if (/ending$|^ending\s|^ed$|^credits/i.test(normalized)) return "ed"
    return null
}

function getChaptersSkipData(chapters: PlayerChapter[], duration: number): SkipData {
    let op: { interval: SkipInterval } | null = null
    let ed: { interval: SkipInterval } | null = null

    if (!chapters || chapters.length === 0 || duration <= 0) {
        return { op, ed }
    }

    const sorted = [...chapters].sort((a, b) => a.start - b.start)

    for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i]
        const type = getChapterType(c.title)
        if (!type) continue

        const start = c.start
        const nextStart = i < sorted.length - 1 ? sorted[i + 1].start : duration
        const end = Math.max(start, nextStart)

        if (type === "op" && !op) {
            op = { interval: { startTime: start, endTime: end } }
        } else if (type === "ed" && !ed) {
            ed = { interval: { startTime: start, endTime: end } }
        }
    }

    return { op, ed }
}

interface UseSkipDataProps {
    source: MobilePlaybackSource | null
    chapters: PlayerChapter[]
    duration: number
    currentTime: number
    status: PlayerStatus
    autoSkipOpEd: boolean
    playerSeekTo: (time: number) => void
}

export function useSkipData({
    source,
    chapters,
    duration,
    currentTime,
    status,
    autoSkipOpEd,
    playerSeekTo,
}: UseSkipDataProps) {
    const lastAutoSkippedRef = React.useRef<string | null>(null)

    React.useEffect(() => {
        lastAutoSkippedRef.current = null
    }, [source?.id])

    const chapterSkip = getChaptersSkipData(chapters, duration)
    const malId = source?.media?.idMal
    const epNum = source?.episodeNumber
    // AniSkip only fills in what the chapters don't have, and only once the
    // duration is known: chapters and duration settle over the first events
    // of a load, and asking again for each of them sent several requests.
    const aniskipKey = duration > 0 && malId && epNum && !(chapterSkip.op && chapterSkip.ed) ? `${malId}/${epNum}` : null
    const [aniskip, setAniskip] = React.useState<{ key: string; data: SkipData } | null>(null)
    const aniskipFetchedRef = React.useRef<string | null>(null)

    React.useEffect(() => {
        if (!aniskipKey || aniskipFetchedRef.current === aniskipKey) return

        let active = true
        fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${epNum}?types[]=ed&types[]=mixed-ed&types[]=mixed-op&types[]=op&types[]=recap&episodeLength=`)
            .then(res => res.json())
            .then(data => {
                if (!active) return
                const results = data && data.found && data.results ? data.results : []
                const aniOp = results.find((r: any) => r.skipType === "op" || r.skipType === "mixed-op")
                const aniEd = results.find((r: any) => r.skipType === "ed" || r.skipType === "mixed-ed")
                aniskipFetchedRef.current = aniskipKey
                setAniskip({
                    key: aniskipKey,
                    data: {
                        op: aniOp ? { interval: { startTime: aniOp.interval.startTime, endTime: aniOp.interval.endTime } } : null,
                        ed: aniEd ? { interval: { startTime: aniEd.interval.startTime, endTime: aniEd.interval.endTime } } : null,
                    },
                })
            })
            .catch(() => undefined)

        return () => {
            active = false
        }
    }, [aniskipKey, malId, epNum])

    const fetched = aniskip !== null && aniskip.key === `${malId}/${epNum}` ? aniskip.data : null
    const skipData: SkipData = {
        op: chapterSkip.op || fetched?.op || null,
        ed: chapterSkip.ed || fetched?.ed || null,
    }

    React.useEffect(() => {
        if (!autoSkipOpEd) return
        if (status !== "ready" && status !== "buffering") return

        if (skipData.op) {
            const { startTime, endTime } = skipData.op.interval
            if (currentTime >= startTime && currentTime < endTime - 1.5) {
                const skipId = `op-${source?.id}-${startTime}`
                if (lastAutoSkippedRef.current !== skipId) {
                    lastAutoSkippedRef.current = skipId
                    playerSeekTo(endTime)
                    toast.info("Skipped opening intro")
                }
            }
        }

        if (skipData.ed) {
            const { startTime, endTime } = skipData.ed.interval
            if (currentTime >= startTime && currentTime < endTime - 1.5) {
                const skipId = `ed-${source?.id}-${startTime}`
                if (lastAutoSkippedRef.current !== skipId) {
                    lastAutoSkippedRef.current = skipId
                    playerSeekTo(endTime)
                    toast.info("Skipped ending outro")
                }
            }
        }
    }, [currentTime, status, skipData, autoSkipOpEd, source?.id, playerSeekTo])

    const showSkipIntro = Boolean(
        skipData.op &&
        currentTime >= skipData.op.interval.startTime &&
        currentTime <= skipData.op.interval.startTime + 15 &&
        !autoSkipOpEd,
    )

    const showSkipOutro = Boolean(
        skipData.ed &&
        currentTime >= skipData.ed.interval.startTime &&
        currentTime <= skipData.ed.interval.startTime + 15 &&
        !autoSkipOpEd,
    )

    return {
        skipData,
        showSkipIntro,
        showSkipOutro,
    }
}
