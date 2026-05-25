import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";
import { profileApi } from "../../src/api/inbox";

interface ActivityEvent {
  id: string;
  type: "message" | "reaction";
  actor: { id: string; fullName: string; avatarUrl?: string | null };
  channel: { id: string; name: string; type: string };
  preview: string;
  isUrgent: boolean;
  createdAt: string;
}

const AVATAR_COLORS = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb"];

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const bg = AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
  return url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.38 }}>
          {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </Text>
      </View>
    );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function ActivityScreen() {
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: profileApi.get,
    staleTime: 60_000,
  });

  const { data, isLoading, refetch, isRefetching } = useQuery<ActivityEvent[]>({
    queryKey: ["activity-feed"],
    queryFn: () => apiRequest<ActivityEvent[]>("/api/mobile/activity"),
    refetchInterval: 30_000,
  });

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Activity</Text>
        <Text style={s.subtitle}>Recent updates across your channels</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => { void Haptics.selectionAsync(); void refetch(); }}
              tintColor="#00d2ff"
            />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📭</Text>
              <Text style={s.emptyText}>No recent activity</Text>
              <Text style={s.emptyHint}>Messages and reactions will appear here</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.eventRow, item.isUrgent && s.eventRowUrgent]}
              onPress={() => void Haptics.selectionAsync()}
              activeOpacity={0.7}
            >
              <Avatar name={item.actor.fullName} url={item.actor.avatarUrl} size={42} />
              <View style={s.eventContent}>
                <View style={s.eventHeader}>
                  <Text style={s.actorName} numberOfLines={1}>{item.actor.fullName}</Text>
                  <Text style={s.eventTime}>{relTime(item.createdAt)}</Text>
                </View>
                <Text style={s.channelTag}>
                  {item.type === "reaction" ? "reacted in" : "in"}{" "}
                  <Text style={s.channelName}>
                    {item.channel.type === "DIRECT" ? "👤" : "#"}{item.channel.name}
                  </Text>
                </Text>
                <Text style={[s.preview, item.isUrgent && s.previewUrgent]} numberOfLines={2}>
                  {item.preview}
                </Text>
              </View>
              {item.isUrgent && (
                <View style={s.urgentDot}>
                  <Text style={{ fontSize: 14 }}>🚨</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: "#0f1321" },
  header:        { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  title:         { fontSize: 28, fontWeight: "800", color: "#dfe1f6" },
  subtitle:      { fontSize: 13, color: "#5c6b72", marginTop: 2 },
  list:          { padding: 12, gap: 8 },
  eventRow:      { flexDirection: "row", gap: 12, padding: 12, backgroundColor: "#1b1f2e", borderRadius: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.06)" },
  eventRowUrgent:{ borderColor: "rgba(255,77,109,0.35)", backgroundColor: "rgba(255,77,109,0.04)" },
  eventContent:  { flex: 1 },
  eventHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  actorName:     { color: "#dfe1f6", fontWeight: "700", fontSize: 14, flex: 1 },
  eventTime:     { color: "#5c6b72", fontSize: 11 },
  channelTag:    { color: "#5c6b72", fontSize: 12, marginBottom: 3 },
  channelName:   { color: "#00d2ff", fontWeight: "600" },
  preview:       { color: "#bbc9cf", fontSize: 13, lineHeight: 18 },
  previewUrgent: { color: "#ffd6dd" },
  urgentDot:     { alignSelf: "flex-start", marginTop: 2 },
  emptyWrap:     { alignItems: "center", marginTop: 80, gap: 8 },
  emptyIcon:     { fontSize: 44 },
  emptyText:     { color: "#bbc9cf", fontSize: 16, fontWeight: "600" },
  emptyHint:     { color: "#5c6b72", fontSize: 13 },
});
