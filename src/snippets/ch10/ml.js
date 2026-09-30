// Дані: пряма y = 1 + 0.5x з невеликим шумом і двома промахами.
const x = [0.5, 1.1, 1.8, 2.4, 3.1, 3.7, 4.4, 5.0, 5.6, 6.3, 6.9, 7.6, 8.2, 8.9, 9.5];
const y = x.map((xi, i) => 1 + 0.5 * xi + 0.15 * Math.sin(3 * i));
y[10] += 3.0; y[12] += 2.5;                       // промахи

// Зважений МНК для прямої (вага wᵢ): нормальні рівняння 2×2.
function wls(w) {
  let s = 0, sx = 0, sxx = 0, sy = 0, sxy = 0;
  x.forEach((xi, i) => { s += w[i]; sx += w[i] * xi; sxx += w[i] * xi * xi; sy += w[i] * y[i]; sxy += w[i] * xi * y[i]; });
  const det = s * sxx - sx * sx;
  return [(sy * sxx - sx * sxy) / det, (s * sxy - sx * sy) / det];
}
const fmt = ([a, b]) => `a = ${a.toFixed(3)}, b = ${b.toFixed(3)}`;

// 1) Звичайний МНК: промахи тягнуть пряму до себе.
console.log("МНК:     ", fmt(wls(x.map(() => 1))));

// 2) Губер через ітеративно перезважений МНК (IRLS): великим нев'язкам — менша вага.
let th = wls(x.map(() => 1));
const delta = 0.4;
for (let it = 0; it < 50; it++) {
  const w = x.map((xi, i) => { const r = Math.abs(y[i] - th[0] - th[1] * xi); return r <= delta ? 1 : delta / r; });
  th = wls(w);
}
console.log("Губер:   ", fmt(th));

// 3) RANSAC: перебираємо пари точок, шукаємо пряму з найбільшою «підтримкою».
let best = [];
for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) {
  const b = (y[j] - y[i]) / (x[j] - x[i]), a = y[i] - b * x[i];
  const inl = x.map((xi, k) => Math.abs(y[k] - a - b * xi) < 0.5);
  if (inl.filter(Boolean).length > best.filter(Boolean).length) best = inl;
}
console.log("RANSAC:  ", fmt(wls(best.map(Number))), " відкинуто точок:", best.filter((v) => !v).length);

// 4) Градієнтний спуск (без промахів): як крок навчання впливає на збіжність.
const yc = x.map((xi, i) => 1 + 0.5 * xi + 0.15 * Math.sin(3 * i));
const n = x.length, sxx = x.reduce((s, v) => s + v * v, 0), sx = x.reduce((s, v) => s + v, 0);
const Lmax = (2 / n) * ((n + sxx) / 2 + Math.hypot((n - sxx) / 2, sx));   // λ_max гессіана MSE
for (const f of [0.5, 0.95, 1.05]) {
  let [a, b] = [0, 0];
  const lr = (f * 2) / Lmax;
  for (let it = 0; it < 2000; it++) {
    let ga = 0, gb = 0;
    x.forEach((xi, i) => { const r = yc[i] - a - b * xi; ga -= (2 / n) * r; gb -= (2 / n) * r * xi; });
    a -= lr * ga; b -= lr * gb;
  }
  console.log(`GD, крок ${f}·(2/L): a = ${a.toPrecision(4)}, b = ${b.toPrecision(4)}`);
}
