import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../src/api/client";

interface DriveFile { id: string; name: string; mimeType: string; size: string; storageUrl?: string | null; createdAt: string }

const MIME_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "image/jpeg": "🖼️", "image/png": "🖼️", "image/webp": "🖼️",
  "video/mp4": "🎬",
  "audio/mpeg": "🎵",
  "application/zip": "🗜️",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
};
function fileIcon(mime: string) { return MIME_ICONS[mime] ?? "📎"; }
function formatBytes(bytes: string) {
  const n = parseInt(bytes, 10);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DriveScreen() {
  const { data: files, isLoading } = useQuery({
    queryKey: ["drive"],
    queryFn: () => apiRequest<{ files: DriveFile[] }>("/api/drive/files").then(r => r.files),
  });

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Drive</Text>
      </View>
      {isLoading
        ? <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={files ?? []}
            keyExtractor={f => f.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.row}>
                <Text style={s.icon}>{fileIcon(item.mimeType)}</Text>
                <View style={s.info}>
                  <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.meta}>{formatBytes(item.size)} · {new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty}>No files yet</Text>}
          />
        )
      }
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f1321" },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:  { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  row:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)", gap: 12 },
  icon:   { fontSize: 26, width: 36, textAlign: "center" },
  info:   { flex: 1 },
  name:   { color: "#dfe1f6", fontSize: 14, fontWeight: "600" },
  meta:   { color: "#5c6b72", fontSize: 12, marginTop: 2 },
  empty:  { color: "#5c6b72", textAlign: "center", marginTop: 60, fontSize: 14 },
});
