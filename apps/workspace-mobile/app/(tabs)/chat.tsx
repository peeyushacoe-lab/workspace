import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../src/api/client";

interface Channel {
  id: string; name: string; type: string; description?: string | null;
  isPrivate: boolean; memberCount: number;
  lastMessage?: { content: string; sender: string; at: string } | null;
}
interface ChatMsg {
  id: string; content: string; createdAt: string;
  sender: { id: string; fullName: string; avatarUrl?: string | null };
  reactions: { emoji: string; user: string }[];
}

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const r = size / 2;
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: r, flexShrink: 0 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Text style={{ color: "#003543", fontWeight: "700", fontSize: size * 0.38 }}>{name[0]?.toUpperCase() ?? "?"}</Text>
    </View>
  );
}

export default function ChatScreen() {
  const qc = useQueryClient();
  const [activeChannel, setActive] = useState<Channel | null>(null);
  const [text, setText] = useState("");

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
      qc.setQueryData<ChatMsg[]>(["m-messages", activeChannel?.id], (prev) =>
        prev ? [...prev, msg] : [msg],
      );
    },
  });

  if (activeChannel) {
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setActive(null)}>
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
                <Avatar name={item.sender.fullName} url={item.sender.avatarUrl} />
                <View style={s.msgContent}>
                  <View style={s.msgHeader}>
                    <Text style={s.senderName}>{item.sender.fullName}</Text>
                    <Text style={s.msgTime}>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
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
            onPress={() => text.trim() && sendMutation.mutate()}
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

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Chat</Text>
      </View>
      {loadingChannels ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={channels ?? []}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.channelRow} onPress={() => setActive(item)}>
              <View style={s.channelLeft}>
                <Text style={s.channelIcon}>{item.type === "DIRECT" ? "👤" : item.isPrivate ? "🔒" : "#"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.channelName}>{item.name}</Text>
                  {item.lastMessage ? (
                    <Text style={s.channelPreview} numberOfLines={1}>
                      {item.lastMessage.sender}: {item.lastMessage.content}
                    </Text>
                  ) : item.description ? (
                    <Text style={s.channelPreview} numberOfLines={1}>{item.description}</Text>
                  ) : null}
                </View>
              </View>
              <Text style={s.memberBadge}>{item.memberCount}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.empty}>No channels yet</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: "#0f1321" },
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, gap: 10 },
  title:        { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  memberCount:  { fontSize: 11, color: "#5c6b72" },
  back:         { color: "#00d2ff", fontSize: 15, marginRight: 4 },
  channelRow:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  channelLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  channelIcon:  { fontSize: 18, width: 28, textAlign: "center" },
  channelName:  { color: "#dfe1f6", fontSize: 15, fontWeight: "600" },
  channelPreview: { color: "#5c6b72", fontSize: 12, marginTop: 2 },
  memberBadge:  { color: "#5c6b72", fontSize: 11, backgroundColor: "#1b1f2e", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  empty:        { color: "#5c6b72", textAlign: "center", marginTop: 60, fontSize: 14 },
  msgList:      { padding: 12, gap: 14 },
  msgRow:       { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  msgHeader:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  msgContent:   { flex: 1 },
  senderName:   { color: "#00d2ff", fontSize: 13, fontWeight: "700" },
  msgText:      { color: "#dfe1f6", fontSize: 14, lineHeight: 20 },
  msgTime:      { color: "#5c6b72", fontSize: 10 },
  reactionsRow: { flexDirection: "row", gap: 4, marginTop: 4 },
  reactionChip: { backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  reactionText: { fontSize: 13 },
  inputBar:     { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)", gap: 8 },
  msgInput:     { flex: 1, backgroundColor: "#1b1f2e", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: "#dfe1f6", fontSize: 14, maxHeight: 100 },
  sendBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  sendDisabled: { backgroundColor: "#3c494e" },
  sendText:     { color: "#003543", fontWeight: "700", fontSize: 18 },
});
