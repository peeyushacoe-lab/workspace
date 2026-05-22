import { Text } from "@react-email/components";
import { BaseEmail, text } from "./base";

type Props = {
  name: string;
  status?: string;
  customMessage?: string;
};

export default function ReminderEmail({ name, status, customMessage }: Props) {
  return (
    <BaseEmail
      badge="Reminder"
      preview="A quick reminder from CyberSage."
      title="Quick reminder from CyberSage"
    >
      <Text style={text}>Hi {name},</Text>
      <Text style={text}>
        This is a quick reminder about your CyberSage application status:
        <strong> {status || "Pending"}</strong>.
      </Text>
      <Text style={text}>
        {customMessage ||
          "Please reply to the latest instructions from the team when you are ready."}
      </Text>
    </BaseEmail>
  );
}
