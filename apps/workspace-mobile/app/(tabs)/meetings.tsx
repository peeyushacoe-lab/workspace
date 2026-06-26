import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, Linking,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";

interface MeetingUser { id: string; fullName: string; avatarUrl?: string | null }
interface MeetingParticipant { user: MeetingUser }
interface Meeting {
  id: string;
  title: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  roomName: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  organizer: MeetingUser;
  participants: MeetingParticipant[];
}

const STATUS_BADGE: Record<Meeting["status"], { label: string; bg: string; color: string }> = {
  LIVE:      { label: "LIVE", bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  SCHEDULED: { label: "Scheduled", bg: "rgba(0,210,255,0.1)", color: "#00d2ff" },
  ENDED:     { label: "Ended", bg: "rgba(92,107,114,0.15)", color: "#5c6b72" },
  CANCELLED: { label: "Cancelled", bg: "rgba(255,77,109,0.1)", color: "#ff4d6d" },
};

function formatMeetingTime(m: Meeting) {
  if (m.status === "LIVE" && m.startedAt) {
    const diff = Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 60_000);
    return diff < 1 ? "Just started" : `Started ${diff}m ago`;
  }
  if (m.scheduledAt) {
    const d = new Date(m.scheduledAt);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return `Today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return null;
}

export default function MeetingsScreen() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isInstant, setIsInstant] = useState(true);
  const [scheduledDate, setScheduledDate] = useState("");

  const { data: meetings, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => apiRequest<Meeting[]>("/api/mobile/meetings"),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; isInstant: boolean; scheduledAt?: string }) =>
      apiRequest<Meeting>("/api/mobile/meetings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (meeting) => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      setCreating(false);
      setNewTitle("");
      if (meeting.status === "ACTIVE") {
        Alert.alert(
          "Meeting created",
          `Your meeting is live. Share the room: ${meeting.roomName}`,
          [{ text: "OK" }]
        );
      }
    },
    onError: (e) => Alert.alert("Failed", e instanceof Error ? e.message : "Could not create meeting"),
  });

  const joinMeeting = (m: Meeting) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `https://cybersage-mail.vercel.app/meet/${m.roomName}`;
    void Linking.openURL(url);
  };

  const handleCreate = () => {
    if (!newTitle.trim()) {
      Alert.alert("Title required", "Enter a title for the meeting.");
      return;
    }
    createMutation.mutate({
      title: newTitle.trim(),
      isInstant,
      ...((!isInstant && scheduledDate) ? { scheduledAt: new Date(scheduledDate).toISOString() } : {}),
    });
  };

  const groups = {
    live: (meetings ?? []).filter(m => m.status === "LIVE"),
    upcoming: (meetings ?? []).filter(m => m.status === "SCHEDULED"),
    past: (meetings ?? []).filter(m => m.status === "ENDED" || m.status === "CANCELLED"),
  };

  const sections = [
    ...groups.live.map(m => ({ ...m, _section: "Live" })),
    ...groups.upcoming.map(m => ({ ...m, _section: "Upcoming" })),
    ...groups.past.map(m => ({ ...m, _section: "Past" })),
  ];

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Meetings</Text>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreating(true); }}
          activeOpacity={0.8}
        >
          <Text style={s.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={m => m.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void Haptics.selectionAsync(); void refetch(); }} tintColor="#00d2ff" />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📞</Text>
              <Text style={s.emptyText}>No meetings</Text>
              <Text style={s.emptyHint}>Tap + New to schedule or start one</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const badge = STATUS_BADGE[item.status];
            const prevSection = index > 0 ? sections[index - 1]._section : null;
            const showHeader = item._section !== prevSection;

            return (
              <>
                {showHeader && (
                  <Text style={s.sectionHeader}>{item._section}</Text>
                )}
                <TouchableOpacity
                  style={[s.card, item.status === "LIVE" && s.cardLive]}
                  onPress={() => item.status !== "ENDED" && item.status !== "CANCELLED" && joinMeeting(item)}
                  activeOpacity={item.status === "ENDED" || item.status === "CANCELLED" ? 1 : 0.75}
                >
                  <View style={s.cardTop}>
                    <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[s.statusText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                    {item.status === "LIVE" && (
                      <View style={s.liveDot} />
                    )}
                  </View>

                  <Text style={s.meetTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={s.meetOrg}>by {item.organizer.fullName}</Text>
                  {formatMeetingTime(item) && (
                    <Text style={s.meetTime}>{formatMeetingTime(item)}</Text>
                  )}

                  {item.participants.length > 0 && (
                    <Text style={s.meetParticipants}>
                      {item.participants.slice(0, 3).map(p => p.user.fullName.split(" ")[0]).join(", ")}
                      {item.participants.length > 3 ? ` +${item.participants.length - 3}` : ""}
                    </Text>
                  )}

                  {item.status !== "ENDED" && item.status !== "CANCELLED" && (
                    <TouchableOpacity style={[s.joinBtn, item.status === "LIVE" ? s.joinBtnLive : s.joinBtnScheduled]} onPress={() => joinMeeting(item)}>
                      <Text style={[s.joinBtnText, item.status === "LIVE" && s.joinBtnTextLive]}>
                        {item.status === "LIVE" ? "Join Now" : "Open"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </>
            );
          }}
        />
      )}

      {/* Create modal */}
      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setCreating(false)}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>New Meeting</Text>
            <TouchableOpacity onPress={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending
                ? <ActivityIndicator color="#00d2ff" size="small" />
                : <Text style={s.createBtn}>Create</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={s.modalBody}>
            <TextInput
              style={s.titleInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Meeting title"
              placeholderTextColor="#5c6b72"
              autoFocus
            />

            <View style={s.typeToggle}>
              <TouchableOpacity
                style={[s.typeBtn, isInstant && s.typeBtnActive]}
                onPress={() => setIsInstant(true)}
              >
                <Text style={[s.typeBtnText, isInstant && s.typeBtnTextActive]}>⚡ Instant</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.typeBtn, !isInstant && s.typeBtnActive]}
                onPress={() => setIsInstant(false)}
              >
                <Text style={[s.typeBtnText, !isInstant && s.typeBtnTextActive]}>📅 Schedule</Text>
              </TouchableOpacity>
            </View>

            {!isInstant && (
              <TextInput
                style={s.titleInput}
                value={scheduledDate}
                onChangeText={setScheduledDate}
                placeholder="Date/time e.g. 2026-06-01T14:00"
                placeholderTextColor="#5c6b72"
              />
            )}

            <Text style={s.hint}>
              {isInstant
                ? "A live meeting room will be created immediately."
                : "A scheduled meeting will appear in your calendar."}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: "#0f1321" },
  header:           { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14 },
  title:            { fontSize: 28, fontWeight: "800", color: "#dfe1f6" },
  newBtn:           { backgroundColor: "#00d2ff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  newBtnText:       { color: "#003543", fontSize: 13, fontWeight: "700" },
  list:             { padding: 12, paddingBottom: 60, gap: 10 },
  sectionHeader:    { color: "#5c6b72", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  card:             { backgroundColor: "#1b1f2e", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.06)" },
  cardLive:         { borderColor: "rgba(34,197,94,0.3)", backgroundColor: "rgba(34,197,94,0.04)" },
  cardTop:          { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:       { fontSize: 11, fontWeight: "700" },
  liveDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  meetTitle:        { color: "#dfe1f6", fontSize: 17, fontWeight: "700", marginBottom: 4 },
  meetOrg:          { color: "#5c6b72", fontSize: 12, marginBottom: 3 },
  meetTime:         { color: "#bbc9cf", fontSize: 12, marginBottom: 4 },
  meetParticipants: { color: "#5c6b72", fontSize: 12, marginBottom: 12 },
  joinBtn:          { borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  joinBtnLive:      { backgroundColor: "#22c55e" },
  joinBtnScheduled: { backgroundColor: "#1b2a36", borderWidth: 1, borderColor: "rgba(0,210,255,0.2)" },
  joinBtnText:      { fontSize: 14, fontWeight: "700", color: "#00d2ff" },
  joinBtnTextLive:  { color: "#003543" },
  emptyWrap:        { alignItems: "center", marginTop: 80, gap: 8 },
  emptyIcon:        { fontSize: 44 },
  emptyText:        { color: "#bbc9cf", fontSize: 16, fontWeight: "600" },
  emptyHint:        { color: "#5c6b72", fontSize: 13 },
  // Modal
  modal:            { flex: 1, backgroundColor: "#0f1321" },
  modalHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  modalTitle:       { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  cancelBtn:        { color: "#bbc9cf", fontSize: 15 },
  createBtn:        { color: "#00d2ff", fontSize: 15, fontWeight: "700" },
  modalBody:        { padding: 20, gap: 16 },
  titleInput:       { backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#dfe1f6", fontSize: 15, borderWidth: 1, borderColor: "rgba(0,210,255,0.12)" },
  typeToggle:       { flexDirection: "row", gap: 10 },
  typeBtn:          { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: "#1b1f2e", alignItems: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  typeBtnActive:    { backgroundColor: "rgba(0,210,255,0.1)", borderColor: "#00d2ff" },
  typeBtnText:      { color: "#5c6b72", fontWeight: "600" },
  typeBtnTextActive:{ color: "#00d2ff" },
  hint:             { color: "#5c6b72", fontSize: 13 },
});
