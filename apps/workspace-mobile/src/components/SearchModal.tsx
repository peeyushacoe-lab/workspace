import { useState, useCallback } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, Modal, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../api/client";

interface SearchResults {
  channels: { id: string; name: string; type: string; isPrivate: boolean; description?: string | null }[];
  messages: { id: string; content: string; createdAt: string; channel: { id: string; name: string }; sender: { id: string; fullName: string } }[];
  users: { id: string; fullName: string; email: string; role: string; avatarUrl?: string | null }[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onChannelSelect?: (channelId: string) => void;
}

const AVATAR_COLORS = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb"];

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const bg = AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
  return url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.4 }}>
          {name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </Text>
      </View>
    );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SearchModal({ visible, onClose, onChannelSelect }: Props) {
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery<SearchResults>({
    queryKey: ["search", query],
    queryFn: () => apiRequest<SearchResults>(`/api/mobile/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 1,
    staleTime: 10_000,
  });

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  const hasResults = data && (data.channels.length + data.messages.length + data.users.length) > 0;

  type Section =
    | { kind: "header"; label: string }
    | { kind: "channel"; item: SearchResults["channels"][0] }
    | { kind: "message"; item: SearchResults["messages"][0] }
    | { kind: "user"; item: SearchResults["users"][0] };

  const sections: Section[] = [];
  if (data?.channels.length) {
    sections.push({ kind: "header", label: "Channels" });
    data.channels.forEach(c => sections.push({ kind: "channel", item: c }));
  }
  if (data?.messages.length) {
    sections.push({ kind: "header", label: "Messages" });
    data.messages.forEach(m => sections.push({ kind: "message", item: m }));
  }
  if (data?.users.length) {
    sections.push({ kind: "header", label: "People" });
    data.users.forEach(u => sections.push({ kind: "user", item: u }));
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Search bar */}
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search channels, messages, people…"
            placeholderTextColor="#5c6b72"
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <TouchableOpacity onPress={handleClose} style={s.cancelBtn}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {query.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyText}>Search anything</Text>
            <Text style={s.emptyHint}>Channels, messages, or people</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        ) : !hasResults ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>😶</Text>
            <Text style={s.emptyText}>No results for "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={sections}
            keyExtractor={(item, i) => `${item.kind}-${i}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              if (item.kind === "header") {
                return <Text style={s.sectionHeader}>{item.label}</Text>;
              }
              if (item.kind === "channel") {
                const c = item.item;
                return (
                  <TouchableOpacity
                    style={s.resultRow}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      if (onChannelSelect) onChannelSelect(c.id);
                      handleClose();
                    }}
                  >
                    <View style={s.channelIconBox}>
                      <Text style={{ fontSize: 16 }}>{c.isPrivate ? "🔒" : "#"}</Text>
                    </View>
                    <View style={s.resultContent}>
                      <Text style={s.resultTitle}>{c.name}</Text>
                      {c.description ? <Text style={s.resultSub} numberOfLines={1}>{c.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              }
              if (item.kind === "message") {
                const m = item.item;
                return (
                  <TouchableOpacity
                    style={s.resultRow}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      if (onChannelSelect) onChannelSelect(m.channel.id);
                      handleClose();
                    }}
                  >
                    <View style={s.channelIconBox}>
                      <Text style={{ fontSize: 14 }}>💬</Text>
                    </View>
                    <View style={s.resultContent}>
                      <Text style={s.resultTitle} numberOfLines={1}>{m.content}</Text>
                      <Text style={s.resultSub}>
                        {m.sender.fullName} · #{m.channel.name} · {relTime(m.createdAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }
              if (item.kind === "user") {
                const u = item.item;
                return (
                  <TouchableOpacity
                    style={s.resultRow}
                    onPress={() => void Haptics.selectionAsync()}
                  >
                    <Avatar name={u.fullName} url={u.avatarUrl} size={36} />
                    <View style={s.resultContent}>
                      <Text style={s.resultTitle}>{u.fullName}</Text>
                      <Text style={s.resultSub}>{u.email}</Text>
                    </View>
                    <Text style={s.roleTag}>{u.role.replace("_", " ")}</Text>
                  </TouchableOpacity>
                );
              }
              return null;
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#0f1321" },
  searchBar:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#1a2332" },
  searchIcon:    { fontSize: 16 },
  searchInput:   { flex: 1, color: "#e8f0fe", backgroundColor: "#1a2332", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  cancelBtn:     { paddingHorizontal: 4 },
  cancelText:    { color: "#00d2ff", fontSize: 15 },
  list:          { padding: 12 },
  sectionHeader: { color: "#5c6b72", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 16, marginBottom: 6, paddingHorizontal: 4 },
  resultRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  channelIconBox:{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#1a2332", alignItems: "center", justifyContent: "center" },
  resultContent: { flex: 1 },
  resultTitle:   { color: "#dfe1f6", fontSize: 14, fontWeight: "600" },
  resultSub:     { color: "#5c6b72", fontSize: 12, marginTop: 1 },
  roleTag:       { color: "#5c6b72", fontSize: 10, fontWeight: "600", backgroundColor: "#1a2332", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  emptyWrap:     { alignItems: "center", marginTop: 80, gap: 8 },
  emptyIcon:     { fontSize: 44 },
  emptyText:     { color: "#bbc9cf", fontSize: 16, fontWeight: "600" },
  emptyHint:     { color: "#5c6b72", fontSize: 13 },
});
