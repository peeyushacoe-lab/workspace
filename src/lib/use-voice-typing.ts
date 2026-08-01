"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice typing via the Web Speech API (SpeechRecognition).
 *
 * Matches Google Docs' "Voice typing" — dictation into the editor, including
 * spoken punctuation. It's an accessibility feature first: it's how users with
 * motor impairments or RSI author documents at all.
 *
 * Browser support is uneven — Chrome and Edge implement it, Firefox does not.
 * `supported` is exposed so the UI can hide the control rather than offering a
 * button that silently does nothing.
 */

/** Spoken commands → literal characters, in the order they should be applied. */
const SPOKEN_PUNCTUATION: [RegExp, string][] = [
  [/\bnew paragraph\b/gi, "\n\n"],
  [/\bnew line\b/gi, "\n"],
  [/\bfull stop\b/gi, "."],
  [/\bperiod\b/gi, "."],
  [/\bcomma\b/gi, ","],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation (mark|point)\b/gi, "!"],
  [/\bsemicolon\b/gi, ";"],
  [/\bcolon\b/gi, ":"],
  [/\bopen quote\b/gi, "“"],
  [/\bclose quote\b/gi, "”"],
  [/\bopen paren(thesis)?\b/gi, "("],
  [/\bclose paren(thesis)?\b/gi, ")"],
  [/\bhyphen\b/gi, "-"],
  [/\bdash\b/gi, "—"],
];

/** Applies spoken punctuation and tidies the spacing it leaves behind. */
export function applySpokenPunctuation(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SPOKEN_PUNCTUATION) {
    out = out.replace(pattern, replacement);
  }
  return out
    // " ." → "."
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    // "(  x  )" → "(x)"
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    // "one \n\n two" → "one\n\ntwo". The break commands substitute a newline
    // in place of a word, leaving the spaces that surrounded that word behind.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceTyping({
  onText,
  lang = "en-GB",
}: {
  /** Called with each finalised phrase, punctuation already applied. */
  onText: (text: string) => void;
  lang?: string;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Held in a ref so restarting the recogniser doesn't need a fresh callback.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const supported = typeof window !== "undefined" && getRecognitionCtor() !== null;

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setError("Voice typing isn't supported in this browser."); return; }

    setError(null);
    const recognition = new Ctor();
    // continuous keeps the session open between phrases; interim results drive
    // the live "listening…" preview.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number };
      };
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          const cleaned = applySpokenPunctuation(transcript).trim();
          if (cleaned) onTextRef.current(cleaned + " ");
        } else {
          pending += transcript;
        }
      }
      setInterim(pending);
    };

    recognition.onerror = (event: unknown) => {
      const code = (event as { error?: string }).error;
      // "no-speech" and "aborted" are routine, not worth alarming the user.
      if (code === "no-speech" || code === "aborted") return;
      setError(
        code === "not-allowed"
          ? "Microphone access was denied. Allow it in your browser settings to use voice typing."
          : "Voice typing stopped unexpectedly.",
      );
      setListening(false);
    };

    // Chrome ends the session on its own after a pause; restart so dictation
    // feels continuous until the user actually stops it.
    recognition.onend = () => {
      if (recognitionRef.current === recognition && listeningRef.current) {
        try { recognition.start(); } catch { setListening(false); }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start voice typing.");
    }
  }, [lang]);

  // Mirrors `listening` for the onend handler, which closes over stale state.
  const listeningRef = useRef(false);
  listeningRef.current = listening;

  const toggle = useCallback(() => {
    if (listening) stop(); else start();
  }, [listening, start, stop]);

  useEffect(() => () => {
    listeningRef.current = false;
    recognitionRef.current?.abort();
  }, []);

  return { supported, listening, interim, error, start, stop, toggle };
}
