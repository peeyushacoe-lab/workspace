import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Linking,
  Animated, TextInput, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";

interface DriveFile   { id: string; name: string; mimeType: string; size: string; storageUrl?: string | null; createdAt: string; isStarred: boolean }
interface DriveFolder { id: string; name: string; createdAt: string }
interface DriveData   { files: DriveFile[]; folders: DriveFolder[] }

const MIME_ICONS: Record<string, string> = {
  "application/pdf":   "📄",
  "image/jpeg": "🖼️", "image/png": "🖼️", "image/gif": "🖼️", "image/webp": "🖼️",
  "video/mp4": "🎬", "video/quicktime": "🎬",
  "audio/mpeg": "🎵", "audio/wav": "🎵",
  "application/zip": "🗜️", "application/x-rar-compressed": "🗜️",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "📋",
  "text/plain": "📃", "text/csv": "📊",
};

function fileIcon(mime: string) { return MIME_ICONS[mime] ?? "📎"; }

function formatBytes(bytes: string | number) {
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(n) || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DriveScreen() {
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const qs = folderId ? `?folderId=${folderId}` : "";
  const searchQs = query ? `?q=${encodeURIComponent(query)}` : "";

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["m-drive", folderId, query],
    queryFn: () =>
      query
        ? apiRequest<DriveData>(`/api/mobile/drive/files?q=${encodeURIComponent(query)}`)
        : apiRequest<DriveData>(`/api/mobile/drive/files${qs}`),
  });

  const starMutation = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      apiRequest(`/api/mobile/drive/files/${id}`, { method: "PATCH", body: JSON.stringify({ isStarred: starred }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-drive"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/mobile/drive/files/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["m-drive"] }),
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("/api/mobile/drive/folders", {
        method: "POST",
        body: JSON.stringify({ name, parentId: folderId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["m-drive"] });
      setShowNewFolder(false);
      setNewFolderName("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Failed to create folder"),
  });

  const openFolder = (f: DriveFolder) => {
    setBreadcrumb((prev) => [...prev, { id: f.id, name: f.name }]);
    setFolderId(f.id);
  };

  const goBack = () => {
    const up = breadcrumb.slice(0, -1);
    setBreadcrumb(up);
    setFolderId(up.length ? up[up.length - 1].id : null);
  };

  const openFile = (file: DriveFile) => {
    if (!file.storageUrl) {
      // Try via attachment proxy
      void Linking.openURL(`/api/drive/files/${file.id}/download`);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(file.storageUrl);
  };

  const showFileActions = (file: DriveFile) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      file.name,
      formatBytes(file.size),
      [
        {
          text: file.storageUrl ? "Open / Preview" : "Download",
          onPress: () => openFile(file),
        },
        {
          text: file.isStarred ? "★ Unstar" : "☆ Star",
          onPress: () => starMutation.mutate({ id: file.id, starred: !file.isStarred }),
        },
        {
          text: "🗑 Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert("Delete file?", `"${file.name}" will be permanently deleted.`, [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(file.id) },
            ]),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const uploadImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload files.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) return;

    setUploading(true);
    try {
      await apiRequest("/api/mobile/drive/upload", {
        method: "POST",
        body: JSON.stringify({
          name: asset.fileName ?? `upload_${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? "image/jpeg",
          base64: asset.base64,
          folderId,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["m-drive"] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setUploading(false);
    }
  };

  const showUploadMenu = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Add to Drive",
      undefined,
      [
        { text: "📷 Upload photo", onPress: () => void uploadImage() },
        { text: "📁 New folder", onPress: () => setShowNewFolder(true) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const folders = data?.folders ?? [];
  const files   = data?.files   ?? [];
  const items: ({ kind: "folder"; data: DriveFolder } | { kind: "file"; data: DriveFile })[] = [
    ...folders.map((f) => ({ kind: "folder" as const, data: f })),
    ...files.map((f)   => ({ kind: "file"   as const, data: f })),
  ];

  return (
    <View style={s.screen}>
      <View style={s.header}>
        {folderId ? (
          <TouchableOpacity onPress={goBack} style={{ marginRight: 10 }}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={s.title} numberOfLines={1}>
          {breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : "Drive"}
        </Text>
        <TouchableOpacity onPress={() => setShowSearch(v => !v)} style={s.searchBtn}>
          <Text style={{ fontSize: 18 }}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={s.searchBar}>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search files…"
            placeholderTextColor="#5c6b72"
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Text style={{ color: "#5c6b72", fontSize: 16, paddingHorizontal: 4 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.data.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor="#00d2ff" />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>🗂️</Text>
              <Text style={s.emptyText}>{query ? "No results" : "No files here"}</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === "folder") {
              return (
                <TouchableOpacity style={s.row} onPress={() => { void Haptics.selectionAsync(); openFolder(item.data); }}>
                  <Text style={s.icon}>📁</Text>
                  <View style={s.info}>
                    <Text style={s.name} numberOfLines={1}>{item.data.name}</Text>
                    <Text style={s.meta}>{new Date(item.data.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                style={s.row}
                onPress={() => { void Haptics.selectionAsync(); openFile(item.data); }}
                onLongPress={() => showFileActions(item.data)}
                activeOpacity={0.7}
              >
                <Text style={s.icon}>{fileIcon(item.data.mimeType)}</Text>
                <View style={s.info}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.data.isStarred ? "⭐ " : ""}{item.data.name}
                  </Text>
                  <Text style={s.meta}>
                    {formatBytes(item.data.size)} · {new Date(item.data.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => showFileActions(item.data)} style={s.moreBtn}>
                  <Text style={s.moreText}>···</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, uploading && s.fabUploading]}
        onPress={uploading ? undefined : showUploadMenu}
        activeOpacity={0.85}
      >
        {uploading
          ? <ActivityIndicator color="#003543" size="small" />
          : <Text style={s.fabText}>+</Text>
        }
      </TouchableOpacity>

      {/* New folder modal */}
      <Modal visible={showNewFolder} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowNewFolder(false)}>
        <KeyboardAvoidingView style={s.folderModal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.folderHeader}>
            <TouchableOpacity onPress={() => { setShowNewFolder(false); setNewFolderName(""); }}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.folderTitle}>New Folder</Text>
            <TouchableOpacity
              onPress={() => { if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim()); }}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              {createFolderMutation.isPending
                ? <ActivityIndicator color="#00d2ff" size="small" />
                : <Text style={[s.createBtn, !newFolderName.trim() && s.createBtnDisabled]}>Create</Text>
              }
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.folderInput}
            value={newFolderName}
            onChangeText={setNewFolderName}
            placeholder="Folder name"
            placeholderTextColor="#5c6b72"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim()); }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: "#0f1321" },
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:         { fontSize: 22, fontWeight: "700", color: "#dfe1f6", flex: 1 },
  back:          { color: "#00d2ff", fontSize: 15 },
  searchBtn:     { padding: 4 },
  searchBar:     { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)" },
  searchInput:   { flex: 1, paddingVertical: 10, color: "#dfe1f6", fontSize: 14 },
  row:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)", gap: 12 },
  icon:          { fontSize: 26, width: 36, textAlign: "center" },
  info:          { flex: 1 },
  name:          { color: "#dfe1f6", fontSize: 14, fontWeight: "600" },
  meta:          { color: "#5c6b72", fontSize: 12, marginTop: 2 },
  chevron:       { color: "#5c6b72", fontSize: 22 },
  moreBtn:       { padding: 8 },
  moreText:      { color: "#5c6b72", fontSize: 18, letterSpacing: 1 },
  emptyWrap:     { alignItems: "center", marginTop: 80, gap: 8 },
  emptyIcon:     { fontSize: 44 },
  emptyText:     { color: "#5c6b72", fontSize: 14 },
  // FAB
  fab:           { position: "absolute", bottom: 28, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: "#00d2ff", alignItems: "center", justifyContent: "center", shadowColor: "#00d2ff", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabUploading:  { backgroundColor: "#1b1f2e" },
  fabText:       { color: "#003543", fontSize: 28, fontWeight: "700", lineHeight: 32 },
  // Folder modal
  folderModal:   { flex: 1, backgroundColor: "#0f1321" },
  folderHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  folderTitle:   { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  cancelBtn:     { color: "#bbc9cf", fontSize: 15 },
  createBtn:     { color: "#00d2ff", fontSize: 15, fontWeight: "700" },
  createBtnDisabled: { color: "#3c494e" },
  folderInput:   { margin: 20, backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#dfe1f6", fontSize: 16, borderWidth: 1, borderColor: "rgba(0,210,255,0.12)" },
});
