// Розділ 2. Що означає «найкращий» розв'язок?
import { renderMath, tex, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import {
  animate,
  clamp,
  createPlot,
  formatNumber as fmt,
  isCompact,
  makeDraggable,
  residualColor,
  setAttrs,
  snap,
  svgEl,
  type Plot,
} from '../lib/plot';
import { lineThrough, type Pt } from '../lib/linalg';

import criteriaPy from '../snippets/ch02/criteria.py?raw';
import criteriaJs from '../snippets/ch02/criteria.js?raw';
import estimatesPy from '../snippets/ch02/estimates.py?raw';
import estimatesJs from '../snippets/ch02/estimates.js?raw';

renderMath();
initQuizzes();
initCodeTabs({
  criteria: { py: criteriaPy, js: criteriaJs },
  estimates: { py: estimatesPy, js: estimatesJs },
});

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

/** Число для KaTeX: кома в фігурних дужках, щоб після неї не з'являвся пробіл. */
function texNum(v: number, digits: number): string {
  return fmt(v, digits).replace('−', '-').replace(',', '{,}');
}

/* =====================================================================
   Критерії якості та їхні оптимуми для прямої y = a + b·x
   ===================================================================== */
type Crit = 'sum' | 'abs' | 'max' | 'sq';
type Line = { a: number; b: number };

const residualsOf = (pts: Pt[], { a, b }: Line) => pts.map((p) => p.y - (a + b * p.x));

const LOSS: Record<Crit, (r: number[]) => number> = {
  sum: (r) => Math.abs(r.reduce((s, v) => s + v, 0)),
  abs: (r) => r.reduce((s, v) => s + Math.abs(v), 0),
  max: (r) => Math.max(...r.map(Math.abs)),
  sq: (r) => r.reduce((s, v) => s + v * v, 0),
};

/** Мінімум суми квадратів: розв'язок 2×2 нормальних рівнянь (виведемо їх у розділі 4). */
function fitL2(pts: Pt[]): Line | null {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx < 1e-12) return null;
  const b = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  return { a: my - b * mx, b };
}

/** Мінімум суми модулів: для двох параметрів оптимум проходить через дві точки даних. */
function fitL1(pts: Pt[]): Line | null {
  let best: Line | null = null;
  let bestLoss = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const l = lineThrough(pts[i], pts[j]);
      if (!l) continue;
      const loss = LOSS.abs(residualsOf(pts, l));
      if (loss < bestLoss - 1e-12) [best, bestLoss] = [l, loss];
    }
  return best;
}

/** Мінімакс (Чебишов): оптимум визначають три точки з нев'язками однакової величини й чергованих знаків. */
function fitLinf(pts: Pt[]): Line | null {
  let best: Line | null = null;
  let bestLoss = Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const [p, q, s] = [pts[i], pts[j], pts[k]].sort((u, v) => u.x - v.x);
        if (s.x - p.x < 1e-12) continue;
        const b = (s.y - p.y) / (s.x - p.x);
        const a = (p.y + q.y - b * (p.x + q.x)) / 2;
        const loss = LOSS.max(residualsOf(pts, { a, b }));
        if (loss < bestLoss - 1e-12) [best, bestLoss] = [{ a, b }, loss];
      }
  return best;
}

/* =====================================================================
   2.1–2.2. Головний інтерактив: чотири критерії на одному графіку
   ===================================================================== */
