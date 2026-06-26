import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

interface AppItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  route?: string;
  soon?: boolean;
  external?: string;
}

const APPS: AppItem[] = [
  { id: "inbox",    label: "Mail",        icon: "✉️",  color: "#00d2ff",  route: "/(tabs)/index" },
  { id: "chat",     label: "Chat",        icon: "💬",  color: "#7c3aed",  route: "/(tabs)/chat" },
  { id: "meetings", label: "Meetings",    icon: "📹",  color: "#059669",  route: "/(tabs)/meetings" },
  { id: "calendar", label: "Calendar",    icon: "📅",  color: "#2563eb",  route: "/(tabs)/calendar" },
  { id: "drive",    label: "Drive",       icon: "🗂️",  color: "#b45309",  route: "/(tabs)/drive" },
  { id: "notes",    label: "Notes",       icon: "📝",  color: "#65a30d",  route: "/(tabs)/notes" },
  { id: "ai",       label: "AI Brain",    icon: "🤖",  color: "#d97706",  route: "/(tabs)/ai" },
  { id: "activity", label: "Activity",    icon: "📊",  color: "#0891b2",  route: "/(tabs)/activity" },
  { id: "contacts", label: "Contacts",    icon: "👥",  color: "#9333ea",  soon: true },
  { id: "security", label: "Security",    icon: "🛡️",  color: "#dc2626",  soon: true },
  { id: "tasks",    label: "Tasks",       icon: "✅",  color: "#0d9488",  soon: true },
  { id: "settings", label: "Settings",    icon: "⚙️",  color: "#475569",  route: "/(tabs)/settings" },
];

const QUICK_ACTIONS = [
  {
    icon: "🌐",
    label: "Open web app",
    action: () => void Linking.openURL("https://nexus.cybersage.uk"),
  },
  {
    icon: "⚙️",
    label: "Settings & profile",
    route: "/(tabs)/settings",
  },
  {
    icon: "📊",
    label: "Activity feed",
    route: "/(tabs)/activity",
  },
];

export default function MoreScreen() {
  const router = useRouter();

  const handlePress = (app: AppItem) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (app.soon) {
      Alert.alert(app.label, "Coming soon to Nexus mobile.");
      return;
    }
    if (app.external) {
      void Linking.openURL(app.external);
      return;
    }
    if (app.route) {
      router.push(app.route as Parameters<typeof router.push>[0]);
    }
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>More</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.grid}>
          {APPS.map((app) => (
            <TouchableOpacity
              key={app.id}
              style={s.appTile}
              onPress={() => handlePress(app)}
              activeOpacity={0.75}
            >
              <View style={[s.iconBox, { backgroundColor: app.color + "22", borderColor: app.color + "40" }]}>
                <Text style={s.iconText}>{app.icon}</Text>
                {app.soon && (
                  <View style={s.soonBadge}>
                    <Text style={s.soonText}>soon</Text>
                  </View>
                )}
              </View>
              <Text style={s.appLabel} numberOfLines={1}>{app.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>Quick Actions</Text>
        {QUICK_ACTIONS.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={s.quickRow}
            onPress={() => {
              void Haptics.selectionAsync();
              if (item.route) {
                router.push(item.route as Parameters<typeof router.push>[0]);
              } else {
                item.action?.();
              }
            }}
          >
            <View style={s.quickIcon}>
              <Text style={{ fontSize: 18 }}>{item.icon}</Text>
            </View>
            <Text style={s.quickLabel}>{item.label}</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: "#0f1321" },
  header:       { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title:        { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  scroll:       { paddingHorizontal: 16 },
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 8 },
  appTile:      { width: "22%", alignItems: "center", marginBottom: 8 },
  iconBox:      { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, position: "relative" },
  iconText:     { fontSize: 28 },
  soonBadge:    { position: "absolute", top: -4, right: -4, backgroundColor: "#f59e0b", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  soonText:     { color: "#fff", fontSize: 8, fontWeight: "800" },
  appLabel:     { color: "#bbc9cf", fontSize: 11, marginTop: 6, textAlign: "center", fontWeight: "500" },
  divider:      { height: 1, backgroundColor: "rgba(0,210,255,0.08)", marginVertical: 20 },
  sectionTitle: { color: "#5c6b72", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  quickRow:     { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)" },
  quickIcon:    { width: 40, height: 40, borderRadius: 10, backgroundColor: "#1b1f2e", alignItems: "center", justifyContent: "center" },
  quickLabel:   { flex: 1, color: "#dfe1f6", fontSize: 15 },
  chevron:      { color: "#5c6b72", fontSize: 20 },
});
