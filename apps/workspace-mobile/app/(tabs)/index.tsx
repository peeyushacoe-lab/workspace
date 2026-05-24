"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  RefreshControl, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, ScrollView, Image,
  PanResponder, Animated,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { inboxApi, draftApi, type Thread } from "../../src/api/inbox";

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

function ThreadRow({ item, onPress, onArchive }: { item: Thread; onPress: () => void; onArchive: () => void }) {
  const isUnread = item.unreadCount > 0;
  const senderName = item.lastMessage?.from
    ? item.lastMessage.from.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Unknown";
  const date = item.lastMessage
    ? formatDate(item.lastMessage.receivedAt)
    : formatDate(item.createdAt);

  const translateX = useRef(new Animated.Value(0)).current;
  const ARCHIVE_THRESHOLD = -80;

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
    onPanResponderMove: (_, g) => {
      if (g.dx < 0) translateX.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx < ARCHIVE_THRESHOLD) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.timing(translateX, { toValue: -400, duration: 250, useNativeDriver: true }).start(onArchive);
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  return (
    <View style={s.swipeContainer}>
      {/* Archive reveal */}
      <View style={s.archiveReveal}>
        <Text style={s.archiveLabel}>Archive</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={[s.row, isUnread && s.rowUnread]}
          onPress={() => { void Haptics.selectionAsync(); onPress(); }}
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
      </Animated.View>
    </View>
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

interface Attachment {
  uri: string;
  base64: string;
  name: string;
  mimeType: string;
}

export default function InboxScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [query, setQ] = useState("");
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState("");
  const [sub, setSub] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: threads, isLoading, refetch } = useQuery({
    queryKey: ["inbox", query],
    queryFn: () => inboxApi.list(query ? { q: query } : undefined),
  });

  // Load draft when compose opens
  useEffect(() => {
    if (!composing) return;
    draftApi.load().then(draft => {
      if (draft) {
        setTo(draft.to ?? "");
        setSub(draft.subject ?? "");
        setBody(draft.body ?? "");
      }
    }).catch(() => {});
  }, [composing]);

  // Auto-save draft after 1.5s of inactivity
  const scheduleDraftSave = useCallback((newTo: string, newSub: string, newBody: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      setDraftSaving(true);
      try {
        await draftApi.save({ to: newTo, subject: newSub, body: newBody });
      } catch {}
      setDraftSaving(false);
    }, 1500);
  }, []);

  const handleToChange = (v: string) => { setTo(v); scheduleDraftSave(v, sub, body); };
  const handleSubChange = (v: string) => { setSub(v); scheduleDraftSave(to, v, body); };
  const handleBodyChange = (v: string) => { setBody(v); scheduleDraftSave(to, sub, v); };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      quality: 0.7,
      base64: true,
      selectionLimit: 5,
    });
    if (result.canceled) return;
    const picked: Attachment[] = result.assets
      .filter(a => a.base64)
      .map(a => ({
        uri: a.uri,
        base64: a.base64!,
        name: a.fileName ?? `image_${Date.now()}.jpg`,
        mimeType: a.mimeType ?? "image/jpeg",
      }));
    setAttachments(prev => [...prev, ...picked].slice(0, 5));
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const archiveMutation = useMutation({
    mutationFn: (threadId: string) => inboxApi.update(threadId, { isArchived: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const sendMutation = useMutation({
    mutationFn: () => {
      // Inline base64 images into body HTML when attachments present
      const inlineImages = attachments.map((a, i) =>
        `<br/><img src="data:${a.mimeType};base64,${a.base64}" alt="attachment ${i + 1}" style="max-width:100%;border-radius:8px;margin-top:8px;"/>`
      ).join("");
      const enrichedBody = body + (inlineImages ? `\n\n[images attached]${inlineImages}` : "");
      return inboxApi.compose({ to, subject: sub, body: enrichedBody });
    },
    onSuccess: () => {
      setComposing(false);
      setTo(""); setSub(""); setBody(""); setAttachments([]); setSendError(null);
      void draftApi.clear().catch(() => {});
      void qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e) => setSendError(e instanceof Error ? e.message : "Failed to send"),
  });

  const closeCompose = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (to.trim() || sub.trim() || body.trim()) {
      void draftApi.save({ to, subject: sub, body }).catch(() => {});
    }
    setComposing(false);
    setSendError(null);
  };

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const canSend = to.trim() && sub.trim() && body.trim() && !sendMutation.isPending;

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>Nexus</Text>
          <Text style={s.title}>Inbox</Text>
        </View>
        <TouchableOpacity style={s.composeBtn} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setComposing(true); }} activeOpacity={0.8}>
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
              <ThreadRow
                item={item}
                onPress={() => router.push(`/thread/${item.id}`)}
                onArchive={() => archiveMutation.mutate(item.id)}
              />
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
      <Modal visible={composing} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCompose}>
        <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Modal header */}
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={closeCompose}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <View style={s.modalTitleWrap}>
              <Text style={s.modalTitle}>New Message</Text>
              {draftSaving && <Text style={s.draftLabel}>Saving…</Text>}
            </View>
            <TouchableOpacity onPress={() => canSend && sendMutation.mutate()} disabled={!canSend}>
              {sendMutation.isPending
                ? <ActivityIndicator color="#00d2ff" size="small" />
                : <Text style={[s.sendBtn, !canSend && s.sendBtnDisabled]}>Send</Text>
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
                onChangeText={handleToChange}
                placeholder="recipient@example.com"
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
                onChangeText={handleSubChange}
                placeholder="Subject"
                placeholderTextColor="#5c6b72"
              />
            </View>
            <View style={s.divider} />
            <TextInput
              style={s.bodyInput}
              value={body}
              onChangeText={handleBodyChange}
              placeholder="Write your message…"
              placeholderTextColor="#5c6b72"
              multiline
              textAlignVertical="top"
            />

            {/* Attachment thumbnails */}
            {attachments.length > 0 && (
              <View style={s.attachWrap}>
                {attachments.map((a, i) => (
                  <View key={i} style={s.attachThumb}>
                    <Image source={{ uri: a.uri }} style={s.thumbImg} />
                    <TouchableOpacity style={s.thumbRemove} onPress={() => removeAttachment(i)}>
                      <Text style={s.thumbRemoveText}>✕</Text>
                    </TouchableOpacity>
                    <Text style={s.thumbName} numberOfLines={1}>{a.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Toolbar */}
            <View style={s.toolbar}>
              <TouchableOpacity style={s.toolBtn} onPress={pickImage}>
                <Text style={s.toolBtnText}>📎 Attach Image</Text>
              </TouchableOpacity>
              {attachments.length > 0 && (
                <Text style={s.attachCount}>{attachments.length}/5</Text>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: "#0f1321" },
  header:         { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14 },
  eyebrow:        { fontSize: 11, fontWeight: "700", color: "#00d2ff", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 },
  title:          { fontSize: 28, fontWeight: "800", color: "#dfe1f6", letterSpacing: -0.5 },
  composeBtn:     { backgroundColor: "#00d2ff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  composeBtnText: { color: "#003543", fontSize: 13, fontWeight: "700" },
  searchWrap:     { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  searchIcon:     { fontSize: 14, marginRight: 8 },
  search:         { flex: 1, paddingVertical: 11, color: "#dfe1f6", fontSize: 14 },
  swipeContainer: { overflow: "hidden", position: "relative" },
  archiveReveal:  { position: "absolute", right: 0, top: 0, bottom: 0, width: 80, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" },
  archiveLabel:   { color: "#fff", fontSize: 11, fontWeight: "700" },
  row:            { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)", backgroundColor: "#0f1321" },
  rowUnread:      { backgroundColor: "rgba(0,210,255,0.03)" },
  rowBody:        { flex: 1, minWidth: 0 },
  rowTop:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  sender:         { color: "#bbc9cf", fontSize: 14, flex: 1, marginRight: 8 },
  senderBold:     { color: "#dfe1f6", fontWeight: "700" },
  date:           { color: "#5c6b72", fontSize: 11 },
  subject:        { color: "#dfe1f6", fontSize: 13, marginBottom: 2 },
  subjectBold:    { fontWeight: "700" },
  snippet:        { color: "#5c6b72", fontSize: 12 },
  dot:            { width: 8, height: 8, borderRadius: 4, backgroundColor: "#00d2ff", flexShrink: 0 },
  emptyWrap:      { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  empty:          { color: "#5c6b72", fontSize: 15 },
  // Modal
  modal:          { flex: 1, backgroundColor: "#0f1321" },
  modalHeader:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  modalTitleWrap: { alignItems: "center" },
  modalTitle:     { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  draftLabel:     { color: "#5c6b72", fontSize: 10, marginTop: 2 },
  cancelBtn:      { color: "#bbc9cf", fontSize: 15 },
  sendBtn:        { color: "#00d2ff", fontSize: 15, fontWeight: "700" },
  sendBtnDisabled:{ color: "#3c494e" },
  modalBody:      { flex: 1 },
  errorBanner:    { margin: 16, padding: 12, backgroundColor: "rgba(255,77,109,0.1)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,109,0.3)" },
  errorText:      { color: "#ff4d6d", fontSize: 13 },
  fieldRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 4 },
  fieldLabel:     { color: "#5c6b72", fontSize: 13, fontWeight: "600", width: 60 },
  fieldInput:     { flex: 1, color: "#dfe1f6", fontSize: 15, paddingVertical: 12 },
  divider:        { height: 1, backgroundColor: "rgba(0,210,255,0.06)", marginHorizontal: 16 },
  bodyInput:      { color: "#dfe1f6", fontSize: 15, padding: 16, minHeight: 260, lineHeight: 22 },
  // Attachments
  attachWrap:     { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  attachThumb:    { width: 90, alignItems: "center" },
  thumbImg:       { width: 80, height: 80, borderRadius: 10, backgroundColor: "#1b1f2e" },
  thumbRemove:    { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: "#ff4d6d", alignItems: "center", justifyContent: "center" },
  thumbRemoveText:{ color: "#fff", fontSize: 10, fontWeight: "700" },
  thumbName:      { color: "#5c6b72", fontSize: 10, marginTop: 4, textAlign: "center" },
  // Toolbar
  toolbar:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.06)", gap: 12 },
  toolBtn:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#1b1f2e", borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,210,255,0.12)" },
  toolBtnText:    { color: "#dfe1f6", fontSize: 13 },
  attachCount:    { color: "#5c6b72", fontSize: 12 },
});