function initCriteriaWidget(): void {
  const root = $('#w-criteria');
  const PRESETS: Record<string, Pt[]> = {
    three: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ],
    six: [
      { x: 0.5, y: 0.9 },
      { x: 1.5, y: 1.5 },
      { x: 2.5, y: 1.7 },
      { x: 3.5, y: 2.5 },
      { x: 4.5, y: 2.7 },
      { x: 5.5, y: 3.4 },
    ],
    outlier: [
      { x: 0.5, y: 0.9 },
      { x: 1.5, y: 1.5 },
      { x: 2.5, y: 1.7 },
      { x: 3.5, y: 2.5 },
      { x: 4.5, y: 0.1 },
      { x: 5.5, y: 3.4 },
    ],
  };

  // Однаковий масштаб по осях: квадрати нев'язок — справжні квадрати.
  const X: [number, number] = [0, 6];
  const plotBox = $('.plot', root);
  const compact = isCompact(plotBox);
  const Y: [number, number] = compact ? [-0.6, 4.0] : [-0.5, 3.8];
  const plot: Plot = createPlot(plotBox, {
    width: compact ? 420 : 600,
    height: compact ? 330 : 440,
    x: X,
    y: Y,
    margin: { top: 16, right: 16, bottom: 31, left: 36 },
    xTicks: [0, 1, 2, 3, 4, 5, 6],
    yTicks: [0, 1, 2, 3],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Точки, пряма та нев\'язки, зображені відповідно до обраного критерію',
  });
  const { sx, sy, svg, layer } = plot;

  const ghostLayer = svgEl('g', {}, layer);
  const ghosts: Record<'abs' | 'max' | 'sq', SVGLineElement> = {
    abs: svgEl('line', { stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '7 5' }, ghostLayer),
    max: svgEl('line', { stroke: 'var(--ml)', 'stroke-width': 2, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round' }, ghostLayer),
    sq: svgEl('line', { stroke: 'var(--good)', 'stroke-width': 2, 'stroke-dasharray': '12 4 2 4' }, ghostLayer),
  };
  const shapes = svgEl('g', {}, layer);
  const line = svgEl('line', { class: 'fit-line' }, layer);
  const centroid = svgEl('g', {}, svg);
  svgEl('circle', { r: 6, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }, centroid);
  svgEl('path', { d: 'M-10,0 H10 M0,-10 V10', stroke: 'var(--accent)', 'stroke-width': 1.5 }, centroid);
  const cLabel = svgEl('text', { x: 10, y: 20, class: 'plot-label', style: 'fill: var(--accent)' }, centroid);
  cLabel.textContent = 'центр ваги';
  const labels = svgEl('g', {}, svg);
  const handlesLayer = svgEl('g', {}, svg);

  const sliderA = $<HTMLInputElement>('input[name="a"]', root);
  const sliderB = $<HTMLInputElement>('input[name="b"]', root);
  const outA = $('output[for="crit-a"]', root);
  const outB = $('output[for="crit-b"]', root);
  const eqDisplay = $('[data-out="eq"]', root);
  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);
  const bestBtn = $<HTMLButtonElement>('[data-action="best"]', root);
  const ghostBox = $<HTMLInputElement>('input[name="ghosts"]', root);
  const legend = $('[data-out="legend"]', root);
  const critBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-crit]')];
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];

  let pts: Pt[] = [];
  let preset = 'three';
  let crit: Crit = 'sq';
  let a = 0.2;
  let b = 0.8;
  let handles: SVGGElement[] = [];

  const NAMES: Record<Crit, string> = {
    sum: '\\left|\\sum r_i\\right|',
    abs: '\\sum |r_i|',
    max: '\\max |r_i|',
    sq: '\\sum r_i^2',
  };
  const TEXT: Record<Crit, string> = {
    sum:
      '<b>Сума нев\'язок.</b> Плюси й мінуси взаємно гасяться: нуль дає <i>будь-яка</i> пряма, що проходить через центр ваги точок. Натисніть кнопку нижче — пряма обертатиметься, а сума лишатиметься нулем. Як критерій це не працює.',
    abs: '<b>Сума модулів (L1).</b> Знаки вже не заважають, і мінімум існує. Але функція має «злами», де похідна не визначена, тож формули для мінімуму немає — лише перебір чи ітерації. Оптимальна пряма проходить точно через дві точки.',
    max: '<b>Найбільша нев\'язка (мінімакс, L∞).</b> Дбає лише про найгіршу точку, решта на результат не впливають. Тому одна погана точка тягне за собою всю пряму.',
    sq: '<b>Сума квадратів (L2).</b> Кожна нев\'язка — площа квадрата, тож велика нев\'язка «коштує» непропорційно дорожче: 2 → 4, а 3 → 9. Функція гладка, і мінімум дає проста формула.',
  };

  function optimum(c: Crit): Line | null {
    if (c === 'abs') return fitL1(pts);
    if (c === 'max') return fitLinf(pts);
    return fitL2(pts);
  }

  function buildHandles() {
    handlesLayer.replaceChildren();
    handles = pts.map((_, i) => {
      const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}` }, handlesLayer);
      svgEl('circle', { r: 18, class: 'drag-halo' }, g);
      svgEl('circle', { r: 6.5, class: 'data-point' }, g);
      makeDraggable(g, svg, (px, py) => {
        pts[i].x = clamp(snap(plot.ix(px), 0.1), X[0] + 0.1, X[1] - 0.1);
        pts[i].y = clamp(snap(plot.iy(py), 0.1), Y[0] + 0.1, Y[1] - 0.1);
        render();
      });
      g.addEventListener('keydown', (e) => {
        const d = ({ ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] } as Record<string, number[]>)[e.key];
        if (!d) return;
        e.preventDefault();
        pts[i].x = clamp(+(pts[i].x + d[0]).toFixed(1), X[0] + 0.1, X[1] - 0.1);
        pts[i].y = clamp(+(pts[i].y + d[1]).toFixed(1), Y[0] + 0.1, Y[1] - 0.1);
        render();
      });
      return g;
    });
  }

  function setLine(el: SVGLineElement, l: Line) {
    setAttrs(el, { x1: sx(X[0]), y1: sy(l.a + l.b * X[0]), x2: sx(X[1]), y2: sy(l.a + l.b * X[1]) });
  }

  function render() {
    setLine(line, { a, b });
    const r = residualsOf(pts, { a, b });
    const absMax = Math.max(...r.map(Math.abs));
    shapes.replaceChildren();
    labels.replaceChildren();

    pts.forEach((p, i) => {
      const yl = a + b * p.x;
      const x0 = sx(p.x);
      const [y0, y1] = [sy(p.y), sy(yl)];
      const tiny = Math.abs(r[i]) < 0.005;
      let color = residualColor(r[i], 1.2);
      let width = 2.5;
      let label = fmt(r[i], 2, true);
      let dash = '4 3';

      if (crit === 'sum') {
        color = r[i] >= 0 ? 'var(--accent)' : 'var(--warn)';
      } else if (crit === 'abs') {
        label = fmt(Math.abs(r[i]), 2);
      } else if (crit === 'max') {
        const isMax = Math.abs(Math.abs(r[i]) - absMax) < 1e-9;
        color = isMax ? 'var(--bad)' : 'var(--axis)';
        width = isMax ? 4 : 1.5;
        dash = isMax ? '' : '3 3';
        label = isMax ? `max ${fmt(Math.abs(r[i]), 2)}` : '';
      } else {
        // Квадрат зі стороною |r|, прикладений до нев'язки справа.
        const side = Math.abs(y1 - y0);
        svgEl('rect', { x: x0, y: Math.min(y0, y1), width: side, height: side, fill: color, 'fill-opacity': 0.22, stroke: color, 'stroke-width': 1.2 }, shapes);
        label = fmt(r[i] * r[i], 2);
      }
      if (!tiny) svgEl('line', { x1: x0, x2: x0, y1: y0, y2: y1, stroke: color, 'stroke-width': width, 'stroke-dasharray': dash }, shapes);
      if (!tiny && label) {
        const t = svgEl('text', { x: x0 - 6, y: clamp((y0 + y1) / 2 + 4, 14, plot.opts.height - 36), 'text-anchor': 'end', class: 'residual-label', style: `fill: ${color}` }, labels);
        t.textContent = label;
      }
      handles[i]?.setAttribute('transform', `translate(${x0},${y0})`);
    });

    // Центр ваги — лише для критерію «сума нев'язок».
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    centroid.setAttribute('transform', `translate(${sx(mx)},${sy(my)})`);
    centroid.setAttribute('visibility', crit === 'sum' ? 'visible' : 'hidden');

    // Оптимальні прямі всіх трьох «справжніх» критеріїв.
    ghostLayer.setAttribute('visibility', ghostBox.checked ? 'visible' : 'hidden');
    legend.hidden = !ghostBox.checked;
    for (const c of ['abs', 'max', 'sq'] as const) {
      const l = optimum(c);
      if (l) setLine(ghosts[c], l);
    }

    // Повзунки й рівняння.
    sliderA.value = String(a);
    sliderB.value = String(b);
    outA.textContent = fmt(a, 2);
    outB.textContent = fmt(b, 2);
    tex(eqDisplay, `y = ${texNum(a, 2)} ${b < 0 ? '-' : '+'} ${texNum(Math.abs(b), 2)}\\,x`);

    // Таблиця значень усіх критеріїв.
    table.innerHTML =
      '<thead><tr><th>Критерій</th><th>Зараз</th><th>Мінімум</th></tr></thead><tbody>' +
      (['sum', 'abs', 'max', 'sq'] as Crit[])
        .map((c) => {
          const now = LOSS[c](r);
          const opt = c === 'sum' ? null : optimum(c);
          const min = c === 'sum' ? '0 (∞ прямих)' : opt ? fmt(LOSS[c](residualsOf(pts, opt)), 3) : '—';
          return `<tr${c === crit ? ' class="current"' : ''}><td data-tex="${NAMES[c]}"></td><td class="num">${fmt(now, 3)}</td><td class="num">${min}</td></tr>`;
        })
        .join('') +
      '</tbody>';
    table.querySelectorAll<HTMLElement>('[data-tex]').forEach((td) => tex(td, td.dataset.tex!));

    critBtns.forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.crit === crit)));
    presetBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.preset === preset));
    status.innerHTML = TEXT[crit];
    bestBtn.textContent = crit === 'sum' ? '↻ Обертати навколо центру ваги' : 'Знайти найкращу пряму за цим критерієм';
  }

  function animateTo(t: Line) {
    const [fa, fb] = [a, b];
    animate(600, (k) => {
      a = fa + (t.a - fa) * k;
      b = fb + (t.b - fb) * k;
      render();
    });
  }

  function loadPreset(name: string) {
    preset = name;
    pts = PRESETS[name].map((p) => ({ ...p }));
    buildHandles();
    render();
  }

  sliderA.addEventListener('input', () => {
    a = Number(sliderA.value);
    render();
  });
  sliderB.addEventListener('input', () => {
    b = Number(sliderB.value);
    render();
  });
  ghostBox.addEventListener('change', render);
  critBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      crit = btn.dataset.crit as Crit;
      render();
    }),
  );
  presetBtns.forEach((btn) => btn.addEventListener('click', () => loadPreset(btn.dataset.preset!)));

  bestBtn.addEventListener('click', () => {
    if (crit !== 'sum') {
      const l = optimum(crit);
      if (l) animateTo(l);
      return;
    }
    // Обертання навколо центру ваги: сума нев'язок увесь час дорівнює нулю.
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    const b0 = b;
    const start = { a: my - b0 * mx, b: b0 };
    animateTo(start);
    setTimeout(() => {
      animate(3200, (k) => {
        b = b0 + 0.9 * Math.sin(2 * Math.PI * k);
        a = my - b * mx;
        render();
      });
    }, 650);
  });

  loadPreset('three');
}

/* =====================================================================
   2.3. Одне невідоме: три криві критеріїв і три різні «найкращі» оцінки
   ===================================================================== */
function initOneDimWidget(): void {
  const root = $('#w-1d');
  const PRESETS: Record<string, number[]> = {
    three: [10.02, 10.05, 9.98],
    four: [10.02, 10.05, 9.98, 10.04],
    blunder: [10.02, 10.05, 10.2],
  };
  const host = $('.plot', root);
  const xOut = $('[data-out="x"]', root);
  const valuesOut = $('[data-out="values"]', root);
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];

  const curves = [
    {
      key: 'sq',
      title: 'Σ v²  (мм²)  → мінімум: середнє',
      color: 'var(--good)',
      f: (x: number, l: number[]) => l.reduce((s, li) => s + ((x - li) * 1000) ** 2, 0),
      slope: (x: number, l: number[]) => l.reduce((s, li) => s + 2 * (x - li) * 1000, 0),
      best: (l: number[]) => [l.reduce((s, v) => s + v, 0) / l.length],
      bestName: 'середнє',
      unit: 'мм²',
    },
    {
      key: 'abs',
      title: 'Σ |v|  (мм)  → мінімум: медіана',
      color: 'var(--warn)',
      f: (x: number, l: number[]) => l.reduce((s, li) => s + Math.abs(x - li) * 1000, 0),
      slope: (x: number, l: number[]) => l.reduce((s, li) => s + Math.sign(x - li), 0),
      best: (l: number[]) => {
        const s = [...l].sort((p, q) => p - q);
        const n = s.length;
        return n % 2 ? [s[(n - 1) / 2]] : [s[n / 2 - 1], s[n / 2]];
      },
      bestName: 'медіана',
      unit: 'мм',
    },
    {
      key: 'max',
      title: 'max |v|  (мм)  → мінімум: середина розмаху',
      color: 'var(--ml)',
      f: (x: number, l: number[]) => Math.max(...l.map((li) => Math.abs(x - li) * 1000)),
      slope: (x: number, l: number[]) => {
        const mid = (Math.min(...l) + Math.max(...l)) / 2;
        return x < mid ? -1 : x > mid ? 1 : 0;
      },
      best: (l: number[]) => [(Math.min(...l) + Math.max(...l)) / 2],
      bestName: 'середина розмаху',
      unit: 'мм',
    },
  ];

  let data: number[] = [];
  let x = 10.0;
  let plots: { plot: Plot; marker: SVGCircleElement; cursor: SVGLineElement; curve: (typeof curves)[number] }[] = [];

  function build(name: string) {
    data = PRESETS[name];
    presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === name));
    host.replaceChildren();
    const lo = Math.min(...data) - 0.025;
    const hi = Math.max(...data) + 0.025;
    x = clamp(x, lo, hi);
    const step = hi - lo > 0.15 ? 0.04 : 0.02;
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(+t.toFixed(2));
    const compact = isCompact(host);

    plots = curves.map((curve, idx) => {
      const N = 240;
      const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
      const ys = xs.map((v) => curve.f(v, data));
      const top = Math.max(...ys) * 1.12;
      const last = idx === curves.length - 1;
      const plot = createPlot(host, {
        width: compact ? 420 : 640,
        height: last ? 150 : 124,
        x: [lo, hi],
        y: [0, top],
        margin: { top: 22, right: 14, bottom: last ? 30 : 4, left: 14 },
        xTicks: last ? ticks : [],
        xLabel: last ? 'м' : undefined,
        ariaLabel: curve.title,
      });
      const { sx, sy, layer, svg } = plot;
      svg.style.marginBottom = last ? '0' : '2px';
      const t = svgEl('text', { x: 16, y: 15, class: 'plot-label', style: `fill: ${curve.color}; font-weight: 600` }, svg);
      t.textContent = curve.title;

      // Виміри — засічки на осі.
      data.forEach((li) => svgEl('path', { d: `M${sx(li)},${sy(0)} l-5,8 h10 z`, fill: 'var(--point)', transform: 'translate(0,-8)' }, layer));
      // Крива критерію.
      svgEl('path', { d: 'M' + xs.map((v, i) => `${sx(v).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join('L'), fill: 'none', stroke: curve.color, 'stroke-width': 2.5 }, layer);
      // Мінімум (для медіани з парною кількістю вимірів — цілий відрізок).
      const best = curve.best(data);
      const yb = curve.f(best[0], data);
      if (best.length === 2) {
        svgEl('line', { x1: sx(best[0]), x2: sx(best[1]), y1: sy(yb), y2: sy(yb), stroke: curve.color, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.45 }, layer);
      }
      svgEl('circle', { cx: sx(best[0]), cy: sy(yb), r: 5, fill: 'var(--surface)', stroke: curve.color, 'stroke-width': 2.5 }, layer);

      const cursor = svgEl('line', { y1: sy(top), y2: sy(0), stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, layer);
      const marker = svgEl('circle', { r: 5.5, fill: 'var(--accent)' }, layer);

      // Перетягувати можна будь-де на графіку.
      const hit = svgEl('rect', { x: 0, y: 0, width: plot.opts.width, height: plot.opts.height, fill: 'transparent', class: 'draggable' }, svg);
      const move = (px: number) => {
        x = clamp(snap(plot.ix(px), 0.0005), lo, hi);
        update();
      };
      makeDraggable(hit, svg, move);
      hit.addEventListener('pointerdown', (e) => {
        const ctm = svg.getScreenCTM();
        if (ctm) move(new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).x);
      });
      return { plot, marker, cursor, curve };
    });
    update();
  }

  function update() {
    xOut.textContent = `${fmt(x, 4)} м`;
    const rows: string[] = [];
    for (const { plot, marker, cursor, curve } of plots) {
      const v = curve.f(x, data);
      setAttrs(cursor, { x1: plot.sx(x), x2: plot.sx(x) });
      setAttrs(marker, { cx: plot.sx(x), cy: plot.sy(v) });
      const best = curve.best(data);
      const bestTxt = best.map((b) => fmt(b, 4)).join(' … ');
      const slope = curve.slope(x, data);
      rows.push(
        `<tr><td style="color:${curve.color};font-weight:600">${curve.key === 'sq' ? 'Σ v²' : curve.key === 'abs' ? 'Σ |v|' : 'max |v|'}</td><td class="num">${fmt(v, 1)} ${curve.unit}</td><td class="num">${fmt(slope, curve.key === 'sq' ? 0 : 0, true)}</td><td class="num">${bestTxt}</td></tr>`,
      );
    }
    valuesOut.innerHTML = `<thead><tr><th>Критерій</th><th>Значення</th><th>Нахил</th><th>Найкраща оцінка, м</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  }

  presetBtns.forEach((btn) => btn.addEventListener('click', () => build(btn.dataset.preset!)));
  build('three');
}

/* =====================================================================
   2.4. Нівелірний хід: розподіліть нев'язку самі
   ===================================================================== */
function initLevelWidget(): void {
  const root = $('#w-lvl2');
  const W = -7; // сума виправлень мусить дорівнювати −7 мм, щоб хід замкнувся
  const sliders = [...root.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  const outs = [...root.querySelectorAll<HTMLElement>('output')];
  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);

  const svg = svgEl('svg', { viewBox: '0 0 420 210', role: 'img', 'aria-label': 'Виправлення чотирьох ходів у міліметрах' });
  $('.plot', root).appendChild(svg);
  const V: [number, number] = [-8, 4];
  const sy = (v: number) => 20 + ((V[1] - clamp(v, V[0], V[1])) / (V[1] - V[0])) * 160;
  for (let t = V[0]; t <= V[1]; t += 2) {
    svgEl('line', { x1: 40, x2: 410, y1: sy(t), y2: sy(t), stroke: 'var(--grid)' }, svg);
    const lbl = svgEl('text', { x: 34, y: sy(t) + 4, 'text-anchor': 'end', class: 'plot-label' }, svg);
    lbl.textContent = fmt(t, 0);
  }
  svgEl('line', { x1: 40, x2: 410, y1: sy(0), y2: sy(0), stroke: 'var(--axis)', 'stroke-width': 1.5 }, svg);
  const bars = [0, 1, 2, 3].map((i) => {
    const x = 60 + i * 90;
    const rect = svgEl('rect', { x, width: 60, rx: 3 }, svg);
    const val = svgEl('text', { x: x + 30, 'text-anchor': 'middle', class: 'residual-label' }, svg);
    const name = svgEl('text', { x: x + 30, y: 202, 'text-anchor': 'middle', class: 'plot-label' }, svg);
    name.textContent = i === 3 ? 'v₄ (з умови)' : `v${'₁₂₃'[i]}`;
    return { rect, val };
  });

  const PRESET: Record<string, number[]> = {
    last: [0, 0, 0],
    equal: [-1.75, -1.75, -1.75],
    length: [-1.4, -2.1, -1.05],
  };

  function render() {
    const v = sliders.map((s) => Number(s.value));
    v.push(W - v.reduce((s, x) => s + x, 0));
    v.forEach((vi, i) => {
      if (i < 3) outs[i].textContent = fmt(vi, 2, true);
      const color = i === 3 ? 'var(--muted)' : 'var(--accent)';
      const y0 = sy(0);
      const y1 = sy(vi);
      setAttrs(bars[i].rect, { y: Math.min(y0, y1), height: Math.max(1, Math.abs(y1 - y0)), fill: color, opacity: i === 3 ? 0.55 : 0.8 });
      setAttrs(bars[i].val, { y: vi < 0 ? Math.max(y0, y1) + 15 : Math.min(y0, y1) - 5, style: `fill: ${color}` });
      bars[i].val.textContent = fmt(vi, 2, true);
    });
    const sq = v.reduce((s, x) => s + x * x, 0);
    const ab = v.reduce((s, x) => s + Math.abs(x), 0);
    const mx = Math.max(...v.map(Math.abs));
    table.innerHTML = `<thead><tr><th>Критерій</th><th>Зараз</th><th>Мінімум</th></tr></thead><tbody>
      <tr><td>Σ v², мм²</td><td class="num">${fmt(sq, 2)}</td><td class="num">12,25</td></tr>
      <tr><td>Σ |v|, мм</td><td class="num">${fmt(ab, 2)}</td><td class="num">7,00</td></tr>
      <tr><td>max |v|, мм</td><td class="num">${fmt(mx, 2)}</td><td class="num">1,75</td></tr></tbody>`;

    if (Math.abs(sq - 12.25) < 0.02) {
      status.className = 'status success';
      status.innerHTML = '<b>Мінімум суми квадратів:</b> нев\'язку розподілено порівну, по −1,75 мм на кожен хід. Жоден інший розподіл не дає меншої суми квадратів.';
    } else if (v.some((x) => x > 0.001)) {
      status.className = 'status warn';
      status.innerHTML = 'Одне з виправлень має «неправильний» знак. Хід усе одно замикається, але сума модулів уже більша за 7: ми додали зайву помилку, щоб потім її компенсувати.';
    } else {
      status.className = 'status info';
      status.innerHTML = 'Хід замкнено: сума виправлень −7 мм. Зверніть увагу, що <b>Σ |v| = 7</b> для <i>будь-якого</i> розподілу з однаковими знаками. Критерій L1 не бачить різниці між «порівну» та «все на один хід». А сума квадратів бачить.';
    }
  }

  sliders.forEach((s) => s.addEventListener('input', render));
  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const target = PRESET[btn.dataset.preset!];
      const from = sliders.map((s) => Number(s.value));
      animate(450, (k) => {
        sliders.forEach((s, i) => (s.value = String(from[i] + (target[i] - from[i]) * k)));
        render();
      });
    }),
  );
  render();
}

initCriteriaWidget();
initOneDimWidget();
initLevelWidget();
