import type { AL_MediaListStatus, Anime_Entry } from "@/api/generated/types"
import { useDeleteAnilistListEntry, useEditAnilistListEntry } from "@/api/hooks/anilist.hooks"
import {
    dateInput,
    LIST_STATUS,
    listForm,
    type ListForm,
    listPayload,
    maxListProgress,
    parseListDate,
} from "@/components/features/media/edit-list-entry-utils"
import { TVDrawer } from "@/components/tv/tv-drawer"
import { TVButton, TVPillButton } from "@/components/tv/tv-focus"
import { TVInput } from "@/components/tv/tv-input"
import { tvSize } from "@/components/tv/tv-scale"
import { useIsServerConnected } from "@/lib/offline"
import Ionicons from "@expo/vector-icons/Ionicons"
import * as React from "react"
import { FlatList, Pressable, ScrollView, Text, TVFocusGuideView, View } from "react-native"

type Props = {
    entry: Anime_Entry
    open: boolean
    onOpenChange: (open: boolean) => void
}

type StepperProps = {
    label: string
    value: number
    max: number
    step?: number
    onChange: (value: number) => void
}

const TVStepper = React.memo(function TVStepper({
    label,
    value,
    max,
    step = 1,
    onChange,
}: StepperProps) {
    return (
        <View style={{ gap: tvSize(8) }}>
            <Text className="font-semibold text-white/55" style={{ fontSize: tvSize(17) }}>
                {label}
            </Text>
            <TVFocusGuideView
                trapFocusLeft
                trapFocusRight
                style={{ flexDirection: "row", alignItems: "center", gap: tvSize(10) }}
            >
                <TVButton
                    label="Decrease"
                    size="compact"
                    variant="secondary"
                    disabled={value <= 0}
                    icon={<Ionicons name="remove" size={tvSize(18)} color="white" />}
                    onPress={() => onChange(Math.max(0, value - step))}
                />
                <View
                    style={{
                        minWidth: tvSize(120),
                        minHeight: tvSize(56),
                        borderRadius: tvSize(12),
                        backgroundColor: "rgba(255,255,255,0.05)",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: tvSize(18),
                    }}
                >
                    <Text className="font-bold text-white" style={{ fontSize: tvSize(22) }}>
                        {value || "—"}
                        <Text className="text-white/35"> / {max || "—"}</Text>
                    </Text>
                </View>
                <TVButton
                    label="Increase"
                    size="compact"
                    variant="secondary"
                    disabled={value >= max}
                    icon={<Ionicons name="add" size={tvSize(18)} color="white" />}
                    onPress={() => onChange(Math.min(max, value + step))}
                />
            </TVFocusGuideView>
        </View>
    )
})

