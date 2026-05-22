import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inboxApi } from "../../src/api/inbox";

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc     = useQueryClient();
  const [replyBody, setReply] = useState("");
  const [showReply, setShow]  = useState(false);

  const { data: thread, isLoading } = useQuery({
    queryKey: ["thread", id],
    queryFn: () => inboxApi.get(id),
    enabled: !!id,
  });

  const replyMutation = useMutation({
    mutationFn: () => inboxApi.compose({
      to:      thread?.messages[0]?.from ?? "",
      subject: `Re: ${thread?.subject ?? ""}`,
      body:    replyBody,
    }),
    onSuccess: () => {
      setReply(""); setShow(false);
      void qc.invalidateQueries({ queryKey: ["thread", id] });
    },
  });

  if (isLoading || !thread) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#00d2ff" />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.mailbox}>{thread.mailbox.email}</Text>
      </View>

      <Text style={s.subject} numberOfLines={2}>{thread.subject}</Text>

      <ScrollView style={s.scroll} contentContainerStyle={s.messages}>
        {thread.messages.map(msg => (
          <View key={msg.id} style={s.msgCard}>
            <View style={s.msgMeta}>
              <Text style={s.msgFrom}>{msg.from}</Text>
              <Text style={s.msgDate}>{new Date(msg.receivedAt).toLocaleString()}</Text>
            </View>
            <Text style={s.msgBody}>{msg.textBody ?? "(No content)"}</Text>
          </View>
        ))}
      </ScrollView>

      {showReply ? (
        <View style={s.replyBox}>
          <TextInput
            style={s.replyInput}
            placeholder="Write your reply…"
            placeholderTextColor="#5c6b72"
            value={replyBody}
            onChangeText={setReply}
            multiline
          />
          <View style={s.replyActions}>
            <TouchableOpacity onPress={() => setShow(false)}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.sendBtn}
              onPress={() => replyMutation.mutate()}
              disabled={replyMutation.isPending}
            >
              {replyMutation.isPending
                ? <ActivityIndicator color="#003543" size="small" />
                : <Text style={s.sendText}>Send Reply</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={s.replyToggle} onPress={() => setShow(true)}>
          <Text style={s.replyToggleText}>↩ Reply</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: "#0f1321" },
  center:      { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1321" },
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  back:        { color: "#00d2ff", fontSize: 15 },
  mailbox:     { color: "#5c6b72", fontSize: 12 },
  subject:     { fontSize: 18, fontWeight: "700", color: "#dfe1f6", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  scroll:      { flex: 1 },
  messages:    { padding: 16, gap: 12 },
  msgCard:     { backgroundColor: "#1b1f2e", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  msgMeta:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  msgFrom:     { color: "#00d2ff", fontSize: 13, fontWeight: "600", flex: 1 },
  msgDate:     { color: "#5c6b72", fontSize: 11 },
  msgBody:     { color: "#dfe1f6", fontSize: 14, lineHeight: 20 },
  replyBox:    { padding: 16, backgroundColor: "#1b1f2e", borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)" },
  replyInput:  { backgroundColor: "#0f1321", borderRadius: 10, padding: 12, color: "#dfe1f6", minHeight: 80, textAlignVertical: "top", fontSize: 14 },
  replyActions:{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 10 },
  cancel:      { color: "#bbc9cf", fontSize: 14 },
  sendBtn:     { backgroundColor: "#00d2ff", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  sendText:    { color: "#003543", fontWeight: "700", fontSize: 14 },
  replyToggle: { margin: 16, backgroundColor: "rgba(0,210,255,0.1)", borderRadius: 10, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.2)" },
  replyToggleText: { color: "#00d2ff", fontWeight: "600", fontSize: 15 },
});
