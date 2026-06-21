import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { apiRequest } from "../../src/api/client";

const JITSI_DOMAIN = process.env.EXPO_PUBLIC_JITSI_DOMAIN ?? "meet.jit.si";

// Incoming-call screen. Opened from a push notification (see app/_layout.tsx).
// Accept opens the Jitsi room; decline notifies the caller.
export default function IncomingCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    callId: string;
    roomName?: string;
    media?: string;
    callerName?: string;
  }>();
  const [busy, setBusy] = useState(false);

  const callId = params.callId;
  const roomName = typeof params.roomName === "string" ? params.roomName : "";
  const isVideo = params.media === "video";
  const callerName = typeof params.callerName === "string" ? params.callerName : "Someone";

  const signal = async (action: "accept" | "decline") => {
    try {
      await apiRequest("/api/mobile/chat/call/signal", {
        method: "POST",
        body: JSON.stringify({ callId, action }),
      });
    } catch {
      // Best-effort — still let the user proceed/leave.
    }
  };

  const onAccept = async () => {
    if (busy) return;
    setBusy(true);
    await signal("accept");
    if (roomName) void Linking.openURL(`https://${JITSI_DOMAIN}/${roomName}`);
    router.back();
  };

  const onDecline = async () => {
    if (busy) return;
    setBusy(true);
    await signal("decline");
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.body}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{callerName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{callerName}</Text>
        <Text style={styles.subtitle}>
          {`Incoming ${isVideo ? "video" : "voice"} call`}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.decline]}
          onPress={() => void onDecline()}
          disabled={busy}
        >
          <Text style={styles.btnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.accept]}
          onPress={() => void onAccept()}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1321", paddingVertical: 64 },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1a56db",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  avatarText: { color: "#fff", fontSize: 40, fontWeight: "600" },
  name: { color: "#fff", fontSize: 24, fontWeight: "600" },
  subtitle: { color: "#9aa0a6", fontSize: 15, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "space-evenly", paddingHorizontal: 24 },
  btn: {
    flex: 1,
    marginHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  accept: { backgroundColor: "#0f9d58" },
  decline: { backgroundColor: "#ea4335" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
