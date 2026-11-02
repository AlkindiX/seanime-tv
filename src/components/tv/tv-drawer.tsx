import { TVButton } from "@/components/tv/tv-focus"
import { tvSize } from "@/components/tv/tv-scale"
import Ionicons from "@expo/vector-icons/Ionicons"
import * as React from "react"
import { Animated, Modal, Platform, Pressable, Text, View, TVFocusGuideView, ViewStyle } from "react-native"

/**
 * webOS: the panel slides in with the Web Animations API (transform only, run
 * by the compositor). Animated has no native driver on react-native-web, so
 * `useNativeDriver` there still moves the panel from JavaScript every frame.
 * Closing isn't animated on any platform: the drawer unmounts when `open`
 * turns false.
 */
const WEB_SLIDE = Platform.OS === "web"
const SLIDE_MS = 220
/**
 * The panel: a plain View on webOS, whose ref stays the same between renders
 * (Animated.View's changes with its props, which would restart the slide).
 */
const DrawerPanel = (WEB_SLIDE ? View : Animated.View) as typeof Animated.View

type TVDrawerProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onRequestClose?: () => void
    onShow?: () => void
    title: string
    subtitle?: string
    children: React.ReactNode
    width?: number
    style?: ViewStyle
    closeDisabled?: boolean
    inline?: boolean
    focusKey?: string
}

export function TVDrawer({
    open,
    onOpenChange,
    onRequestClose,
    onShow,
    title,
    subtitle,
    children,
    width = tvSize(650),
    style,
    closeDisabled = false,
    inline = false,
    focusKey,
}: TVDrawerProps) {
    const slideAnim = React.useRef(new Animated.Value(width)).current
    const onShowRef = React.useRef(onShow)
    onShowRef.current = onShow

    React.useEffect(() => {
        if (inline) {
            if (open) onShowRef.current?.()
            return
        }
        if (WEB_SLIDE) return

        Animated.timing(slideAnim, {
            toValue: open ? 0 : width,
            duration: SLIDE_MS,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished && open) {
                onShowRef.current?.()
            }
        })
    }, [inline, open, width])

    // webOS: runs when the panel's node mounts (each time the drawer opens)
    // and with null when it unmounts, which stops a slide still running so
    // `onShow` doesn't fire for a drawer already closed.
    const slideRef = React.useRef<Animation | null>(null)
    const slideIn = React.useCallback((view: React.ComponentRef<typeof View> | null) => {
        const node = view as unknown as HTMLElement | null
        if (slideRef.current) {
            slideRef.current.onfinish = null
            slideRef.current.cancel()
            slideRef.current = null
        }
        if (!node) return
        if (typeof node.animate !== "function") {
            onShowRef.current?.()
            return
        }
        const animation = node.animate([
            { transform: `translateX(${width}px)` },
            { transform: "translateX(0px)" },
        ], { duration: SLIDE_MS, easing: "ease-in-out" })
        animation.onfinish = () => {
            slideRef.current = null
            onShowRef.current?.()
        }
        slideRef.current = animation
    }, [width])

    if (!open) return null

    const body = (
        <View
            style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.65)",
                flexDirection: "row",
                justifyContent: "flex-end",
                zIndex: 9999,
            }}
        >
            <Pressable
                focusable={false}
                onPress={() => {
                    if (!closeDisabled) onOpenChange(false)
                }}
                style={{ flex: 1 }}
            />

            <TVFocusGuideView
                key={focusKey}
                autoFocus={inline}
                trapFocusLeft={true}
                trapFocusRight={true}
                trapFocusUp={true}
                trapFocusDown={true}
                style={{ height: "100%" }}
            >
                <DrawerPanel
                    ref={WEB_SLIDE && !inline ? slideIn : undefined}
                    style={[
                        {
                            width,
                            height: "100%",
                            backgroundColor: "#0c0c0c",
                            borderLeftWidth: tvSize(2),
                            borderLeftColor: "rgba(255,255,255,0.08)",
                            transform: inline || WEB_SLIDE ? undefined : [{ translateX: slideAnim }],
                            paddingTop: tvSize(40),
                            paddingHorizontal: 0,
                            gap: tvSize(20),
                            overflow: "hidden",
                        },
                        style,
                    ]}
                >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: tvSize(30) }}>
                        <View style={{ gap: tvSize(4), flexShrink: 1 }}>
                            {!!subtitle && (
                                <Text className="text-white/60 font-bold uppercase tracking-wider" style={{ fontSize: tvSize(16) }}>
                                    {subtitle}
                                </Text>
                            )}
                            <Text className="text-white font-black" style={{ fontSize: tvSize(24) }} numberOfLines={1}>
                                {title}
                            </Text>
                        </View>
                        <TVButton
                            label="Close"
                            variant="secondary"
                            size="compact"
                            icon={<Ionicons name="close" size={tvSize(20)} color="white" />}
                            disabled={closeDisabled}
                            onPress={() => onOpenChange(false)}
                        />
                    </View>

                    <View style={{ flex: 1 }}>
                        {children}
                    </View>
                </DrawerPanel>
            </TVFocusGuideView>
        </View>
    )

    if (inline) return body

    return (
        <Modal
            visible
            transparent={true}
            animationType="none"
            onRequestClose={() => {
                if (closeDisabled) return
                if (onRequestClose) {
                    onRequestClose()
                    return
                }
                onOpenChange(false)
            }}
        >
            {body}
        </Modal>
    )
}
