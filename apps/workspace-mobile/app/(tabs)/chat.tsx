import { useState, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image, Animated, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";
import { ProfileSidebar } from "../../src/components/ProfileSidebar";
import { profileApi } from "../../src/api/inbox";

interface Channel {
  id: string; name: string; type: string; description?: string | null;
  isPrivate: boolean; memberCount: number;
  unreadCount?: number;
  lastMessage?: { content: string; sender: string; at: string } | null;
}

interface ChatMsg {
  id: string; content: string; createdAt: string;
  sender: { id: string; fullName: string; avatarUrl?: string | null };
  reactions: { emoji: string; user: string }[];
}

type FilterType = "all" | "unread" | "mentions" | "saved";

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "unread",   label: "Unread" },
  { key: "mentions", label: "Mentions" },
  { key: "saved",    label: "Saved" },
];

const PRESENCE_COLORS: Record<string, string> = {
  ONLINE: "#22c55e", AWAY: "#f59e0b", BUSY: "#ef4444",
  INVISIBLE: "#5c6b72", OFFLINE: "#5c6b72",
};

function PresenceDot({ status }: { status?: string }) {
  const color = PRESENCE_COLORS[status ?? "OFFLINE"] ?? "#5c6b72";
  return (
    <View style={{
      position: "absolute", bottom: 0, right: 0,
      width: 11, height: 11, borderRadius: 5.5,
      backgroundColor: color, borderWidth: 1.5, borderColor: "#0f1321",
    }} />
  );
}

function Avatar({
  name, url, size = 40, presence,
}: { name: string; url?: string | null; size?: number; presence?: string }) {
  const r = size / 2;
  const colors = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb"];
  const bg = colors[(name.charCodeAt(0) ?? 0) % colors.length];
  return (
    <View style={{ position: "relative", flexShrink: 0 }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: r }} />
        : (
          <View style={{ width: size, height: size, borderRadius: r, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.38 }}>
              {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )
      }
      {presence !== undefined && <PresenceDot status={presence} />}
    </View>
  );
}

