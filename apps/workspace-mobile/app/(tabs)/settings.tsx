import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { useAuthStore } from "../../src/store/auth";

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
      </View>
      <ScrollView>
        {/* Profile card */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.fullName?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
          <View>
            <Text style={s.name}>{user?.fullName}</Text>
            <Text style={s.email}>{user?.email}</Text>
            <Text style={s.role}>{user?.role}</Text>
          </View>
        </View>

        {/* Sections */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          <SettingRow label="Profile & Personal Info" icon="👤" />
          <SettingRow label="Security & MFA"          icon="🔒" />
          <SettingRow label="Notifications"           icon="🔔" />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Preferences</Text>
          <SettingRow label="Appearance"              icon="🎨" />
          <SettingRow label="Language & Region"       icon="🌐" />
          <SettingRow label="AI Preferences"          icon="🤖" />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <SettingRow label="CyberSage v1.0-beta"     icon="ℹ️" />
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SettingRow({ label, icon }: { label: string; icon: string }) {
  return (
    <TouchableOpacity style={s.row}>
      <Text style={s.rowIcon}>{icon}</Text>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: "#0f1321" },
  header:      { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:       { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, margin: 16, backgroundColor: "#1b1f2e", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  avatar:      { width: 56, height: 56, borderRadius: 28, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center" },
  avatarText:  { color: "#003543", fontWeight: "700", fontSize: 22 },
  name:        { color: "#dfe1f6", fontWeight: "700", fontSize: 16 },
  email:       { color: "#bbc9cf", fontSize: 13, marginTop: 1 },
  role:        { color: "#00d2ff", fontSize: 11, fontWeight: "600", marginTop: 2, textTransform: "uppercase" },
  section:     { marginTop: 20, marginHorizontal: 16 },
  sectionTitle:{ color: "#5c6b72", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  row:         { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  rowIcon:     { fontSize: 18, width: 30 },
  rowLabel:    { flex: 1, color: "#dfe1f6", fontSize: 15 },
  chevron:     { color: "#5c6b72", fontSize: 20 },
  logoutBtn:   { margin: 24, backgroundColor: "rgba(255,77,109,0.1)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,77,109,0.3)" },
  logoutText:  { color: "#ff4d6d", fontWeight: "700", fontSize: 15 },
});
