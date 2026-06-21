// Per-person gradient avatars — the Nexus design language. Deterministic from a
// key (email or name) so the same person always gets the same gradient.

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#FF6B9D,#C44FE0)",
  "linear-gradient(135deg,#00C2FF,#3B82F6)",
  "linear-gradient(135deg,#10B981,#059669)",
  "linear-gradient(135deg,#F59E0B,#EF4444)",
  "linear-gradient(135deg,#7C5CFF,#00C2FF)",
  "linear-gradient(135deg,#F472B6,#7C3AED)",
];

export function avatarGradient(key: string): string {
  let h = 0;
  const k = key.toLowerCase();
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
