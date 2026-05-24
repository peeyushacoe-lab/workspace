import { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  TextInput, ActivityIndicator, Image, Modal, Platform, Switch,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../src/store/auth";
import { profileApi, type MobileProfile } from "../../src/api/inbox";
import { useBiometricLock } from "../../src/hooks/useBiometricLock";

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

interface NotifPrefs {
  newEmail: boolean;
  chatMessage: boolean;
  mentions: boolean;
  calendarReminders: boolean;
}

const DEFAULT_NOTIF: NotifPrefs = { newEmail: true, chatMessage: true, mentions: true, calendarReminders: true };
const NOTIF_KEY = "notifPrefs";

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", displayName: "", bio: "", statusEmoji: "", statusMessage: "" });
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF);
  const { enabled: lockEnabled, toggle: toggleLock } = useBiometricLock();

  useEffect(() => {
    profileApi.get().then(setProfile).catch(() => {});
    AsyncStorage.getItem(NOTIF_KEY).then(v => {
      if (v) setNotifPrefs({ ...DEFAULT_NOTIF, ...JSON.parse(v) as Partial<NotifPrefs> });
    });
  }, []);

  const saveNotifPref = async (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLockToggle = async (value: boolean) => {
    const ok = await toggleLock(value);
    if (!ok && value) {
      Alert.alert("Not Available", "Biometric authentication is not set up on this device.");
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
          <Text style={s.editBtn}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
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
        </View>

        {/* Security section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Security</Text>
          <View style={s.row}>
            <Text style={s.rowIcon}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>App Lock</Text>
              <Text style={s.rowSub}>Require biometrics on launch</Text>
            </View>
            <Switch
              value={lockEnabled}
              onValueChange={(v) => void handleLockToggle(v)}
              trackColor={{ false: "#1b1f2e", true: "rgba(0,210,255,0.4)" }}
              thumbColor={lockEnabled ? "#00d2ff" : "#5c6b72"}
            />
          </View>
        </View>

        {/* Notifications section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Notifications</Text>
          <SettingRow label="Notification Preferences" icon="🔔" onPress={() => setShowNotifPanel(true)} subtitle="Email, chat, mentions…" />
        </View>

        {/* Preferences section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Preferences</Text>
          <SettingRow label="Appearance" icon="🎨" />
          <SettingRow label="Language & Region" icon="🌐" />
          <SettingRow label="AI Preferences" icon="🤖" />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <SettingRow label="Nexus by CyberSage" icon="ℹ️" subtitle="v1.0-beta" />
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Notification Preferences Modal */}
      <Modal visible={showNotifPanel} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNotifPanel(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <View />
            <Text style={s.modalTitle}>Notifications</Text>
            <TouchableOpacity onPress={() => setShowNotifPanel(false)}>
              <Text style={s.save}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody}>
            <Text style={s.notifDesc}>Choose which push notifications you receive on this device.</Text>
            {([
              { key: "newEmail", label: "New Email", icon: "📧", sub: "When you receive a new message" },
              { key: "chatMessage", label: "Chat Messages", icon: "💬", sub: "New messages in channels" },
              { key: "mentions", label: "Mentions", icon: "@", sub: "When someone mentions you" },
              { key: "calendarReminders", label: "Calendar Reminders", icon: "📅", sub: "Event reminders" },
            ] as const).map(({ key, label, icon, sub }) => (
              <View key={key} style={s.notifRow}>
                <Text style={s.rowIcon}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>{label}</Text>
                  <Text style={s.rowSub}>{sub}</Text>
                </View>
                <Switch
                  value={notifPrefs[key]}
                  onValueChange={(v) => void saveNotifPref(key, v)}
                  trackColor={{ false: "#1b1f2e", true: "rgba(0,210,255,0.4)" }}
                  thumbColor={notifPrefs[key] ? "#00d2ff" : "#5c6b72"}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

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
            <TextInput style={s.input} value={draft.fullName} onChangeText={(v) => setDraft((d) => ({ ...d, fullName: v }))} placeholderTextColor="#5c6b72" color="#dfe1f6" />

            <Text style={s.fieldLabel}>Display Name</Text>
            <TextInput style={s.input} value={draft.displayName} onChangeText={(v) => setDraft((d) => ({ ...d, displayName: v }))} placeholder="How you appear to others" placeholderTextColor="#5c6b72" color="#dfe1f6" />

            <Text style={s.fieldLabel}>Bio</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
              value={draft.bio}
              onChangeText={(v) => setDraft((d) => ({ ...d, bio: v }))}
              placeholder="Tell people about yourself"
              placeholderTextColor="#5c6b72"
              color="#dfe1f6"
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
    <TouchableOpacity
      style={s.row}
      onPress={() => { void Haptics.selectionAsync(); onPress?.(); }}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={s.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {subtitle && <Text style={s.rowSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {onPress && <Text style={s.chevron}>›</Text>}
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
  notifRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  rowIcon:      { fontSize: 18, width: 30 },
  rowLabel:     { color: "#dfe1f6", fontSize: 15 },
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
  notifDesc:    { color: "#5c6b72", fontSize: 13, marginBottom: 20, lineHeight: 18 },
  fieldLabel:   { color: "#5c6b72", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 16 },
  input:        { backgroundColor: "#1b1f2e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  statusGrid:   { gap: 8 },
  statusChip:   { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: "#1b1f2e", borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  statusActive: { borderColor: "#00d2ff", backgroundColor: "rgba(0,210,255,0.1)" },
  statusChipText: { color: "#dfe1f6", fontSize: 14 },
  clearStatus:  { color: "#ff4d6d", fontSize: 13, marginTop: 12, textAlign: "center" },
});
