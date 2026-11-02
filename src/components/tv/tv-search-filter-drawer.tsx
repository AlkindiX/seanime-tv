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
    SEARCH_MIN_SCORES,
    SEARCH_SEASONS,
    SEARCH_SORTING_ANIME,
    SEARCH_STATUS,
    SEARCH_YEARS,
} from "@/lib/search/search-constants"
import { DEFAULT_SEARCH_PARAMS, getActiveFiltersCount, type SearchParams } from "@/lib/search/search.atoms"
import { removeAdultTags, type MediaTag } from "@/lib/search/tag-filter"
import Ionicons from "@expo/vector-icons/Ionicons"
import * as React from "react"
import { ScrollView, TVFocusGuideView, View } from "react-native"

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    params: SearchParams
    onApply: (params: SearchParams) => void
}

export function TVSearchFilterDrawer({
    open,
    onOpenChange,
    params,
    onApply,
}: Props) {
    const catalog = mediaTags as MediaTag[]
    const [draft, setDraft] = React.useState<SearchParams>(params)
    const [tagSearch, setTagSearch] = React.useState("")

    React.useEffect(() => {
        if (!open) return
        setDraft(params.isAdult ? params : { ...params, tags: removeAdultTags(params.tags, catalog) })
        setTagSearch("")
    }, [open, params])

    const toggle = React.useCallback((key: "genre" | "tags" | "status", value: string) => {
        setDraft(current => {
            const values = current[key] as string[]
            const next = values.includes(value)
                ? values.filter(item => item !== value)
                : [...values, value]
            return { ...current, [key]: next }
        })
    }, [])

    const active = getActiveFiltersCount(draft)

    return (
        <TVDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="Search filters"
            subtitle={active ? `${active} active` : "Anime catalog"}
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
                    values={SEARCH_SORTING_ANIME}
                    selected={value => draft.sorting === value}
                    onPress={value => setDraft(current => ({ ...current, sorting: value as SearchParams["sorting"] }))}
                />
                <TVFilterChoiceRow
                    label="Format"
                    values={SEARCH_FORMATS_ANIME}
                    allowAll
                    selected={value => (draft.format ?? "") === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        format: (value || null) as SearchParams["format"],
                    }))}
                />
                <TVFilterChoiceRow
                    label="Season"
                    values={[...SEARCH_SEASONS]}
                    allowAll
                    selected={value => (draft.season ?? "") === value}
                    onPress={value => setDraft(current => ({
                        ...current,
                        season: (value || null) as SearchParams["season"],
                    }))}
                />
                <TVFilterChoiceRow
                    label="Year"
                    values={SEARCH_YEARS.map(value => ({ value, label: value }))}
                    allowAll
                    selected={value => (draft.year ?? "") === value}
                    onPress={value => setDraft(current => ({ ...current, year: value || null }))}
                />
                <TVFilterChoiceRow
                    label="Status"
                    values={SEARCH_STATUS}
                    selected={value => draft.status.includes(value as AL_MediaStatus)}
                    onPress={value => toggle("status", value)}
                />
                <TVFilterChoiceRow
                    label="Minimum score"
                    values={SEARCH_MIN_SCORES}
                    allowAll
                    selected={value => (draft.minScore ?? "") === value}
                    onPress={value => setDraft(current => ({ ...current, minScore: value || null }))}
                />
                <TVFilterChoiceRow
                    label="Genres"
                    values={SEARCH_MEDIA_GENRES.map(value => ({ value, label: value }))}
                    selected={value => draft.genre.includes(value)}
                    onPress={value => toggle("genre", value)}
                />

                <TVTagFilter
                    catalog={catalog}
                    search={tagSearch}
                    selected={draft.tags}
                    allowAdult={draft.isAdult}
                    onSearch={setTagSearch}
                    onToggle={value => toggle("tags", value)}
                />

                <TVFilterChoiceRow
                    label="Adult content"
                    values={[
                        { value: "off", label: "Hidden" },
                        { value: "on", label: "Shown" },
                    ]}
                    selected={value => draft.isAdult === (value === "on")}
                    onPress={value => setDraft(current => {
                        const isAdult = value === "on"
                        return {
                            ...current,
                            isAdult,
                            tags: isAdult ? current.tags : removeAdultTags(current.tags, catalog),
                        }
                    })}
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
                        onPress={() => setDraft({
                            ...DEFAULT_SEARCH_PARAMS,
                            type: "anime",
                            title: params.title,
                        })}
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
