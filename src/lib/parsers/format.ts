/** Formats whole rupees with Indian digit grouping, e.g. 4500000 → "₹45,00,000". */
export function formatINR(rupees: number): string {
  const digits = String(Math.trunc(rupees));
  if (digits.length <= 3) return `₹${digits}`;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `₹${head},${digits.slice(-3)}`;
}
