import { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, type ViewStyle } from "react-native";

export function Skeleton({ width, height, borderRadius = 8, style }: {
  width: number | string; height: number; borderRadius?: number; style?: ViewStyle;
}) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[{ width: width as number, height, borderRadius, backgroundColor: "#1b1f2e", opacity: anim }, style]}
    />
  );
}

export function ThreadSkeleton() {
  return (
    <View style={s.row}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={s.body}>
        <View style={s.top}>
          <Skeleton width={120} height={12} />
          <Skeleton width={40} height={10} />
        </View>
        <Skeleton width="90%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="70%" height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function ChatSkeleton() {
  return (
    <View style={s.row}>
      <Skeleton width={36} height={36} borderRadius={18} />
      <View style={s.body}>
        <Skeleton width={100} height={12} />
        <Skeleton width="80%" height={30} borderRadius={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 5, type = "thread" }: { count?: number; type?: "thread" | "chat" }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) =>
        type === "thread" ? <ThreadSkeleton key={i} /> : <ChatSkeleton key={i} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)" },
  body: { flex: 1, gap: 4 },
  top:  { flexDirection: "row", justifyContent: "space-between" },
});
