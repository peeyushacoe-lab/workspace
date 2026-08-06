import { ConnectPlaceholder } from "@/components/connect/ConnectPlaceholder";

export default function ConnectChannelsPage() {
  return (
    <ConnectPlaceholder
      href="/connect/channels"
      detail={
        "Channels get threaded posts — a message opens a thread rather than " +
        "scrolling the room. The data model already supports it (ChatMessage.parentId), " +
        "so this phase is presentation: making threads the primary way a channel reads, " +
        "while direct messages stay a flat timeline."
      }
      fallback={{ href: "/connect/chat", label: "Go to Chat" }}
    />
  );
}
