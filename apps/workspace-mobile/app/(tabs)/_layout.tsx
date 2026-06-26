import { Tabs } from "expo-router";
import { View } from "react-native";
import Svg, { Path, Circle, Rect, Polyline, Line } from "react-native-svg";

function InboxIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M22 12h-6l-2 3H10l-2-3H2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function ChatIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function MeetingsIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M23 7l-7 5 7 5V7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Rect x="1" y="5" width="15" height="14" rx="2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

function NotesIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Polyline points="14 2 14 8 20 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Line x1="16" y1="13" x2="8" y2="13" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
      <Line x1="16" y1="17" x2="8" y2="17" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
      <Polyline points="10 9 9 9 8 9" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
    </Svg>
  );
}

function AIIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a4 4 0 014 4v1h1a3 3 0 010 6h-1v1a4 4 0 01-8 0v-1H7a3 3 0 010-6h1V6a4 4 0 014-4z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
      <Circle cx="9" cy="10" r="1" fill={color}/>
      <Circle cx="15" cy="10" r="1" fill={color}/>
      <Path d="M9 15s1 1 3 1 3-1 3-1" stroke={color} strokeWidth={1.8} strokeLinecap="round"/>
    </Svg>
  );
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="5" cy="12" r="1.5" fill={color}/>
      <Circle cx="12" cy="12" r="1.5" fill={color}/>
      <Circle cx="19" cy="12" r="1.5" fill={color}/>
    </Svg>
  );
}

function TabIcon({ Icon, focused }: { Icon: React.ComponentType<{ color: string }>; focused: boolean }) {
  return (
    <View style={{
      alignItems: "center", justifyContent: "center",
      width: 40, height: 28, borderRadius: 14,
      backgroundColor: focused ? "rgba(0,210,255,0.12)" : "transparent",
    }}>
      <Icon color={focused ? "#00d2ff" : "#5c6b72"} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0a0d1c",
          borderTopColor: "rgba(0,210,255,0.08)",
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 10,
          paddingTop: 6,
          elevation: 0,
        },
        tabBarActiveTintColor: "#00d2ff",
        tabBarInactiveTintColor: "#5c6b72",
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inbox",
          tabBarIcon: ({ focused }) => <TabIcon Icon={InboxIcon} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }) => <TabIcon Icon={ChatIcon} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          title: "Meet",
          tabBarIcon: ({ focused }) => <TabIcon Icon={MeetingsIcon} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: "Notes",
          tabBarIcon: ({ focused }) => <TabIcon Icon={NotesIcon} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarIcon: ({ focused }) => <TabIcon Icon={AIIcon} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ focused }) => <TabIcon Icon={MoreIcon} focused={focused} />,
        }}
      />
      {/* Hidden tabs — accessible via router.push */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="drive" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
