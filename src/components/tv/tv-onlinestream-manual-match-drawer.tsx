import * as React from "react"
import { View, Text, ScrollView, Pressable, ActivityIndicator, Animated, TVFocusGuideView } from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { TVDrawer } from "./tv-drawer"
import { TVInput, type TVInputHandle } from "./tv-input"
import { TVButton, useTVFocus } from "./tv-focus"
import { tvSize } from "./tv-scale"
import {
    useGetOnlinestreamMapping,
    useOnlinestreamManualMapping,
    useOnlinestreamManualSearch,
    useRemoveOnlinestreamMapping,
} from "@/api/hooks/onlinestream.hooks"
import type { HibikeOnlinestream_SearchResult } from "@/api/generated/types"

type TVManualMatchResultCardProps = {
    result: HibikeOnlinestream_SearchResult
    onPress: () => void
}

const TVManualMatchResultCard = React.memo(function TVManualMatchResultCard({
    result,
    onPress,
}: TVManualMatchResultCardProps) {
    const focus = useTVFocus(1.01)

    return (
        <Pressable
            onPress={onPress}
            onFocus={focus.focus}
            onBlur={focus.blur}
        >
            <Animated.View
                style={[
                    focus.style,
                    {
                        padding: tvSize(14),
                        borderRadius: tvSize(12),
                        backgroundColor: focus.focused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                        borderWidth: tvSize(2),
                        borderColor: focus.focused ? "#ffffff" : "rgba(255,255,255,0.08)",
                        gap: tvSize(4),
                    },
                ]}
            >
                <Text
                    style={{
                        fontSize: tvSize(16),
                        fontWeight: "600",
                        color: "#ffffff",
                    }}
                    numberOfLines={2}
                >
                    {result.title}
                </Text>
                <Text style={{ fontSize: tvSize(12), color: "rgba(255,255,255,0.4)" }}>
                    {result.subOrDub === "both" ? "Sub & Dub" : result.subOrDub === "dub" ? "Dub" : "Sub"}
                </Text>
            </Animated.View>
        </Pressable>
    )
})

type TVOnlinestreamManualMatchDrawerProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    mediaId: number
    provider: string
    dubbed: boolean
    mediaTitle: string
}

export function TVOnlinestreamManualMatchDrawer({
    open,
    onOpenChange,
    mediaId,
    provider,
    dubbed,
    mediaTitle,
}: TVOnlinestreamManualMatchDrawerProps) {
    const [query, setQuery] = React.useState(mediaTitle)
    const inputRef = React.useRef<TVInputHandle>(null)

    const { data: currentMapping } = useGetOnlinestreamMapping({ provider, mediaId })
    const { mutate: search, data: searchResults, isPending: isSearching } = useOnlinestreamManualSearch(mediaId, provider)
    const { mutate: mapAnime, isPending: isMapping } = useOnlinestreamManualMapping()
    const { mutate: removeMapping, isPending: isRemoving } = useRemoveOnlinestreamMapping()

    React.useEffect(() => {
        if (open) {
            setQuery(mediaTitle)
            const timer = setTimeout(() => {
                inputRef.current?.requestTVFocus()
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [open, mediaTitle])

    const handleSearch = React.useCallback(() => {
        if (!query.trim() || !provider) return
        search({ provider, query: query.trim(), dubbed })
    }, [query, provider, dubbed, search])

    const handleSelectResult = React.useCallback((result: HibikeOnlinestream_SearchResult) => {
        mapAnime(
            { provider, mediaId, animeId: result.id },
            { onSuccess: () => onOpenChange(false) },
        )
    }, [provider, mediaId, mapAnime, onOpenChange])

    const handleRemoveMapping = React.useCallback(() => {
        removeMapping(
            { provider, mediaId },
            { onSuccess: () => onOpenChange(false) },
        )
    }, [provider, mediaId, removeMapping, onOpenChange])

    return (
        <TVDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="Manual Match"
            subtitle={mediaTitle}
            width={650}
        >
            <View style={{ flex: 1, gap: tvSize(20), paddingTop: tvSize(10) }}>
                <View style={{ gap: tvSize(6), paddingHorizontal: tvSize(30) }}>
                    <Text style={{ fontSize: tvSize(14), color: "rgba(255,255,255,0.4)", fontWeight: "600" }}>SEARCH QUERY</Text>
                    <View style={{ flexDirection: "row", gap: tvSize(10), alignItems: "center" }}>
                        <TVInput
                            ref={inputRef}
                            value={query}
                            onChangeText={setQuery}
                            onSubmitEditing={handleSearch}
                            placeholder="Search title..."
                            placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                        <TVButton
                            label="Search"
                            size="compact"
                            icon={<Ionicons name="search" size={tvSize(20)} color="white" />}
                            onPress={handleSearch}
                            disabled={isSearching || !query.trim()}
                        />
                    </View>
                </View>

                {currentMapping?.animeId && (
                    <View style={{ marginHorizontal: tvSize(30), flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(168,159,255,0.06)", borderWidth: tvSize(1), borderColor: "rgba(168,159,255,0.15)", borderRadius: tvSize(12), padding: tvSize(12) }}>
                        <View style={{ gap: tvSize(2) }}>
                            <Text style={{ fontSize: tvSize(12), color: "rgba(255,255,255,0.4)", fontWeight: "600" }}>CURRENTLY MAPPED TO</Text>
                            <Text style={{ fontSize: tvSize(16), color: "#a89fff", fontWeight: "bold" }}>{currentMapping.animeId}</Text>
                        </View>
                        <TVButton
                            label="Remove mapping"
                            variant="danger"
                            size="compact"
                            icon={<Ionicons name="trash-outline" size={tvSize(18)} color="#ef4444" />}
                            onPress={handleRemoveMapping}
                            disabled={isRemoving}
                        />
                    </View>
                )}

                <View style={{ flex: 1 }}>
                    {isSearching || isMapping ? (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                            <ActivityIndicator size="large" color="#ffffff" />
                        </View>
                    ) : searchResults && searchResults.length > 0 ? (
                        <TVFocusGuideView trapFocusLeft trapFocusRight style={{ flex: 1 }}>
                            <ScrollView
                                style={{ flex: 1 }}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{
                                    gap: tvSize(10),
                                    paddingHorizontal: tvSize(30),
                                    paddingVertical: tvSize(10),
                                }}
                            >
                                {searchResults.map((result, index) => (
                                    <TVManualMatchResultCard
                                        key={`${result.id}-${index}`}
                                        result={result}
                                        onPress={() => handleSelectResult(result)}
                                    />
                                ))}
                            </ScrollView>
                        </TVFocusGuideView>
                    ) : searchResults && searchResults.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                            <Text style={{ fontSize: tvSize(16), color: "rgba(255,255,255,0.4)" }}>No results found</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        </TVDrawer>
    )
}
