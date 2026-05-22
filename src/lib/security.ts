export type MessageRisk = {
  label: string;
  level: "ok" | "warn" | "danger";
};

const urlRegex = /https?:\/\/[^\s<>"']+/gi;
const riskyTlds = [".zip", ".mov", ".click", ".top", ".xyz"];

export function analyzeMessage(message: string): MessageRisk[] {
  const urls = message.match(urlRegex) ?? [];
  const risks: MessageRisk[] = [];

  if (!urls.length) {
    risks.push({ label: "No links detected", level: "ok" });
  }

  urls.forEach((url) => {
    const normalized = url.toLowerCase();

    if (normalized.startsWith("http://")) {
      risks.push({ label: `Insecure link: ${url}`, level: "danger" });
    }

    if (riskyTlds.some((tld) => normalized.includes(tld))) {
      risks.push({ label: `Review risky domain: ${url}`, level: "warn" });
    }
  });

  if (message.length > 1200) {
    risks.push({ label: "Long message may reduce readability", level: "warn" });
  }

  return risks.length ? risks : [{ label: "Message looks clean", level: "ok" }];
}
