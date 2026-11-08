/** Compares release versions such as 1.4.2; a pre-release suffix and missing parts count as zero. */
export function compare(a: string, b: string) {
  const parts = (value: string) =>
    value
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  const length = Math.max(left.length, right.length)

  return Array.from({ length }, (_, index) => (left[index] ?? 0) - (right[index] ?? 0)).find((diff) => diff !== 0) ?? 0
}
