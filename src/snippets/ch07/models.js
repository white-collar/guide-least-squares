// Загальний рецепт: обираємо базисні функції φⱼ(x), складаємо A[i][j] = φⱼ(xᵢ)
// і розв'язуємо звичайний МНК. Тут — через нормальні рівняння (задачі маленькі й добре обумовлені).
function fit(basis, xs, ys) {
  const A = xs.map((x) => basis.map((phi) => phi(x)));
  const k = basis.length;
  const N = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const u = Array.from({ length: k }, (_, i) => A.reduce((s, r, m) => s + r[i] * ys[m], 0));
  // Метод Гаусса для N·θ = u.
  const M = N.map((row, i) => [...row, u[i]]);
  for (let c = 0; c < k; c++) {
    for (let i = c + 1; i < k; i++) {
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= k; j++) M[i][j] -= f * M[c][j];
    }
  }
  const th = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = M[i][k];
    for (let j = i + 1; j < k; j++) s -= M[i][j] * th[j];
    th[i] = s / M[i][i];
  }
  return th;
}
const r3 = (arr) => arr.map((v) => +v.toFixed(3));

// 1) Парабола: траєкторія м'яча h(t) = h₀ + v₀·t − (g/2)·t².
const t = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8];
const h = [1.02, 2.63, 3.83, 4.66, 5.03, 5.06, 4.63, 3.84, 2.66, 1.13];
const [h0, v0, c] = fit([() => 1, (x) => x, (x) => x * x], t, h);
console.log("h₀, v₀ =", r3([h0, v0]), "  g =", +(-2 * c).toFixed(2), "м/с²");

// 2) Експонента y = a·e^(b·x) нелінійна за b, але ln y = ln a + b·x — вже пряма.
const x = [0, 1, 2, 3, 4, 5];
const y = [10.1, 6.0, 3.7, 2.2, 1.35, 0.82];
const [lnA, b] = fit([() => 1, (s) => s], x, y.map(Math.log));
console.log("a =", +Math.exp(lnA).toFixed(3), " b =", +b.toFixed(3), " (період напіврозпаду", +(Math.log(2) / -b).toFixed(2), ")");

// 3) Синусоїда з невідомою фазою: A·sin(x + φ) = P·sin x + Q·cos x — лінійно за P, Q.
const xs = [0, 1, 2, 3, 4, 5, 6];
const ys = xs.map((s, i) => 2 * Math.sin(s + 0.7) + [0.05, -0.1, 0.02, 0.08, -0.04, 0.03, -0.06][i]);
const [P, Q] = fit([Math.sin, Math.cos], xs, ys);
console.log("амплітуда =", +Math.hypot(P, Q).toFixed(3), " фаза =", +Math.atan2(Q, P).toFixed(3));
