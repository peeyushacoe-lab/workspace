import { NextResponse } from "next/server";
import { verifyRedirectToken } from "@/lib/redirect-scan";

// GET /api/redirect?u=<url>&t=<signature>&f=<0|1>
// Every link inside a scanned inbound email is rewritten to point here (see
// src/lib/sentinel/inbound-scan.ts). Safe links pass straight through;
// flagged links show an interstitial warning first. The signature check
// stops this endpoint being (ab)used as a generic open redirect — only
// links we signed ourselves will verify.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  const token = url.searchParams.get("t");
  const flagged = url.searchParams.get("f") === "1";

  if (!target || !token || !verifyRedirectToken(target, flagged, token)) {
    return new NextResponse("Invalid or expired link.", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return new NextResponse("Invalid link target.", { status: 400 });
  }

  if (!flagged) {
    return NextResponse.redirect(parsed.toString(), { status: 302 });
  }

  const escapedTarget = parsed.toString().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const escapedHost = parsed.hostname.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Link warning — Nexus</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { margin:0; background:#0B0D13; color:#E6E9F0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
  .card { max-width:440px; width:100%; background:#12151D; border:1px solid #262A35; border-radius:16px; padding:28px; }
  .icon { width:40px; height:40px; border-radius:50%; background:rgba(234,67,53,0.12); display:flex; align-items:center; justify-content:center; margin-bottom:16px; font-size:20px; }
  h1 { font-size:16px; font-weight:600; margin:0 0 8px; }
  p { font-size:13px; color:#8A92A6; line-height:1.6; margin:0 0 4px; }
  .host { font-family:monospace; font-size:12px; background:#1B1F2A; border:1px solid #262A35; border-radius:8px; padding:8px 10px; margin:14px 0 20px; word-break:break-all; color:#ea4335; }
  .actions { display:flex; gap:10px; }
  a.btn { flex:1; text-align:center; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; }
  .go-back { background:#00C2FF; color:#06121A; }
  .continue { background:transparent; color:#8A92A6; border:1px solid #262A35; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">&#9888;</div>
    <h1>This link looks risky</h1>
    <p>Nexus flagged this link from an email as potentially unsafe (shortened URL, IP address, or a pattern commonly used in phishing).</p>
    <div class="host">${escapedHost}</div>
    <div class="actions">
      <a class="go-back btn" href="javascript:history.back()">Go back</a>
      <a class="continue btn" href="${escapedTarget}" rel="noopener noreferrer">Continue anyway</a>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
