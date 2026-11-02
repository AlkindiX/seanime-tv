import { TV, tvSize } from "@/components/tv/tv-scale"
import { LinearGradient } from "expo-linear-gradient"
import * as React from "react"
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform, View } from "react-native"

/**
 * A dark fade at the top of a tab screen, so rows scrolled up under the
 * floating nav bar sink into the background instead of running into it.
 * Android TV draws this with the ScrollView's `fadingEdgeLength`, which the
 * web ignores, so it's webOS only. Render it inside the screen, after the
 * scrolling content and before anything that must stay on top.
 *
 * With `shown` (a screen whose top is a hero image) it fades in and out as
 * that flips, with a CSS transition (see useScrolledPast); without, it is
 * always there.
 */
export function TVNavScrim({ shown }: { shown?: boolean }) {
    if (Platform.OS !== "web") return null
    return (
        <View
            pointerEvents="none"
            style={[SCRIM_STYLE, shown === undefined ? null : shown ? SCRIM_SHOWN : SCRIM_HIDDEN]}
        >
            <Gradient />
        </View>
    )
}

const SCRIM_STYLE = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TV.navInset + tvSize(40),
    zIndex: 205,
} as const

const FADE = {
    transitionProperty: "opacity",
    transitionDuration: "240ms",
    transitionTimingFunction: "ease-out",
}
const SCRIM_SHOWN = { ...FADE, opacity: 1 } as object
const SCRIM_HIDDEN = { ...FADE, opacity: 0 } as object

function Gradient() {
    return (
        <LinearGradient
            colors={["rgba(10,10,10,0.97)", "rgba(10,10,10,0.85)", "rgba(10,10,10,0)"]}
            locations={[0, 0.55, 1]}
            style={{ flex: 1 }}
        />
    )
}

/** How far a hero screen scrolls before its scrim shows. */
export const SCRIM_SCROLL_THRESHOLD = tvSize(40)

/**
 * webOS: whether a screen has scrolled past `threshold`, as state that only
 * changes when the scroll crosses it. Screens use it for scroll-linked fades,
 * which CSS transitions then run; following the scroll offset every frame
 * (Reanimated on the web) restyles from JavaScript while the TV scrolls.
 */
export function useScrolledPast(threshold: number) {
    const [scrolled, setScrolled] = React.useState(false)
    const scrolledRef = React.useRef(false)
    const onScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const next = event.nativeEvent.contentOffset.y > threshold
        if (next === scrolledRef.current) return
        scrolledRef.current = next
        setScrolled(next)
    }, [threshold])
    return [scrolled, onScroll] as const
}
