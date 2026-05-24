import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  onUnlock: () => void;
}

export function BiometricLockScreen({ onUnlock }: Props) {
  return (
    <View style={s.overlay}>
      <View style={s.lockIcon}>
        <Text style={s.lockEmoji}>🔒</Text>
      </View>
      <Text style={s.title}>Nexus is Locked</Text>
      <Text style={s.sub}>Authenticate to continue</Text>
      <TouchableOpacity style={s.btn} onPress={onUnlock}>
        <Text style={s.btnText}>Unlock with Biometrics</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: "#0f1321", zIndex: 9999, alignItems: "center", justifyContent: "center", gap: 16 },
  lockIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(0,210,255,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.2)" },
  lockEmoji:{ fontSize: 32 },
  title:    { color: "#dfe1f6", fontSize: 22, fontWeight: "700" },
  sub:      { color: "#5c6b72", fontSize: 14 },
  btn:      { marginTop: 16, backgroundColor: "#00d2ff", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  btnText:  { color: "#003543", fontWeight: "700", fontSize: 15 },
});
