const x = [1, 2, 3];
const y = [1, 2, 2];

// S(a, b) — многочлен другого степеня. Його коефіцієнти — п'ять сум по даних.
const sum = (f) => x.reduce((s, xi, i) => s + f(xi, y[i]), 0);
const n = x.length, sx = sum((xi) => xi), sxx = sum((xi) => xi * xi);
const sy = sum((xi, yi) => yi), sxy = sum((xi, yi) => xi * yi), syy = sum((xi, yi) => yi * yi);
console.log(`S(a, b) = ${n}a² + ${2 * sx}ab + ${sxx}b² − ${2 * sy}a − ${2 * sxy}b + ${syy}`);

const S = (a, b) => n * a * a + 2 * sx * a * b + sxx * b * b - 2 * sy * a - 2 * sxy * b + syy;

// «Карта» чаші символами: що темніший символ, то більша помилка.
// Рядки — значення b (згори вниз), стовпці — значення a.
const shades = " .:-=+*#%@";
let best = { S: Infinity };
const rows = [];
for (let b = 1.75; b >= -0.75 - 1e-9; b -= 0.125) {
  let row = "";
  for (let a = -1.5; a <= 2.5 + 1e-9; a += 0.1) {
    const s = S(a, b);
    if (s < best.S) best = { a, b, S: s };
    const level = Math.min(shades.length - 1, Math.floor(Math.sqrt(s) * 3.5));
    row += shades[level];
  }
  rows.push(`b=${b.toFixed(2).padStart(5)} │${row}`);
}
console.log(rows.join("\n"));
console.log(`дно чаші на сітці: a ≈ ${best.a.toFixed(2)}, b ≈ ${best.b.toFixed(2)}, S ≈ ${best.S.toFixed(3)}`);
