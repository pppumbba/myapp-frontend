/** "Ganbat Chinzorig" -> "GC", for avatars without a photo. */
export function initials(name?: string): string {
  return (name ?? '?')
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