export default function ChatScreen() {
  const qc = useQueryClient();
  const [activeChannel, setActive] = useState<Channel | null>(null);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeCall, setActiveCall] = useState<{ name: string } | null>(null);
  const fabScale = useRef(new Animated.Value(1)).current;

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: profileApi.get,
    staleTime: 60_000,
  });

  const { data: channels, isLoading: loadingChannels } = useQuery({
    queryKey: ["m-channels"],
    queryFn: () => apiRequest<Channel[]>("/api/mobile/chat/channels"),
  });

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ["m-messages", activeChannel?.id],
    queryFn: () => apiRequest<ChatMsg[]>(`/api/mobile/chat/channels/${activeChannel!.id}/messages`),
    enabled: !!activeChannel,
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest<ChatMsg>(`/api/mobile/chat/channels/${activeChannel!.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      }),
    onSuccess: (msg) => {
      setText("");
      qc.setQueryData<ChatMsg[]>(["m-messages", activeChannel?.id], prev =>
        prev ? [...prev, msg] : [msg],
      );
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const filteredChannels = (channels ?? []).filter(c => {
    if (filter === "unread")   return (c.unreadCount ?? 0) > 0;
    if (filter === "mentions") return c.lastMessage?.content.includes("@") ?? false;
    return true;
  });

  const animateFab = () => {
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  // --- Channel message view ---
  if (activeChannel) {
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { void Haptics.selectionAsync(); setActive(null); }}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              {activeChannel.type === "DIRECT" ? "👤" : "#"} {activeChannel.name}
            </Text>
            <Text style={s.memberCount}>{activeChannel.memberCount} members</Text>
          </View>
        </View>

        {loadingMessages ? (
          <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={[...(messages ?? [])].reverse()}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.msgList}
            renderItem={({ item }) => (
              <View style={s.msgRow}>
                <Avatar name={item.sender.fullName} url={item.sender.avatarUrl} size={36} />
                <View style={s.msgContent}>
                  <View style={s.msgHeader}>
                    <Text style={s.senderName}>{item.sender.fullName}</Text>
                    <Text style={s.msgTime}>
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  <Text style={s.msgText}>{item.content}</Text>
                  {item.reactions.length > 0 && (
                    <View style={s.reactionsRow}>
                      {item.reactions.map((r, i) => (
                        <View key={i} style={s.reactionChip}>
                          <Text style={s.reactionText}>{r.emoji}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          />
        )}

        <View style={s.inputBar}>
          <TextInput
            style={s.msgInput}
            placeholder="Message…"
            placeholderTextColor="#5c6b72"
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sendMutation.isPending) && s.sendDisabled]}
            onPress={() => { if (text.trim()) sendMutation.mutate(); }}
            disabled={!text.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending
              ? <ActivityIndicator color="#003543" size="small" />
              : <Text style={s.sendText}>↑</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- Channel list ---
  return (
    <View style={s.screen}>
      {/* Conference call banner */}
      {activeCall && (
        <View style={s.callBanner}>
          <View style={s.callBannerLeft}>
            <View style={s.callBannerIcon}><Text style={{ fontSize: 14 }}>📹</Text></View>
            <View>
              <Text style={s.callBannerTitle} numberOfLines={1}>
                You're in a meeting · {activeCall.name}
              </Text>
              <Text style={s.callBannerSub}>Use both devices, or transfer here.</Text>
            </View>
          </View>
          <View style={s.callBannerActions}>
            <TouchableOpacity style={s.joinBtn} onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
              <Text style={s.joinBtnText}>Join</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveCall(null)}>
              <Text style={s.dismissCall}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Header with avatar */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => { void Haptics.selectionAsync(); setShowSidebar(true); }}
          activeOpacity={0.8}
          style={s.avatarBtn}
        >
          {myProfile?.avatarUrl
            ? <Image source={{ uri: myProfile.avatarUrl }} style={s.headerAvatar} />
            : (
              <View style={[s.headerAvatar, s.headerAvatarFallback]}>
                <Text style={s.headerAvatarText}>
                  {(myProfile?.displayName ?? myProfile?.fullName ?? "?")[0]?.toUpperCase()}
                </Text>
              </View>
            )
          }
        </TouchableOpacity>
        <Text style={s.title}>Chat</Text>
        <TouchableOpacity onPress={() => Alert.alert("Search", "Search coming soon.")} style={s.headerAction}>
          <Text style={s.headerActionText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Filter pills */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterPill, filter === f.key && s.filterPillActive]}
            onPress={() => { void Haptics.selectionAsync(); setFilter(f.key); }}
          >
            <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loadingChannels ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredChannels}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.channelRow}
              onPress={() => { void Haptics.selectionAsync(); setActive(item); }}
              activeOpacity={0.7}
            >
              {/* Channel avatar / presence */}
              <View style={s.channelAvatarWrap}>
                {item.type === "DIRECT" ? (
                  <Avatar
                    name={item.name}
                    size={44}
                    presence="ONLINE"
                  />
                ) : (
                  <View style={s.channelIconBox}>
                    <Text style={s.channelIconText}>
                      {item.isPrivate ? "🔒" : "#"}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <View style={s.channelTopRow}>
                  <Text style={[s.channelName, (item.unreadCount ?? 0) > 0 && s.channelNameUnread]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.lastMessage && (
                    <Text style={s.channelTime}>
                      {formatRelativeTime(item.lastMessage.at)}
                    </Text>
                  )}
                </View>
                {item.lastMessage ? (
                  <Text style={s.channelPreview} numberOfLines={1}>
                    {item.lastMessage.sender}: {item.lastMessage.content}
                  </Text>
                ) : item.description ? (
                  <Text style={s.channelPreview} numberOfLines={1}>{item.description}</Text>
                ) : null}
              </View>

              {(item.unreadCount ?? 0) > 0 && (
                <View style={s.unreadBadge}>
                  <Text style={s.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>💬</Text>
              <Text style={s.emptyText}>
                {filter === "all" ? "No channels yet" : `No ${filter} conversations`}
              </Text>
            </View>
          }
        />
      )}

      {/* Floating compose FAB */}
      <Animated.View style={[s.fab, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity
          onPress={() => {
            animateFab();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert("New Message", "Create a new channel or direct message.");
          }}
          activeOpacity={0.9}
          style={s.fabInner}
        >
          <Text style={s.fabText}>✏️</Text>
        </TouchableOpacity>
      </Animated.View>

      <ProfileSidebar visible={showSidebar} onClose={() => setShowSidebar(false)} />
    </View>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

const s = StyleSheet.create({
  screen:           { flex: 1, backgroundColor: "#0f1321" },

  // Call banner
  callBanner:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#1e1b4b", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(124,58,237,0.3)" },
  callBannerLeft:   { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  callBannerIcon:   { width: 36, height: 36, borderRadius: 8, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  callBannerTitle:  { color: "#dfe1f6", fontSize: 13, fontWeight: "600" },
  callBannerSub:    { color: "#7c7ca0", fontSize: 11 },
  callBannerActions:{ flexDirection: "row", alignItems: "center", gap: 10 },
  joinBtn:          { backgroundColor: "#4f46e5", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  joinBtnText:      { color: "#fff", fontWeight: "700", fontSize: 13 },
  dismissCall:      { color: "#7c7ca0", fontSize: 16, padding: 4 },

  // Header
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, gap: 10 },
  avatarBtn:        {},
  headerAvatar:     { width: 34, height: 34, borderRadius: 17 },
  headerAvatarFallback: { backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#003543", fontWeight: "700", fontSize: 14 },
  title:            { flex: 1, fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  headerAction:     { padding: 4 },
  headerActionText: { fontSize: 18 },

  // Filter pills
  filterRow:        { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  filterPill:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#1b1f2e", borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  filterPillActive: { backgroundColor: "rgba(0,210,255,0.12)", borderColor: "rgba(0,210,255,0.3)" },
  filterText:       { color: "#5c6b72", fontSize: 13, fontWeight: "500" },
  filterTextActive: { color: "#00d2ff", fontWeight: "700" },

  // Channel list
  channelRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)" },
  channelAvatarWrap:{},
  channelIconBox:   { width: 44, height: 44, borderRadius: 12, backgroundColor: "#1b1f2e", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  channelIconText:  { fontSize: 18 },
  channelTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  channelName:      { color: "#bbc9cf", fontSize: 15, fontWeight: "500", flex: 1 },
  channelNameUnread:{ color: "#dfe1f6", fontWeight: "700" },
  channelTime:      { color: "#5c6b72", fontSize: 11 },
  channelPreview:   { color: "#5c6b72", fontSize: 12, lineHeight: 16 },
  unreadBadge:      { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadText:       { color: "#003543", fontSize: 11, fontWeight: "800" },

  // Empty
  emptyWrap:        { alignItems: "center", marginTop: 80, gap: 12 },
  emptyIcon:        { fontSize: 40 },
  emptyText:        { color: "#5c6b72", fontSize: 14 },

  // FAB
  fab:              { position: "absolute", bottom: 24, right: 20 },
  fabInner:         { width: 56, height: 56, borderRadius: 28, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", shadowColor: "#00d2ff", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabText:          { fontSize: 22 },

  // Message view
  back:             { color: "#00d2ff", fontSize: 15 },
  memberCount:      { fontSize: 11, color: "#5c6b72" },
  msgList:          { padding: 12, gap: 14 },
  msgRow:           { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  msgHeader:        { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  msgContent:       { flex: 1 },
  senderName:       { color: "#00d2ff", fontSize: 13, fontWeight: "700" },
  msgText:          { color: "#dfe1f6", fontSize: 14, lineHeight: 20 },
  msgTime:          { color: "#5c6b72", fontSize: 10 },
  reactionsRow:     { flexDirection: "row", gap: 4, marginTop: 4 },
  reactionChip:     { backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  reactionText:     { fontSize: 13 },
  inputBar:         { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)", gap: 8 },
  msgInput:         { flex: 1, backgroundColor: "#1b1f2e", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: "#dfe1f6", fontSize: 14, maxHeight: 100 },
  sendBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  sendDisabled:     { backgroundColor: "#3c494e" },
  sendText:         { color: "#003543", fontWeight: "700", fontSize: 18 },
});
