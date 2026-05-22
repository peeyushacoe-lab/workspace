/**
 * CyberSage Inbound Email Worker
 * Receives emails via Cloudflare Email Routing, parses them,
 * and forwards to the CyberSage webhook endpoint with full body.
 */

export default {
  async email(message, env) {
    const rawEmail = await streamToText(message.raw);

    // Parse headers
    const headers = {};
    const headerSection = rawEmail.split(/\r?\n\r?\n/)[0] ?? "";
    for (const line of headerSection.split(/\r?\n/)) {
      if (line.startsWith(" ") || line.startsWith("\t")) continue;
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).toLowerCase().trim();
      const val = line.slice(colonIdx + 1).trim();
      headers[key] = val;
    }

    // Parse body — extract text/plain and text/html parts from MIME
    const { text, html } = parseMimeParts(rawEmail);

    const payload = {
      type: "email.received",
      data: {
        from: message.from,
        to: [message.to],
        subject: headers["subject"] ?? "(No Subject)",
        text: text ?? null,
        html: html ?? null,
        message_id: headers["message-id"] ?? null,
        headers: {
          "message-id": headers["message-id"] ?? "",
          "in-reply-to": headers["in-reply-to"] ?? "",
          "references": headers["references"] ?? "",
        },
        attachments: [],
        bcc: [],
        cc: [],
      },
    };

    const webhookUrl = env.WEBHOOK_URL;
    const webhookSecret = env.WEBHOOK_SECRET;

    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Simple bearer auth — bypass Svix verification for direct worker calls
        "x-worker-secret": webhookSecret,
      },
      body: JSON.stringify(payload),
    });
  },
};

async function streamToText(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(combined);
}

function parseMimeParts(raw) {
  let text = null;
  let html = null;

  // Find boundary
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    // Not multipart — single body
    const bodyStart = raw.indexOf("\r\n\r\n") + 4 || raw.indexOf("\n\n") + 2;
    const body = raw.slice(bodyStart);
    if (raw.toLowerCase().includes("content-type: text/html")) {
      html = decodeTransferEncoding(body, getEncoding(raw));
    } else {
      text = decodeTransferEncoding(body, getEncoding(raw));
    }
    return { text, html };
  }

  const boundary = boundaryMatch[1].trim();
  const parts = raw.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));

  for (const part of parts) {
    if (!part.trim() || part.trim() === "--") continue;
    const partHeaders = (part.split(/\r?\n\r?\n/)[0] ?? "").toLowerCase();
    const partBody = part.slice((part.indexOf("\r\n\r\n") + 4) || (part.indexOf("\n\n") + 2));
    const encoding = getEncoding(part);

    if (partHeaders.includes("content-type: text/plain")) {
      text = decodeTransferEncoding(partBody.trim(), encoding);
    } else if (partHeaders.includes("content-type: text/html")) {
      html = decodeTransferEncoding(partBody.trim(), encoding);
    }
  }

  return { text, html };
}

function getEncoding(section) {
  const match = section.match(/content-transfer-encoding:\s*([^\r\n]+)/i);
  return match ? match[1].trim().toLowerCase() : "7bit";
}

function decodeTransferEncoding(body, encoding) {
  if (encoding === "base64") {
    try { return atob(body.replace(/\s/g, "")); } catch { return body; }
  }
  if (encoding === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
