import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuthStore } from "../../src/store/auth";

export default function MfaApproveScreen() {
  const router = useRouter();
  const { token, baseUrl } = useAuthStore();
  const params = useLocalSearchParams<{
    challengeId: string;
    number: string;
    options: string; // JSON-encoded number[]
  }>();

  const challengeId = params.challengeId;
  const correctNumber = Number(params.number);
  const options: number[] = params.options ? JSON.parse(params.options) as number[] : [];

  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);

  // Auto-close after result
  useEffect(() => {
    if (result) {
      const t = setTimeout(() => router.replace("/(tabs)"), 2000);
      return () => clearTimeout(t);
    }
  }, [result, router]);

  const respond = async (selectedNumber: number | null, deny = false) => {
    if (loading) return;
    setLoading(true);
    if (selectedNumber !== null) setSelected(selectedNumber);

    try {
      const API = baseUrl ?? "https://nexus.cybersage.uk";
      const res = await fetch(`${API}/api/auth/mfa/push-approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify(
          deny
            ? { challengeId, action: "deny" }
            : { challengeId, selectedNumber },
        ),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (data.result === "approved") {
        setResult("approved");
      } else {
        setResult("denied");
      }
    } catch {
      Alert.alert("Error", "Could not reach Nexus. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  if (!challengeId || options.length === 0) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.errorText}>Invalid sign-in request.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.card}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.brand}>Nexus</Text>
          <Text style={s.title}>Approve sign-in?</Text>
          <Text style={s.subtitle}>
            Tap the number that matches what&apos;s shown on the sign-in screen.
          </Text>
        </View>

        {result === null ? (
          <>
            {/* Number options */}
            <View style={s.optionsRow}>
              {options.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    s.optionBtn,
                    selected === n && s.optionBtnSelected,
                  ]}
                  onPress={() => void respond(n)}
                  disabled={loading}
                  activeOpacity={0.75}
                >
                  {loading && selected === n ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[s.optionText, selected === n && s.optionTextSelected]}>
                      {n}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Deny */}
            <TouchableOpacity
              style={s.denyBtn}
              onPress={() => void respond(null, true)}
              disabled={loading}
            >
              <Text style={s.denyText}>I didn&apos;t request this — Deny</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Result */
          <View style={s.resultContainer}>
            <Text style={result === "approved" ? s.resultApproved : s.resultDenied}>
              {result === "approved" ? "✓ Approved" : "✗ Denied"}
            </Text>
            <Text style={s.resultSub}>
              {result === "approved"
                ? "You are now signed in."
                : "Sign-in request was blocked."}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  brand: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a56db",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#202124",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#5f6368",
    textAlign: "center",
    lineHeight: 20,
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },
  optionBtn: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "#e8f0fe",
    alignItems: "center",
    justifyContent: "center",
  },
  optionBtnSelected: {
    backgroundColor: "#1a56db",
  },
  optionText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1a56db",
  },
  optionTextSelected: {
    color: "#ffffff",
  },
  denyBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  denyText: {
    fontSize: 14,
    color: "#ea4335",
    fontWeight: "500",
  },
  resultContainer: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  resultApproved: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f9d58",
  },
  resultDenied: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ea4335",
  },
  resultSub: {
    fontSize: 14,
    color: "#5f6368",
  },
  errorText: {
    color: "#ea4335",
    fontSize: 15,
  },
});
