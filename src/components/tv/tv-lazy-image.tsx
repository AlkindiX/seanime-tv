import { trackNearScreen } from "@/lib/webos/viewport-tracker"
import { Image, type ImageProps } from "expo-image"
import * as React from "react"
import { Platform, type StyleProp, View, type ViewStyle } from "react-native"

/**
 * expo-image for cards in TV rows and grids. On webOS and Tizen the image
 * exists only while its card is near the screen and is dropped again once
 * the card scrolls well past it (see viewport-tracker.ts); a card coming back
 * reloads it from the browser's cache. Native TV keeps expo-image as it was.
 */
export function TVLazyImage(props: ImageProps) {
    if (Platform.OS !== "web") return <Image {...props} />
    return <WebLazyImage {...props} />
}

const FILL = { width: "100%", height: "100%" } as const

function WebLazyImage({ style, ...props }: ImageProps) {
    // A plain View keeps the image's box (and something to measure) while the image is gone.
    const ref = React.useRef<React.ComponentRef<typeof View>>(null)
    const [near, setNear] = React.useState(false)

    React.useLayoutEffect(() => {
        const node = ref.current as unknown as Element | null
        if (!node) return
        const tracked = trackNearScreen(node, setNear)
        setNear(tracked.near)
        return tracked.stop
    }, [])

    return (
        <View ref={ref} style={style as StyleProp<ViewStyle>}>
            {near ? <Image {...props} style={FILL} /> : null}
        </View>
    )
}
