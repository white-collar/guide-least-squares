// Невеликі утиліти лінійної алгебри для інтерактивів.

export type Matrix = number[][];

/** Ранг матриці методом Гаусса з частковим вибором головного елемента. */
export function rank(m: Matrix, eps = 1e-9): number {
  const a = m.map((row) => row.slice());
  const rows = a.length;
  const cols = rows ? a[0].length : 0;
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let pivot = r;
    for (let i = r + 1; i < rows; i++) if (Math.abs(a[i][c]) > Math.abs(a[pivot][c])) pivot = i;
    if (Math.abs(a[pivot][c]) < eps) continue;
    [a[r], a[pivot]] = [a[pivot], a[r]];
    for (let i = r + 1; i < rows; i++) {
      const f = a[i][c] / a[r][c];
      for (let j = c; j < cols; j++) a[i][j] -= f * a[r][j];
    }
    r++;
  }
  return r;
}

export interface Pt {
  x: number;
  y: number;
}

/** Пряма y = a + b·x через дві точки; null, якщо x однакові. */
export function lineThrough(p: Pt, q: Pt): { a: number; b: number } | null {
  const det = q.x - p.x;
  if (Math.abs(det) < 1e-12) return null;
  const b = (q.y - p.y) / det;
  return { a: p.y - b * p.x, b };
}

/** Визначник розширеної матриці [A|y] для трьох точок (0 ⇔ точки на одній прямій). */
export function det3(p: Pt[]): number {
  return (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y);
}

/** Детермінований генератор випадкових чисел (mulberry32). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Нормально розподілене число (перетворення Бокса–Мюллера). */
export function gaussian(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
