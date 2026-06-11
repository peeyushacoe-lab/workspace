import { useState, useRef, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

const SUGGESTIONS = [
  "Summarise my emails from today",
  "Draft a professional out-of-office reply",
  "What should I prioritise this week?",
  "Help me write a meeting agenda",
];

let msgIdCounter = 0;
function nextId() { return String(++msgIdCounter); }

export default function AIScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const historyForApi = useCallback(() =>
    messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    [messages]
  );

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: Message = { id: nextId(), role: "user", content: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply } = await apiRequest<{ reply: string }>("/api/mobile/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: historyForApi(),
        }),
      });
      const aiMsg: Message = { id: nextId(), role: "assistant", content: reply, ts: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      const errMsg: Message = {
        id: nextId(), role: "assistant", ts: Date.now(),
        content: e instanceof Error ? e.message : "Something went wrong. Please try again.",
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, historyForApi]);

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>Nexus</Text>
          <Text style={s.title}>AI Brain</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              void Haptics.selectionAsync();
              Alert.alert("Clear conversation?", undefined, [
                { text: "Cancel", style: "cancel" },
                { text: "Clear", style: "destructive", onPress: () => setMessages([]) },
              ]);
            }}
          >
            <Text style={s.clearBtn}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Message list / empty state */}
      {messages.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>🤖</Text>
          <Text style={s.emptyTitle}>How can I help?</Text>
          <Text style={s.emptyHint}>Ask me anything about your workspace</Text>
          <View style={s.suggestions}>
            {SUGGESTIONS.map((s2, i) => (
              <TouchableOpacity key={i} style={s.chip} onPress={() => void send(s2)}>
                <Text style={s.chipText}>{s2}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <View style={[s.bubble, item.role === "user" ? s.bubbleUser : s.bubbleAI]}>
              {item.role === "assistant" && (
                <Text style={s.aiLabel}>AI</Text>
              )}
              <Text style={[s.bubbleText, item.role === "user" ? s.bubbleTextUser : s.bubbleTextAI]}>
                {item.content}
              </Text>
            </View>
          )}
          ListFooterComponent={loading ? (
            <View style={[s.bubble, s.bubbleAI]}>
              <Text style={s.aiLabel}>AI</Text>
              <ActivityIndicator color="#00d2ff" size="small" style={{ paddingVertical: 4 }} />
            </View>
          ) : null}
        />
      )}

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message Nexus AI…"
          placeholderTextColor="#5c6b72"
          multiline
          maxLength={8000}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => void send(input)}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
          onPress={() => void send(input)}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          <Text style={s.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: "#0f1321" },
  header:         { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  eyebrow:        { fontSize: 11, fontWeight: "700", color: "#00d2ff", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 },
  title:          { fontSize: 22, fontWeight: "800", color: "#dfe1f6" },
  clearBtn:       { color: "#5c6b72", fontSize: 14 },
  emptyWrap:      { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyIcon:      { fontSize: 52, marginBottom: 12 },
  emptyTitle:     { color: "#dfe1f6", fontSize: 20, fontWeight: "700", marginBottom: 6 },
  emptyHint:      { color: "#5c6b72", fontSize: 14, marginBottom: 24 },
  suggestions:    { width: "100%", gap: 10 },
  chip:           { backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.12)" },
  chipText:       { color: "#bbc9cf", fontSize: 14 },
  list:           { padding: 16, paddingBottom: 16, gap: 12 },
  bubble:         { maxWidth: "84%", borderRadius: 16, padding: 12 },
  bubbleUser:     { alignSelf: "flex-end", backgroundColor: "#00d2ff" },
  bubbleAI:       { alignSelf: "flex-start", backgroundColor: "#1b1f2e", borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  aiLabel:        { color: "#00d2ff", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  bubbleText:     { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: "#003543" },
  bubbleTextAI:   { color: "#dfe1f6" },
  inputRow:       { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)" },
  input:          { flex: 1, backgroundColor: "#1b1f2e", borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, color: "#dfe1f6", fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  sendBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center" },
  sendBtnDisabled:{ backgroundColor: "#1b1f2e" },
  sendIcon:       { color: "#003543", fontSize: 18, fontWeight: "700" },
});
