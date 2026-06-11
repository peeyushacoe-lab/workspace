import { useState, useRef, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string | null;
  updatedAt: string;
}

const NOTE_COLORS = [
  null, "#1b2a1b", "#2a1b1b", "#1b1b2a", "#2a2a1b", "#1b2a2a", "#2a1b2a",
];

const COLOR_DOTS: Record<string, string> = {
  "#1b2a1b": "#22c55e",
  "#2a1b1b": "#ef4444",
  "#1b1b2a": "#6366f1",
  "#2a2a1b": "#eab308",
  "#1b2a2a": "#06b6d4",
  "#2a1b2a": "#a855f7",
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotesScreen() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: notes, isLoading } = useQuery({
    queryKey: ["notes", query],
    queryFn: () => apiRequest<Note[]>(`/api/mobile/notes${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      apiRequest<Note>("/api/mobile/notes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (note) => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      openEditor(note);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Note> & { id: string }) =>
      apiRequest<Note>(`/api/mobile/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: boolean }>(`/api/mobile/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"] });
      setEditing(null);
    },
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      apiRequest<Note>(`/api/mobile/notes/${id}`, { method: "PUT", body: JSON.stringify({ pinned }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notes"] }),
  });

  const openEditor = (note: Note) => {
    setEditing(note);
    setEditTitle(note.title === "Untitled Note" ? "" : note.title);
    setEditContent(note.content);
    setEditColor(note.color);
  };

  const scheduleAutosave = useCallback((title: string, content: string, color: string | null) => {
    if (!editing) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateMutation.mutateAsync({
          id: editing.id,
          title: title.trim() || "Untitled Note",
          content,
          color,
        });
      } catch {}
      setSaving(false);
    }, 1200);
  }, [editing]);

  const handleTitleChange = (v: string) => { setEditTitle(v); scheduleAutosave(v, editContent, editColor); };
  const handleContentChange = (v: string) => { setEditContent(v); scheduleAutosave(editTitle, v, editColor); };
  const handleColorChange = (c: string | null) => {
    setEditColor(c);
    if (editing) {
      updateMutation.mutate({ id: editing.id, color: c });
    }
  };

  const closeEditor = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        title: editTitle.trim() || "Untitled Note",
        content: editContent,
        color: editColor,
      });
    }
    setEditing(null);
    setSaving(false);
  };

  const confirmDelete = () => {
    Alert.alert("Delete note?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => { if (editing) deleteMutation.mutate(editing.id); },
      },
    ]);
  };

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Notes</Text>
        <TouchableOpacity
          style={s.fab}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); createMutation.mutate({ title: "", content: "" }); }}
          activeOpacity={0.8}
        >
          <Text style={s.fabText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.search}
          placeholder="Search notes…"
          placeholderTextColor="#5c6b72"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Text style={{ color: "#5c6b72", fontSize: 16, paddingRight: 4 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notes ?? []}
          keyExtractor={n => n.id}
          contentContainerStyle={s.list}
          numColumns={2}
          columnWrapperStyle={s.row}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📝</Text>
              <Text style={s.emptyText}>No notes yet</Text>
              <Text style={s.emptyHint}>Tap + to create your first note</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, item.color ? { backgroundColor: item.color } : null]}
              onPress={() => { void Haptics.selectionAsync(); openEditor(item); }}
              onLongPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                pinMutation.mutate({ id: item.id, pinned: !item.pinned });
              }}
              activeOpacity={0.8}
            >
              {item.pinned && <Text style={s.pinBadge}>📌</Text>}
              <Text style={s.cardTitle} numberOfLines={2}>
                {item.title || "Untitled Note"}
              </Text>
              {item.content.length > 0 && (
                <Text style={s.cardSnippet} numberOfLines={4}>{item.content}</Text>
              )}
              <Text style={s.cardDate}>{relTime(item.updatedAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Editor Modal */}
      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeEditor}>
        <KeyboardAvoidingView style={[s.editor, editing?.color ? { backgroundColor: editing.color } : null]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Toolbar */}
          <View style={s.editorHeader}>
            <TouchableOpacity onPress={closeEditor}>
              <Text style={s.backBtn}>← Done</Text>
            </TouchableOpacity>
            <View style={s.editorHeaderRight}>
              {saving && <Text style={s.savingLabel}>Saving…</Text>}
              <TouchableOpacity onPress={confirmDelete} style={{ marginLeft: 16 }}>
                <Text style={s.deleteBtn}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={s.editorBody} keyboardShouldPersistTaps="handled">
            <TextInput
              style={s.editorTitle}
              value={editTitle}
              onChangeText={handleTitleChange}
              placeholder="Title"
              placeholderTextColor="#5c6b72"
              multiline={false}
              returnKeyType="next"
            />
            <TextInput
              style={s.editorContent}
              value={editContent}
              onChangeText={handleContentChange}
              placeholder="Start writing…"
              placeholderTextColor="#5c6b72"
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </ScrollView>

          {/* Color picker */}
          <View style={s.colorBar}>
            {NOTE_COLORS.map((c) => (
              <TouchableOpacity
                key={c ?? "default"}
                style={[s.colorDot, { backgroundColor: c ? COLOR_DOTS[c] ?? "#5c6b72" : "#1b1f2e", borderWidth: editColor === c ? 2 : 0, borderColor: "#fff" }]}
                onPress={() => handleColorChange(c)}
              />
            ))}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: "#0f1321" },
  header:         { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14 },
  title:          { fontSize: 28, fontWeight: "800", color: "#dfe1f6" },
  fab:            { width: 36, height: 36, borderRadius: 18, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center" },
  fabText:        { color: "#003543", fontSize: 24, fontWeight: "700", lineHeight: 30 },
  searchWrap:     { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 12, backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  searchIcon:     { fontSize: 13, marginRight: 8 },
  search:         { flex: 1, paddingVertical: 10, color: "#dfe1f6", fontSize: 14 },
  list:           { padding: 8, paddingBottom: 100 },
  row:            { justifyContent: "space-between" },
  card:           { flex: 1, margin: 6, minHeight: 130, backgroundColor: "#1b1f2e", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  pinBadge:       { fontSize: 11, marginBottom: 4 },
  cardTitle:      { color: "#dfe1f6", fontWeight: "700", fontSize: 14, marginBottom: 6 },
  cardSnippet:    { color: "#bbc9cf", fontSize: 12, lineHeight: 17, flex: 1 },
  cardDate:       { color: "#5c6b72", fontSize: 10, marginTop: 8 },
  emptyWrap:      { alignItems: "center", marginTop: 80, gap: 8 },
  emptyIcon:      { fontSize: 44 },
  emptyText:      { color: "#bbc9cf", fontSize: 16, fontWeight: "600" },
  emptyHint:      { color: "#5c6b72", fontSize: 13 },
  // Editor
  editor:         { flex: 1, backgroundColor: "#0f1321" },
  editorHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  editorHeaderRight: { flexDirection: "row", alignItems: "center" },
  backBtn:        { color: "#00d2ff", fontSize: 15, fontWeight: "600" },
  savingLabel:    { color: "#5c6b72", fontSize: 12 },
  deleteBtn:      { fontSize: 18 },
  editorBody:     { flex: 1, padding: 16 },
  editorTitle:    { color: "#dfe1f6", fontSize: 24, fontWeight: "700", marginBottom: 16, paddingTop: 8 },
  editorContent:  { color: "#dfe1f6", fontSize: 15, lineHeight: 24, minHeight: 400 },
  colorBar:       { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "rgba(0,210,255,0.08)" },
  colorDot:       { width: 26, height: 26, borderRadius: 13 },
});
