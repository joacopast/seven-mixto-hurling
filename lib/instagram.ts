/** Extrae el @handle de una URL de Instagram para mostrarlo en el footer. */
export function instagramHandle(url: string): string | null {
  const match = url.match(/instagram\.com\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  return `@${match[1]}`;
}
