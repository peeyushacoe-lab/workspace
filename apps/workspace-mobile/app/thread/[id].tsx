import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { inboxApi } from "../../src/api/inbox";
import { apiRequest } from "../../src/api/client";
import { UserProfileSheet } from "../../src/components/UserProfileSheet";

interface AISummary { summary: string; keyPoints: string[]; actionItems: string[] }

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();
  const [replyBody, setReply]       = useState("");
  const [showReply, setShow]        = useState(false);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [aiPanel, setAiPanel]       = useState<"none" | "summarize" | "smart-reply">("none");
  const [summary, setSummary]       = useState<AISummary | null>(null);
  const [smartReply, setSmartReply] = useState("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState<string | null>(null);
  const [replyTone, setTone]        = useState<"professional" | "friendly" | "brief">("professional");

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
      replyToThreadId: id,
    }),
    onSuccess: () => {
      setReply(""); setShow(false);
      void qc.invalidateQueries({ queryKey: ["thread", id] });
    },
  });

  const runAI = async (action: "summarize" | "smart-reply", tone?: string) => {
    setAiLoading(true); setAiError(null);
    try {
      if (action === "summarize") {
        const data = await apiRequest<AISummary>("/api/mobile/ai", {
          method: "POST",
          body: JSON.stringify({ action, threadId: id }),
        });
        setSummary(data);
        setAiPanel("summarize");
      } else {
        const data = await apiRequest<{ reply: string }>("/api/mobile/ai", {
          method: "POST",
          body: JSON.stringify({ action, threadId: id, tone: tone ?? replyTone }),
        });
        setSmartReply(data.reply);
        setAiPanel("smart-reply");
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    }
    setAiLoading(false);
  };

  const useSmartReply = () => {
    setReply(smartReply);
    setAiPanel("none");
    setShow(true);
  };

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

      {/* AI action bar */}
      <View style={s.aiBar}>
        <TouchableOpacity
          style={s.aiBtn}
          onPress={() => runAI("summarize")}
          disabled={aiLoading}
        >
          <Text style={s.aiBtnText}>✦ Summarize</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.aiBtn}
          onPress={() => runAI("smart-reply", replyTone)}
          disabled={aiLoading}
        >
          <Text style={s.aiBtnText}>⚡ Smart Reply</Text>
        </TouchableOpacity>
        {aiLoading && <ActivityIndicator color="#00d2ff" size="small" />}
      </View>

      {aiError && (
        <View style={s.aiError}>
          <Text style={s.aiErrorText}>{aiError}</Text>
        </View>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.messages}>
        {thread.messages.map(msg => (
          <View key={msg.id} style={s.msgCard}>
            <View style={s.msgMeta}>
              <TouchableOpacity
                onPress={() => { void Haptics.selectionAsync(); setProfileEmail(msg.from); }}
                activeOpacity={0.7}
              >
                <Text style={s.msgFrom}>{msg.from}</Text>
              </TouchableOpacity>
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

      {/* AI Summary Modal */}
      <Modal visible={aiPanel === "summarize"} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAiPanel("none")}>
        <View style={s.aiModal}>
          <View style={s.aiModalHeader}>
            <Text style={s.aiModalTitle}>✦ Thread Summary</Text>
            <TouchableOpacity onPress={() => setAiPanel("none")}>
              <Text style={s.aiModalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.aiModalBody} contentContainerStyle={{ padding: 20, gap: 20 }}>
            {summary && (
              <>
                <View style={s.aiSection}>
                  <Text style={s.aiSectionLabel}>Overview</Text>
                  <Text style={s.aiText}>{summary.summary}</Text>
                </View>
                {summary.keyPoints.length > 0 && (
                  <View style={s.aiSection}>
                    <Text style={s.aiSectionLabel}>Key Points</Text>
                    {summary.keyPoints.map((p, i) => (
                      <Text key={i} style={s.aiListItem}>• {p}</Text>
                    ))}
                  </View>
                )}
                {summary.actionItems.length > 0 && (
                  <View style={s.aiSection}>
                    <Text style={s.aiSectionLabel}>Action Items</Text>
                    {summary.actionItems.map((a, i) => (
                      <Text key={i} style={s.aiListItem}>☐ {a}</Text>
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* User Profile Sheet */}
      <UserProfileSheet
        email={profileEmail}
        onClose={() => setProfileEmail(null)}
        onCompose={(email) => { setReply(`To: ${email}\n\n`); setShow(true); }}
      />

      {/* Smart Reply Modal */}
      <Modal visible={aiPanel === "smart-reply"} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAiPanel("none")}>
        <View style={s.aiModal}>
          <View style={s.aiModalHeader}>
            <Text style={s.aiModalTitle}>⚡ Smart Reply</Text>
            <TouchableOpacity onPress={() => setAiPanel("none")}>
              <Text style={s.aiModalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={s.aiModalBody} contentContainerStyle={{ padding: 20 }}>
            {/* Tone selector */}
            <View style={s.toneRow}>
              {(["professional", "friendly", "brief"] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.tonePill, replyTone === t && s.tonePillActive]}
                  onPress={() => { setTone(t); void runAI("smart-reply", t); }}
                >
                  <Text style={[s.tonePillText, replyTone === t && s.tonePillTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.aiSection}>
              <Text style={s.aiText}>{smartReply}</Text>
            </View>
            <TouchableOpacity style={s.useReplyBtn} onPress={useSmartReply}>
              <Text style={s.useReplyText}>Use this Reply</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: "#0f1321" },
  center:          { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1321" },
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  back:            { color: "#00d2ff", fontSize: 15 },
  mailbox:         { color: "#5c6b72", fontSize: 12 },
  subject:         { fontSize: 18, fontWeight: "700", color: "#dfe1f6", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  // AI bar
  aiBar:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  aiBtn:           { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "rgba(0,210,255,0.08)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.18)" },
  aiBtnText:       { color: "#00d2ff", fontSize: 12, fontWeight: "600" },
  aiError:         { marginHorizontal: 16, marginTop: 6, padding: 10, backgroundColor: "rgba(255,77,109,0.1)", borderRadius: 8 },
  aiErrorText:     { color: "#ff4d6d", fontSize: 12 },
  // Thread
  scroll:          { flex: 1 },
  messages:        { padding: 16, gap: 12 },
  msgCard:         { backgroundColor: "#1b1f2e", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  msgMeta:         { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  msgFrom:         { color: "#00d2ff", fontSize: 13, fontWeight: "600", flex: 1 },
  msgDate:         { color: "#5c6b72", fontSize: 11 },
  msgBody:         { color: "#dfe1f6", fontSize: 14, lineHeight: 20 },
  // Reply
  replyBox:        { padding: 16, backgroundColor: "#1b1f2e", borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)" },
  replyInput:      { backgroundColor: "#0f1321", borderRadius: 10, padding: 12, color: "#dfe1f6", minHeight: 80, textAlignVertical: "top", fontSize: 14 },
  replyActions:    { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 10 },
  cancel:          { color: "#bbc9cf", fontSize: 14 },
  sendBtn:         { backgroundColor: "#00d2ff", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  sendText:        { color: "#003543", fontWeight: "700", fontSize: 14 },
  replyToggle:     { margin: 16, backgroundColor: "rgba(0,210,255,0.1)", borderRadius: 10, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,210,255,0.2)" },
  replyToggleText: { color: "#00d2ff", fontWeight: "600", fontSize: 15 },
  // AI Modal
  aiModal:         { flex: 1, backgroundColor: "#0f1321" },
  aiModalHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  aiModalTitle:    { color: "#dfe1f6", fontSize: 18, fontWeight: "700" },
  aiModalClose:    { color: "#00d2ff", fontSize: 15 },
  aiModalBody:     { flex: 1 },
  aiSection:       { backgroundColor: "#1b1f2e", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  aiSectionLabel:  { color: "#00d2ff", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  aiText:          { color: "#dfe1f6", fontSize: 14, lineHeight: 22 },
  aiListItem:      { color: "#dfe1f6", fontSize: 14, lineHeight: 24, marginLeft: 4 },
  toneRow:         { flexDirection: "row", gap: 8, marginBottom: 16 },
  tonePill:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.18)", backgroundColor: "transparent" },
  tonePillActive:  { backgroundColor: "#00d2ff", borderColor: "#00d2ff" },
  tonePillText:    { color: "#bbc9cf", fontSize: 13 },
  tonePillTextActive: { color: "#003543", fontWeight: "700" },
  useReplyBtn:     { marginTop: 20, backgroundColor: "#00d2ff", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  useReplyText:    { color: "#003543", fontWeight: "700", fontSize: 15 },
});
