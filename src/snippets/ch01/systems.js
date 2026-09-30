// Три точки (x_i, y_i). Шукаємо пряму y = a + b·x.
const x = [1, 2, 3];
const y = [1, 2, 2];

// Розв'язок системи 2×2 з рівнянь i та j (правило Крамера).
function solvePair(i, j) {
  const det = x[j] - x[i];            // визначник матриці [[1, x_i], [1, x_j]]
  if (det === 0) return null;          // однакові x — прямої не визначити
  const b = (y[j] - y[i]) / det;
  const a = y[i] - b * x[i];
  return { a, b };
}

const pairs = [[0, 1], [1, 2], [0, 2]];
for (const [i, j] of pairs) {
  const { a, b } = solvePair(i, j);
  // Нев'язка r_k = y_k − (a + b·x_k): наскільки точка «не влізла» в пряму.
  const residuals = x.map((xk, k) => +(y[k] - (a + b * xk)).toFixed(2));
  console.log(`рівняння ${i + 1}+${j + 1}: y = ${a.toFixed(2)} + ${b.toFixed(2)}x,`,
              "нев'язки =", residuals);
}

// Чи лежать усі три точки на одній прямій? Тоді визначник [A|y] дорівнює нулю.
const det3 = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
console.log("det [A|y] =", det3, det3 === 0 ? "→ точний розв'язок є" : "→ система несумісна");
