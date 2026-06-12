/**
 * CyberSage Inbound Email Worker
 * Parses full email body (text + HTML) via PostalMime, then POSTs to Nexus webhook.
 */
import PostalMime from "postal-mime";

export default {
  async email(message, env) {
    const webhookUrl = env.WEBHOOK_URL;
    const webhookSecret = env.WEBHOOK_SECRET;

    if (!webhookUrl || !webhookSecret) {
      console.error("[email-worker] Missing WEBHOOK_URL or WEBHOOK_SECRET");
      return;
    }

    // Read raw email stream into ArrayBuffer and parse with PostalMime
    let parsed = { text: null, html: null, subject: null, attachments: [], cc: [], bcc: [] };
    try {
      const rawBuffer = await new Response(message.raw).arrayBuffer();
      const parser = new PostalMime();
      parsed = await parser.parse(rawBuffer);
    } catch (err) {
      console.error("[email-worker] PostalMime parse failed:", err);
    }

    const subject     = parsed.subject ?? message.headers.get("subject") ?? "(No Subject)";
    const fromHeader  = message.headers.get("from") ?? message.from;
    const messageId   = message.headers.get("message-id") ?? null;
    const inReplyTo   = message.headers.get("in-reply-to") ?? "";
    const references  = message.headers.get("references") ?? "";

    // Build attachment list (metadata only — large binaries skipped if >5MB)
    const attachments = (parsed.attachments ?? [])
      .filter((a) => (a.content?.byteLength ?? 0) < 5 * 1024 * 1024)
      .map((a) => ({
        filename:    a.filename ?? "attachment",
        mimeType:    a.mimeType ?? "application/octet-stream",
        size:        a.content?.byteLength ?? 0,
        contentId:   a.contentId ?? null,
      }));

    const payload = {
      type: "email.received",
      data: {
        from:       message.from,
        to:         [message.to],
        subject,
        text:       parsed.text   ?? null,
        html:       parsed.html   ?? null,
        message_id: messageId,
        headers: {
          "from":        fromHeader,
          "message-id":  messageId ?? "",
          "in-reply-to": inReplyTo,
          "references":  references,
        },
        attachments,
        cc:  (parsed.cc  ?? []).map((a) => a.address).filter(Boolean),
        bcc: (parsed.bcc ?? []).map((a) => a.address).filter(Boolean),
      },
    };

    console.log(`[email-worker] from=${message.from} to=${message.to} subject="${subject}" text=${parsed.text?.length ?? 0}chars html=${parsed.html?.length ?? 0}chars`);

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
