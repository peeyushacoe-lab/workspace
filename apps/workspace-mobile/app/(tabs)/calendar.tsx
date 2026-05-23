import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../src/api/client";

interface CalEvent { id: string; title: string; startTime: string; endTime: string; location?: string | null; isAllDay: boolean }

export default function CalendarScreen() {
  const now   = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: events, isLoading } = useQuery({
    queryKey: ["calendar"],
    queryFn: () => apiRequest<CalEvent[]>(`/api/mobile/calendar/events?month=${month}`),
  });

  const sorted = (events ?? [])
    .filter(e => new Date(e.startTime) >= new Date(now.setHours(0, 0, 0, 0)))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>Calendar</Text>
        <Text style={s.subtitle}>{now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</Text>
      </View>
      {isLoading
        ? <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={sorted}
            keyExtractor={e => e.id}
            renderItem={({ item }) => {
              const start = new Date(item.startTime);
              const end   = new Date(item.endTime);
              return (
                <View style={s.card}>
                  <View style={s.timebar}>
                    <Text style={s.day}>{start.getDate()}</Text>
                    <Text style={s.dayName}>{start.toLocaleDateString("en", { weekday: "short" })}</Text>
                  </View>
                  <View style={s.details}>
                    <Text style={s.evtTitle}>{item.title}</Text>
                    <Text style={s.evtTime}>
                      {item.isAllDay ? "All day" : `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </Text>
                    {item.location && <Text style={s.evtLocation}>📍 {item.location}</Text>}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={s.empty}>No upcoming events</Text>}
          />
        )
      }
    </View>
  );
}

const s = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: "#0f1321" },
  header:     { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:      { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  subtitle:   { color: "#bbc9cf", fontSize: 13, marginTop: 2 },
  card:       { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)", gap: 14 },
  timebar:    { alignItems: "center", width: 36 },
  day:        { color: "#00d2ff", fontSize: 20, fontWeight: "700" },
  dayName:    { color: "#5c6b72", fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  details:    { flex: 1 },
  evtTitle:   { color: "#dfe1f6", fontSize: 15, fontWeight: "600", marginBottom: 3 },
  evtTime:    { color: "#bbc9cf", fontSize: 12 },
  evtLocation:{ color: "#5c6b72", fontSize: 12, marginTop: 2 },
  empty:      { color: "#5c6b72", textAlign: "center", marginTop: 60, fontSize: 14 },
});
