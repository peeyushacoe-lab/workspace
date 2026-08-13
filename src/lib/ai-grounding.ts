/**
 * Should this question be answered from the user's workspace?
 *
 * Retrieval costs six parallel queries. "Write me a haiku about firewalls" needs
 * none of them; "what's on my calendar tomorrow" needs all of them. Running the
 * fan-out unconditionally would put a database round-trip behind every message
 * including "thanks".
 *
 * Deliberately a keyword heuristic rather than an LLM classifier: an extra model
 * call to decide whether to make a model call doubles latency on every message to
 * save a query on some of them. It is also inspectable and testable, which a
 * classifier prompt is not.
 *
 * Biased toward grounding. A false positive costs a few cheap indexed queries and
 * some unused context; a false negative means the assistant confidently invents
 * your schedule — which is the exact failure this whole feature exists to remove.
 */

/**
 * First-person possessives. The strongest single signal — "my", "our", "I have"
 * almost always means "look at my data", regardless of the noun that follows.
 */
// The `(?<!how )` on "do i" matters: "how do I configure SPF records" is a
// how-to question about the world, but the bare "do i" inside it read as a
// first-person reference to the user's own data and forced a pointless fan-out.
const PERSONAL =
  /\b(my|mine|our|ours|i have|i've|(?<!how )do i|am i|i need to|assigned to me|for me)\b/i;

/** Workspace nouns. Present tense or not, these name things that live in Nexus. */
const WORKSPACE_NOUN =
  /\b(email|emails|inbox|mail|message|messages|thread|calendar|meeting|meetings|event|events|schedule|task|tasks|todo|to-do|deadline|due|document|documents|doc|docs|file|files|drive|note|notes|channel|team|teams|colleague|who is|reports to|manager)\b/i;

/** Time references — "tomorrow", "this week" only make sense against real data. */
const TEMPORAL =
  /\b(today|tomorrow|yesterday|tonight|this week|next week|last week|this month|upcoming|overdue|recent|recently|latest|so far|right now)\b/i;

/**
 * Generative asks. These want the model's own capability, not the workspace —
 * even when they mention workspace nouns ("write an email about X").
 */
const GENERATIVE =
  /\b(write|draft|compose|rewrite|translate|explain|what is|what are|how do i|how does|define|generate|brainstorm|suggest a|give me an example|summarise this|summarize this|convert|refactor|debug)\b/i;

export type GroundingDecision = {
  ground: boolean;
  /** Why — surfaced in logs, and useful when tuning the heuristic. */
  reason: string;
};

export function shouldGround(question: string): GroundingDecision {
  const q = question.trim();

  // Too short to carry intent ("hi", "ok", "thanks").
  if (q.length < 8) return { ground: false, reason: "too-short" };

  const personal = PERSONAL.test(q);
  const noun = WORKSPACE_NOUN.test(q);
  const temporal = TEMPORAL.test(q);
  const generative = GENERATIVE.test(q);

  // "Write an email to Sam about the audit" — generative, and grounding it would
  // stuff the prompt with unrelated inbox threads. But "summarise MY emails about
  // the audit" is both, and there the personal reference wins: the user is asking
  // about their own data, and the verb is just how they phrased it.
  if (generative && !personal && !temporal) {
    return { ground: false, reason: "generative" };
  }

  if (personal && (noun || temporal)) return { ground: true, reason: "personal+workspace" };
  if (noun && temporal) return { ground: true, reason: "workspace+temporal" };
  if (personal) return { ground: true, reason: "personal" };
  if (noun) return { ground: true, reason: "workspace-noun" };
  // Temporal alone still grounds: "what's happening tomorrow" names no workspace
  // noun but is unambiguously a question about the asker's day.
  if (temporal) return { ground: true, reason: "temporal" };

  return { ground: false, reason: "no-signal" };
}
