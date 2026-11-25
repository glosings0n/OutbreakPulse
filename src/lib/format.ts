/** Thousands grouped with a narrow no-break space ("24 040"), so a number never wraps or reads as a decimal. */
export function formatCount(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatMs(n: number): string {
  return `${formatCount(n)} ms`;
}
