// Три виміри довжини з розділу 1 (м) та той самий набір із промахом.
for (const l of [[10.02, 10.05, 9.98], [10.02, 10.05, 10.2]]) {
  const sorted = [...l].sort((p, q) => p - q);
  const n = sorted.length;
  const mean = l.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const midrange = (sorted[0] + sorted[n - 1]) / 2;

  console.log("виміри:", l);
  // Кожен критерій має «свою» найкращу оцінку:
  console.log("  Σ v²   → середнє           ", mean.toFixed(4));
  console.log("  Σ |v|  → медіана           ", median.toFixed(4));
  console.log("  max|v| → середина розмаху  ", midrange.toFixed(4));
}
