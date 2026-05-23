import { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../src/api/client";

interface DriveFile   { id: string; name: string; mimeType: string; size: string; storageUrl?: string | null; createdAt: string; isStarred: boolean }
interface DriveFolder { id: string; name: string; createdAt: string }
interface DriveData   { files: DriveFile[]; folders: DriveFolder[] }

const MIME_ICONS: Record<string, string> = {
  "application/pdf": "📄",
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

  const qs = folderId ? `?folderId=${folderId}` : "";
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["m-drive", folderId],
    queryFn: () => apiRequest<DriveData>(`/api/mobile/drive/files${qs}`),
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
      </View>

      {isLoading ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.data.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} tintColor="#00d2ff" />}
          renderItem={({ item }) => {
            if (item.kind === "folder") {
              return (
                <TouchableOpacity style={s.row} onPress={() => openFolder(item.data)}>
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
              <TouchableOpacity style={s.row}>
                <Text style={s.icon}>{fileIcon(item.data.mimeType)}</Text>
                <View style={s.info}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.data.isStarred ? "⭐ " : ""}{item.data.name}
                  </Text>
                  <Text style={s.meta}>
                    {formatBytes(item.data.size)} · {new Date(item.data.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={s.empty}>No files here</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: "#0f1321" },
  header:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:   { fontSize: 22, fontWeight: "700", color: "#dfe1f6", flex: 1 },
  back:    { color: "#00d2ff", fontSize: 15 },
  row:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)", gap: 12 },
  icon:    { fontSize: 26, width: 36, textAlign: "center" },
  info:    { flex: 1 },
  name:    { color: "#dfe1f6", fontSize: 14, fontWeight: "600" },
  meta:    { color: "#5c6b72", fontSize: 12, marginTop: 2 },
  chevron: { color: "#5c6b72", fontSize: 22 },
  empty:   { color: "#5c6b72", textAlign: "center", marginTop: 60, fontSize: 14 },
});
