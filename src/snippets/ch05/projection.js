const dot = (u, v) => u.reduce((s, ui, i) => s + ui * v[i], 0);

// Проєкція вектора y на площину, натягнуту на стовпці u і v.
// Умова: залишок r = y − (a·u + b·v) перпендикулярний і до u, і до v.
function project(u, v, y) {
  const [uu, uv, vv] = [dot(u, u), dot(u, v), dot(v, v)];
  const [uy, vy] = [dot(u, y), dot(v, y)];
  const det = uu * vv - uv * uv;          // нормальні рівняння 2×2 за Крамером
  const a = (uy * vv - uv * vy) / det;
  const b = (uu * vy - uv * uy) / det;
  const yHat = u.map((ui, i) => a * ui + b * v[i]);
  const r = y.map((yi, i) => yi - yHat[i]);
  return { a, b, yHat, r };
}

const round = (arr) => arr.map((t) => +t.toFixed(4));

// 1) Пряма через три точки: стовпці A — одиниці та x.
const ones = [1, 1, 1], x = [1, 2, 3], y = [1, 2, 2];
const p = project(ones, x, y);
console.log("a, b =", round([p.a, p.b]), " ŷ =", round(p.yHat), " r =", round(p.r));
console.log("r·1 =", +dot(p.r, ones).toFixed(12), " r·x =", +dot(p.r, x).toFixed(12));
console.log("|y|² =", dot(y, y), " |ŷ|² + |r|² =", +(dot(p.yHat, p.yHat) + dot(p.r, p.r)).toFixed(10));

// 2) Нівелірна мережа з розділу 4, розв'язана «з іншого боку»:
//    проєктуємо вектор вимірів на напрямок умови c = (1, 1, −1).
const h = [1.203, 0.402, 1.611];                 // виміряні перевищення, м
const c = [1, 1, -1];                            // умова: h1 + h2 − h3 = 0
const w = dot(c, h);                             // нев'язка
const v = c.map((ci) => -(w / dot(c, c)) * ci);  // поправки — перпендикуляр до площини умови
console.log("нев'язка w =", +(w * 1000).toFixed(2), "мм,  поправки v =", round(v.map((t) => t * 1000)), "мм");
