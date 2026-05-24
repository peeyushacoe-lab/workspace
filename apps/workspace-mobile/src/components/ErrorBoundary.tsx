import { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={s.wrap}>
          <Text style={s.icon}>⚠️</Text>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.msg}>{this.state.error.message}</Text>
          <TouchableOpacity style={s.btn} onPress={() => this.setState({ error: null })}>
            <Text style={s.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  wrap:    { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f1321", padding: 32 },
  icon:    { fontSize: 48, marginBottom: 16 },
  title:   { color: "#dfe1f6", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  msg:     { color: "#5c6b72", fontSize: 13, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  btn:     { backgroundColor: "rgba(0,210,255,0.15)", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(0,210,255,0.3)" },
  btnText: { color: "#00d2ff", fontWeight: "700", fontSize: 14 },
});
