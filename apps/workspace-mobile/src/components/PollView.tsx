import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { apiRequest } from "../api/client";

interface PollOption {
  id: string;
  text: string;
  order: number;
  votes: { userId: string }[];
}

interface Poll {
  id: string;
  question: string;
  isMultiple: boolean;
  options: PollOption[];
}

interface Props {
  poll: Poll;
  currentUserId?: string;
  onVote?: (updated: Poll) => void;
}

export function PollView({ poll, currentUserId, onVote }: Props) {
  const [voting, setVoting] = useState<string | null>(null);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);

  const vote = async (optionId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVoting(optionId);
    try {
      const updated = await apiRequest<Poll>(`/api/mobile/chat/polls/${poll.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
      });
      onVote?.(updated);
    } catch {}
    setVoting(null);
  };

  return (
    <View style={s.container}>
      <Text style={s.question}>📊 {poll.question}</Text>
      <Text style={s.meta}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}{poll.isMultiple ? " · Multiple choice" : ""}</Text>
      {poll.options.map(opt => {
        const voted = currentUserId ? opt.votes.some(v => v.userId === currentUserId) : false;
        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[s.option, voted && s.optionVoted]}
            onPress={() => void vote(opt.id)}
            disabled={voting !== null}
          >
            <View style={[s.bar, { width: `${pct}%` as `${number}%` }]} />
            <View style={s.optionContent}>
              <Text style={[s.optionText, voted && s.optionTextVoted]}>{opt.text}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {voting === opt.id && <ActivityIndicator size="small" color="#00d2ff" />}
                <Text style={s.pctText}>{pct}%</Text>
                {voted && <Text style={s.checkText}>✓</Text>}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container:      { backgroundColor: "#1b1f2e", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(0,210,255,0.12)", marginTop: 6 },
  question:       { color: "#dfe1f6", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  meta:           { color: "#5c6b72", fontSize: 11, marginBottom: 12 },
  option:         { position: "relative", borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,210,255,0.1)", overflow: "hidden", marginBottom: 8 },
  optionVoted:    { borderColor: "#00d2ff" },
  bar:            { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "rgba(0,210,255,0.08)" },
  optionContent:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  optionText:     { color: "#bbc9cf", fontSize: 13, flex: 1 },
  optionTextVoted:{ color: "#00d2ff", fontWeight: "600" },
  pctText:        { color: "#5c6b72", fontSize: 11 },
  checkText:      { color: "#00d2ff", fontSize: 12, fontWeight: "700" },
});
