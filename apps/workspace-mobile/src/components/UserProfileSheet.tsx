import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, Linking,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { usersApi, type WorkspaceUser } from "../api/inbox";
import * as Haptics from "expo-haptics";

function formatLastSeen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 2) return "Active now";
  if (m < 60) return `Active ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Active ${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Active yesterday";
  return `Last seen ${new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

const PRESENCE_COLORS: Record<string, string> = {
  ONLINE: "#22c55e", AWAY: "#f59e0b", BUSY: "#ef4444",
  INVISIBLE: "#5c6b72", OFFLINE: "#5c6b72",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", CEO: "CEO", CISO: "CISO", COO: "COO",
  R_AND_D: "R&D Head", OPS_MANAGER: "Ops Manager",
  DEVELOPER: "Developer", CYBER_SECURITY: "Cyber Security",
  QA: "QA Engineer", MARKETING: "Marketing",
  RESEARCH: "Research", FINANCE: "Finance",
  OPERATIONS: "Operations", SUPPORT: "Support",
};

function Avatar({ user, size = 72 }: { user: WorkspaceUser; size?: number }) {
  const name = user.displayName ?? user.fullName;
  const initials = name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  const colors = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb"];
  const color = colors[(name.charCodeAt(0) ?? 0) % colors.length];

  if (user.avatarUrl) {
    return <Image source={{ uri: user.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.36 }}>{initials || "?"}</Text>
    </View>
  );
}

interface Props {
  /** Pass userId OR email — sheet resolves either */
  userId?: string | null;
  email?: string | null;
  onClose: () => void;
  onCompose?: (email: string) => void;
}

export function UserProfileSheet({ userId, email, onClose, onCompose }: Props) {
  const visible = !!(userId || email);

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["userProfile", userId ?? email],
    queryFn: () =>
      userId ? usersApi.getProfile(userId) : usersApi.getByEmail(email!),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  const roleLabel = profile
    ? (profile.customRole ?? ROLE_LABELS[profile.role] ?? profile.role)
    : "";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.sheet}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.handle} />
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={s.center}>
            <ActivityIndicator color="#00d2ff" size="large" />
          </View>
        )}

        {isError && (
          <View style={s.center}>
            <Text style={s.errorText}>Could not load profile</Text>
          </View>
        )}

        {profile && !isLoading && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Avatar + name */}
            <View style={s.heroSection}>
              <View style={{ position: "relative" }}>
                <Avatar user={profile} size={88} />
                {profile.presence && (
                  <View style={[s.presenceBadge, { backgroundColor: PRESENCE_COLORS[profile.presence.status] ?? "#5c6b72" }]} />
                )}
              </View>
              <View style={s.heroInfo}>
                <Text style={s.name}>{profile.displayName ?? profile.fullName}</Text>
                {profile.pronouns && (
                  <Text style={s.pronouns}>({profile.pronouns})</Text>
                )}
                {(profile.statusEmoji || profile.statusMessage) && (
                  <Text style={s.status}>{profile.statusEmoji} {profile.statusMessage}</Text>
                )}
                <View style={s.roleRow}>
                  <View style={s.roleBadge}>
                    <Text style={s.roleText}>{roleLabel}</Text>
                  </View>
                  {profile.jobTitle && (
                    <Text style={s.jobTitle} numberOfLines={1}>{profile.jobTitle}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Last seen */}
            {profile.presence && (
              <View style={s.lastSeenRow}>
                <View style={[s.lastSeenDot, { backgroundColor: PRESENCE_COLORS[profile.presence.status] ?? "#5c6b72" }]} />
                <Text style={s.lastSeenText}>
                  {formatLastSeen(profile.presence.lastSeenAt) ?? "Offline"}
                </Text>
              </View>
            )}

            {/* Bio */}
            {profile.bio ? (
              <View style={s.bioSection}>
                <Text style={s.bio}>{profile.bio}</Text>
              </View>
            ) : null}

            {/* Info rows */}
            <View style={s.infoCard}>
              <InfoRow label="Email" value={profile.email} icon="✉️" />
              {profile.department && <InfoRow label="Department" value={profile.department} icon="🏢" />}
              {profile.location && <InfoRow label="Location" value={profile.location} icon="📍" />}
              {profile.jobTitle && <InfoRow label="Title" value={profile.jobTitle} icon="💼" />}
            </View>

            {/* Actions */}
            <View style={s.actions}>
              <TouchableOpacity
                style={s.composeBtn}
                onPress={() => { onCompose?.(profile.email); onClose(); }}
              >
                <Text style={s.composeBtnText}>✉️  Send Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.copyBtn}
                onPress={() => void Linking.openURL(`mailto:${profile.email}`)}
              >
                <Text style={s.copyBtnText}>Open in Mail App</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet:        { flex: 1, backgroundColor: "#0f1321" },
  header:       { alignItems: "center", paddingTop: 12, paddingBottom: 8, position: "relative" },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", marginBottom: 8 },
  closeBtn:     { position: "absolute", right: 16, top: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: "#9ca3af", fontSize: 12, fontWeight: "600" },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  errorText:    { color: "#ff4d6d", fontSize: 14 },
  heroSection:  { flexDirection: "row", alignItems: "flex-start", padding: 24, gap: 18 },
  heroInfo:     { flex: 1 },
  name:         { color: "#f1f5f9", fontSize: 22, fontWeight: "800", marginBottom: 2 },
  pronouns:     { color: "#5c6b72", fontSize: 12, marginBottom: 4 },
  status:       { color: "#bbc9cf", fontSize: 13, marginBottom: 8 },
  presenceBadge:{ position: "absolute", bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#0f1321" },
  lastSeenRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 24, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#1b1f2e", borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,210,255,0.06)" },
  lastSeenDot:  { width: 8, height: 8, borderRadius: 4 },
  lastSeenText: { color: "#bbc9cf", fontSize: 13 },
  roleRow:      { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  roleBadge:    { backgroundColor: "rgba(0,210,255,0.12)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(0,210,255,0.25)" },
  roleText:     { color: "#00d2ff", fontSize: 11, fontWeight: "700" },
  jobTitle:     { color: "#bbc9cf", fontSize: 13, flex: 1 },
  bioSection:   { marginHorizontal: 24, marginBottom: 16, padding: 16, backgroundColor: "#1b1f2e", borderRadius: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.06)" },
  bio:          { color: "#bbc9cf", fontSize: 14, lineHeight: 22 },
  infoCard:     { marginHorizontal: 24, marginBottom: 24, backgroundColor: "#1b1f2e", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,210,255,0.06)" },
  infoRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)", gap: 12 },
  infoIcon:     { fontSize: 16 },
  infoLabel:    { color: "#5c6b72", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  infoValue:    { color: "#dfe1f6", fontSize: 14 },
  actions:      { marginHorizontal: 24, gap: 12, paddingBottom: 40 },
  composeBtn:   { backgroundColor: "#00d2ff", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  composeBtnText:{ color: "#003543", fontWeight: "800", fontSize: 15 },
  copyBtn:      { backgroundColor: "rgba(0,210,255,0.08)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.2)" },
  copyBtnText:  { color: "#00d2ff", fontWeight: "600", fontSize: 14 },
});
