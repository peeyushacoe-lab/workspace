// Per-person avatar fills — deterministic from a key (email or name) so the
// same person always looks the same everywhere.
//
// These are flat colours, not gradients, and they are muted on purpose. The
// previous set opened with hot pink → violet and put six fully saturated
// gradients side by side; in a message list or a member column that reads as a
// carnival and pulls attention away from the content, which is the only thing
// on the page anyone is actually there to read. An avatar's job is to be
// *distinguishable*, not loud.
//
// Literal hex is the documented Atrium exception here: these are consumed as
// inline `background` values and as a persisted `Team.color`, contexts a CSS
// variable cannot reach. Every value clears 4.5:1 against white text.
const AVATAR_COLORS = [
  "#4f46e5", // indigo
  "#0e7c5a", // green
  "#b45309", // amber
  "#7c5cd6", // violet
  "#0369a1", // blue
  "#c0362c", // red
  "#5b6470", // slate
  "#a8447a", // plum
];

function hash(key: string): number {
  let h = 0;
  const k = key.toLowerCase();
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Background value for a person's avatar.
 *
 * Named `avatarGradient` for compatibility — roughly forty call sites pass the
 * result straight into `style={{ background }}`, which accepts a flat colour
 * just as happily as a gradient, so the rename is not worth the churn.
 */
export function avatarGradient(key: string): string {
  return AVATAR_COLORS[hash(key) % AVATAR_COLORS.length];
}
