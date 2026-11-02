import type {
    AL_BaseAnime,
    Anime_EntryLibraryData,
    Anime_EntryListData,
    Anime_NakamaEntryLibraryData,
} from "@/api/generated/types"
import { useAnimeLibraryEntryDataValue, useMediaEntryListDataValue } from "@/atoms/anilist-collection.atoms"
import { useMediaCardSettings } from "@/atoms/server.atoms"
import { TVFocusScaleView, usePreferredFocus, useTVFocus } from "@/components/tv/tv-focus"
import { TVLazyImage } from "@/components/tv/tv-lazy-image"
import { TVScoreBadge } from "@/components/tv/tv-score-badge"
import { TV, tvSize } from "@/components/tv/tv-scale"
import { Ionicons } from "@/lib/icons/Ionicons"
import { animeCardStats, mediaTitle } from "@/lib/media-metadata"
import * as React from "react"
import { Platform, Pressable, Text, View } from "react-native"

/**
 * webOS draws the UI at 1920x1080 CSS pixels, and AniList's `large` cover
 * (230 px wide) covers a card up to about this wide, focus scale included.
 * `extraLarge` is about four times the pixels to decode and keep in the TV's
 * memory for every mounted card.
 */
const LARGE_COVER_MAX_CARD_WIDTH = 250

/**
 * webOS: expo-image's `blurRadius` becomes a CSS `filter: blur()`, which the
 * TV redraws whenever the card scales or scrolls. A blurred adult cover is a
 * plain placeholder there instead.
 */
const CSS_BLUR = Platform.OS === "web"

type TVMediaCardProps = {
    media: AL_BaseAnime
    width: number
    onPress?: () => void
    /**
     * Called with this card's media. Lists pass one handler for every card
     * instead of a new closure per card, so React.memo skips cards whose data
     * didn't change.
     */
    onPressMedia?: (media: AL_BaseAnime) => void
    preferred?: boolean
    badge?: string
    listData?: Anime_EntryListData
    libraryData?: Anime_EntryLibraryData
    nakamaLibraryData?: Anime_NakamaEntryLibraryData
    showAudienceScore?: boolean
    hideProgress?: boolean
    hideLibraryBadge?: boolean
}

