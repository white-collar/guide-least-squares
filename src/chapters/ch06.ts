// Розділ 6. Програмуємо МНК.
import { renderMath, tex, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { clamp, createPlot, formatNumber as fmt, isCompact, setAttrs, svgEl } from '../lib/plot';

import solversPy from '../snippets/ch06/solvers.py?raw';
import solversJs from '../snippets/ch06/solvers.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ solvers: { py: solversPy, js: solversJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

/** Число для KaTeX без зайвих нулів. */
function tn(v: number, digits = 3): string {
  let s = fmt(v, digits);
  if (s.includes(',')) s = s.replace(/0+$/, '').replace(/,$/, '');
  if (s === '−0') s = '0';
  return s.replace('−', '-').replace(',', '{,}');
}

/** Компактний запис дуже великих і малих чисел: 1,2·10⁻⁵. */
function sci(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 4) return fmt(v, Math.max(0, digits + 2 - Math.max(0, e)));
  const m = v / 10 ** e;
  const sup = String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return `${fmt(m, digits)}·10${sup}`;
}

/* =====================================================================
   6.2. Скільки цифр губить кожен спосіб: емуляція float32 / float64
   ===================================================================== */
type Arith = (v: number) => number;

const NOISE = [1, -2, 0, 1, -1, 2, 0, -1, 1, -1];

/** Дані: x = X0 + 0,37·i, y = 2 + 0,5·i + шум; усе вже округлено до обраної точності. */
function makeData(X0: number, r: Arith) {
  const xs = NOISE.map((_, i) => r(X0 + 0.37 * i));
  const ys = NOISE.map((e, i) => r(2 + 0.5 * i + 0.05 * e));
  return { xs, ys };
}

/** Еталонний нахил: центрована формула у float64 на тих самих (округлених) даних. */
function refSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxy / sxx;
}

/** Нормальні рівняння «шкільною» формулою; кожна операція округлюється функцією r. */
function slopeNormal(xs: number[], ys: number[], r: Arith): number {
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sx = r(sx + xs[i]);
    sy = r(sy + ys[i]);
    sxx = r(sxx + r(xs[i] * xs[i]));
    sxy = r(sxy + r(xs[i] * ys[i]));
  }
  const n = xs.length;
  return r(r(r(n * sxy) - r(sx * sy)) / r(r(n * sxx) - r(sx * sx)));
}

/** QR (модифікований Грам — Шмідт) для стовпців 1 і x. */
function slopeQR(xs: number[], ys: number[], r: Arith): number {
  const n = xs.length;
  const q1 = r(1 / r(Math.sqrt(n)));
  let r12 = 0;
  for (const x of xs) r12 = r(r12 + r(q1 * x));
  const v = xs.map((x) => r(x - r(r12 * q1)));
  let r22 = 0;
  for (const t of v) r22 = r(r22 + r(t * t));
  r22 = r(Math.sqrt(r22));
  const q2 = v.map((t) => r(t / r22));
  // Qᵀy: друга компонента; першу віднімаємо від y (так працює модифікований варіант).
  let c1 = 0;
  for (const y of ys) c1 = r(c1 + r(q1 * y));
  const yr = ys.map((y) => r(y - r(c1 * q1)));
  let c2 = 0;
  for (let i = 0; i < n; i++) c2 = r(c2 + r(q2[i] * yr[i]));
  return r(c2 / r22);
}

/** Спершу центрування, потім формула — у тій самій точності. */
function slopeCentered(xs: number[], ys: number[], r: Arith): number {
  const n = xs.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx = r(sx + xs[i]);
    sy = r(sy + ys[i]);
  }
  const mx = r(sx / n);
  const my = r(sy / n);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = r(xs[i] - mx);
    sxy = r(sxy + r(dx * r(ys[i] - my)));
    sxx = r(sxx + r(dx * dx));
  }
  return r(sxy / sxx);
}

