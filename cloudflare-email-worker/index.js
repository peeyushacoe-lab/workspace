/**
 * CyberSage Inbound Email Worker
 * Uses native message.headers API — no raw stream parsing.
 */

export default {
  async email(message, env) {
    const webhookUrl = env.WEBHOOK_URL;
    const webhookSecret = env.WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
      console.error("[email-worker] Missing WEBHOOK_URL or WEBHOOK_SECRET");
      return;
    }

    // Use the native Headers API — no raw stream needed
    const subject     = message.headers.get("subject") ?? "(No Subject)";
    const fromHeader  = message.headers.get("from") ?? message.from;
    const messageId   = message.headers.get("message-id") ?? null;
    const inReplyTo   = message.headers.get("in-reply-to") ?? "";
    const references  = message.headers.get("references") ?? "";

    const payload = {
      type: "email.received",
      data: {
        from:       message.from,
        to:         [message.to],
        subject,
        text:       null,
        html:       null,
        message_id: messageId,
        headers: {
          "from":        fromHeader,
          "message-id":  messageId ?? "",
          "in-reply-to": inReplyTo,
          "references":  references,
        },
        attachments: [],
        bcc: [],
        cc:  [],
      },
    };

    console.log(`[email-worker] from=${message.from} to=${message.to} subject="${subject}"`);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type":    "application/json",
          "x-worker-secret": webhookSecret,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text().catch(() => "");
      console.log(`[email-worker] webhook ${response.status}: ${text}`);
    } catch (err) {
      console.error("[email-worker] fetch failed:", err);
    }
  },
};
