import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from "react-native";

interface Props {
  url: string;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null | undefined): string {
  if (!mime) return "📎";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("pdf")) return "📄";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📊";
  if (mime.includes("zip") || mime.includes("archive")) return "🗜️";
  return "📎";
}

export function FilePreview({ url, name, mime, size }: Props) {
  const isImage = mime?.startsWith("image/") ?? false;

  const open = () => {
    Linking.openURL(url).catch(() => {});
  };

  if (isImage) {
    return (
      <TouchableOpacity onPress={open} activeOpacity={0.85} style={s.imageWrap}>
        <Image
          source={{ uri: url }}
          style={s.image}
          resizeMode="cover"
        />
        {name && <Text style={s.imageName} numberOfLines={1}>{name}</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={open} activeOpacity={0.8} style={s.fileCard}>
      <Text style={s.fileIcon}>{fileIcon(mime)}</Text>
      <View style={s.fileInfo}>
        <Text style={s.fileName} numberOfLines={1}>{name ?? "Attachment"}</Text>
        {size ? <Text style={s.fileSize}>{formatSize(size)}</Text> : null}
      </View>
      <Text style={s.openText}>Open ›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  imageWrap:  { marginTop: 6, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  image:      { width: 220, height: 150 },
  imageName:  { color: "#5c6b72", fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#0f1321" },
  fileCard:   { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, backgroundColor: "#1b1f2e", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)" },
  fileIcon:   { fontSize: 24 },
  fileInfo:   { flex: 1 },
  fileName:   { color: "#dfe1f6", fontSize: 13, fontWeight: "600" },
  fileSize:   { color: "#5c6b72", fontSize: 11, marginTop: 1 },
  openText:   { color: "#00d2ff", fontSize: 13, fontWeight: "600" },
});
