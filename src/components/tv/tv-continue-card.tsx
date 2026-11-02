import { serverStatusAtom } from "@/atoms/server.atoms"
import type { ContinueWatchingItem } from "@/hooks/use-anime-library-collection"
import { getContinueWatchingSpoilerActive, getEpisodeSpoilerState, getSpoilerSafeAnimeImage } from "@/lib/anime-spoilers"
import { atom, useAtomValue } from "jotai"
import * as React from "react"
import { TVEpisodeCard } from "./tv-episode-card"
import { Pressable } from "react-native"

/**
 * Continue watching hides spoilers for every card alike (the episode number
 * doesn't matter), so the cards read just these two flags and don't re-render
 * on every server status refetch.
 */
const continueSpoilerAtom = atom(get => {
    const status = get(serverStatusAtom)
    return getEpisodeSpoilerState(status, { spoilerActive: getContinueWatchingSpoilerActive(status) })
})
const hideThumbnailAtom = atom(get => get(continueSpoilerAtom).hideThumbnail)
const hideTitleAtom = atom(get => get(continueSpoilerAtom).hideTitle)

type Props = {
    item: ContinueWatchingItem
    onPress?: () => void
    /** Called with `item`; one handler for the whole row keeps React.memo working. */
    onPressItem?: (item: ContinueWatchingItem) => void
    preferred?: boolean
    progressPercent?: number
}

export const TVContinueCard = React.memo(
    React.forwardRef<React.ElementRef<typeof Pressable>, Props>(
        function TVContinueCard({
            item,
            onPress,
            onPressItem,
            preferred,
            progressPercent,
            ...props
        }, ref) {
            const hideThumbnail = useAtomValue(hideThumbnailAtom)
            const hideTitle = useAtomValue(hideTitleAtom)
            const episode = item.episode
            const media = episode.baseAnime
            const handlePress = onPress ?? (() => onPressItem?.(item))
            const title = media?.title?.userPreferred
                ?? media?.title?.english
                ?? media?.title?.romaji
                ?? "Untitled"
            const image = episode.episodeMetadata?.image
                ?? media?.bannerImage
                ?? media?.coverImage?.extraLarge
                ?? media?.coverImage?.large

            return (
                <TVEpisodeCard
                    ref={ref}
                    image={image}
                    duration={episode.episodeMetadata?.length}
                    badge={episode.displayTitle}
                    title={title}
                    subtitle={hideTitle
                        ? `Episode ${episode.episodeNumber}`
                        : episode.episodeTitle || `Episode ${episode.episodeNumber}`}
                    onPress={handlePress}
                    preferred={preferred}
                    progressPercent={progressPercent}
                    filler={episode.episodeMetadata?.isFiller}
                    blurred={hideThumbnail}
                    blurredImage={getSpoilerSafeAnimeImage(media)}
                    recyclingKey={`${media?.id ?? "episode"}-${episode.episodeNumber}`}
                    {...props}
                />
            )
        }
    )
)
