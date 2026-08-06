import { ConnectPlaceholder } from "@/components/connect/ConnectPlaceholder";

export default function ConnectCallsPage() {
  return (
    <ConnectPlaceholder
      href="/connect/calls"
      detail={
        "One-to-one and group audio/video calls with a call history, separate " +
        "from scheduled meetings. Ringing, accept and decline already run over " +
        "Redis with Jitsi carrying the media — this phase adds the history, " +
        "missed-call handling and device selection around them."
      }
      fallback={{ href: "/connect/meetings", label: "Go to Meetings" }}
    />
  );
}
