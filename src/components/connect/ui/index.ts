// Connect's design-system primitives. Separate from `@/components/ui/*`
// because that folder still backs the /users admin pages on a pre-Atrium
// shadcn scaffold — see button.tsx's file comment for why these aren't
// merged into one barrel.
export { Button } from "./button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./button";
export { Dialog } from "./dialog";
export type { DialogSize } from "./dialog";
export { Menu, MenuItem } from "./dropdown";
export { Tabs, TabButton } from "./tabs";
export { Tooltip } from "./tooltip";
