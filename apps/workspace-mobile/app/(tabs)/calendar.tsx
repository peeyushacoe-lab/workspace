import { useState, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, Switch, Alert, RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../../src/api/client";

interface CalEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  description?: string | null;
  isAllDay: boolean;
  visibility?: string;
  color?: string | null;
}

const EVENT_COLORS = [
  { value: null,      dot: "#00d2ff" },
  { value: "#7c3aed", dot: "#7c3aed" },
  { value: "#059669", dot: "#059669" },
  { value: "#dc2626", dot: "#dc2626" },
  { value: "#d97706", dot: "#d97706" },
  { value: "#2563eb", dot: "#2563eb" },
];

function pad(n: number) { return String(n).padStart(2, "0"); }

function toLocalDateTimeString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventColor(e: CalEvent) {
  return e.color ?? "#00d2ff";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatEventDate(e: CalEvent) {
  const start = new Date(e.startTime);
  const end = new Date(e.endTime);
  if (e.isAllDay) return "All day";
  return `${formatTime(e.startTime)} – ${formatTime(e.endTime)}`;
}

// Build a 7-day strip starting from today
function buildDateStrip() {
  const days: Date[] = [];
  const now = new Date();
  for (let i = -1; i <= 13; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarScreen() {
  const qc = useQueryClient();
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const [creating, setCreating] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<CalEvent | null>(null);

  // Form state
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIsAllDay, setNewIsAllDay] = useState(false);
  const [newColor, setNewColor] = useState<string | null>(null);
  const [newStart, setNewStart] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalDateTimeString(d);
  });
  const [newEnd, setNewEnd] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    return toLocalDateTimeString(d);
  });

  const month = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}`;

  const { data: events, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["calendar", month],
    queryFn: () => apiRequest<CalEvent[]>(`/api/mobile/calendar/events?month=${month}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest<CalEvent>("/api/mobile/calendar/events", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      resetForm();
      setCreating(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e) => Alert.alert("Failed", e instanceof Error ? e.message : "Could not create event"),
  });

  const resetForm = () => {
    setNewTitle("");
    setNewLocation("");
    setNewDescription("");
    setNewIsAllDay(false);
    setNewColor(null);
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    setNewStart(toLocalDateTimeString(d));
    const d2 = new Date(d);
    d2.setHours(d2.getHours() + 1);
    setNewEnd(toLocalDateTimeString(d2));
  };

  const handleCreate = () => {
    if (!newTitle.trim()) { Alert.alert("Title required"); return; }
    const startIso = newIsAllDay
      ? new Date(newStart.slice(0, 10) + "T00:00:00").toISOString()
      : new Date(newStart).toISOString();
    const endIso = newIsAllDay
      ? new Date(newStart.slice(0, 10) + "T23:59:59").toISOString()
      : new Date(newEnd).toISOString();
    createMutation.mutate({
      title: newTitle.trim(),
      startTime: startIso,
      endTime: endIso,
      location: newLocation.trim() || null,
      description: newDescription.trim() || null,
      isAllDay: newIsAllDay,
      visibility: "PUBLIC",
      color: newColor,
    });
  };

  // Events for selected day
  const selectedDayStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;
  const dayEvents = (events ?? [])
    .filter(e => {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      const day = new Date(selectedDayStr);
      const dayEnd = new Date(selectedDayStr);
      dayEnd.setHours(23, 59, 59, 999);
      return start <= dayEnd && end >= day;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // Days with events (for dot indicators)
  const eventDays = new Set(
    (events ?? []).map(e => {
      const d = new Date(e.startTime);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })
  );

  const strip = buildDateStrip();

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Calendar</Text>
          <Text style={s.subtitle}>
            {selectedDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </Text>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreating(true); }}
          activeOpacity={0.8}
        >
          <Text style={s.newBtnText}>+ Event</Text>
        </TouchableOpacity>
      </View>

      {/* Date strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.stripWrap}
      >
        {strip.map((d, i) => {
          const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const isSelected = key === selectedDayStr;
          const isToday = key === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
          const hasEvent = eventDays.has(key);
          return (
            <TouchableOpacity
              key={key}
              style={[s.dayCell, isSelected && s.dayCellActive]}
              onPress={() => { void Haptics.selectionAsync(); setSelectedDate(d); }}
              activeOpacity={0.7}
            >
              <Text style={[s.dayName, isSelected && s.dayNameActive]}>{WEEKDAYS[d.getDay()]}</Text>
              <Text style={[s.dayNum, isSelected && s.dayNumActive, isToday && !isSelected && s.dayNumToday]}>
                {d.getDate()}
              </Text>
              {hasEvent && <View style={[s.eventDot, isSelected && s.eventDotActive]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Events for selected day */}
      {isLoading ? (
        <ActivityIndicator color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={dayEvents}
          keyExtractor={e => e.id}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor="#00d2ff" />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📅</Text>
              <Text style={s.emptyText}>No events this day</Text>
              <TouchableOpacity
                style={s.emptyAdd}
                onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreating(true); }}
              >
                <Text style={s.emptyAddText}>+ Add event</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const color = eventColor(item);
            return (
              <TouchableOpacity
                style={[s.card, { borderLeftColor: color }]}
                onPress={() => { void Haptics.selectionAsync(); setViewingEvent(item); }}
                activeOpacity={0.75}
              >
                <View style={[s.colorBar, { backgroundColor: color }]} />
                <View style={s.cardBody}>
                  <Text style={s.evtTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={s.evtTime}>{formatEventDate(item)}</Text>
                  {item.location && <Text style={s.evtLocation}>📍 {item.location}</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Create event modal */}
      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { resetForm(); setCreating(false); }}>
        <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { resetForm(); setCreating(false); }}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle}>New Event</Text>
            <TouchableOpacity onPress={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending
                ? <ActivityIndicator color="#00d2ff" size="small" />
                : <Text style={s.createBtn}>Add</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView style={s.formBody} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <TextInput
              style={s.titleInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Event title"
              placeholderTextColor="#5c6b72"
              autoFocus
            />

            {/* All day toggle */}
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>All day</Text>
              <Switch
                value={newIsAllDay}
                onValueChange={setNewIsAllDay}
                trackColor={{ false: "#1b1f2e", true: "rgba(0,210,255,0.4)" }}
                thumbColor={newIsAllDay ? "#00d2ff" : "#5c6b72"}
              />
            </View>

            {/* Start/end */}
            {!newIsAllDay && (
              <>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Start</Text>
                  <TextInput
                    style={s.dateInput}
                    value={newStart}
                    onChangeText={setNewStart}
                    placeholder="YYYY-MM-DDTHH:MM"
                    placeholderTextColor="#5c6b72"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>End</Text>
                  <TextInput
                    style={s.dateInput}
                    value={newEnd}
                    onChangeText={setNewEnd}
                    placeholder="YYYY-MM-DDTHH:MM"
                    placeholderTextColor="#5c6b72"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </>
            )}
            {newIsAllDay && (
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Date</Text>
                <TextInput
                  style={s.dateInput}
                  value={newStart.slice(0, 10)}
                  onChangeText={(v) => setNewStart(v + "T00:00")}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#5c6b72"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            )}

            {/* Location */}
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>Location</Text>
              <TextInput
                style={s.dateInput}
                value={newLocation}
                onChangeText={setNewLocation}
                placeholder="Optional"
                placeholderTextColor="#5c6b72"
              />
            </View>

            {/* Description */}
            <TextInput
              style={s.descInput}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Notes or description…"
              placeholderTextColor="#5c6b72"
              multiline
              textAlignVertical="top"
            />

            {/* Color picker */}
            <Text style={s.colorLabel}>Colour</Text>
            <View style={s.colorRow}>
              {EVENT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c.value ?? "default"}
                  style={[
                    s.colorDot,
                    { backgroundColor: c.dot },
                    newColor === c.value && s.colorDotActive,
                  ]}
                  onPress={() => setNewColor(c.value)}
                />
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Event detail modal */}
      <Modal visible={!!viewingEvent} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setViewingEvent(null)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <View />
            <Text style={s.modalTitle} numberOfLines={1}>{viewingEvent?.title ?? ""}</Text>
            <TouchableOpacity onPress={() => setViewingEvent(null)}>
              <Text style={s.createBtn}>Done</Text>
            </TouchableOpacity>
          </View>
          {viewingEvent && (
            <ScrollView style={s.formBody}>
              <View style={[s.detailColorBar, { backgroundColor: eventColor(viewingEvent) }]} />
              <Text style={s.detailTitle}>{viewingEvent.title}</Text>
              <Text style={s.detailTime}>{formatEventDate(viewingEvent)}</Text>
              {viewingEvent.location && (
                <Text style={s.detailMeta}>📍 {viewingEvent.location}</Text>
              )}
              {viewingEvent.description && (
                <Text style={s.detailDesc}>{viewingEvent.description}</Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: "#0f1321" },
  header:          { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10 },
  title:           { fontSize: 22, fontWeight: "700", color: "#dfe1f6" },
  subtitle:        { color: "#5c6b72", fontSize: 13, marginTop: 2 },
  newBtn:          { backgroundColor: "#00d2ff", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  newBtnText:      { color: "#003543", fontSize: 13, fontWeight: "700" },

  // Date strip
  stripWrap:       { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  dayCell:         { alignItems: "center", width: 50, paddingVertical: 8, borderRadius: 12, gap: 4 },
  dayCellActive:   { backgroundColor: "#00d2ff" },
  dayName:         { color: "#5c6b72", fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  dayNameActive:   { color: "#003543" },
  dayNum:          { color: "#dfe1f6", fontSize: 18, fontWeight: "700" },
  dayNumActive:    { color: "#003543" },
  dayNumToday:     { color: "#00d2ff" },
  eventDot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: "#00d2ff" },
  eventDotActive:  { backgroundColor: "#003543" },

  // Event list
  list:            { padding: 12, paddingBottom: 40 },
  card:            { flexDirection: "row", backgroundColor: "#1b1f2e", borderRadius: 12, marginBottom: 8, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,210,255,0.06)" },
  colorBar:        { width: 4 },
  cardBody:        { flex: 1, padding: 14 },
  evtTitle:        { color: "#dfe1f6", fontSize: 15, fontWeight: "600", marginBottom: 3 },
  evtTime:         { color: "#bbc9cf", fontSize: 12 },
  evtLocation:     { color: "#5c6b72", fontSize: 12, marginTop: 3 },

  emptyWrap:       { alignItems: "center", marginTop: 60, gap: 10 },
  emptyIcon:       { fontSize: 44 },
  emptyText:       { color: "#5c6b72", fontSize: 14 },
  emptyAdd:        { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "rgba(0,210,255,0.1)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,210,255,0.3)" },
  emptyAddText:    { color: "#00d2ff", fontSize: 14, fontWeight: "600" },

  // Modal
  modal:           { flex: 1, backgroundColor: "#0f1321" },
  modalHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  modalTitle:      { color: "#dfe1f6", fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
  cancelBtn:       { color: "#bbc9cf", fontSize: 15 },
  createBtn:       { color: "#00d2ff", fontSize: 15, fontWeight: "700" },
  formBody:        { padding: 16 },
  titleInput:      { backgroundColor: "#1b1f2e", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#dfe1f6", fontSize: 18, fontWeight: "600", borderWidth: 1, borderColor: "rgba(0,210,255,0.12)", marginBottom: 16 },
  fieldRow:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.06)" },
  fieldLabel:      { color: "#bbc9cf", fontSize: 15 },
  dateInput:       { color: "#dfe1f6", fontSize: 14, textAlign: "right", flex: 1, marginLeft: 12 },
  descInput:       { backgroundColor: "#1b1f2e", borderRadius: 12, padding: 14, color: "#dfe1f6", fontSize: 14, minHeight: 80, borderWidth: 1, borderColor: "rgba(0,210,255,0.08)", marginTop: 16, textAlignVertical: "top" },
  colorLabel:      { color: "#5c6b72", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  colorRow:        { flexDirection: "row", gap: 14 },
  colorDot:        { width: 28, height: 28, borderRadius: 14 },
  colorDotActive:  { borderWidth: 3, borderColor: "#fff" },

  // Detail modal
  detailColorBar:  { height: 4, borderRadius: 2, marginBottom: 20 },
  detailTitle:     { color: "#dfe1f6", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  detailTime:      { color: "#bbc9cf", fontSize: 14, marginBottom: 8 },
  detailMeta:      { color: "#5c6b72", fontSize: 13, marginBottom: 8 },
  detailDesc:      { color: "#bbc9cf", fontSize: 14, lineHeight: 20, marginTop: 12 },
});
