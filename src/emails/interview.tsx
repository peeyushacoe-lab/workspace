import { Text } from "@react-email/components";
import { BaseEmail, text } from "./base";

type Props = {
  name: string;
  interviewDate?: string;
  customMessage?: string;
};

export default function InterviewEmail({
  name,
  interviewDate,
  customMessage,
}: Props) {
  return (
    <BaseEmail
      badge="Interview"
      preview="Your CyberSage interview has been scheduled."
      title="Your interview is scheduled"
    >
      <Text style={text}>Hi {name},</Text>
      <Text style={text}>
        We would like to invite you to the next stage of the CyberSage
        internship process.
      </Text>
      <Text style={text}>
        Interview date: <strong>{interviewDate || "To be confirmed"}</strong>
      </Text>
      <Text style={text}>
        {customMessage ||
          "Please be ready to discuss your background, interests, and availability."}
      </Text>
    </BaseEmail>
  );
}
