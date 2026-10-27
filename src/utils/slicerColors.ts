export function normalizeColorForCompare(color: string | undefined): string {
  return (color ?? '').replace('#', '').toLowerCase().substring(0, 6);
}
export function colorsAreSimilar(a: string | undefined, b: string | undefined, threshold = 40): boolean {
  const first = normalizeColorForCompare(a);
  const second = normalizeColorForCompare(b);
  return /^[a-f\d]{6}$/.test(first) && /^[a-f\d]{6}$/.test(second) &&
    [0, 2, 4].every(i => Math.abs(parseInt(first.slice(i, i + 2), 16) - parseInt(second.slice(i, i + 2), 16)) <= threshold);
}
