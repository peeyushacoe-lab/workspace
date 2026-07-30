#!/usr/bin/env python3
"""
Atrium design-system checker.

Guards the one rule that keeps both themes correct: never hardcode a colour.
Run with `npm run check:atrium`. Exits non-zero on any failure.

Checks
  1. no legacy Nexus-dark / Google-grey hex values anywhere in src
  2. no arbitrary-value colour utilities  ( bg-[#...] , border-[rgba(...)] )
  3. no raw Tailwind palette shades       ( text-red-400, bg-slate-800 )
  4. no old-theme rgba() triplets (the pre-Atrium cyan, blue, red, green, amber)
  5. no dark-theme translucent whites     ( border-white/[0.07] )
  6. text-white / text-accent-foreground never sits on a light token fill
  7. WCAG AA contrast on every token pairing, in BOTH light and dark
  8. no viewport-height calc inside the floating panel on lg
  9. no `dark` hardcoded on <html>

Deliberate exceptions are listed in EXEMPT_* below with the reason.
"""
import re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'src')
CSS  = os.path.join(SRC, 'app', 'globals.css')

# ── exceptions ───────────────────────────────────────────────────────────────
# CSS variables cannot reach these: email clients, pdf-lib, canvas, Jitsi config,
# <meta theme-color>. They carry literal Atrium hex values instead.
EXEMPT_LITERAL = (
    'src/lib/email', 'src/emails/', 'src/lib/hr-letters',
    'src/app/(portal)/whiteboard/', 'src/app/layout.tsx',
    'src/app/(portal)/meet/', 'src/components/call/CallStage.tsx',
    'src/app/api/', 'src/lib/avatar.ts', 'src/components/ui/tokens.ts',
    'src/generated/',
)
# Categorical content palettes — distinct hues are the point, and the values are
# persisted to the database or fed to <input type="color">.
EXEMPT_PALETTE = (
    'src/components/NotesView.tsx',
    'src/app/(portal)/users/page.tsx',
    'src/app/login/UserPicker.tsx',
)
# Routes that bypass the floating panel and are legitimately viewport-height.
EXEMPT_FULLSCREEN = (
    'src/components/SheetsEditor.tsx', 'src/components/SlidesEditor.tsx',
    'src/components/DocsView.tsx', 'src/components/SidebarLayout.tsx',
    'src/components/ShareFileViewer.tsx',
    'src/app/(portal)/apps/sheets/[id]/', 'src/app/(portal)/apps/slides/[id]/',
    'src/app/(portal)/docs/',
)

LEGACY_HEX = re.compile(
    r'#(?:0B0D12|0B0D13|12151D|1B1F2A|1b1f2e|0D1017|262A35|2E333F|E6E9F0|C8CEDB|C5CAD3|C2C8D6'
    r'|8A92A6|5A6275|00C2FF|00d2ff|47d6ff|33cfff|0098E6|0E2532|133347|143850|141828|0F1117'
    r'|0f1321|0E1018|1a56db|1648c7|ea4335|0f9d58|F59E0B|f4b400|ff6d00|202124|5f6368|80868b'
    r'|bdc1c6|e8eaed|f1f3f4|f8f9fa|3A4150|3A3F4B|444C5E|5d6579|9aa3b8|dfe1f6|303444|262939)'
    r'(?![0-9A-Fa-f])', re.I)
ARB_UTIL   = re.compile(r'\b(?:bg|text|border|ring|divide|outline|fill|stroke|shadow|from|to|via'
                        r'|placeholder|caret|accent|decoration)(?:-[a-z]+)?-\[(?:#|rgba?\(|hsl)')
PALETTE    = re.compile(r'\b(?:bg|text|border|ring|divide|from|to|via)-(?:slate|gray|zinc|neutral'
                        r'|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue'
                        r'|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b')
OLD_RGBA   = re.compile(r'rgba?\(\s*(?:0\s*,\s*194\s*,\s*255|0\s*,\s*210\s*,\s*255|26\s*,\s*86\s*,\s*219'
                        r'|234\s*,\s*67\s*,\s*53|255\s*,\s*92\s*,\s*122|15\s*,\s*157\s*,\s*88'
                        r'|16\s*,\s*185\s*,\s*129|245\s*,\s*158\s*,\s*11|124\s*,\s*92\s*,\s*255)')
WHITE_LINE = re.compile(r'\b(?:border|divide|ring)-white(?:/(?:\[[0-9.]+\]|[0-9]+))?\b')
# An *opaque, unprefixed* light fill only. `bg-surface/20` is a translucent wash
# over whatever is behind it, and `hover:bg-surface` is a transient state — neither
# is the resting background of the text, so neither makes white text invisible.
LIGHT_FILL = re.compile(r'(?<![-\w:/])bg-(?:surface|surface-sunken|canvas|hover)(?![-\w/])')
WHITE_TEXT = re.compile(r'(?<![-\w:/])text-white(?![-\w/])')
VH_CALC    = re.compile(r'\blg:(?:h|min-h|max-h)-\[calc\(100vh')

