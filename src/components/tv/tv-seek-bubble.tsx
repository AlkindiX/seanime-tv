import { tvSize } from "@/components/tv/tv-scale"
import { formatSeekBubble, type SeekBubbleStore } from "@/lib/player/seek-bubble"
import RotateCcw from "lucide-react-native/icons/rotate-ccw"
import RotateCw from "lucide-react-native/icons/rotate-cw"
import * as React from "react"
import { Text, View } from "react-native"

/**
 * The seek bubble of the webOS player (src/lib/player/seek-bubble.ts): a
 * round badge on the side the video moved to, with how far it moved. It
 * pops in with the Web Animations API (opacity and transform only).
 */
export function TVSeekBubble({ store }: { store: SeekBubbleStore }) {
    const bubble = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const ref = React.useRef<React.ComponentRef<typeof View>>(null)
    const id = bubble?.id

    React.useEffect(() => {
        const node = ref.current as unknown as HTMLElement | null
        if (!id || !node || typeof node.animate !== "function") return
        node.animate([
            { opacity: 0, transform: "scale(0.85)" },
            { opacity: 1, transform: "scale(1)" },
        ], { duration: 120, easing: "ease-out" })
    }, [id])

    if (!bubble) return null

    const forward = bubble.direction > 0
    const seconds = Math.round(bubble.seconds)
    const Icon = forward ? RotateCw : RotateCcw

    return (
        <View
            pointerEvents="none"
            style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: "34%",
                ...(forward ? { right: 0 } : { left: 0 }),
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <View
                ref={ref}
                accessibilityLabel={`${forward ? "Forward" : "Back"} ${seconds} seconds`}
                style={{
                    width: tvSize(150),
                    height: tvSize(150),
                    borderRadius: tvSize(75),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.55)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.16)",
                }}
            >
                <Icon size={tvSize(40)} color="#ffffff" />
                <Text
                    className="font-bold text-white"
                    // A margin, as webOS 6 has no flexbox gap.
                    style={{ fontSize: tvSize(26), marginTop: tvSize(6), fontVariant: ["tabular-nums"] }}
                >
                    {formatSeekBubble(bubble)}
                </Text>
            </View>
        </View>
    )
}
