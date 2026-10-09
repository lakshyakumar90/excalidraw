/**
 * Stable, accessible participant colors.
 * One user keeps one hue across tabs and reconnects; colors stay readable
 * against the light canvas and pair with a text label (never color alone).
 */
export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue} 70% 42%)`;
}

export function initialsForName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0]!}${last[0]!}`.toUpperCase();
}
