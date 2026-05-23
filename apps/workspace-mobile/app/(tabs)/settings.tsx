import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  TextInput, ActivityIndicator, Image, Modal, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../src/store/auth";
import { profileApi, type MobileProfile } from "../../src/api/inbox";

const STATUS_PRESETS = [
  { emoji: "🟢", label: "Available" },
  { emoji: "📅", label: "In a meeting" },
  { emoji: "🏠", label: "Working from home" },
  { emoji: "🔕", label: "Do not disturb" },
  { emoji: "✈️", label: "Out of office" },
  { emoji: "🎯", label: "Focused" },
  { emoji: "🏖️", label: "On vacation" },
  { emoji: "⏰", label: "Be right back" },
] as const;

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", displayName: "", bio: "", statusEmoji: "", statusMessage: "" });

  useEffect(() => {
    profileApi.get()
      .then(setProfile)
      .catch(() => {});
  }, []);

  const openEdit = () => {
    if (!profile) return;
    setDraft({
      fullName:      profile.fullName ?? "",
      displayName:   profile.displayName ?? "",
      bio:           profile.bio ?? "",
      statusEmoji:   profile.statusEmoji ?? "",
      statusMessage: profile.statusMessage ?? "",
    });
    setEditing(true);
  };

  const pickAvatar = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Allow photo access to change your avatar."); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
    try {
      const updated = await profileApi.update({ avatarUrl: dataUrl });
      setProfile((p) => p ? { ...p, avatarUrl: updated.avatarUrl } : p);
    } catch { Alert.alert("Error", "Failed to update avatar"); }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await profileApi.update({
        fullName:      draft.fullName || undefined,
        displayName:   draft.displayName || null,
        bio:           draft.bio || null,
        statusEmoji:   draft.statusEmoji || null,
        statusMessage: draft.statusMessage || null,
      });
      setProfile((p) => p ? { ...p, ...updated } : updated);
      setEditing(false);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  const displayProfile = profile ?? { fullName: user?.fullName, email: user?.email, role: user?.role, avatarUrl: null, statusEmoji: null, statusMessage: null };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
        <TouchableOpacity onPress={openEdit}>
          <Text style={s.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        {/* Profile card */}
        <View style={s.profileCard}>
          <TouchableOpacity onPress={pickAvatar} style={s.avatarWrap}>
            {displayProfile.avatarUrl ? (
              <Image source={{ uri: displayProfile.avatarUrl }} style={s.avatarImg} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>{displayProfile.fullName?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
            )}
            <View style={s.avatarEdit}><Text style={{ fontSize: 10 }}>📷</Text></View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{displayProfile.fullName}</Text>
            <Text style={s.email}>{displayProfile.email ?? user?.email}</Text>
            <Text style={s.role}>{displayProfile.role ?? user?.role}</Text>
            {(displayProfile.statusEmoji || displayProfile.statusMessage) && (
              <Text style={s.status}>{displayProfile.statusEmoji} {displayProfile.statusMessage}</Text>
            )}
          </View>
        </View>

        {/* Account section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          <SettingRow label="Profile & Bio" icon="👤" subtitle={profile?.bio?.slice(0, 40) ?? undefined} onPress={openEdit} />
          <SettingRow label="Security & MFA" icon="🔒" subtitle={profile ? (profile as MobileProfile & {mfaEnabled?: boolean}).mfaEnabled ? "MFA enabled" : undefined : undefined} />
          <SettingRow label="Notifications" icon="🔔" />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Preferences</Text>
          <SettingRow label="Appearance" icon="🎨" />
          <SettingRow label="Language & Region" icon="🌐" />
          <SettingRow label="AI Preferences" icon="🤖" />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <SettingRow label="CyberSage Workspace" icon="ℹ️" subtitle="v1.0-beta" />
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => void saveProfile()} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#00d2ff" size="small" />
                : <Text style={s.save}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Full Name</Text>
            <TextInput style={s.input} value={draft.fullName} onChangeText={(v) => setDraft((d) => ({ ...d, fullName: v }))} placeholderTextColor="#5c6b72" />

            <Text style={s.fieldLabel}>Display Name</Text>
            <TextInput style={s.input} value={draft.displayName} onChangeText={(v) => setDraft((d) => ({ ...d, displayName: v }))} placeholder="How you appear to others" placeholderTextColor="#5c6b72" />

            <Text style={s.fieldLabel}>Bio</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={draft.bio}
              onChangeText={(v) => setDraft((d) => ({ ...d, bio: v }))}
              placeholder="Tell people about yourself"
              placeholderTextColor="#5c6b72"
              multiline
            />

            <Text style={s.fieldLabel}>Status</Text>
            <View style={s.statusGrid}>
              {STATUS_PRESETS.map(({ emoji, label }) => {
                const active = draft.statusEmoji === emoji && draft.statusMessage === label;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[s.statusChip, active && s.statusActive]}
                    onPress={() => setDraft((d) => ({ ...d, statusEmoji: emoji, statusMessage: label }))}
                  >
                    <Text style={s.statusChipText}>{emoji} {label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {(draft.statusEmoji || draft.statusMessage) && (
              <TouchableOpacity onPress={() => setDraft((d) => ({ ...d, statusEmoji: "", statusMessage: "" }))}>
                <Text style={s.clearStatus}>Clear status</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function SettingRow({ label, icon, subtitle, onPress }: { label: string; icon: string; subtitle?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <Text style={s.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {subtitle && <Text style={s.rowSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: "#0f1321" },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:        { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  editBtn:      { color: "#00d2ff", fontSize: 15, fontWeight: "600" },
  profileCard:  { flexDirection: "row", alignItems: "center", gap: 14, margin: 16, backgroundColor: "#1b1f2e", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  avatarWrap:   { position: "relative" },
  avatarImg:    { width: 60, height: 60, borderRadius: 30 },
  avatar:       { width: 60, height: 60, borderRadius: 30, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center" },
  avatarText:   { color: "#003543", fontWeight: "700", fontSize: 24 },
  avatarEdit:   { position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: "#1b1f2e", borderWidth: 1, borderColor: "rgba(0,210,255,0.3)", alignItems: "center", justifyContent: "center" },
  name:         { color: "#dfe1f6", fontWeight: "700", fontSize: 16 },
  email:        { color: "#bbc9cf", fontSize: 13, marginTop: 1 },
  role:         { color: "#00d2ff", fontSize: 11, fontWeight: "600", marginTop: 2, textTransform: "uppercase" },
  status:       { color: "#bbc9cf", fontSize: 12, marginTop: 4 },
  section:      { marginTop: 20, marginHorizontal: 16 },
  sectionTitle: { color: "#5c6b72", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  row:          { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  rowIcon:      { fontSize: 18, width: 30 },
  rowLabel:     { flex: 1, color: "#dfe1f6", fontSize: 15 },
  rowSub:       { color: "#5c6b72", fontSize: 12, marginTop: 1 },
  chevron:      { color: "#5c6b72", fontSize: 20 },
  logoutBtn:    { margin: 24, backgroundColor: "rgba(255,77,109,0.1)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,77,109,0.3)" },
  logoutText:   { color: "#ff4d6d", fontWeight: "700", fontSize: 15 },
  // Modal
  modal:        { flex: 1, backgroundColor: "#0f1321" },
  modalHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  modalTitle:   { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  cancel:       { color: "#bbc9cf", fontSize: 15 },
  save:         { color: "#00d2ff", fontSize: 15, fontWeight: "700" },
  modalBody:    { padding: 20 },
  fieldLabel:   { color: "#5c6b72", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 16 },
  input:        { backgroundColor: "#1b1f2e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: "#dfe1f6", fontSize: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  statusGrid:   { gap: 8 },
  statusChip:   { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: "#1b1f2e", borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  statusActive: { borderColor: "#00d2ff", backgroundColor: "rgba(0,210,255,0.1)" },
  statusChipText: { color: "#dfe1f6", fontSize: 14 },
  clearStatus:  { color: "#ff4d6d", fontSize: 13, marginTop: 12, textAlign: "center" },
});
