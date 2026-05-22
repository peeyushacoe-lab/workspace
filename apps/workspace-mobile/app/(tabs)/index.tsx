import { useCallback, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  RefreshControl, StyleSheet, ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { inboxApi, Thread } from "../../src/api/inbox";

function ThreadRow({ item, onPress }: { item: Thread; onPress: () => void }) {
  const date = item.lastMessage
    ? new Date(item.lastMessage.receivedAt).toLocaleDateString()
    : new Date(item.createdAt).toLocaleDateString();
  return (
    <TouchableOpacity style={[s.row, item.unreadCount > 0 && s.unread]} onPress={onPress}>
      <View style={s.rowLeft}>
        <View style={s.fromRow}>
          <Text style={[s.from, item.unreadCount > 0 && s.fromBold]} numberOfLines={1}>
            {item.lastMessage?.from ?? "—"}
          </Text>
          {item.unreadCount > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{item.unreadCount}</Text></View>
          )}
        </View>
        <Text style={s.subject} numberOfLines={1}>{item.subject}</Text>
        <Text style={s.snippet} numberOfLines={1}>{item.lastMessage?.snippet ?? ""}</Text>
      </View>
      <Text style={s.date}>{date}</Text>
    </TouchableOpacity>
  );
}

export default function InboxScreen() {
  const router       = useRouter();
  const qc           = useQueryClient();
  const [query, setQ] = useState("");
  const [composing, setComposing] = useState(false);
  const [to, setTo]  = useState(""); const [sub, setSub] = useState(""); const [body, setBody] = useState("");

  const { data: threads, isLoading, refetch } = useQuery({
    queryKey: ["inbox", query],
    queryFn: () => inboxApi.list(query ? { q: query } : undefined),
  });

  const sendMutation = useMutation({
    mutationFn: () => inboxApi.compose({ to, subject: sub, body }),
    onSuccess: () => {
      setComposing(false); setTo(""); setSub(""); setBody("");
      void qc.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const onRefresh = useCallback(() => { void refetch(); }, [refetch]);

  if (composing) {
    return (
      <View style={s.screen}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setComposing(false)}>
            <Text style={s.back}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={s.title}>New Message</Text>
          <TouchableOpacity onPress={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
            {sendMutation.isPending
              ? <ActivityIndicator color="#00d2ff" />
              : <Text style={s.sendBtn}>Send</Text>
            }
          </TouchableOpacity>
        </View>
        <View style={s.composeBody}>
          <TextInput style={s.composeInput} placeholder="To" placeholderTextColor="#5c6b72" value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={s.composeInput} placeholder="Subject" placeholderTextColor="#5c6b72" value={sub} onChangeText={setSub} />
          <TextInput style={[s.composeInput, s.bodyInput]} placeholder="Message…" placeholderTextColor="#5c6b72" value={body} onChangeText={setBody} multiline />
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Inbox</Text>
        <TouchableOpacity style={s.composeBtn} onPress={() => setComposing(true)}>
          <Text style={s.composeBtnText}>✏️ Compose</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          placeholder="🔍  Search mail…"
          placeholderTextColor="#5c6b72"
          value={query}
          onChangeText={setQ}
        />
      </View>

      {isLoading
        ? <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={threads ?? []}
            keyExtractor={t => t.id}
            renderItem={({ item }) => (
              <ThreadRow
                item={item}
                onPress={() => router.push(`/thread/${item.id}`)}
              />
            )}
            refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#00d2ff" />}
            ListEmptyComponent={<Text style={s.empty}>No messages</Text>}
          />
        )
      }
    </View>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: "#0f1321" },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:        { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  back:         { color: "#bbc9cf", fontSize: 14 },
  sendBtn:      { color: "#00d2ff", fontWeight: "700", fontSize: 15 },
  composeBtn:   { backgroundColor: "rgba(0,210,255,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  composeBtnText:{ color: "#00d2ff", fontSize: 13, fontWeight: "600" },
  searchWrap:   { paddingHorizontal: 16, paddingBottom: 8 },
  search:       { backgroundColor: "#1b1f2e", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#dfe1f6", fontSize: 14 },
  row:          { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  unread:       { backgroundColor: "rgba(0,210,255,0.04)" },
  rowLeft:      { flex: 1, marginRight: 8 },
  fromRow:      { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  from:         { flex: 1, color: "#bbc9cf", fontSize: 13 },
  fromBold:     { color: "#dfe1f6", fontWeight: "700" },
  badge:        { backgroundColor: "#00d2ff", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 },
  badgeText:    { color: "#003543", fontSize: 10, fontWeight: "700" },
  subject:      { color: "#dfe1f6", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  snippet:      { color: "#5c6b72", fontSize: 12 },
  date:         { color: "#5c6b72", fontSize: 11, marginTop: 2 },
  empty:        { color: "#5c6b72", textAlign: "center", marginTop: 60, fontSize: 14 },
  composeBody:  { flex: 1, padding: 16 },
  composeInput: { backgroundColor: "#1b1f2e", borderRadius: 10, padding: 12, color: "#dfe1f6", marginBottom: 10, fontSize: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  bodyInput:    { flex: 1, minHeight: 200, textAlignVertical: "top" },
});
