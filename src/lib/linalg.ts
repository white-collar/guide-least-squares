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

/* ---------- Квадратична форма суми квадратів для прямої ---------- */

/**
 * Для моделі y = a + b·(x − shift) сума квадратів нев'язок записується як
 * S(θ) = θᵀMθ − 2θᵀv + c, де θ = (a, b). Усе визначають п'ять сум по даних.
 */
export interface Quadratic {
  M: [[number, number], [number, number]];
  v: [number, number];
  c: number;
}

export function lineQuadratic(pts: Pt[], shift = 0): Quadratic {
  let n = 0, su = 0, suu = 0, sy = 0, suy = 0, syy = 0;
  for (const p of pts) {
    const u = p.x - shift;
    n += 1;
    su += u;
    suu += u * u;
    sy += p.y;
    suy += u * p.y;
    syy += p.y * p.y;
  }
  return { M: [[n, su], [su, suu]], v: [sy, suy], c: syy };
}

export function evalQuadratic(q: Quadratic, a: number, b: number): number {
  const { M, v, c } = q;
  return M[0][0] * a * a + 2 * M[0][1] * a * b + M[1][1] * b * b - 2 * (v[0] * a + v[1] * b) + c;
}

/** Градієнт S: 2(Mθ − v). */
export function gradQuadratic(q: Quadratic, a: number, b: number): [number, number] {
  const { M, v } = q;
  return [2 * (M[0][0] * a + M[0][1] * b - v[0]), 2 * (M[1][0] * a + M[1][1] * b - v[1])];
}

/** Розв'язок 2×2 системи Mθ = v (null, якщо матриця вироджена). */
export function solve2(M: number[][], v: number[]): [number, number] | null {
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  if (Math.abs(det) < 1e-10 * Math.max(1, Math.abs(M[0][0] * M[1][1]))) return null;
  return [(v[0] * M[1][1] - M[0][1] * v[1]) / det, (M[0][0] * v[1] - M[1][0] * v[0]) / det];
}

/** Власні значення (λ₁ ≥ λ₂) і кут першого власного вектора симетричної 2×2 матриці. */
export function eigSym2(M: number[][]): { l1: number; l2: number; angle: number } {
  const [p, q, r] = [M[0][0], M[0][1], M[1][1]];
  const mid = (p + r) / 2;
  const rad = Math.hypot((p - r) / 2, q);
  return { l1: mid + rad, l2: mid - rad, angle: 0.5 * Math.atan2(2 * q, p - r) };
}