export const TVMediaCard = React.memo(function TVMediaCard({
    media,
    width,
    onPress,
    onPressMedia,
    preferred,
    badge,
    listData: listProp,
    libraryData: libraryProp,
    nakamaLibraryData: nakamaProp,
    showAudienceScore,
    hideProgress,
    hideLibraryBadge,
}: TVMediaCardProps) {
    const focusState = useTVFocus(1.055, mediaTitle(media))
    const cardSettings = useMediaCardSettings()
    const syncedList = useMediaEntryListDataValue("anime", media.id) as Anime_EntryListData | undefined
    const syncedLibrary = useAnimeLibraryEntryDataValue(media.id)
    const list = syncedList ?? listProp
    const library = syncedLibrary?.libraryData ?? libraryProp
    const nakama = syncedLibrary?.nakamaLibraryData ?? nakamaProp
    const title = mediaTitle(media)
    const preferLarge = Platform.OS === "web" && width <= LARGE_COVER_MAX_CARD_WIDTH
    const image = (preferLarge ? media.coverImage?.large : undefined)
        ?? media.coverImage?.extraLarge
        ?? media.coverImage?.large
        ?? media.coverImage?.medium
    const showUnwatched = cardSettings.showUnwatchedCount
    const hideAudienceScore = cardSettings.hideAudienceScore
    const blurAdult = cardSettings.blurAdultContent && !!media.isAdult
    const stats = animeCardStats(media, list, library, nakama, showUnwatched)
    const showLibrary = !hideLibraryBadge && stats.files > 0
    const showScore = showAudienceScore && !hideAudienceScore && !!media.meanScore

    const isPreferred = usePreferredFocus(preferred)
    const handlePress = onPress ?? (() => onPressMedia?.(media))

    return (
        <Pressable
            onPress={handlePress}
            onFocus={focusState.focus}
            onBlur={focusState.blur}
            hasTVPreferredFocus={isPreferred}
            scrollSnapAlign="start"
            accessibilityRole="button"
            accessibilityLabel={title}
            style={{ width }}
        >
            <TVFocusScaleView style={focusState.style}>
                <View
                    style={{
                        width,
                        height: width * 1.42,
                        overflow: "hidden",
                        borderRadius: TV.radius,
                        borderWidth: TV.focusBorder,
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderColor: focusState.focused ? "#fff" : "transparent",
                    }}
                >
                    {blurAdult && CSS_BLUR ? null : (
                        <TVLazyImage
                            source={image ? { uri: image } : undefined}
                            style={{ width: "100%", height: "100%" }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={120}
                            recyclingKey={String(media.id)}
                            blurRadius={blurAdult ? tvSize(18) : 0}
                        />
                    )}
                    {blurAdult ? (
                        <View
                            style={{
                                position: "absolute",
                                inset: 0,
                                backgroundColor: "rgba(0,0,0,0.42)",
                            }}
                        />
                    ) : null}
                    {!hideProgress && (stats.progress > 0 || stats.unwatched > 0) ? (
                        <View
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                borderBottomRightRadius: tvSize(10),
                                backgroundColor: "rgba(10,10,10,0.88)",
                                paddingHorizontal: tvSize(10),
                                paddingVertical: tvSize(6),
                                gap: tvSize(2),
                            }}
                        >
                            {stats.unwatched > 0 ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: tvSize(4) }}>
                                    <Ionicons name="play-circle-outline" size={tvSize(14)} color="rgba(255,255,255,0.82)" />
                                    <Text className="font-semibold text-white/85" style={{ fontSize: tvSize(15) }}>
                                        {stats.unwatched}
                                    </Text>
                                </View>
                            ) : null}
                            {stats.progress > 0 ? (
                                <Text className="font-extrabold text-white" style={{ fontSize: tvSize(18) }}>
                                    {stats.progress}
                                    <Text className="text-white/45">/{stats.total || "-"}</Text>
                                </Text>
                            ) : null}
                        </View>
                    ) : null}
                    {showLibrary ? (
                        <View
                            style={{
                                position: "absolute",
                                top: 0,
                                right: 0,
                                width: tvSize(38),
                                height: tvSize(38),
                                alignItems: "center",
                                justifyContent: "center",
                                borderBottomLeftRadius: tvSize(10),
                                backgroundColor: "#fdba74",
                            }}
                        >
                            <Ionicons name="library" size={tvSize(20)} color="#431407" />
                        </View>
                    ) : null}
                    {badge ? (
                        <View
                            style={{
                                position: "absolute",
                                bottom: stats.progress > 0 || stats.unwatched > 0 ? tvSize(0) : 0,
                                right: 0,
                                borderTopLeftRadius: tvSize(10),
                                backgroundColor: "rgba(0,0,0,0.82)",
                                paddingHorizontal: tvSize(10),
                                paddingVertical: tvSize(5),
                            }}
                        >
                            <Text className="font-semibold text-white" style={{ fontSize: tvSize(17) }}>{badge}</Text>
                        </View>
                    ) : null}
                    {showScore ? (
                        <View
                            style={{
                                position: "absolute",
                                bottom: tvSize(1),
                                left: tvSize(1),
                                borderTopRightRadius: tvSize(10),
                                overflow: "hidden",
                            }}
                        >
                            <TVScoreBadge score={media.meanScore} kind="audience" compact />
                        </View>
                    ) : null}
                    {list?.score ? (
                        <View
                            style={{
                                position: "absolute",
                                bottom: tvSize(1),
                                right: tvSize(1),
                                borderTopLeftRadius: tvSize(10),
                                overflow: "hidden",
                            }}
                        >
                            <TVScoreBadge score={list.score} kind="user" compact />
                        </View>
                    ) : null}
                </View>
                <Text
                    className="font-semibold text-white"
                    numberOfLines={1}
                    style={{
                        marginTop: tvSize(10),
                        fontSize: tvSize(22),
                        opacity: focusState.focused ? 1 : 0.78,
                    }}
                >
                    {title}
                </Text>
                <Text
                    className="text-white/40"
                    numberOfLines={1}
                    style={{ marginTop: tvSize(2), fontSize: tvSize(18) }}
                >
                    {[media.seasonYear, media.format?.replaceAll("_", " ")].filter(Boolean).join(" · ")}
                </Text>
            </TVFocusScaleView>
        </Pressable>
    )
})