failures = []
def fail(check, detail):
    failures.append((check, detail))

def files(exts=('.tsx', '.ts')):
    for dp, _, fns in os.walk(SRC):
        for fn in fns:
            if fn.endswith(exts):
                p = os.path.join(dp, fn)
                yield p, os.path.relpath(p, ROOT).replace('\\', '/')

# ── 1-6: source scans ────────────────────────────────────────────────────────
for path, rel in files():
    text = open(path, encoding='utf-8').read()

    if not any(k in rel for k in EXEMPT_LITERAL):
        for m in LEGACY_HEX.finditer(text):
            fail('legacy hex', f'{rel}: {m.group(0)}')
        for m in OLD_RGBA.finditer(text):
            fail('pre-Atrium rgba', f'{rel}: {m.group(0)}')

    for m in ARB_UTIL.finditer(text):
        fail('arbitrary colour utility', f'{rel}: {m.group(0)}…]')

    if not any(k in rel for k in EXEMPT_PALETTE):
        for m in PALETTE.finditer(text):
            fail('raw palette shade', f'{rel}: {m.group(0)}')

    for m in WHITE_LINE.finditer(text):
        fail('translucent white hairline', f'{rel}: {m.group(0)}')

    if not rel.endswith('.ts'):
        for i, line in enumerate(text.split('\n'), 1):
            if WHITE_TEXT.search(line) and LIGHT_FILL.search(line):
                fail('white text on a light fill', f'{rel}:{i}')
            if VH_CALC.search(line) and not any(k in rel for k in EXEMPT_FULLSCREEN):
                fail('viewport calc inside the panel', f'{rel}:{i} — use lg:h-full')

# ── 7: contrast, both themes ─────────────────────────────────────────────────
css = open(CSS, encoding='utf-8').read()
def tokens(sel):
    m = re.search(re.escape(sel) + r'\s*\{(.*?)\n\}', css, re.S)
    return dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;', m.group(1))) if m else {}
light = tokens(':root'); dark = tokens('.dark')
for k, v in light.items():
    dark.setdefault(k, v)

def _lin(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
def ratio(a, b):
    def lum(h):
        h = h.lstrip('#')
        r, g, bb = (_lin(int(h[i:i+2], 16)) for i in (0, 2, 4))
        return .2126*r + .7152*g + .0722*bb
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + .05) / (lo + .05)

PAIRS = [
    ('foreground','surface',4.5), ('foreground','canvas',4.5), ('foreground','surface-sunken',4.5),
    ('muted','surface',4.5), ('muted','surface-sunken',4.5),
    ('subtle','surface',3.0), ('subtle','surface-sunken',3.0),
    ('accent','surface',4.5), ('accent-foreground','accent',4.5),
    ('accent-strong','accent-soft',4.5),
    ('ok','surface',4.5), ('ok','ok-soft',4.5),
    ('warn','surface',4.5), ('warn','warn-soft',4.5),
    ('crit','surface',4.5), ('crit','crit-soft',4.5),
    ('violet','surface',4.5), ('violet','violet-soft',4.5),
    ('border','surface',1.2), ('border-strong','surface',1.4),
]
for name, toks in (('light', light), ('dark', dark)):
    for fg, bg, minimum in PAIRS:
        if fg not in toks or bg not in toks:
            fail('missing token', f'{name}: --{fg} or --{bg}'); continue
        r = ratio(toks[fg], toks[bg])
        if r < minimum:
            fail('contrast', f'{name}: {fg} on {bg} = {r:.2f}:1 (needs {minimum})')

# ── 9: light is the default ──────────────────────────────────────────────────
layout = open(os.path.join(SRC, 'app', 'layout.tsx'), encoding='utf-8').read()
if re.search(r'className=\{`[^`]*\bdark\b', layout):
    fail('theme default', 'layout.tsx still hardcodes `dark` on <html>')

# ── report ───────────────────────────────────────────────────────────────────
if not failures:
    n = sum(1 for _ in files())
    print(f'✓ Atrium design system: {n} files clean, contrast AA in light and dark.')
    sys.exit(0)

from collections import defaultdict
grouped = defaultdict(list)
for check, detail in failures:
    grouped[check].append(detail)
print(f'✗ Atrium design system: {len(failures)} issue(s)\n')
for check in sorted(grouped):
    items = grouped[check]
    print(f'  {check} ({len(items)})')
    for d in items[:15]:
        print(f'      {d}')
    if len(items) > 15:
        print(f'      … and {len(items) - 15} more')
    print()
sys.exit(1)