function initPrecision(): void {
  const root = $('#w-precision');
  const box = $('.plot', root);
  const compact = isCompact(box);
  const slider = $<HTMLInputElement>('input[name="offset"]', root);
  const out = $('output[for="offset"]', root);
  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);
  const modeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="prec"]')];

  const METHODS = [
    { key: 'ne', name: 'Нормальні рівняння', color: 'var(--warn)', f: slopeNormal },
    { key: 'qr', name: 'QR', color: 'var(--accent)', f: slopeQR },
    { key: 'c', name: 'Центрування + формула', color: 'var(--good)', f: slopeCentered },
  ];
  const E: [number, number] = [0, 8];
  const L: [number, number] = [-17, 1];

  const plot = createPlot(box, {
    width: compact ? 420 : 620,
    height: compact ? 300 : 340,
    x: E,
    y: L,
    margin: { top: 16, right: 16, bottom: 34, left: 52 },
    xTicks: [0, 2, 4, 6, 8],
    yTicks: [-16, -12, -8, -4, 0],
    ariaLabel: 'Відносна похибка нахилу залежно від віддаленості x від нуля для трьох алгоритмів',
  });
  // Підписи осей як степені десяти.
  const pow = (e: number) => `10${String(e).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
  plot.svg.querySelectorAll('.plot-axis text').forEach((t) => {
    const v = Number((t.textContent ?? '').replace('−', '-'));
    t.textContent = pow(v);
  });
  const xl = svgEl('text', { x: plot.opts.width - 18, y: plot.opts.height - 40, 'text-anchor': 'end', class: 'plot-label' }, plot.svg);
  xl.textContent = 'X₀ (наскільки x далеко від нуля)';
  const yl = svgEl('text', { x: 58, y: 28, class: 'plot-label' }, plot.svg);
  yl.textContent = 'відносна похибка нахилу';

  const epsLine = svgEl('line', { stroke: 'var(--muted)', 'stroke-dasharray': '2 4', x1: plot.sx(E[0]), x2: plot.sx(E[1]) }, plot.layer);
  const epsLbl = svgEl('text', { x: plot.sx(E[1]) - 6, 'text-anchor': 'end', class: 'plot-label' }, plot.layer);
  const curves = METHODS.map((m) => svgEl('path', { fill: 'none', stroke: m.color, 'stroke-width': 2.5 }, plot.layer));
  const cursor = svgEl('line', { stroke: 'var(--text)', 'stroke-width': 1, 'stroke-dasharray': '4 3', y1: plot.sy(L[0]), y2: plot.sy(L[1]) }, plot.layer);
  const dots = METHODS.map((m) => svgEl('circle', { r: 5, fill: m.color }, plot.layer));

  const mode = () => (modeInputs.find((i) => i.checked)?.value ?? '32') as '32' | '64';
  const errOf = (X0: number, m: (typeof METHODS)[number], r: Arith) => {
    const { xs, ys } = makeData(X0, r);
    const ref = refSlope(xs, ys);
    const b = m.f(xs, ys, r);
    const e = Math.abs(b - ref) / Math.abs(ref);
    return { b, ref, e: Number.isFinite(e) ? e : Infinity };
  };
  const lg = (e: number) => (Number.isFinite(e) ? clamp(Math.log10(Math.max(e, 1e-17)), L[0], L[1]) : L[1]);

  function drawCurves() {
    const r: Arith = mode() === '32' ? Math.fround : (v) => v;
    const eps = mode() === '32' ? 2 ** -24 : 2 ** -53;
    setAttrs(epsLine, { y1: plot.sy(Math.log10(eps)), y2: plot.sy(Math.log10(eps)) });
    setAttrs(epsLbl, { y: plot.sy(Math.log10(eps)) - 5 });
    epsLbl.textContent = `точність ${mode() === '32' ? 'float32' : 'float64'} ≈ ${sci(eps)}`;
    METHODS.forEach((m, k) => {
      const pts: string[] = [];
      for (let i = 0; i <= 160; i++) {
        const e10 = E[0] + ((E[1] - E[0]) * i) / 160;
        const { e } = errOf(10 ** e10, m, r);
        pts.push(`${plot.sx(e10).toFixed(1)},${plot.sy(lg(e)).toFixed(1)}`);
      }
      curves[k].setAttribute('d', 'M' + pts.join('L'));
    });
  }

  function update() {
    const e10 = Number(slider.value);
    const X0 = Math.round(10 ** e10);
    const r: Arith = mode() === '32' ? Math.fround : (v) => v;
    out.textContent = X0.toLocaleString('uk-UA');
    setAttrs(cursor, { x1: plot.sx(e10), x2: plot.sx(e10) });
    const digits = mode() === '32' ? 7 : 16;
    const rows = METHODS.map((m, k) => {
      const { b, e } = errOf(X0, m, r);
      setAttrs(dots[k], { cx: plot.sx(e10), cy: plot.sy(lg(e)) });
      const good = clamp(-Math.log10(Math.max(e, 1e-17)), 0, digits);
      return `<tr><td><i class="swatch" style="border-color:${m.color}"></i>${m.name}</td><td class="num">${Number.isFinite(b) ? fmt(b, 6) : '—'}</td><td class="num">${Number.isFinite(e) ? sci(e) : '—'}</td><td class="num">${good < 0.5 ? '<b style="color:var(--bad)">0</b>' : fmt(good, 0)}</td></tr>`;
    });
    table.innerHTML = `<thead><tr><th>Спосіб</th><th>Нахил b</th><th>Похибка</th><th title="Скільки правильних десяткових цифр">Цифр</th></tr></thead><tbody>${rows.join('')}</tbody>`;

    const ne = errOf(X0, METHODS[0], r).e;
    const qr = errOf(X0, METHODS[1], r).e;
    const { xs } = makeData(X0, r);
    if (xs.some((v, i) => i > 0 && v <= xs[i - 1])) {
      status.className = 'status warn';
      status.innerHTML = `За такого X₀ ${mode() === '32' ? 'float32' : 'float64'} не може навіть записати сусідні x, що відрізняються на 0,37: вони злипаються. Тут не допоможе жоден алгоритм, дані зіпсовано ще до обчислень.`;
    } else if (ne > 0.01 && qr < 0.01) {
      status.className = 'status warn';
      status.innerHTML = `<b>Нормальні рівняння зламалися</b> (похибка ${Number.isFinite(ne) ? sci(ne) : 'нескінченна'}), а QR ще тримається (${sci(qr)}). Число обумовленості AᵀA — квадрат від обумовленості A, тож НР може губити вдвічі більше цифр.`;
    } else if (ne > 0.01) {
      status.className = 'status warn';
      status.innerHTML = 'Тепер не справляється і QR. Рятує лише центрування: воно прибирає саму причину поганої обумовленості.';
    } else {
      status.className = 'status info';
      status.innerHTML = 'Поки x близько до нуля, усі три способи дають майже однаковий результат. Збільшуйте X₀.';
    }
  }

  slider.addEventListener('input', update);
  modeInputs.forEach((i) =>
    i.addEventListener('change', () => {
      drawCurves();
      update();
    }),
  );
  drawCurves();
  update();
}

/* =====================================================================
   6.4. SVD і майже залежні стовпці: обрізання малих сингулярних чисел
   ===================================================================== */

/** Однобічний метод Якобі: SVD прямокутної матриці A (n×k). */
function svd(A: number[][]) {
  const n = A.length;
  const k = A[0].length;
  const U = A.map((row) => [...row]);
  const V: number[][] = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0;
    for (let p = 0; p < k - 1; p++)
      for (let q = p + 1; q < k; q++) {
        let al = 0, be = 0, ga = 0;
        for (let i = 0; i < n; i++) {
          al += U[i][p] ** 2;
          be += U[i][q] ** 2;
          ga += U[i][p] * U[i][q];
        }
        const scale = Math.sqrt(al * be);
        if (scale === 0 || Math.abs(ga) <= 1e-15 * scale) continue;
        off = Math.max(off, Math.abs(ga) / scale);
        const zeta = (be - al) / (2 * ga);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < n; i++) {
          const [up, uq] = [U[i][p], U[i][q]];
          U[i][p] = c * up - s * uq;
          U[i][q] = s * up + c * uq;
        }
        for (let i = 0; i < k; i++) {
          const [vp, vq] = [V[i][p], V[i][q]];
          V[i][p] = c * vp - s * vq;
          V[i][q] = s * vp + c * vq;
        }
      }
    if (off < 1e-15) break;
  }
  const sig = Array.from({ length: k }, (_, j) => Math.sqrt(U.reduce((s, r) => s + r[j] ** 2, 0)));
  const order = sig.map((_, j) => j).sort((i, j) => sig[j] - sig[i]);
  return {
    s: order.map((j) => sig[j]),
    u: order.map((j) => U.map((r) => (sig[j] > 0 ? r[j] / sig[j] : 0))),
    v: order.map((j) => V.map((r) => r[j])),
  };
}

function initSvd(): void {
  const root = $('#w-svd');
  const deltaIn = $<HTMLInputElement>('input[name="delta"]', root);
  const cutIn = $<HTMLInputElement>('input[name="cut"]', root);
  const deltaOut = $('output[for="delta"]', root);
  const cutOut = $('output[for="cut"]', root);
  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);
  const box = $('.plot', root);

  const x1 = [0, 1, 2, 3, 4, 5, 6, 7];
  const z = [1, -1, 1, -1, -1, 1, -1, 1];
  const e = [0.3, -0.5, 0.8, 0.1, -0.7, 0.4, -0.2, -0.3].map((v) => 0.1 * v);

  const plot = createPlot(box, {
    width: 520,
    height: 300,
    x: [0.4, 3.6],
    y: [-12, 2],
    margin: { top: 16, right: 12, bottom: 30, left: 46 },
    xTicks: [1, 2, 3],
    yTicks: [-12, -8, -4, 0],
    ariaLabel: 'Сингулярні числа матриці A в логарифмічному масштабі та поріг обрізання',
  });
  plot.svg.querySelectorAll('.plot-axis text').forEach((t) => {
    const v = Number((t.textContent ?? '').replace('−', '-'));
    t.textContent = Number.isInteger(v) && Math.abs(v) >= 4 || v === 0 ? `10${String(v).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}` : `σ${'₁₂₃'[v - 1] ?? ''}`;
  });
  const bars = [0, 1, 2].map(() => svgEl('rect', { width: 44, rx: 3 }, plot.layer));
  const vals = [0, 1, 2].map(() => svgEl('text', { 'text-anchor': 'middle', class: 'residual-label' }, plot.svg));
  const cutLine = svgEl('line', { stroke: 'var(--bad)', 'stroke-width': 2, 'stroke-dasharray': '6 4', x1: plot.sx(0.4), x2: plot.sx(3.6) }, plot.layer);

  function update() {
    const delta = 10 ** Number(deltaIn.value);
    const tau = 10 ** Number(cutIn.value);
    deltaOut.textContent = sci(delta);
    cutOut.textContent = sci(tau);
    const x2 = x1.map((v, i) => v + delta * z[i]);
    const y = x1.map((v, i) => 1 + 0.5 * v + 0.5 * x2[i] + e[i]);
    const A = x1.map((v, i) => [1, v, x2[i]]);
    const { s, u, v } = svd(A);

    const bottom = plot.sy(-12);
    s.forEach((si, i) => {
      const lv = clamp(Math.log10(si), -12, 2);
      const kept = si / s[0] > tau;
      setAttrs(bars[i], { x: plot.sx(i + 1) - 22, y: plot.sy(lv), height: Math.max(1, bottom - plot.sy(lv)), fill: kept ? 'var(--accent)' : 'var(--muted)', opacity: kept ? 0.85 : 0.4 });
      setAttrs(vals[i], { x: plot.sx(i + 1), y: plot.sy(lv) - 6, style: `fill: ${kept ? 'var(--accent)' : 'var(--muted)'}` });
      vals[i].textContent = sci(si);
    });
    const cutY = clamp(Math.log10(s[0] * tau), -12, 2);
    setAttrs(cutLine, { y1: plot.sy(cutY), y2: plot.sy(cutY) });

    // θ = Σ (uᵢᵀy / σᵢ) vᵢ — по всіх або лише по «великих» σ.
    const solve = (keep: (i: number) => boolean) => {
      const th = [0, 0, 0];
      s.forEach((si, i) => {
        if (!keep(i) || si === 0) return;
        const c = u[i].reduce((acc, ui, m) => acc + ui * y[m], 0) / si;
        for (let j = 0; j < 3; j++) th[j] += c * v[i][j];
      });
      const res = A.map((row, m) => y[m] - row.reduce((acc, aj, j) => acc + aj * th[j], 0));
      return { th, S: res.reduce((acc, r) => acc + r * r, 0), norm: Math.hypot(...th) };
    };
    const full = solve(() => true);
    const cut = solve((i) => s[i] / s[0] > tau);
    const kept = s.filter((si) => si / s[0] > tau).length;
    const row = (name: string, r: ReturnType<typeof solve>) =>
      `<tr><td>${name}</td>${r.th.map((t) => `<td class="num">${Math.abs(t) > 1e4 ? sci(t) : fmt(t, 3)}</td>`).join('')}<td class="num">${fmt(r.S, 3)}</td></tr>`;
    table.innerHTML = `<thead><tr><th></th><th>a</th><th>b₁</th><th>b₂</th><th>S</th></tr></thead><tbody>${row('усі 3 σ', full)}${row(`лише ${kept} σ`, cut)}</tbody>`;

    const kappa = s[0] / s[2];
    if (kept === 3) {
      status.className = 'status info';
      status.innerHTML = `Число обумовленості A: <b>${sci(kappa)}</b>. ${
        Math.abs(full.th[1]) > 3
          ? 'Ознаки майже однакові, і повний розв\'язок «розхитався»: b₁ і b₂ великі й протилежні за знаком, хоча S майже не менша. Підніміть поріг обрізання.'
          : 'Стовпці достатньо різні, повний розв\'язок стабільний.'
      }`;
    } else {
      status.className = 'status success';
      status.innerHTML = `Відкинули ${3 - kept} мал${3 - kept === 1 ? 'е' : 'і'} сингулярн${3 - kept === 1 ? 'е число' : 'і числа'}: параметри стали розумними (b₁ ≈ b₂), а S зросла лише на ${sci(cut.S - full.S)}. Це і є <b>розв'язок з найменшою нормою</b>: |θ| = ${fmt(cut.norm, 3)} замість ${sci(full.norm)}.`;
    }
  }
  deltaIn.addEventListener('input', update);
  cutIn.addEventListener('input', update);
  update();
}

/* Робочий приклад QR для трьох точок: числа рахуємо тут, щоб не помилитися вручну. */
function renderQrExample(): void {
  const el = document.querySelector<HTMLElement>('#qr-check');
  if (!el) return;
  const s3 = Math.sqrt(3);
  const s2 = Math.sqrt(2);
  const b = (1 / s2) / s2;
  const a = (5 / s3 - 2 * s3 * b) / s3;
  tex(el, `b = \\frac{1/\\sqrt2}{\\sqrt2} = ${tn(b, 4)},\\qquad a = \\frac{5/\\sqrt3 - 2\\sqrt3\\cdot ${tn(b, 4)}}{\\sqrt3} = ${tn(a, 4)}`, true);
}

initPrecision();
initSvd();
renderQrExample();
