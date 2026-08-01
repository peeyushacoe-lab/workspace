// Stub declarations for optional packages that may not be installed yet.
// Once `npm install` is run after updating package.json, these are superseded
// by the real package types.

declare module "mammoth" {
  interface ConversionResult { value: string; messages: unknown[] }
  interface Options { arrayBuffer?: ArrayBuffer; path?: string }
  export function convertToHtml(input: Options): Promise<ConversionResult>;
  export function extractRawText(input: Options): Promise<ConversionResult>;
}

/**
 * jsdom is used only by the test scripts (npm test), which run the browser-side
 * DOCX/PPTX/accessibility code under Node. @types/jsdom is in devDependencies,
 * but tsconfig type-checks `scripts/**` during `next build`, so this stub keeps
 * the build green on machines where devDependencies haven't been installed
 * (CI with --omit=dev, fresh clones, Vercel's production install).
 *
 * Only the surface the tests actually touch is declared.
 */
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    readonly window: Window & typeof globalThis & {
      DOMParser: typeof DOMParser;
      Node: typeof Node;
      document: Document;
    };
  }
}

declare module "@tiptap/extension-collaboration-cursor" {
  import type { Extension } from "@tiptap/core";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CollaborationCursor: any & { configure(opts: any): Extension };
  export default CollaborationCursor;
}
