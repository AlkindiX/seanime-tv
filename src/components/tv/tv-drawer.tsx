import { TVButton } from "@/components/tv/tv-focus"
import { tvSize } from "@/components/tv/tv-scale"
import Ionicons from "@expo/vector-icons/Ionicons"
import * as React from "react"
import { Animated, Modal, Pressable, Text, View, TVFocusGuideView, ViewStyle } from "react-native"

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

        Animated.timing(slideAnim, {
            toValue: open ? 0 : width,
            duration: 220,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished && open) {
                onShowRef.current?.()
            }
        })
    }, [inline, open, width])

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
                <Animated.View
                    style={[
                        {
                            width,
                            height: "100%",
                            backgroundColor: "#0c0c0c",
                            borderLeftWidth: tvSize(2),
                            borderLeftColor: "rgba(255,255,255,0.08)",
                            transform: inline ? undefined : [{ translateX: slideAnim }],
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
                </Animated.View>
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
