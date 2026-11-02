import type { AL_MediaStatus } from "@/api/generated/types"
import { TVDrawer } from "@/components/tv/tv-drawer"
import { TVFilterChoiceRow } from "@/components/tv/tv-filter-choice-row"
import { TVButton } from "@/components/tv/tv-focus"
import { tvSize } from "@/components/tv/tv-scale"
import { TVTagFilter } from "@/components/tv/tv-tag-filter"
import mediaTags from "@/lib/search/media-tags.json"
import {
    SEARCH_FORMATS_ANIME,
    SEARCH_MEDIA_GENRES,
    SEARCH_SEASONS,
    SEARCH_STATUS,
    SEARCH_YEARS,
} from "@/lib/search/search-constants"
import { type MediaTag } from "@/lib/search/tag-filter"
import {
    COLLECTION_SORTING_OPTIONS,
    type CollectionParams,
    countActiveCollectionFilters,
    DEFAULT_COLLECTION_PARAMS,
} from "@/lib/utils/filtering"
import Ionicons from "@expo/vector-icons/Ionicons"
import * as React from "react"
import { ScrollView, TVFocusGuideView, View } from "react-native"

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    params: CollectionParams
    onApply: (params: CollectionParams) => void
}

export function TVCollectionFilterDrawer({
    open,
    onOpenChange,
    params,
    onApply,
}: Props) {
    const catalog = mediaTags as MediaTag[]
    const [draft, setDraft] = React.useState<CollectionParams>(params)
    const [tagSearch, setTagSearch] = React.useState("")

    React.useEffect(() => {
        if (!open) return
        setDraft({
            ...params,
            genre: params.genre ? [...params.genre] : null,
            tags: params.tags ? [...params.tags] : null,
        })
        setTagSearch("")
    }, [open, params])

    const selectedTags = draft.tags ?? []
    const toggle = React.useCallback((key: "genre" | "tags", value: string) => {
        setDraft(current => {
            const values = current[key] ?? []
            const next = values.includes(value)
                ? values.filter(item => item !== value)
                : [...values, value]
            return { ...current, [key]: next.length ? next : null }
        })
    }, [])

    const active = countActiveCollectionFilters(draft, "anime")

    return (
        <TVDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="List filters"
            subtitle={active ? `${active} active` : "AniList collection"}
            width={tvSize(900)}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: tvSize(30),
                    paddingTop: tvSize(8),
                    paddingBottom: tvSize(40),
                    gap: tvSize(22),
                }}
            >
                <TVFilterChoiceRow
                    label="Sort by"
                    values={COLLECTION_SORTING_OPTIONS}
                    selected={value => draft.sorting === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        sorting: value as CollectionParams["sorting"],
                    }))}
                />
                <TVFilterChoiceRow
                    label="Format"
                    values={SEARCH_FORMATS_ANIME}
                    allowAll
                    selected={value => (draft.format ?? "") === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        format: (value || null) as CollectionParams["format"],
                    }))}
                />
                <TVFilterChoiceRow
                    label="Season"
                    values={SEARCH_SEASONS}
                    allowAll
                    selected={value => (draft.season ?? "") === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        season: (value || null) as CollectionParams["season"],
                    }))}
                />
                <TVFilterChoiceRow
                    label="Year"
                    values={SEARCH_YEARS.map(value => ({ value, label: value }))}
                    allowAll
                    selected={value => (draft.year ?? "") === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        year: value || null,
                    }))}
                />
                <TVFilterChoiceRow
                    label="Status"
                    values={SEARCH_STATUS}
                    allowAll
                    selected={value => (draft.status ?? "") === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        status: (value || null) as AL_MediaStatus | null,
                    }))}
                />
                <TVFilterChoiceRow
                    label="Genres"
                    values={SEARCH_MEDIA_GENRES.map(value => ({ value, label: value }))}
                    selected={value => draft.genre?.includes(value) ?? false}
                    onPress={value => toggle("genre", value)}
                />

                <TVTagFilter
                    catalog={catalog}
                    search={tagSearch}
                    selected={selectedTags}
                    allowAdult={false}
                    onSearch={setTagSearch}
                    onToggle={value => toggle("tags", value)}
                />

                <View style={{ height: tvSize(1), backgroundColor: "rgba(255,255,255,0.08)" }} />
                <TVFocusGuideView
                    trapFocusLeft
                    trapFocusRight
                    style={{ flexDirection: "row", gap: tvSize(12) }}
                >
                    <TVButton
                        label="Reset"
                        variant="secondary"
                        icon={<Ionicons name="refresh-outline" size={tvSize(20)} color="white" />}
                        onPress={() => setDraft({ ...DEFAULT_COLLECTION_PARAMS })}
                    />
                    <TVButton
                        label={active ? `Apply (${active})` : "Apply"}
                        variant="primary"
                        icon={<Ionicons name="checkmark" size={tvSize(20)} color="white" />}
                        onPress={() => {
                            onApply(draft)
                            onOpenChange(false)
                        }}
                    />
                </TVFocusGuideView>
            </ScrollView>
        </TVDrawer>
    )
}
