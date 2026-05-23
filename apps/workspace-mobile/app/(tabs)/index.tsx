"use client";
import { useCallback, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  RefreshControl, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { inboxApi, type Thread } from "../../src/api/inbox";

function InitialAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const colors = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors[idx],
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.38 }}>
        {name[0]?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
}

function ThreadRow({ item, onPress }: { item: Thread; onPress: () => void }) {
  const isUnread = item.unreadCount > 0;
  const senderName = item.lastMessage?.from
    ? item.lastMessage.from.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Unknown";
  const date = item.lastMessage
    ? formatDate(item.lastMessage.receivedAt)
    : formatDate(item.createdAt);

  return (
    <TouchableOpacity
      style={[s.row, isUnread && s.rowUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <InitialAvatar name={senderName} />
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={[s.sender, isUnread && s.senderBold]} numberOfLines={1}>{senderName}</Text>
          <Text style={s.date}>{date}</Text>
        </View>
        <Text style={[s.subject, isUnread && s.subjectBold]} numberOfLines={1}>{item.subject}</Text>
        <Text style={s.snippet} numberOfLines={1}>{item.lastMessage?.snippet ?? ""}</Text>
      </View>
      {isUnread && <View style={s.dot} />}
    </TouchableOpacity>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function InboxScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [query, setQ] = useState("");
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState("");
  const [sub, setSub] = useState("");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: threads, isLoading, refetch } = useQuery({
    queryKey: ["inbox", query],
    queryFn: () => inboxApi.list(query ? { q: query } : undefined),
  });

  const sendMutation = useMutation({
    mutationFn: () => inboxApi.compose({ to, subject: sub, body }),
    onSuccess: () => {
      setComposing(false); setTo(""); setSub(""); setBody(""); setSendError(null);
      void qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e) => setSendError(e instanceof Error ? e.message : "Failed to send"),
  });

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>Nexus</Text>
          <Text style={s.title}>Inbox</Text>
        </View>
        <TouchableOpacity style={s.composeBtn} onPress={() => setComposing(true)} activeOpacity={0.8}>
          <Text style={s.composeBtnText}>+ Compose</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.search}
          placeholder="Search mail…"
          placeholderTextColor="#5c6b72"
          value={query}
          onChangeText={setQ}
        />
      </View>

      {/* Thread list */}
      {isLoading
        ? <ActivityIndicator color="#00d2ff" style={{ marginTop: 60 }} size="large" />
        : (
          <FlatList
            data={threads ?? []}
            keyExtractor={t => t.id}
            renderItem={({ item }) => (
              <ThreadRow item={item} onPress={() => router.push(`/thread/${item.id}`)} />
            )}
            refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#00d2ff" />}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={s.emptyIcon}>📭</Text>
                <Text style={s.empty}>No messages</Text>
              </View>
            }
            contentContainerStyle={threads?.length === 0 ? { flex: 1 } : undefined}
          />
        )
      }

      {/* Compose Modal */}
      <Modal visible={composing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposing(false)}>
        <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { setComposing(false); setSendError(null); }}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>New Message</Text>
            <TouchableOpacity
              onPress={() => !sendMutation.isPending && to.trim() && sub.trim() && body.trim() && sendMutation.mutate()}
              disabled={sendMutation.isPending || !to.trim() || !sub.trim() || !body.trim()}
            >
              {sendMutation.isPending
                ? <ActivityIndicator color="#00d2ff" size="small" />
                : <Text style={[s.sendBtn, (!to.trim() || !sub.trim() || !body.trim()) && s.sendBtnDisabled]}>Send</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {sendError && (
              <View style={s.errorBanner}>
                <Text style={s.errorText}>{sendError}</Text>
              </View>
            )}
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>To</Text>
              <TextInput
                style={s.fieldInput}
                value={to}
                onChangeText={setTo}
                placeholder="recipient@cybersage.uk"
                placeholderTextColor="#5c6b72"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View style={s.divider} />
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>Subject</Text>
              <TextInput
                style={s.fieldInput}
                value={sub}
                onChangeText={setSub}
                placeholder="Subject"
                placeholderTextColor="#5c6b72"
              />
            </View>
            <View style={s.divider} />
            <TextInput
              style={s.bodyInput}
              value={body}
              onChangeText={setBody}
              placeholder="Write your message…"
              placeholderTextColor="#5c6b72"
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: "#0f1321" },
  header:        { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14 },
  eyebrow:       { fontSize: 11, fontWeight: "700", color: "#00d2ff", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 },
  title:         { fontSize: 28, fontWeight: "800", color: "#dfe1f6", letterSpacing: -0.5 },
  composeBtn:    { backgroundColor: "#00d2ff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  composeBtnText:{ color: "#003543", fontSize: 13, fontWeight: "700" },
  searchWrap:    { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  searchIcon:    { fontSize: 14, marginRight: 8 },
  search:        { flex: 1, paddingVertical: 11, color: "#dfe1f6", fontSize: 14 },
  row:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)" },
  rowUnread:     { backgroundColor: "rgba(0,210,255,0.03)" },
  rowBody:       { flex: 1, minWidth: 0 },
  rowTop:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  sender:        { color: "#bbc9cf", fontSize: 14, flex: 1, marginRight: 8 },
  senderBold:    { color: "#dfe1f6", fontWeight: "700" },
  date:          { color: "#5c6b72", fontSize: 11 },
  subject:       { color: "#dfe1f6", fontSize: 13, marginBottom: 2 },
  subjectBold:   { fontWeight: "700" },
  snippet:       { color: "#5c6b72", fontSize: 12 },
  dot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: "#00d2ff", flexShrink: 0 },
  emptyWrap:     { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  empty:         { color: "#5c6b72", fontSize: 15 },
  // Modal
  modal:         { flex: 1, backgroundColor: "#0f1321" },
  modalHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  modalTitle:    { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  cancelBtn:     { color: "#bbc9cf", fontSize: 15 },
  sendBtn:       { color: "#00d2ff", fontSize: 15, fontWeight: "700" },
  sendBtnDisabled:{ color: "#3c494e" },
  modalBody:     { flex: 1 },
  errorBanner:   { margin: 16, padding: 12, backgroundColor: "rgba(255,77,109,0.1)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,109,0.3)" },
  errorText:     { color: "#ff4d6d", fontSize: 13 },
  fieldRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 4 },
  fieldLabel:    { color: "#5c6b72", fontSize: 13, fontWeight: "600", width: 60 },
  fieldInput:    { flex: 1, color: "#dfe1f6", fontSize: 15, paddingVertical: 12 },
  divider:       { height: 1, backgroundColor: "rgba(0,210,255,0.06)", marginHorizontal: 16 },
  bodyInput:     { color: "#dfe1f6", fontSize: 15, padding: 16, minHeight: 300, lineHeight: 22 },
});
