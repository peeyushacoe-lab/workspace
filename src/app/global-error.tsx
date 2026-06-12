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
        <div className="flex min-h-screen items-center justify-center bg-white">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-[#202124]">Something went wrong</h1>
            <p className="mt-2 text-sm text-[#5f6368]">An unexpected error occurred.</p>
            <button
              onClick={reset}
              className="mt-6 rounded-md bg-[#1a56db] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1447c0]"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
