import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  Image, TextInput, ActivityIndicator, Alert, Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { apiRequest } from "../api/client";
import { profileApi, type MobileProfile } from "../api/inbox";
import { useAuthStore } from "../store/auth";

const ACCOUNTS_KEY = "cs_saved_accounts";

export interface SavedAccount {
  id: string;
  fullName: string;
  email: string;
  role: string;
  orgName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
}

type PresenceStatus = "ONLINE" | "AWAY" | "BUSY" | "INVISIBLE" | "OFFLINE";

const PRESENCE_OPTIONS: { status: PresenceStatus; label: string; color: string; icon: string }[] = [
  { status: "ONLINE",    label: "Active",          color: "#22c55e", icon: "●" },
  { status: "AWAY",      label: "Away",            color: "#f59e0b", icon: "●" },
  { status: "BUSY",      label: "Do not disturb",  color: "#ef4444", icon: "⊘" },
  { status: "INVISIBLE", label: "Appear offline",  color: "#5c6b72", icon: "○" },
  { status: "OFFLINE",   label: "Set offline",     color: "#5c6b72", icon: "✕" },
];

const WORK_LOCATIONS = [
  { value: "in_office", label: "In the office",   icon: "🏢" },
  { value: "remote",    label: "Working remotely", icon: "🏠" },
  { value: "traveling", label: "Traveling",        icon: "✈️" },
  { value: "off",       label: "Off",              icon: "🌙" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface PresenceData {
  status: PresenceStatus;
  statusMessage: string | null;
  lastSeenAt: string | null;
  workLocation: string | null;
}

function PresenceDotView({ status, size = 10 }: { status: PresenceStatus; size?: number }) {
  const opt = PRESENCE_OPTIONS.find(o => o.status === status) ?? PRESENCE_OPTIONS[4];
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: opt.color,
      borderWidth: 1.5, borderColor: "#0f1321",
    }} />
  );
}

