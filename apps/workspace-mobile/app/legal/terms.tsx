import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function TermsScreen() {
  const router = useRouter();
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Terms of Service</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.updated}>Last updated: January 2025</Text>

        <Section title="1. Acceptance">
          By accessing or using Nexus by CyberSage, you agree to these Terms of Service. If you do not agree, do not use the service. These terms apply to all users of the mobile application and web platform.
        </Section>

        <Section title="2. License">
          CyberSage grants you a limited, non-exclusive, non-transferable license to use Nexus for your organization's internal business purposes. You may not sublicense, sell, or distribute the service.
        </Section>

        <Section title="3. Acceptable Use">
          You agree not to use Nexus to: send spam or unsolicited messages, transmit malicious code, infringe intellectual property rights, harass other users, or violate any applicable law. Violations may result in account suspension.
        </Section>

        <Section title="4. Intellectual Property">
          Nexus and all associated technology remain the property of CyberSage Ltd. Your content (emails, files, messages) remains yours. You grant CyberSage a limited license to process your content solely to provide the service.
        </Section>

        <Section title="5. Service Availability">
          We aim for 99.9% uptime but do not guarantee uninterrupted access. Planned maintenance will be communicated in advance. CyberSage is not liable for losses arising from downtime.
        </Section>

        <Section title="6. Limitation of Liability">
          To the maximum extent permitted by law, CyberSage's liability is limited to the amount you paid for the service in the 12 months preceding the claim. We are not liable for indirect, incidental, or consequential damages.
        </Section>

        <Section title="7. Changes to Terms">
          We may update these terms with reasonable notice. Continued use after notice constitutes acceptance. Significant changes will be communicated by email.
        </Section>

        <Section title="8. Governing Law">
          These terms are governed by English law. Disputes shall be resolved in the courts of England and Wales.{"\n"}Contact: legal@cybersage.uk
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
