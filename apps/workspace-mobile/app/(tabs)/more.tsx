import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

interface AppItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  route?: string;
  soon?: boolean;
}

const APPS: AppItem[] = [
  { id: "inbox",    label: "Mail",        icon: "✉️",  color: "#00d2ff",  route: "/(tabs)/index" },
  { id: "chat",     label: "Chat",        icon: "💬",  color: "#7c3aed",  route: "/(tabs)/chat" },
  { id: "drive",    label: "Drive",       icon: "🗂️",  color: "#059669",  route: "/(tabs)/drive" },
  { id: "calendar", label: "Calendar",    icon: "📅",  color: "#2563eb",  route: "/(tabs)/calendar" },
  { id: "ai",       label: "AI Brain",    icon: "🤖",  color: "#d97706",  soon: true },
  { id: "calls",    label: "Calls",       icon: "📞",  color: "#0891b2",  soon: true },
  { id: "notes",    label: "Notes",       icon: "📝",  color: "#65a30d",  soon: true },
  { id: "contacts", label: "Contacts",    icon: "👥",  color: "#9333ea",  soon: true },
  { id: "files",    label: "Files",       icon: "📁",  color: "#b45309",  soon: true },
  { id: "security", label: "Security",    icon: "🛡️",  color: "#dc2626",  soon: true },
  { id: "tasks",    label: "Tasks",       icon: "✅",  color: "#0d9488",  soon: true },
  { id: "settings", label: "Settings",    icon: "⚙️",  color: "#475569",  route: "/(tabs)/settings" },
];

export default function MoreScreen() {
  const router = useRouter();

  const handlePress = (app: AppItem) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (app.soon) {
      Alert.alert(app.label, "Coming soon to Nexus mobile.");
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

      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        <View style={s.row}>
          {APPS.map((app, i) => (
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

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        {[
          { icon: "🔍", label: "Search everything", action: () => Alert.alert("Search", "Global search coming soon.") },
          { icon: "🔔", label: "Notification centre", action: () => Alert.alert("Notifications", "Notification centre coming soon.") },
          { icon: "📊", label: "Activity feed", action: () => Alert.alert("Activity", "Activity feed coming soon.") },
          { icon: "🌐", label: "Open web app", action: () => Alert.alert("Web App", "Open Nexus in your browser.") },
        ].map((item, i) => (
          <TouchableOpacity
            key={i}
            style={s.quickRow}
            onPress={() => { void Haptics.selectionAsync(); item.action(); }}
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
  screen:      { flex: 1, backgroundColor: "#0f1321" },
  header:      { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  title:       { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  grid:        { paddingHorizontal: 16 },
  row:         { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 8 },
  appTile:     { width: "22%", alignItems: "center", marginBottom: 8 },
  iconBox:     { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, position: "relative" },
  iconText:    { fontSize: 28 },
  soonBadge:   { position: "absolute", top: -4, right: -4, backgroundColor: "#f59e0b", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  soonText:    { color: "#fff", fontSize: 8, fontWeight: "800" },
  appLabel:    { color: "#bbc9cf", fontSize: 11, marginTop: 6, textAlign: "center", fontWeight: "500" },
  divider:     { height: 1, backgroundColor: "rgba(0,210,255,0.08)", marginVertical: 20 },
  sectionTitle: { color: "#5c6b72", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  quickRow:    { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.05)" },
  quickIcon:   { width: 40, height: 40, borderRadius: 10, backgroundColor: "#1b1f2e", alignItems: "center", justifyContent: "center" },
  quickLabel:  { flex: 1, color: "#dfe1f6", fontSize: 15 },
  chevron:     { color: "#5c6b72", fontSize: 20 },
});
