"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-[#0f1321]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#dfe1f6]">Something went wrong</h1>
            <p className="mt-2 text-sm text-[#bbc9cf]">An unexpected error occurred.</p>
            <button
              onClick={reset}
              className="mt-6 rounded-md bg-[#00d2ff] px-4 py-2 text-sm font-semibold text-[#003543] hover:bg-[#47d6ff]"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
