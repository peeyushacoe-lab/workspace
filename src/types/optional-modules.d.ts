// Stub declarations for optional packages that may not be installed yet.
// Once `npm install` is run after updating package.json, these are superseded
// by the real package types.

declare module "@tiptap/extension-collaboration-cursor" {
  import type { Extension } from "@tiptap/core";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CollaborationCursor: any & { configure(opts: any): Extension };
  export default CollaborationCursor;
}
