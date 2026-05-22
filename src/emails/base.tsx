import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

type Props = {
  preview: string;
  title: string;
  badge: string;
  children: ReactNode;
};

export function BaseEmail({ preview, title, badge, children }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brand}>CyberSage</Text>
            <Text style={badgeStyle}>{badge}</Text>
          </Section>
          <Heading style={heading}>{title}</Heading>
          {children}
          <Hr style={hr} />
          <Text style={footer}>
            CyberSage Technical Team
            <br />
            Sent from noreply@cybersage.uk
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const text = {
  color: "#263241",
  fontSize: "16px",
  lineHeight: "26px",
};

const body = {
  backgroundColor: "#f4f7fb",
  fontFamily: "Inter, Arial, sans-serif",
  margin: "0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #d9e2ef",
  borderRadius: "12px",
  margin: "32px auto",
  maxWidth: "620px",
  padding: "32px",
};

const brandBar = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
};

const brand = {
  color: "#0f172a",
  fontSize: "18px",
  fontWeight: "700",
};

const badgeStyle = {
  backgroundColor: "#dff7f3",
  borderRadius: "999px",
  color: "#0f766e",
  fontSize: "12px",
  fontWeight: "700",
  padding: "8px 12px",
};

const heading = {
  color: "#111827",
  fontSize: "28px",
  lineHeight: "36px",
  margin: "28px 0 16px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "28px 0",
};

const footer = {
  color: "#64748b",
  fontSize: "13px",
  lineHeight: "20px",
};
