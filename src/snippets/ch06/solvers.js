// МНК двома способами: нормальні рівняння (Холецький) і QR (відбиття Хаусхолдера).
// A — масив рядків n×k, y — масив довжини n.

function normalEquations(A, y) {
  const k = A[0].length;
  const N = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const u = Array.from({ length: k }, (_, i) => A.reduce((s, r, m) => s + r[i] * y[m], 0));
  // Розклад Холецького N = L·Lᵀ, потім два трикутні розв'язки.
  const L = N.map((row) => row.map(() => 0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = N[i][j];
      for (let p = 0; p < j; p++) s -= L[i][p] * L[j][p];
      L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
    }
  }
  const z = [];
  for (let i = 0; i < k; i++) z[i] = (u[i] - L[i].slice(0, i).reduce((s, l, p) => s + l * z[p], 0)) / L[i][i];
  const theta = [];
  for (let i = k - 1; i >= 0; i--) {
    let s = z[i];
    for (let p = i + 1; p < k; p++) s -= L[p][i] * theta[p];
    theta[i] = s / L[i][i];
  }
  return theta;
}

function qrLeastSquares(A, y) {
  const n = A.length, k = A[0].length;
  const R = A.map((r) => [...r]);
  const b = [...y];
  for (let j = 0; j < k; j++) {
    // Відбиття, що обнуляє стовпець j нижче діагоналі.
    let norm = 0;
    for (let i = j; i < n; i++) norm += R[i][j] ** 2;
    norm = Math.sqrt(norm);
    const alpha = R[j][j] > 0 ? -norm : norm;
    const v = R.map((r, i) => (i < j ? 0 : r[j]));
    v[j] -= alpha;
    const vv = v.reduce((s, t) => s + t * t, 0);
    if (vv === 0) continue;
    const reflect = (col) => {
      const f = (2 * v.reduce((s, t, i) => s + t * col(i), 0)) / vv;
      return f;
    };
    for (let c = j; c < k; c++) {
      const f = reflect((i) => R[i][c]);
      for (let i = j; i < n; i++) R[i][c] -= f * v[i];
    }
    const f = reflect((i) => b[i]);
    for (let i = j; i < n; i++) b[i] -= f * v[i];
  }
  // Зворотний хід для верхньотрикутної R (перші k рядків).
  const theta = [];
  for (let i = k - 1; i >= 0; i--) {
    let s = b[i];
    for (let p = i + 1; p < k; p++) s -= R[i][p] * theta[p];
    theta[i] = s / R[i][i];
  }
  return theta;
}

// Дані: x ≈ 10 000 000 з кроком 0,37 (скажімо, координата в метрах).
const X0 = 1e7;
const noise = [1, -2, 0, 1, -1, 2, 0, -1, 1, -1];
const x = noise.map((_, i) => X0 + 0.37 * i);
const y = noise.map((e, i) => 2 + 0.5 * i + 0.01 * e);
const A = x.map((xi) => [1, xi]);

// Еталон — центрована формула (спершу віднімаємо середні).
const xm = x.reduce((s, v) => s + v, 0) / x.length;
const ym = y.reduce((s, v) => s + v, 0) / y.length;
const bRef = x.reduce((s, xi, i) => s + (xi - xm) * (y[i] - ym), 0) / x.reduce((s, xi) => s + (xi - xm) ** 2, 0);

for (const [name, solve] of [["нормальні рівняння", normalEquations], ["QR (Хаусхолдер)", qrLeastSquares]]) {
  const b = solve(A, y)[1];
  console.log(`${name.padEnd(20)} b = ${b.toFixed(10)}   похибка ${Math.abs(b - bRef).toExponential(1)}`);
}
console.log("еталон (центровано)  b =", bRef.toFixed(10));