export function TVEditAnilistEntryDrawer({
    entry,
    open,
    onOpenChange,
}: Props) {
    const notReleased = entry.media?.status === "NOT_YET_RELEASED"
    const maxProgress = maxListProgress(entry, "anime") ?? 0
    const [form, setForm] = React.useState<ListForm>(() => listForm(entry, notReleased))
    const [start, setStart] = React.useState(() => dateInput(form.startedAt))
    const [end, setEnd] = React.useState(() => dateInput(form.completedAt))
    const [confirmRemove, setConfirmRemove] = React.useState(false)
    const keepRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const removeRef = React.useRef<React.ElementRef<typeof Pressable>>(null)
    const wasConfirming = React.useRef(false)
    const isConnected = useIsServerConnected()
    const { mutate: save, isPending: saving } = useEditAnilistListEntry(entry.mediaId, "anime")
    const { mutate: remove, isPending: removing } = useDeleteAnilistListEntry(entry.mediaId, "anime", () => onOpenChange(false), false)

    React.useEffect(() => {
        if (!open) return
        const next = listForm(entry, notReleased)
        setForm(next)
        setStart(dateInput(next.startedAt))
        setEnd(dateInput(next.completedAt))
        setConfirmRemove(false)
    }, [entry, notReleased, open])

    React.useEffect(() => {
        if (!open) {
            wasConfirming.current = false
            return
        }

        const shouldRestoreRemove = wasConfirming.current && !confirmRemove
        wasConfirming.current = confirmRemove
        if (!confirmRemove && !shouldRestoreRemove) return

        const frame = requestAnimationFrame(() => {
            if (confirmRemove) {
                keepRef.current?.focus()
                return
            }
            removeRef.current?.focus()
        })

        return () => cancelAnimationFrame(frame)
    }, [confirmRemove, open])

    const status = React.useMemo(() => notReleased ? LIST_STATUS.filter(item => item.value === "PLANNING") : LIST_STATUS, [notReleased])

    const setValue = React.useCallback(<K extends keyof ListForm>(key: K, value: ListForm[K]) => {
        setForm(current => ({ ...current, [key]: value }))
    }, [])

    const setDate = React.useCallback((
        key: "startedAt" | "completedAt",
        value: string,
        setter: React.Dispatch<React.SetStateAction<string>>,
    ) => {
        setter(value)
        if (!value.trim()) {
            setValue(key, null)
            return
        }
        const parsed = parseListDate(value)
        if (parsed) setValue(key, parsed)
    }, [setValue])

    const validDates = (!start || !!parseListDate(start)) && (!end || !!parseListDate(end))
    const busy = saving || removing

    const handleSave = React.useCallback(() => {
        if (!validDates) return
        save(listPayload(entry, "anime", form, maxProgress), {
            onSuccess: () => onOpenChange(false),
        })
    }, [entry, form, maxProgress, onOpenChange, save, validDates])

    return (
        <TVDrawer
            open={open}
            onOpenChange={onOpenChange}
            title={entry.media?.title?.userPreferred ?? "Anime list entry"}
            subtitle={entry.listData ? "Edit AniList entry" : "Add to AniList"}
            width={tvSize(820)}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: tvSize(30),
                    paddingTop: tvSize(10),
                    paddingBottom: tvSize(40),
                    gap: tvSize(26),
                }}
            >
                <View style={{ gap: tvSize(10) }}>
                    <Text className="font-semibold text-white/55" style={{ fontSize: tvSize(17) }}>
                        Status
                    </Text>
                    <TVFocusGuideView trapFocusLeft trapFocusRight>
                        <FlatList
                            horizontal
                            data={status}
                            keyExtractor={item => item.value}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{
                                padding: tvSize(8),
                                gap: tvSize(10),
                            }}
                            renderItem={({ item, index }) => (
                                <TVPillButton
                                    label={item.label}
                                    active={form.status === item.value}
                                    preferred={index === 0}
                                    onPress={() => setValue("status", item.value as AL_MediaListStatus)}
                                />
                            )}
                        />
                    </TVFocusGuideView>
                </View>

                {!notReleased ? (
                    <>
                        <TVStepper
                            label="Score"
                            value={Number.parseFloat(form.score) || 0}
                            max={10}
                            step={0.5}
                            onChange={value => setValue("score", value ? String(value) : "")}
                        />
                        <TVStepper
                            label="Episodes"
                            value={Number.parseInt(form.progress, 10) || 0}
                            max={maxProgress}
                            onChange={value => setValue("progress", value ? String(value) : "")}
                        />
                        <View style={{ gap: tvSize(12) }}>
                            <Text className="font-semibold text-white/55" style={{ fontSize: tvSize(17) }}>
                                Dates
                            </Text>
                            <View style={{ flexDirection: "row", gap: tvSize(14) }}>
                                <View style={{ flex: 1, gap: tvSize(7) }}>
                                    <Text className="text-white/40" style={{ fontSize: tvSize(15) }}>Start date</Text>
                                    <TVInput
                                        value={start}
                                        onChangeText={value => setDate("startedAt", value, setStart)}
                                        placeholder="YYYY-MM-DD"
                                        autoCorrect={false}
                                        autoCapitalize="none"
                                    />
                                </View>
                                <View style={{ flex: 1, gap: tvSize(7) }}>
                                    <Text className="text-white/40" style={{ fontSize: tvSize(15) }}>Completion date</Text>
                                    <TVInput
                                        value={end}
                                        onChangeText={value => setDate("completedAt", value, setEnd)}
                                        placeholder="YYYY-MM-DD"
                                        autoCorrect={false}
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>
                            {!validDates ? (
                                <Text className="font-medium text-red-300/80" style={{ fontSize: tvSize(15) }}>
                                    Use YYYY-MM-DD for dates.
                                </Text>
                            ) : null}
                        </View>
                    </>
                ) : null}

                <View style={{ height: tvSize(1), backgroundColor: "rgba(255,255,255,0.08)" }} />

                {confirmRemove ? (
                    <View style={{ gap: tvSize(12) }}>
                        <Text className="font-semibold text-white" style={{ fontSize: tvSize(19) }}>
                            Remove this anime from your AniList?
                        </Text>
                        <TVFocusGuideView
                            trapFocusLeft
                            trapFocusRight
                            style={{ flexDirection: "row", gap: tvSize(12) }}
                        >
                            <TVButton
                                ref={keepRef}
                                label="Keep entry"
                                preferred
                                onPress={() => setConfirmRemove(false)}
                            />
                            <TVButton
                                label={removing ? "Removing..." : "Remove"}
                                variant="danger"
                                disabled={busy}
                                onPress={() => remove({ mediaId: entry.mediaId, type: "anime" })}
                            />
                        </TVFocusGuideView>
                    </View>
                ) : (
                    <TVFocusGuideView
                        trapFocusLeft
                        trapFocusRight
                        style={{ flexDirection: "row", gap: tvSize(12) }}
                    >
                        <TVButton
                            label={saving
                                ? "Saving..."
                                : !isConnected
                                    ? (entry.listData ? "Queue changes" : "Queue add")
                                    : entry.listData
                                        ? "Save changes"
                                        : "Add to list"}
                            variant="primary"
                            disabled={busy || !validDates}
                            icon={<Ionicons name="checkmark" size={tvSize(20)} color="white" />}
                            onPress={handleSave}
                        />
                        {entry.listData && isConnected ? (
                            <TVButton
                                ref={removeRef}
                                label="Remove from list"
                                variant="danger"
                                disabled={busy}
                                icon={<Ionicons name="trash-outline" size={tvSize(20)} color="white" />}
                                onPress={() => setConfirmRemove(true)}
                            />
                        ) : null}
                    </TVFocusGuideView>
                )}
            </ScrollView>
        </TVDrawer>
    )
}
