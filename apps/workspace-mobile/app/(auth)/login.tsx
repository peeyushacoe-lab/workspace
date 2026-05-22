import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from "react-native";
import { useAuthStore } from "../../src/store/auth";

export default function LoginScreen() {
  const { login } = useAuthStore();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      if (result.mfaRequired) {
        Alert.alert("MFA Required", "TOTP verification coming soon.");
      }
    } catch (e) {
      Alert.alert("Login failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.card}>
        {/* Logo / Brand */}
        <Text style={s.brand}>CyberSage</Text>
        <Text style={s.subtitle}>Workspace</Text>

        <TextInput
          style={s.input}
          placeholder="work@cybersage.uk"
          placeholderTextColor="#5c6b72"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={s.input}
          placeholder="Password"
          placeholderTextColor="#5c6b72"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity style={s.btn} onPress={() => void handleLogin()} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#003543" />
            : <Text style={s.btnText}>Sign In</Text>
          }
        </TouchableOpacity>

        <Text style={s.hint}>Sign in with your CyberSage work account.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1321", justifyContent: "center", padding: 24 },
  card:      { backgroundColor: "#1b1f2e", borderRadius: 16, padding: 28, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  brand:     { fontSize: 28, fontWeight: "800", color: "#00d2ff", textAlign: "center", letterSpacing: 1 },
  subtitle:  { fontSize: 14, color: "#bbc9cf", textAlign: "center", marginBottom: 28 },
  input:     { backgroundColor: "#0f1321", borderWidth: 1, borderColor: "rgba(0,210,255,0.15)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#dfe1f6", marginBottom: 14, fontSize: 15 },
  btn:       { backgroundColor: "#00d2ff", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnText:   { color: "#003543", fontWeight: "700", fontSize: 16 },
  hint:      { color: "#5c6b72", fontSize: 12, textAlign: "center", marginTop: 16 },
});
