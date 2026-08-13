/**
 * Slash commands for the Connect composer.
 *
 * This module is the shared *vocabulary* — it has no server-only imports, so
 * the composer can render the autocomplete from the same list the API executes
 * against. Execution lives in `POST /api/chat/channels/[id]/commands`.
 *
 * The split matters: a command like `/task` creates a real row owned by the
 * caller, so the client can only ever *propose* one. Nothing here decides
 * whether a command is permitted — that is the route's job, re-checked against
 * channel membership and org policy on every call. Rendering a command in the
 * picker is a hint, never a grant.
 */

export type SlashCommandName = "task" | "meet" | "poll" | "remind" | "sage" | "shrug" | "me";

export type SlashCommand = {
  name: SlashCommandName;
  /** Shown after the slash in the picker. */
  usage: string;
  description: string;
  /** Key into the composer's icon map — must resolve to a lucide glyph. */
  icon: string;
  /**
   * Handled entirely in the composer without a round trip (text macros).
   * Everything else posts to the commands endpoint.
   */
  clientOnly?: boolean;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "task",
    usage: "/task <title>",
    description: "Create a task linked back to this conversation",
    icon: "check-square",
  },
  {
    name: "meet",
    usage: "/meet [topic]",
    description: "Start a meeting and drop the join link here",
    icon: "video",
  },
  {
    name: "poll",
    usage: "/poll Question | Option A | Option B",
    description: "Ask the channel to pick",
    icon: "bar-chart",
  },
  {
    name: "remind",
    usage: "/remind <30m|2h|tomorrow 9am> <message>",
    description: "Send a message to this conversation later",
    icon: "alarm-clock",
  },
  {
    name: "sage",
    usage: "/sage <question>",
    description: "Ask the assistant about this conversation",
    icon: "sparkles",
  },
  { name: "me", usage: "/me <action>", description: "Post as an action", icon: "user", clientOnly: true },
  { name: "shrug", usage: "/shrug", description: "¯\\_(ツ)_/¯", icon: "smile", clientOnly: true },
];

const BY_NAME = new Map(SLASH_COMMANDS.map((c) => [c.name, c]));

export type ParsedCommand = {
  command: SlashCommand;
  /** Everything after the command word, trimmed. */
  args: string;
};

/**
 * Parse a composer body as a slash command.
 *
 * Returns null for anything that isn't one, including "/" alone and unknown
 * words — an unrecognised `/deploy` must send as literal text rather than be
 * swallowed, because the alternative is a message that silently vanishes.
 */
export function parseSlashCommand(input: string): ParsedCommand | null {
  const match = input.match(/^\/([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const command = BY_NAME.get(match[1].toLowerCase() as SlashCommandName);
  if (!command) return null;
  return { command, args: (match[2] ?? "").trim() };
}

/** Commands whose name starts with the partial typed so far, for the picker. */
export function matchCommands(partial: string): SlashCommand[] {
  const q = partial.replace(/^\//, "").toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

/**
 * Turn "30m" / "2h" / "tomorrow 9am" into an absolute time.
 *
 * Deliberately small: a full natural-language date parser is a dependency and a
 * source of confident wrong answers ("next friday" in whose timezone?). These
 * four shapes cover what people actually type into a chat reminder, and
 * anything else is rejected so the user can see it was rejected.
 */
export function parseReminderTime(input: string, now = new Date()): { at: Date; rest: string } | null {
  const relative = input.match(/^(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|days?)\b\s*([\s\S]*)$/i);
  if (relative) {
    const amount = parseInt(relative[1], 10);
    const unit = relative[2].toLowerCase();
    if (!amount || amount > 10_000) return null;
    const ms = unit.startsWith("m") ? 60_000 : unit.startsWith("h") ? 3_600_000 : 86_400_000;
    return { at: new Date(now.getTime() + amount * ms), rest: relative[3].trim() };
  }

  const tomorrow = input.match(/^tomorrow(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*([\s\S]*)$/i);
  if (tomorrow) {
    let hour = parseInt(tomorrow[1], 10);
    const minute = tomorrow[2] ? parseInt(tomorrow[2], 10) : 0;
    const meridiem = tomorrow[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    const at = new Date(now);
    at.setDate(at.getDate() + 1);
    at.setHours(hour, minute, 0, 0);
    return { at, rest: tomorrow[4].trim() };
  }

  return null;
}

/** `Question | A | B` → its parts. Returns null unless there are ≥2 options. */
export function parsePoll(input: string): { question: string; options: string[] } | null {
  const parts = input.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const [question, ...options] = parts;
  if (options.length > 10) return null;
  return { question, options };
}
