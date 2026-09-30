// Розв'язок системи N·θ = u методом Гаусса (з вибором головного елемента).
function gaussSolve(N, u) {
  const k = u.length;
  const M = N.map((row, i) => [...row, u[i]]);        // розширена матриця
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let i = c + 1; i < k; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < k; i++) {
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= k; j++) M[i][j] -= f * M[c][j];
    }
  }
  const theta = new Array(k).fill(0);                  // зворотний хід
  for (let i = k - 1; i >= 0; i--) {
    let s = M[i][k];
    for (let j = i + 1; j < k; j++) s -= M[i][j] * theta[j];
    theta[i] = s / M[i][i];
  }
  return theta;
}

// Нормальні рівняння для довільної матриці A (n×k): (AᵀA)·θ = Aᵀy.
function leastSquares(A, y) {
  const k = A[0].length;
  const N = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0)));
  const u = Array.from({ length: k }, (_, i) => A.reduce((s, row, r) => s + row[i] * y[r], 0));
  return { N, u, theta: gaussSolve(N, u) };
}

// 1) Пряма через три точки: рядки A — (1, xᵢ).
const x = [1, 2, 3], y = [1, 2, 2];
const line = leastSquares(x.map((xi) => [1, xi]), y);
console.log("AᵀA =", line.N, " Aᵀy =", line.u);
console.log("a, b =", line.theta.map((v) => +v.toFixed(4)));

// 2) Нівелірна мережа: Rp (100 м) → B → C → Rp. Невідомі: висоти B і C.
//    Рівняння: H_B − 100 = 1.203;  H_C − H_B = 0.402;  H_C − 100 = 1.611
const A = [[1, 0], [-1, 1], [0, 1]];
const l = [100 + 1.203, 0.402, 100 + 1.611];
const net = leastSquares(A, l);
console.log("AᵀA =", net.N, " Aᵀl =", net.u.map((v) => +v.toFixed(3)));
const [HB, HC] = net.theta;
const v = A.map((row, i) => +((row[0] * HB + row[1] * HC - l[i]) * 1000).toFixed(2));
console.log(`H_B = ${HB.toFixed(4)} м, H_C = ${HC.toFixed(4)} м, виправлення v =`, v, "мм");
