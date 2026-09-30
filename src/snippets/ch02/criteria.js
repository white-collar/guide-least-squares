const x = [1, 2, 3];
const y = [1, 2, 2];

// Чотири кандидати на «функцію якості» прямої y = a + b·x.
const residuals = (a, b) => x.map((xi, i) => y[i] - (a + b * xi));
const criteria = {
  "Σ r": (r) => r.reduce((s, v) => s + v, 0),
  "Σ |r|": (r) => r.reduce((s, v) => s + Math.abs(v), 0),
  "max |r|": (r) => Math.max(...r.map(Math.abs)),
  "Σ r²": (r) => r.reduce((s, v) => s + v * v, 0),
};

const lines = { "y = x": [0, 1], "y = 2": [2, 0], "y = 0.5 + 0.5x": [0.5, 0.5],
                "y = 2/3 + 0.5x": [2 / 3, 0.5] };
for (const [name, [a, b]] of Object.entries(lines)) {
  const r = residuals(a, b);
  const values = Object.entries(criteria).map(([k, f]) => `${k} = ${f(r).toFixed(3)}`);
  console.log(name.padEnd(15), "→", values.join(", "));
}

// «Навчання» перебором: пробуємо всі (a, b) на сітці й беремо найкращу пару.
// Найпримітивніший спосіб оптимізації — але працює для будь-якого критерію.
for (const name of ["Σ |r|", "max |r|", "Σ r²"]) {
  let best = { loss: Infinity };
  for (let a = -1; a <= 3; a += 0.01) {
    for (let b = -1; b <= 2; b += 0.01) {
      const loss = criteria[name](residuals(a, b));
      if (loss < best.loss - 1e-12) best = { a, b, loss };
    }
  }
  console.log(`мінімум ${name.padEnd(8)}: a = ${best.a.toFixed(2)}, b = ${best.b.toFixed(2)},`,
              `значення ${best.loss.toFixed(3)}`);
}
