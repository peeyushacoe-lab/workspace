import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../src/api/client";

interface Channel { id: string; name: string; type: string; description?: string | null }
interface Message { id: string; content: string; sender: { fullName: string; avatarUrl?: string | null }; createdAt: string }

export default function ChatScreen() {
  const qc = useQueryClient();
  const [activeChannel, setActive] = useState<Channel | null>(null);
  const [text, setText] = useState("");

  const { data: channels, isLoading: loadingChannels } = useQuery({
    queryKey: ["channels"],
    queryFn: () => apiRequest<Channel[]>("/api/chat/channels"),
  });

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ["messages", activeChannel?.id],
    queryFn: () => apiRequest<Message[]>(`/api/chat/channels/${activeChannel!.id}/messages`),
    enabled: !!activeChannel,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiRequest(`/api/chat/channels/${activeChannel!.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    }),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["messages", activeChannel?.id] });
    },
  });

  if (activeChannel) {
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setActive(null)}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={1}>#{activeChannel.name}</Text>
        </View>

        {loadingMessages
          ? <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
          : (
            <FlatList
              data={[...(messages ?? [])].reverse()}
              inverted
              keyExtractor={m => m.id}
              contentContainerStyle={s.msgList}
              renderItem={({ item }) => (
                <View style={s.msgRow}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{item.sender.fullName[0] ?? "?"}</Text>
                  </View>
                  <View style={s.msgContent}>
                    <Text style={s.senderName}>{item.sender.fullName}</Text>
                    <Text style={s.msgText}>{item.content}</Text>
                    <Text style={s.msgTime}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
                  </View>
                </View>
              )}
            />
          )
        }

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
            style={[s.sendBtn, !text.trim() && s.sendDisabled]}
            onPress={() => text.trim() && sendMutation.mutate()}
            disabled={!text.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending
              ? <ActivityIndicator color="#003543" size="small" />
              : <Text style={s.sendText}>↑</Text>
            }
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
      {loadingChannels
        ? <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={channels ?? []}
            keyExtractor={c => c.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.channelRow} onPress={() => setActive(item)}>
                <Text style={s.channelName}>
                  {item.type === "DIRECT" ? "👤" : "#"} {item.name}
                </Text>
                {item.description && <Text style={s.channelDesc} numberOfLines={1}>{item.description}</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty}>No channels</Text>}
          />
        )
      }
    </View>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: "#0f1321" },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:       { fontSize: 22, fontWeight: "700", color: "#dfe1f6", flex: 1 },
  back:        { color: "#00d2ff", fontSize: 15, marginRight: 12 },
  channelRow:  { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  channelName: { color: "#dfe1f6", fontSize: 15, fontWeight: "600" },
  channelDesc: { color: "#5c6b72", fontSize: 12, marginTop: 2 },
  empty:       { color: "#5c6b72", textAlign: "center", marginTop: 60, fontSize: 14 },
  msgList:     { padding: 12, gap: 10 },
  msgRow:      { flexDirection: "row", gap: 10 },
  avatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText:  { color: "#003543", fontWeight: "700", fontSize: 14 },
  msgContent:  { flex: 1 },
  senderName:  { color: "#00d2ff", fontSize: 12, fontWeight: "600", marginBottom: 2 },
  msgText:     { color: "#dfe1f6", fontSize: 14, lineHeight: 20 },
  msgTime:     { color: "#5c6b72", fontSize: 10, marginTop: 2 },
  inputBar:    { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)", gap: 8 },
  msgInput:    { flex: 1, backgroundColor: "#1b1f2e", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: "#dfe1f6", fontSize: 14, maxHeight: 100 },
  sendBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  sendDisabled:{ backgroundColor: "#3c494e" },
  sendText:    { color: "#003543", fontWeight: "700", fontSize: 18 },
});
