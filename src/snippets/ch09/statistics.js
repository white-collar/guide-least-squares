// 1) Центральна гранична теорема: сума багатьох дрібних похибок стає «дзвоном».
//    Кожна елементарна похибка рівномірна на [−1, 1] — зовсім не гауссова.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

for (const k of [1, 2, 12]) {
  const sums = Array.from({ length: 20000 }, () => {
    let s = 0;
    for (let j = 0; j < k; j++) s += 2 * rand() - 1;
    return s / Math.sqrt(k / 3);         // нормуємо до стандартного відхилення 1
  });
  // Гістограма символами: частка значень у кожному інтервалі шириною 0.5.
  const bins = new Array(12).fill(0);
  sums.forEach((v) => { const b = Math.floor((v + 3) / 0.5); if (b >= 0 && b < 12) bins[b]++; });
  const max = Math.max(...bins);
  console.log(`k = ${k}:  ` + bins.map((c) => "▁▂▃▄▅▆▇█"[Math.round((7 * c) / max)]).join(""));
}

// 2) Максимальна правдоподібність перебором: де найімовірніше справжнє значення?
const l = [10.02, 10.05, 9.98, 10.03, 10.30];   // останній вимір — промах
const logLik = {
  "Гаусс (→ Σ квадратів)": (x) => -l.reduce((s, li) => s + (li - x) ** 2, 0),
  "Лаплас (→ Σ модулів)": (x) => -l.reduce((s, li) => s + Math.abs(li - x), 0),
};
for (const [name, f] of Object.entries(logLik)) {
  let best = { x: 0, v: -Infinity };
  for (let x = 9.9; x <= 10.4; x += 0.0005) if (f(x) > best.v) best = { x, v: f(x) };
  console.log(`${name}: максимум правдоподібності в x = ${best.x.toFixed(3)}`);
}
console.log("середнє =", (l.reduce((s, v) => s + v, 0) / l.length).toFixed(3), " медіана =", [...l].sort((a, b) => a - b)[2]);
