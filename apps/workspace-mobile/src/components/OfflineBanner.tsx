import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import NetInfo from "@react-native-community/netinfo";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const slideAnim = useState(new Animated.Value(-50))[0];

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOffline = !state.isConnected;
      setOffline(isOffline);
      if (!isOffline && wasOffline) {
        setShowBack(true);
        setTimeout(() => setShowBack(false), 2500);
      }
      if (isOffline) setWasOffline(true);
    });
    return unsub;
  }, [wasOffline]);

  const visible = offline || showBack;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -50,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  return (
    <Animated.View style={[s.banner, showBack && s.backOnline, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={s.text}>
        {showBack ? "✓ Back online" : "● No internet connection"}
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner:    { position: "absolute", top: 0, left: 0, right: 0, zIndex: 999, backgroundColor: "#ff4d6d", paddingVertical: 8, alignItems: "center" },
  backOnline:{ backgroundColor: "#059669" },
  text:      { color: "#fff", fontSize: 12, fontWeight: "700" },
});
