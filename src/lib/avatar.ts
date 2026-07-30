// Per-person gradient avatars — the Nexus design language. Deterministic from a
// key (email or name) so the same person always gets the same gradient.

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#FF6B9D,#C44FE0)",
  "linear-gradient(135deg,#4f46e5,#3B82F6)",
  "linear-gradient(135deg,#0e7c5a,#0e7c5a)",
  "linear-gradient(135deg,#b45309,#c0362c)",
  "linear-gradient(135deg,#7C5CFF,#4f46e5)",
  "linear-gradient(135deg,#F472B6,#7c5cd6)",
];

export function avatarGradient(key: string): string {
  let h = 0;
  const k = key.toLowerCase();
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
