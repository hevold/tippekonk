/**
 * Computes the page numbers to render in <Pagination>, with 'ellipsis'
 * markers. Always shows first, last and a window around the current page.
 */
export type PaginationToken = number | 'ellipsis';

export function paginationRange(page: number, pageCount: number, siblings = 1): PaginationToken[] {
  const total = Math.max(0, Math.floor(pageCount));
  if (total <= 0) return [];
  const current = Math.min(Math.max(1, Math.floor(page)), total);
  const maxVisible = siblings * 2 + 5; // first, last, current, 2 ellipses, siblings
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < total - 1;

  const tokens: PaginationToken[] = [];
  if (!showLeftEllipsis && showRightEllipsis) {
    const count = 3 + siblings * 2;
    for (let i = 1; i <= count; i++) tokens.push(i);
    tokens.push('ellipsis', total);
    return tokens;
  }
  if (showLeftEllipsis && !showRightEllipsis) {
    const count = 3 + siblings * 2;
    tokens.push(1, 'ellipsis');
    for (let i = total - count + 1; i <= total; i++) tokens.push(i);
    return tokens;
  }
  tokens.push(1, 'ellipsis');
  for (let i = left; i <= right; i++) tokens.push(i);
  tokens.push('ellipsis', total);
  return tokens;
}
