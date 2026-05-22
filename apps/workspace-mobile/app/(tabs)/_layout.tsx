import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ label, emoji }: { label: string; emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1b1f2e",
          borderTopColor: "rgba(0,210,255,0.1)",
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: "#00d2ff",
        tabBarInactiveTintColor: "#5c6b72",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Inbox", tabBarIcon: () => <TabIcon label="Inbox" emoji="📧" /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: "Chat", tabBarIcon: () => <TabIcon label="Chat" emoji="💬" /> }}
      />
      <Tabs.Screen
        name="drive"
        options={{ title: "Drive", tabBarIcon: () => <TabIcon label="Drive" emoji="📁" /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: "Calendar", tabBarIcon: () => <TabIcon label="Cal" emoji="📅" /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: () => <TabIcon label="Settings" emoji="⚙️" /> }}
      />
    </Tabs>
  );
}
