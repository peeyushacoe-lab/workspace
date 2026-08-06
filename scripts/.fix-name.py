import io, re
p = "src/components/ChatView.tsx"
s = io.open(p, encoding="utf-8").read()
old_start = "function safeAttachmentName(name: unknown): string {"
i = s.index(old_start)
j = s.index("\n}\n", i) + 3
new = (
    "function safeAttachmentName(name: unknown): string {\n"
    '  if (typeof name !== "string") return "Attachment";\n'
    "  const cleaned = name\n"
    "    // Control characters.\n"
    "    // eslint-disable-next-line no-control-regex\n"
    '    .replace(/[\\u0000-\\u001f\\u007f]/g, "")\n'
    '    // Bidi overrides — the classic "gnp.exe" rendered as "exe.png" trick.\n'
    '    .replace(/[\\u202a-\\u202e\\u2066-\\u2069]/g, "")\n'
    "    // Path separators, so a name can never be read as a path.\n"
    '    .replace(/[/\\\\]/g, "")\n'
    "    .trim();\n"
    '  return cleaned.slice(0, 120) || "Attachment";\n'
    "}\n"
)
io.open(p, "w", encoding="utf-8").write(s[:i] + new + s[j:])
print("ok")
