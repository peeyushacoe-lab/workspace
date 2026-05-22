import { Text } from "@react-email/components";
import { BaseEmail, text } from "./base";

type Props = {
  name: string;
  customMessage?: string;
};

export default function RejectedEmail({ name, customMessage }: Props) {
  return (
    <BaseEmail
      badge="Application Update"
      preview="An update about your CyberSage internship application."
      title="Thank you for applying"
    >
      <Text style={text}>Hi {name},</Text>
      <Text style={text}>
        Thank you for the time and effort you put into your CyberSage
        internship application. After careful review, we are unable to move your
        application forward at this time.
      </Text>
      <Text style={text}>
        {customMessage ||
          "We appreciate your interest and encourage you to apply again when future opportunities open."}
      </Text>
    </BaseEmail>
  );
}
