// Повний конвеєр МНК на одній сторінці: розв'язок, поправки, σ₀, точність, тест Баарди.
// Невелика задача, тож вистачить нормальних рівнянь (для великих — QR, розділ 6).
function solve(M, b) {                            // метод Гаусса з вибором головного елемента
  const n = b.length, A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    const p = A.reduce((best, row, r) => (r >= c && Math.abs(row[c]) > Math.abs(A[best][c]) ? r : best), c);
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}
const inverse = (M) => M.map((_, j) => solve(M, M.map((__, i) => (i === j ? 1 : 0))));

function adjust(A, y, p = y.map(() => 1)) {
  const n = A.length, k = A[0].length;
  const N = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) =>
    A.reduce((s, row, r) => s + p[r] * row[i] * row[j], 0)));        // AᵀPA
  const u = Array.from({ length: k }, (_, i) => A.reduce((s, row, r) => s + p[r] * row[i] * y[r], 0));
  const theta = solve(N, u);
  const v = A.map((row, r) => row.reduce((s, a, j) => s + a * theta[j], 0) - y[r]);
  const sigma0 = Math.sqrt(v.reduce((s, vi, r) => s + p[r] * vi * vi, 0) / (n - k));
  const Q = inverse(N);                                               // симетрична, тож Q[j][j] — діагональ
  const sigmaTheta = Q.map((row, j) => sigma0 * Math.sqrt(row[j]));
  const w = A.map((row, r) => {                                       // qᵥᵥ = 1/p − aᵀQa
    const h = row.reduce((s, ai, i) => s + ai * row.reduce((t, aj, j) => t + Q[i][j] * aj, 0), 0);
    return v[r] / (sigma0 * Math.sqrt(1 / p[r] - h));
  });
  return { theta, v, sigma0, sigmaTheta, w };
}

const x = [0, 1, 2, 3, 4], y = [1.1, 2.9, 5.2, 6.8, 9.0];
const res = adjust(x.map((xi) => [1, xi]), y);
const f = (arr) => arr.map((t) => t.toFixed(3)).join(", ");
console.log("θ =", f(res.theta), " σθ =", f(res.sigmaTheta));
console.log("σ₀ =", res.sigma0.toFixed(3), " поправки:", f(res.v));
console.log("max |w| =", Math.max(...res.w.map(Math.abs)).toFixed(2), "(промах, якщо > 3,29)");

// Фільтр Калмана в 1D = рекурсивний МНК + «забування» старих вимірів (шум процесу q).
let seed = 20250;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const truth = Array.from({ length: 120 }, (_, t) => (t < 60 ? 10 : 12));
const z = truth.map((v) => v + gauss());                             // шум вимірів R = 1
for (const q of [0, 0.01, 0.1]) {
  let xk = z[0], P = 1;
  const est = z.map((zt, t) => {
    if (t === 0) return xk;                     // старт: перший вимір, дисперсія R
    P += q;                                     // прогноз: невизначеність зростає
    const K = P / (P + 1);                      // коефіцієнт підсилення
    xk += K * (zt - xk);                        // уточнення новим виміром
    P *= 1 - K;
    return xk;
  });
  const rmse = (a, b) => Math.sqrt(est.slice(a, b).reduce((s, e, i) => s + (e - truth[a + i]) ** 2, 0) / (b - a));
  console.log(`q = ${q}: RMSE до стрибка ${rmse(0, 60).toFixed(3)}, після ${rmse(70, 120).toFixed(3)}`);
}
