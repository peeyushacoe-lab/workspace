import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated } from "react-native";
import { useRef, useEffect } from "react";
import * as Haptics from "expo-haptics";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "✅", "👀"];

interface Props {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ visible, onSelect, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 15 }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.7);
      opacity.setValue(0);
    }
  }, [visible, scale, opacity]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <Animated.View style={[s.picker, { transform: [{ scale }], opacity }]}>
          {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={s.emojiBtn}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(emoji);
                onClose();
              }}
            >
              <Text style={s.emoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center",
  },
  picker: {
    flexDirection: "row", flexWrap: "wrap", gap: 4,
    backgroundColor: "#1b1f2e", borderRadius: 20, padding: 10,
    borderWidth: 1, borderColor: "rgba(0,210,255,0.15)",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 16, maxWidth: 300,
  },
  emojiBtn: {
    width: 48, height: 48, alignItems: "center", justifyContent: "center",
    borderRadius: 12, backgroundColor: "#262b3e",
  },
  emoji: { fontSize: 26 },
});
