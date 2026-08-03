/**
 * Webfonts offered inside Sage Docs, Sheets and Slides.
 *
 * Self-hosted through Fontsource — the files are served from our own origin, so
 * opening a document makes no request to Google. That matters more here than in
 * most products: customers evaluating a security workspace do ask where the
 * bytes come from.
 *
 * Every family below must also appear in `src/lib/document-fonts.ts`. A font
 * listed in the picker but not imported here renders as the fallback and looks
 * like a bug; a font imported here but not listed is dead download weight.
 * `npm run check:fonts` fails on either mismatch.
 *
 * Weights are 400 and 700 only. Fontsource ships every weight as a separate
 * file, and shipping nine weights of nineteen families to load a document is
 * not a trade anyone would take. Bebas Neue is display-only and has just 400.
 */

/* ── Sans serif ─────────────────────────────────────────────────────────── */
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/700.css";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/700.css";

/* ── Serif ──────────────────────────────────────────────────────────────── */
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/700.css";
import "@fontsource/merriweather/400.css";
import "@fontsource/merriweather/700.css";
import "@fontsource/crimson-pro/400.css";
import "@fontsource/crimson-pro/700.css";

/* ── Monospace ──────────────────────────────────────────────────────────── */
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/700.css";

/* ── Display ────────────────────────────────────────────────────────────── */
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/700.css";
