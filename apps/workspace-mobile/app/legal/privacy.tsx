import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Privacy Policy</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.updated}>Last updated: January 2025</Text>

        <Section title="1. Information We Collect">
          We collect information you provide directly (name, email, messages) and data generated through your use of Nexus (login times, feature usage). We do not sell your data to third parties.
        </Section>

        <Section title="2. How We Use Your Information">
          Your information is used to provide and improve the Nexus service, send important notifications, and enable AI features you opt into. AI processing is performed server-side and no personal data is used to train third-party models.
        </Section>

        <Section title="3. Data Storage & Security">
          All data is encrypted at rest and in transit. We use industry-standard security measures including TLS 1.3, AES-256 encryption, and multi-factor authentication. You may enable biometric app lock for additional device-level protection.
        </Section>

        <Section title="4. Data Retention">
          Email and chat messages are retained for the duration of your account. Deleted items are removed from backups within 30 days. You may request full data deletion by contacting your workspace administrator.
        </Section>

        <Section title="5. Third-Party Services">
          Nexus uses Anthropic (AI processing) and Expo (push notifications). These services process only the minimum data required to function. See their respective privacy policies for details.
        </Section>

        <Section title="6. Your Rights">
          You have the right to access, correct, or delete your personal data. Enterprise customers may have additional rights under GDPR or CCPA. Contact your workspace admin or support@cybersage.uk.
        </Section>

        <Section title="7. Contact">
          For privacy inquiries: privacy@cybersage.uk{"\n"}CyberSage Ltd, United Kingdom
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionBody}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: "#0f1321" },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,210,255,0.08)" },
  back:         { color: "#00d2ff", fontSize: 15, width: 60 },
  title:        { color: "#dfe1f6", fontSize: 17, fontWeight: "700" },
  body:         { padding: 20, paddingBottom: 60 },
  updated:      { color: "#5c6b72", fontSize: 12, marginBottom: 24 },
  section:      { marginBottom: 24 },
  sectionTitle: { color: "#00d2ff", fontSize: 13, fontWeight: "700", marginBottom: 8 },
  sectionBody:  { color: "#bbc9cf", fontSize: 14, lineHeight: 22 },
});
