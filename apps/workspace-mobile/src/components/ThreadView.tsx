import { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image, Modal,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../api/client";

interface ThreadMsg {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; fullName: string; avatarUrl?: string | null };
  reactions: { emoji: string; user: string }[];
  isSaved?: boolean;
}

interface ThreadData {
  parent: ThreadMsg & { replyCount: number };
  replies: ThreadMsg[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  channelId: string;
  messageId: string;
}

const AVATAR_COLORS = ["#00d2ff", "#7c3aed", "#059669", "#dc2626", "#d97706", "#2563eb"];

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
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

function MsgBubble({ item }: { item: ThreadMsg }) {
  return (
    <View style={s.msgRow}>
      <Avatar name={item.sender.fullName} url={item.sender.avatarUrl} />
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
                <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function ThreadView({ visible, onClose, channelId, messageId }: Props) {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery<ThreadData>({
    queryKey: ["thread", messageId],
    queryFn: () =>
      apiRequest<ThreadData>(`/api/mobile/chat/channels/${channelId}/messages/${messageId}/thread`),
    enabled: visible && !!messageId,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest<ThreadMsg>(`/api/mobile/chat/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text.trim(), parentId: messageId }),
      }),
    onSuccess: (msg) => {
      setText("");
      qc.setQueryData<ThreadData>(["thread", messageId], (prev) => {
        if (!prev) return prev;
        return { ...prev, replies: [...prev.replies, msg] };
      });
      qc.invalidateQueries({ queryKey: ["m-messages", channelId] });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const handleClose = useCallback(() => {
    setText("");
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Thread</Text>
          <View style={{ width: 32 }} />
        </View>

        {isLoading ? (
          <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        ) : data ? (
          <FlatList
            data={[{ ...data.parent, _isParent: true }, ...data.replies.map(r => ({ ...r, _isParent: false }))]}
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.list}
            ListHeaderComponent={
              data.replies.length > 0
                ? <View style={s.replyCountRow}>
                    <Text style={s.replyCountText}>{data.replies.length} {data.replies.length === 1 ? "reply" : "replies"}</Text>
                    <View style={s.divider} />
                  </View>
                : null
            }
            renderItem={({ item, index }) => (
              <>
                <MsgBubble item={item} />
                {index === 0 && <View style={s.parentDivider} />}
              </>
            )}
          />
        ) : null}

        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder="Reply in thread…"
            placeholderTextColor="#5c6b72"
            value={text}
            onChangeText={setText}
            multiline
          />
          {text.trim() ? (
            <TouchableOpacity
              style={[s.sendBtn, sendMutation.isPending && { opacity: 0.5 }]}
              onPress={() => { if (text.trim()) sendMutation.mutate(); }}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending
                ? <ActivityIndicator color="#003543" size="small" />
                : <Text style={s.sendText}>↑</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1321" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#1a2332",
  },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#8899a6", fontSize: 16 },
  headerTitle: { color: "#e8f0fe", fontSize: 16, fontWeight: "700" },
  list: { padding: 16, paddingBottom: 8 },
  parentDivider: { height: 1, backgroundColor: "#1a2332", marginVertical: 12 },
  replyCountRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  replyCountText: { color: "#5c6b72", fontSize: 12, fontWeight: "600" },
  divider: { flex: 1, height: 1, backgroundColor: "#1a2332" },
  msgRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  msgContent: { flex: 1 },
  msgHeader: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 2 },
  senderName: { color: "#e8f0fe", fontWeight: "700", fontSize: 13 },
  msgTime: { color: "#5c6b72", fontSize: 11 },
  msgText: { color: "#c5d0dc", fontSize: 14, lineHeight: 20 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  reactionChip: { backgroundColor: "#1a2332", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#1a2332",
  },
  input: {
    flex: 1, color: "#e8f0fe", backgroundColor: "#1a2332",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center",
  },
  sendText: { color: "#003543", fontSize: 16, fontWeight: "700" },
});
