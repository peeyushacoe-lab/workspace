import { Text } from "@react-email/components";
import { BaseEmail, text } from "./base";

type Props = {
  name: string;
  status?: string;
  customMessage?: string;
};

export default function AcceptedEmail({ name, customMessage }: Props) {
  return (
    <BaseEmail
      badge="Accepted"
      preview="Your CyberSage internship application has been accepted."
      title="Welcome to the CyberSage internship track"
    >
      <Text style={text}>Hi {name},</Text>
      <Text style={text}>
        Congratulations. Your application has been accepted, and we are excited
        to move you into the next stage of the CyberSage internship workflow.
      </Text>
      <Text style={text}>
        {customMessage ||
          "Our team will share onboarding details, expectations, and next steps shortly."}
      </Text>
      <Text style={text}>Thank you for choosing to build with CyberSage.</Text>
    </BaseEmail>
  );
}