function Avatar({ profile, size = 56 }: { profile: MobileProfile | null; size?: number }) {
  if (!profile) return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#1b1f2e" }} />;
  const name = profile.displayName ?? profile.fullName;
  if (profile.avatarUrl) {
    return <Image source={{ uri: profile.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const colors = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706"];
  const bg = colors[(name.charCodeAt(0) ?? 0) % colors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.38 }}>
        {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

export function ProfileSidebar({ visible, onClose }: Props) {
  const { logout } = useAuthStore();
  const router = useRouter();

  const [profile, setProfile] = useState<MobileProfile | null>(null);
  const [presence, setPresence] = useState<PresenceData>({ status: "ONLINE", statusMessage: null, lastSeenAt: null, workLocation: null });
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [editStatus, setEditStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, pres, accs, notifPrefs] = await Promise.all([
        profileApi.get(),
        apiRequest<PresenceData>("/api/mobile/presence"),
        AsyncStorage.getItem(ACCOUNTS_KEY).then(v => v ? JSON.parse(v) as SavedAccount[] : []),
        apiRequest<{ dndEnabled: boolean }>("/api/mobile/preferences/notifications"),
      ]);
      setProfile(p);
      setPresence(pres);
      setAccounts(accs);
      setDndEnabled(notifPrefs.dndEnabled);
    } catch {}
  }, []);

  const toggleDnd = async (value: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDndEnabled(value);
    try {
      await apiRequest("/api/mobile/preferences/notifications", {
        method: "PUT",
        body: JSON.stringify({ dndEnabled: value }),
      });
    } catch {
      setDndEnabled(!value);
    }
  };

  useEffect(() => { if (visible) void load(); }, [visible, load]);

  const setStatus = async (status: PresenceStatus) => {
    void Haptics.selectionAsync();
    setSaving(true);
    try {
      await apiRequest("/api/mobile/presence", { method: "PUT", body: JSON.stringify({ status }) });
      setPresence(p => ({ ...p, status }));
    } catch {}
    setSaving(false);
  };

  const saveStatusMessage = async () => {
    setSaving(true);
    try {
      await apiRequest("/api/mobile/presence", {
        method: "PUT",
        body: JSON.stringify({ statusMessage: statusDraft.trim() || null }),
      });
      setPresence(p => ({ ...p, statusMessage: statusDraft.trim() || null }));
    } catch {}
    setSaving(false);
    setEditStatus(false);
  };

  const setWorkLocation = async (loc: string) => {
    void Haptics.selectionAsync();
    try {
      await apiRequest("/api/mobile/presence", { method: "PUT", body: JSON.stringify({ workLocation: loc === presence.workLocation ? null : loc }) });
      setPresence(p => ({ ...p, workLocation: p.workLocation === loc ? null : loc }));
    } catch {}
  };

  const currentPresenceOpt = PRESENCE_OPTIONS.find(o => o.status === presence.status) ?? PRESENCE_OPTIONS[4];
  const currentWorkLoc = WORK_LOCATIONS.find(w => w.value === presence.workLocation);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.sheet}>
        {/* Handle */}
        <View style={s.handleBar}><View style={s.handle} /></View>

        {/* Profile hero */}
        <TouchableOpacity
          style={s.hero}
          onPress={() => { onClose(); router.push("/(tabs)/settings"); }}
          activeOpacity={0.8}
        >
          <View style={s.avatarWrap}>
            <Avatar profile={profile} size={56} />
            <View style={s.presenceBadge}>
              <PresenceDotView status={presence.status} size={12} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroName}>{profile?.displayName ?? profile?.fullName ?? "…"}</Text>
            <Text style={s.heroTitle}>{profile?.jobTitle ?? profile?.role ?? ""}</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* Presence status */}
          <View style={s.section}>
            {PRESENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.status}
                style={s.menuRow}
                onPress={() => void setStatus(opt.status)}
              >
                <Text style={[s.presenceDot, { color: opt.color }]}>{opt.icon}</Text>
                <Text style={s.menuLabel}>{opt.label}</Text>
                {presence.status === opt.status && (
                  saving ? <ActivityIndicator size="small" color="#00d2ff" /> : <Text style={s.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Work location */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Work location</Text>
            {WORK_LOCATIONS.map(loc => (
              <TouchableOpacity
                key={loc.value}
                style={s.menuRow}
                onPress={() => void setWorkLocation(loc.value)}
              >
                <Text style={s.menuIcon}>{loc.icon}</Text>
                <Text style={s.menuLabel}>{loc.label}</Text>
                {presence.workLocation === loc.value && <Text style={s.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          {/* Status message */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Status message</Text>
            {editStatus ? (
              <View style={s.statusEditRow}>
                <TextInput
                  style={s.statusInput}
                  value={statusDraft}
                  onChangeText={setStatusDraft}
                  placeholder="What's on your mind?"
                  placeholderTextColor="#5c6b72"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => void saveStatusMessage()}
                />
                <TouchableOpacity onPress={() => void saveStatusMessage()} disabled={saving}>
                  <Text style={s.saveText}>{saving ? "…" : "Set"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={s.menuRow}
                onPress={() => { setStatusDraft(presence.statusMessage ?? ""); setEditStatus(true); void Haptics.selectionAsync(); }}
              >
                <Text style={s.menuIcon}>✏️</Text>
                <Text style={[s.menuLabel, !presence.statusMessage && { color: "#5c6b72" }]}>
                  {presence.statusMessage ?? "Set a status message…"}
                </Text>
              </TouchableOpacity>
            )}
            {presence.statusMessage && !editStatus && (
              <TouchableOpacity
                style={s.menuRow}
                onPress={async () => {
                  await apiRequest("/api/mobile/presence", { method: "PUT", body: JSON.stringify({ statusMessage: null }) });
                  setPresence(p => ({ ...p, statusMessage: null }));
                }}
              >
                <Text style={s.menuIcon}>✕</Text>
                <Text style={[s.menuLabel, { color: "#ff4d6d" }]}>Clear status</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Accounts & Orgs */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Accounts and orgs</Text>

            {/* Current account */}
            {profile && (
              <View style={[s.accountRow, s.accountRowActive]}>
                <Avatar profile={profile} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.accountName}>{profile.fullName}</Text>
                  <Text style={s.accountEmail}>{profile.email}</Text>
                </View>
                <Text style={{ color: "#00d2ff", fontSize: 16 }}>✓</Text>
              </View>
            )}

            {/* Saved accounts */}
            {accounts.map(acc => (
              <TouchableOpacity
                key={acc.id}
                style={s.accountRow}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Alert.alert("Switch Account", `Switch to ${acc.email}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Switch", onPress: () => { /* TODO: token swap */ onClose(); } },
                  ]);
                }}
              >
                <View style={s.accountIconBox}>
                  <Text style={s.accountIconText}>{acc.orgName[0]?.toUpperCase() ?? "?"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.accountName}>{acc.orgName}</Text>
                  <Text style={s.accountEmail}>{acc.email}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={s.menuRow}
              onPress={() => { void Haptics.selectionAsync(); Alert.alert("Add Account", "Multi-account support coming soon."); }}
            >
              <View style={s.addAccountIcon}><Text style={{ color: "#00d2ff", fontSize: 18 }}>+</Text></View>
              <Text style={s.menuLabel}>Add account</Text>
            </TouchableOpacity>
          </View>

          {/* Notifications + Settings quick links */}
          <View style={s.section}>
            <View style={s.menuRow}>
              <Text style={s.menuIcon}>{dndEnabled ? "🔕" : "🔔"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.menuLabel}>Do Not Disturb</Text>
                {dndEnabled && <Text style={{ color: "#5c6b72", fontSize: 11 }}>Urgent messages still notify you</Text>}
              </View>
              <Switch
                value={dndEnabled}
                onValueChange={toggleDnd}
                trackColor={{ false: "#2a3040", true: "rgba(0,210,255,0.4)" }}
                thumbColor={dndEnabled ? "#00d2ff" : "#5c6b72"}
                ios_backgroundColor="#2a3040"
              />
            </View>
            <TouchableOpacity style={s.menuRow} onPress={() => { onClose(); router.push("/(tabs)/settings"); }}>
              <Text style={s.menuIcon}>⚙️</Text>
              <Text style={s.menuLabel}>Settings</Text>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.menuRow}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert("Sign Out", "Are you sure?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: () => { onClose(); void logout(); } },
                ]);
              }}
            >
              <Text style={s.menuIcon}>🚪</Text>
              <Text style={[s.menuLabel, { color: "#ff4d6d" }]}>Sign out</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export function PresenceDot({ status, size = 10 }: { status: PresenceStatus; size?: number }) {
  return <PresenceDotView status={status} size={size} />;
}

const s = StyleSheet.create({
  sheet:          { flex: 1, backgroundColor: "#0f1321" },
  handleBar:      { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.12)" },
  hero:           { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  avatarWrap:     { position: "relative" },
  presenceBadge:  { position: "absolute", bottom: 0, right: 0, backgroundColor: "#0f1321", borderRadius: 8, padding: 1 },
  heroName:       { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  heroTitle:      { color: "#5c6b72", fontSize: 13, marginTop: 2 },
  chevron:        { color: "#5c6b72", fontSize: 20 },
  section:        { marginTop: 8, paddingHorizontal: 20, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)" },
  sectionTitle:   { color: "#5c6b72", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingTop: 14, paddingBottom: 4 },
  menuRow:        { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  presenceDot:    { fontSize: 14, width: 22, textAlign: "center" },
  menuIcon:       { fontSize: 18, width: 22, textAlign: "center" },
  menuLabel:      { flex: 1, color: "#dfe1f6", fontSize: 15 },
  checkmark:      { color: "#00d2ff", fontSize: 16, fontWeight: "700" },
  statusEditRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  statusInput:    { flex: 1, backgroundColor: "#1b1f2e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#dfe1f6", fontSize: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.15)" },
  saveText:       { color: "#00d2ff", fontWeight: "700", fontSize: 15 },
  accountRow:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  accountRowActive: {},
  accountIconBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#1b1f2e", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  accountIconText: { color: "#00d2ff", fontWeight: "700", fontSize: 15 },
  accountName:    { color: "#dfe1f6", fontSize: 14, fontWeight: "600" },
  accountEmail:   { color: "#5c6b72", fontSize: 12, marginTop: 1 },
  addAccountIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: "rgba(0,210,255,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.18)" },
});
