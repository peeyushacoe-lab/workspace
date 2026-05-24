import { useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, Animated } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    id: "1",
    icon: "✉️",
    title: "Unified Inbox",
    body: "All your team email in one place. Smart threads, AI summaries, and instant replies.",
  },
  {
    id: "2",
    icon: "💬",
    title: "Team Chat",
    body: "Real-time channels for every project. Stay in sync without leaving your workflow.",
  },
  {
    id: "3",
    icon: "🤖",
    title: "AI-Powered",
    body: "Summarize threads, generate smart replies, and let AI handle the heavy lifting.",
  },
  {
    id: "4",
    icon: "🔒",
    title: "Enterprise Security",
    body: "Biometric app lock, MFA, and end-to-end encryption. Your data stays yours.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const listRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goTo = (index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
    setCurrent(index);
  };

  const finish = async () => {
    await AsyncStorage.setItem("onboardingDone", "true");
    router.replace("/(auth)/login");
  };

  return (
    <View style={s.screen}>
      {/* Skip */}
      <TouchableOpacity style={s.skip} onPress={finish}>
        <Text style={s.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <View style={s.iconWrap}>
              <Text style={s.icon}>{item.icon}</Text>
            </View>
            <Text style={s.slideTitle}>{item.title}</Text>
            <Text style={s.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [0.3, 1, 0.3],
            extrapolate: "clamp",
          });
          const scaleX = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [1, 2.5, 1],
            extrapolate: "clamp",
          });
          return (
            <TouchableOpacity key={i} onPress={() => goTo(i)}>
              <Animated.View style={[s.dot, { opacity, transform: [{ scaleX }] }]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* CTA */}
      {current === SLIDES.length - 1 ? (
        <TouchableOpacity style={s.getStartedBtn} onPress={finish}>
          <Text style={s.getStartedText}>Get Started</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={s.nextBtn} onPress={() => goTo(current + 1)}>
          <Text style={s.nextText}>Next →</Text>
        </TouchableOpacity>
      )}

      {/* Legal links */}
      <View style={s.legalRow}>
        <TouchableOpacity onPress={() => router.push("/legal/privacy")}>
          <Text style={s.legalLink}>Privacy Policy</Text>
        </TouchableOpacity>
        <Text style={s.legalDot}>·</Text>
        <TouchableOpacity onPress={() => router.push("/legal/terms")}>
          <Text style={s.legalLink}>Terms of Service</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: "#0f1321", alignItems: "center" },
  skip:           { position: "absolute", top: 58, right: 20, zIndex: 10 },
  skipText:       { color: "#5c6b72", fontSize: 14 },
  slide:          { width, flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingBottom: 120 },
  iconWrap:       { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(0,210,255,0.1)", alignItems: "center", justifyContent: "center", marginBottom: 32, borderWidth: 1, borderColor: "rgba(0,210,255,0.2)" },
  icon:           { fontSize: 40 },
  slideTitle:     { color: "#dfe1f6", fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 16, letterSpacing: -0.5 },
  slideBody:      { color: "#bbc9cf", fontSize: 16, textAlign: "center", lineHeight: 24 },
  dots:           { flexDirection: "row", gap: 8, marginBottom: 32 },
  dot:            { height: 6, width: 6, borderRadius: 3, backgroundColor: "#00d2ff" },
  nextBtn:        { backgroundColor: "rgba(0,210,255,0.1)", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48, borderWidth: 1, borderColor: "rgba(0,210,255,0.3)", marginBottom: 24 },
  nextText:       { color: "#00d2ff", fontWeight: "700", fontSize: 16 },
  getStartedBtn:  { backgroundColor: "#00d2ff", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48, marginBottom: 24 },
  getStartedText: { color: "#003543", fontWeight: "800", fontSize: 16 },
  legalRow:       { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 24 },
  legalLink:      { color: "#5c6b72", fontSize: 12 },
  legalDot:       { color: "#3c494e", fontSize: 12 },
});
