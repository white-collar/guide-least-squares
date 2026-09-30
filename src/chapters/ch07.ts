// Розділ 7. Не лише прямі.
import { renderMath, tex, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { clamp, createPlot, formatNumber as fmt, isCompact, makeDraggable, setAttrs, snap, svgEl, type Plot } from '../lib/plot';
import { gaussian, lstsq, seededRandom, type Pt } from '../lib/linalg';

import modelsPy from '../snippets/ch07/models.py?raw';
import modelsJs from '../snippets/ch07/models.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ models: { py: modelsPy, js: modelsJs } });

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

const rmse = (r: number[]) => Math.sqrt(r.reduce((s, v) => s + v * v, 0) / r.length);

/** Крива як SVG-шлях; точки поза межами графіка обрізаємо, щоб не малювати «стрибків» у нескінченність. */
function curvePath(plot: Plot, f: (x: number) => number, x0: number, x1: number, n = 300): string {
  const [ylo, yhi] = plot.opts.y;
  const pad = (yhi - ylo) * 2;
  let d = '';
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = f(x);
    if (!Number.isFinite(y) || y < ylo - pad || y > yhi + pad) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${plot.sx(x).toFixed(1)},${plot.sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/* =====================================================================
   7.2. Конструктор моделі з базисних функцій
   ===================================================================== */
interface Basis {
  key: string;
  label: string;
  tex: string;
  f: (t: number) => number;
}

const BASIS: Basis[] = [
  { key: '1', label: '1', tex: '1', f: () => 1 },
  { key: 't', label: 't', tex: 't', f: (t) => t },
  { key: 't2', label: 't²', tex: 't^2', f: (t) => t * t },
  { key: 't3', label: 't³', tex: 't^3', f: (t) => t * t * t },
  { key: 'sin', label: 'sin 2πt', tex: '\\sin 2\\pi t', f: (t) => Math.sin(2 * Math.PI * t) },
  { key: 'cos', label: 'cos 2πt', tex: '\\cos 2\\pi t', f: (t) => Math.cos(2 * Math.PI * t) },
];

function initBasis(): void {
  const root = $('#w-basis');
  const box = $('.plot', root);
  const checks = [...root.querySelectorAll<HTMLInputElement>('input[name="basis"]')];
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const eqOut = $('[data-out="eq"]', root);
  const matOut = $('[data-out="A"]', root);
  const statsOut = $('[data-out="stats"]', root);
  const status = $('[data-out="status"]', root);

  interface Preset {
    name: string;
    t: number[];
    y: number[];
    X: [number, number];
    Y: [number, number];
    xLabel: string;
    yLabel: string;
    start: string[];
    note: string;
  }
  const rnd = seededRandom(11);
  const ball: Preset = (() => {
    const t = Array.from({ length: 13 }, (_, i) => i * 0.15);
    return {
      name: 'ball',
      t,
      y: t.map((s) => 1 + 9 * s - 4.9 * s * s + 0.15 * gaussian(rnd)),
      X: [0, 1.9],
      Y: [0, 6],
      xLabel: 't, с',
      yLabel: 'h, м',
      start: ['1', 't'],
      note: 'Висота кинутого вгору м\'яча. Фізика каже: h = h₀ + v₀t − gt²/2. Додайте t².',
    };
  })();
  const gnss: Preset = (() => {
    const t = Array.from({ length: 37 }, (_, i) => i / 12);
    return {
      name: 'gnss',
      t,
      y: t.map((s) => 2 + 3 * s + 4 * Math.sin(2 * Math.PI * s) + 2 * Math.cos(2 * Math.PI * s) + 1.5 * gaussian(rnd)),
      X: [0, 3],
      Y: [-6, 18],
      xLabel: 't, роки',
      yLabel: 'мм',
      start: ['1', 't'],
      note: 'Вертикальне зміщення станції GNSS за три роки. Крім повільного тренду є річний цикл (температура, сніг, ґрунтові води). Додайте sin і cos.',
    };
  })();
  const PRESETS: Record<string, Preset> = { ball, gnss };

  let preset = ball;
  let plot: Plot;
  let fitPath: SVGPathElement;
  let dots: SVGGElement;

  function build() {
    box.replaceChildren();
    const compact = isCompact(box);
    const step = preset.name === 'ball' ? 0.5 : 1;
    const xt: number[] = [];
    for (let v = preset.X[0]; v <= preset.X[1] + 1e-9; v += step) xt.push(+v.toFixed(2));
    const yt: number[] = [];
    const ystep = preset.name === 'ball' ? 1 : 6;
    for (let v = preset.Y[0]; v <= preset.Y[1] + 1e-9; v += ystep) yt.push(v);
    plot = createPlot(box, {
      width: compact ? 420 : 560,
      height: compact ? 300 : 340,
      x: preset.X,
      y: preset.Y,
      margin: { top: 16, right: 14, bottom: 30, left: 38 },
      xTicks: xt,
      yTicks: yt,
      xLabel: preset.xLabel,
      yLabel: preset.yLabel,
      ariaLabel: 'Дані та підібрана модель',
    });
    fitPath = svgEl('path', { class: 'fit-line' }, plot.layer);
    dots = svgEl('g', {}, plot.layer);
    preset.t.forEach((t, i) => svgEl('circle', { cx: plot.sx(t), cy: plot.sy(preset.y[i]), r: 4.5, class: 'data-point' }, dots));
    checks.forEach((c) => (c.checked = preset.start.includes(c.value)));
    presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === preset.name));
    status.dataset.note = preset.note;
    update();
  }

  function update() {
    const chosen = BASIS.filter((b) => checks.find((c) => c.value === b.key)?.checked);
    if (chosen.length === 0) {
      fitPath.setAttribute('d', '');
      eqOut.textContent = '';
      matOut.textContent = '';
      statsOut.textContent = '';
      status.className = 'status warn';
      status.textContent = 'Оберіть хоча б одну базисну функцію.';
      return;
    }
    const A = preset.t.map((t) => chosen.map((b) => b.f(t)));
    const th = lstsq(A, preset.y);
    if (!th) {
      status.className = 'status warn';
      status.textContent = 'Стовпці матриці A лінійно залежні — такий набір функцій неможливо розділити.';
      return;
    }
    const model = (t: number) => chosen.reduce((s, b, j) => s + th[j] * b.f(t), 0);
    fitPath.setAttribute('d', curvePath(plot, model, preset.X[0], preset.X[1]));
    const r = preset.t.map((t, i) => preset.y[i] - model(t));
    const ym = preset.y.reduce((s, v) => s + v, 0) / preset.y.length;
    const sst = preset.y.reduce((s, v) => s + (v - ym) ** 2, 0);
    const S = r.reduce((s, v) => s + v * v, 0);

    tex(
      eqOut,
      'y = ' +
        chosen
          .map((b, j) => {
            const c = th[j];
            const sign = j === 0 ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + ';
            return `${sign}${tn(Math.abs(c), 3)}${b.key === '1' ? '' : '\\,' + b.tex}`;
          })
          .join(''),
      true,
    );
    // Перші рядки матриці A: це просто таблиця чисел — значення функцій у точках.
    matOut.innerHTML =
      `<thead><tr>${chosen.map((b) => `<th>${b.label}</th>`).join('')}</tr></thead><tbody>` +
      A.slice(0, 4).map((row) => `<tr>${row.map((v) => `<td class="num">${fmt(v, 2)}</td>`).join('')}</tr>`).join('') +
      `<tr>${chosen.map(() => '<td>⋮</td>').join('')}</tr></tbody>`;
    statsOut.innerHTML = `<tr><td>Параметрів k</td><td class="num">${chosen.length}</td></tr><tr><td>RMSE нев'язок</td><td class="num">${fmt(rmse(r), 3)}</td></tr><tr><td>R²</td><td class="num">${fmt(1 - S / sst, 4)}</td></tr>`;

    let msg = status.dataset.note ?? '';
    if (preset.name === 'ball' && chosen.some((b) => b.key === 't2')) {
      const c2 = th[chosen.findIndex((b) => b.key === 't2')];
      msg = `Коефіцієнт при t² дорівнює ${fmt(c2, 2)}, тож g ≈ ${fmt(-2 * c2, 2)} м/с². Фізичну константу знайдено звичайним МНК.`;
    }
    if (preset.name === 'gnss' && chosen.some((b) => b.key === 'sin') && chosen.some((b) => b.key === 'cos')) {
      const P = th[chosen.findIndex((b) => b.key === 'sin')];
      const Q = th[chosen.findIndex((b) => b.key === 'cos')];
      const v = chosen.some((b) => b.key === 't') ? th[chosen.findIndex((b) => b.key === 't')] : NaN;
      msg = `Річний цикл: амплітуда ${fmt(Math.hypot(P, Q), 2)} мм.${Number.isFinite(v) ? ` Швидкість підняття ${fmt(v, 2)} мм/рік — саме заради неї станцію й спостерігають.` : ''}`;
    }
    status.className = 'status info';
    status.textContent = msg;
  }

  checks.forEach((c) => c.addEventListener('change', update));
  presetBtns.forEach((b) =>
    b.addEventListener('click', () => {
      preset = PRESETS[b.dataset.preset!];
      build();
    }),
  );
  build();
}

/* =====================================================================
   7.3. Коло через точки (алгебраїчний метод Каси)
   ===================================================================== */
function initCircle(): void {
  const root = $('#w-circle');
  const box = $('.plot', root);
  const status = $('[data-out="status"]', root);
  const eqOut = $('[data-out="eq"]', root);
  const X: [number, number] = [-0.5, 6.5];
  const Y: [number, number] = [-1.5, 5.5];
  const compact = isCompact(box);
  const plot = createPlot(box, {
    width: compact ? 400 : 460,
    height: compact ? 400 : 460,
    x: X,
    y: Y,
    margin: { top: 14, right: 14, bottom: 28, left: 30 },
    xTicks: [0, 1, 2, 3, 4, 5, 6],
    yTicks: [-1, 0, 1, 2, 3, 4, 5],
    ariaLabel: 'Точки, виміряні вздовж дуги, та підібране коло',
  });
  const circle = svgEl('circle', { fill: 'none', stroke: 'var(--line)', 'stroke-width': 2.5 }, plot.layer);
  const center = svgEl('g', {}, plot.layer);
  svgEl('path', { d: 'M-7,0 H7 M0,-7 V7', stroke: 'var(--good)', 'stroke-width': 2.5 }, center);
  const radius = svgEl('line', { stroke: 'var(--good)', 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }, plot.layer);
  const res = svgEl('g', {}, plot.layer);
  const handles = svgEl('g', {}, plot.svg);

  const rnd = seededRandom(5);
  const pts: Pt[] = Array.from({ length: 7 }, (_, i) => {
    const phi = 0.2 + (i * 2.2) / 6;
    return { x: +(3 + 2.5 * Math.cos(phi) + 0.08 * gaussian(rnd)).toFixed(2), y: +(1.8 + 2.5 * Math.sin(phi) + 0.08 * gaussian(rnd)).toFixed(2) };
  });

  pts.forEach((_, i) => {
    const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}` }, handles);
    svgEl('circle', { r: 16, class: 'drag-halo' }, g);
    svgEl('circle', { r: 6, class: 'data-point' }, g);
    const move = (x: number, y: number) => {
      pts[i].x = clamp(x, X[0] + 0.1, X[1] - 0.1);
      pts[i].y = clamp(y, Y[0] + 0.1, Y[1] - 0.1);
      update();
    };
    makeDraggable(g, plot.svg, (px, py) => move(snap(plot.ix(px), 0.05), snap(plot.iy(py), 0.05)));
    g.addEventListener('keydown', (e) => {
      const d = ({ ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] } as Record<string, number[]>)[e.key];
      if (!d) return;
      e.preventDefault();
      move(pts[i].x + d[0], pts[i].y + d[1]);
    });
  });

  function update() {
    // x² + y² = 2x₀·x + 2y₀·y + c: невідомі x₀, y₀, c входять лінійно.
    const A = pts.map((p) => [2 * p.x, 2 * p.y, 1]);
    const rhs = pts.map((p) => p.x * p.x + p.y * p.y);
    const th = lstsq(A, rhs);
    [...handles.children].forEach((g, i) => g.setAttribute('transform', `translate(${plot.sx(pts[i].x)},${plot.sy(pts[i].y)})`));
    res.replaceChildren();
    if (!th || th[2] + th[0] ** 2 + th[1] ** 2 <= 0) {
      circle.setAttribute('r', '0');
      status.className = 'status warn';
      status.textContent = 'Точки лежать на прямій: коло нескінченного радіуса. Вигніть дугу.';
      return;
    }
    const [x0, y0, c] = th;
    const R = Math.sqrt(c + x0 * x0 + y0 * y0);
    const k = plot.sx(1) - plot.sx(0);
    setAttrs(circle, { cx: plot.sx(x0), cy: plot.sy(y0), r: R * k });
    center.setAttribute('transform', `translate(${plot.sx(x0)},${plot.sy(y0)})`);
    setAttrs(radius, { x1: plot.sx(x0), y1: plot.sy(y0), x2: plot.sx(x0 + R), y2: plot.sy(y0) });
    // Радіальні відхилення точок від кола.
    const dev = pts.map((p) => Math.hypot(p.x - x0, p.y - y0) - R);
    pts.forEach((p) => {
      const ang = Math.atan2(p.y - y0, p.x - x0);
      svgEl('line', { x1: plot.sx(p.x), y1: plot.sy(p.y), x2: plot.sx(x0 + R * Math.cos(ang)), y2: plot.sy(y0 + R * Math.sin(ang)), stroke: 'var(--bad)', 'stroke-width': 2 }, res);
    });
    const narrow = eqOut.clientWidth < 560;
    const head = `x_0 = ${tn(x0, 3)},\\quad y_0 = ${tn(y0, 3)}`;
    const tail = `R = \\sqrt{c + x_0^2 + y_0^2} = ${tn(R, 3)}`;
    tex(eqOut, narrow ? `\\begin{gathered}${head}\\\\${tail}\\end{gathered}` : `${head},\\quad ${tail}`, true);
    status.className = 'status info';
    status.innerHTML = `Середнє радіальне відхилення точок від кола: <b class="num">${fmt(rmse(dev) * 1000, 0)} мм</b> (якщо одиниці — метри). Тягніть точки: коло перераховується одним МНК на кожен рух.`;
  }
  update();
}

/* =====================================================================
   7.4. Перенавчання: многочлени степенів 0…11 через 12 точок
   ===================================================================== */
function initOverfit(): void {
  const root = $('#w-overfit');
  const box = $('.plot', root);
  const errBox = $('.plot-err', root);
  const slider = $<HTMLInputElement>('input[name="deg"]', root);
  const out = $('output[for="deg"]', root);
  const trueBox = $<HTMLInputElement>('input[name="truth"]', root);
  const status = $('[data-out="status"]', root);
  const statsOut = $('[data-out="stats"]', root);
  const compact = isCompact(box);

  const f = (x: number) => Math.sin(3 * x);
  const u = (x: number) => (2 * x) / 3 - 1; // масштабуємо x у [−1, 1] — це рятує обумовленість
  const MAXD = 11;
  const X: [number, number] = [0, 3];

  const plot = createPlot(box, {
    width: compact ? 420 : 560,
    height: compact ? 300 : 340,
    x: X,
    y: [-2.2, 2.2],
    margin: { top: 16, right: 14, bottom: 30, left: 34 },
    xTicks: [0, 1, 2, 3],
    yTicks: [-2, -1, 0, 1, 2],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Навчальні точки, нові точки, справжня залежність і многочлен',
  });
  const truth = svgEl('path', { fill: 'none', stroke: 'var(--good)', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, plot.layer);
  const valDots = svgEl('g', {}, plot.layer);
  const fitPath = svgEl('path', { class: 'fit-line' }, plot.layer);
  const trDots = svgEl('g', {}, plot.layer);

  const eplot = createPlot(errBox, {
    width: compact ? 420 : 380,
    height: compact ? 240 : 260,
    x: [-0.5, MAXD + 0.5],
    y: [0, 1],
    margin: { top: 22, right: 12, bottom: 30, left: 38 },
    xTicks: [0, 1, 3, 5, 7, 9, 11],
    yTicks: [0, 0.25, 0.5, 0.75, 1],
    ariaLabel: 'Помилка на навчальних і на нових даних залежно від степеня многочлена',
  });
  const et = svgEl('text', { x: 44, y: 14, class: 'plot-label', style: 'font-weight: 600' }, eplot.svg);
  et.textContent = 'RMSE залежно від степеня';
  const trLine = svgEl('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5 }, eplot.layer);
  const vaLine = svgEl('path', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2.5 }, eplot.layer);
  const cursor = svgEl('line', { stroke: 'var(--text)', 'stroke-dasharray': '4 3', y1: eplot.sy(0), y2: eplot.sy(1) }, eplot.layer);
  const trDot = svgEl('circle', { r: 5, fill: 'var(--accent)' }, eplot.layer);
  const vaDot = svgEl('circle', { r: 5, fill: 'var(--warn)' }, eplot.layer);

  let seed = 1;
  let xtr: number[] = [];
  let ytr: number[] = [];
  let xva: number[] = [];
  let yva: number[] = [];
  let fits: { w: number[]; tr: number; va: number }[] = [];

  const vander = (x: number, d: number) => Array.from({ length: d + 1 }, (_, j) => u(x) ** j);
  const poly = (w: number[], x: number) => w.reduce((s, c, j) => s + c * u(x) ** j, 0);

  function regenerate() {
    const rnd = seededRandom(seed * 7919);
    xtr = Array.from({ length: 12 }, (_, i) => 0.1 + (2.8 * i) / 11 + (rnd() - 0.5) * 0.2);
    ytr = xtr.map((x) => f(x) + 0.25 * gaussian(rnd));
    xva = Array.from({ length: 80 }, () => 0.1 + 2.8 * rnd());
    yva = xva.map((x) => f(x) + 0.25 * gaussian(rnd));
    fits = [];
    for (let d = 0; d <= MAXD; d++) {
      const w = lstsq(xtr.map((x) => vander(x, d)), ytr) ?? new Array(d + 1).fill(0);
      fits.push({
        w,
        tr: rmse(xtr.map((x, i) => ytr[i] - poly(w, x))),
        va: rmse(xva.map((x, i) => yva[i] - poly(w, x))),
      });
    }
    trDots.replaceChildren();
    valDots.replaceChildren();
    xtr.forEach((x, i) => svgEl('circle', { cx: plot.sx(x), cy: plot.sy(ytr[i]), r: 5.5, class: 'data-point' }, trDots));
    xva.forEach((x, i) => svgEl('circle', { cx: plot.sx(x), cy: plot.sy(clamp(yva[i], -2.1, 2.1)), r: 3, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 1.3, opacity: 0.8 }, valDots));
    const ey = (v: number) => eplot.sy(clamp(v, 0, 1));
    trLine.setAttribute('d', 'M' + fits.map((q, d) => `${eplot.sx(d)},${ey(q.tr)}`).join('L'));
    vaLine.setAttribute('d', 'M' + fits.map((q, d) => `${eplot.sx(d)},${ey(q.va)}`).join('L'));
    truth.setAttribute('d', curvePath(plot, f, X[0], X[1]));
    update();
  }

  function update() {
    const d = Number(slider.value);
    out.textContent = String(d);
    const q = fits[d];
    fitPath.setAttribute('d', curvePath(plot, (x) => poly(q.w, x), X[0], X[1], 500));
    truth.setAttribute('visibility', trueBox.checked ? 'visible' : 'hidden');
    setAttrs(cursor, { x1: eplot.sx(d), x2: eplot.sx(d) });
    setAttrs(trDot, { cx: eplot.sx(d), cy: eplot.sy(clamp(q.tr, 0, 1)) });
    setAttrs(vaDot, { cx: eplot.sx(d), cy: eplot.sy(clamp(q.va, 0, 1)) });
    statsOut.innerHTML = `<tr><td><i class="swatch" style="border-color:var(--accent)"></i>RMSE на навчальних (12 точок)</td><td class="num">${fmt(q.tr, 3)}</td></tr><tr><td><i class="swatch" style="border-color:var(--warn)"></i>RMSE на нових (80 точок)</td><td class="num">${q.va > 5 ? '&gt; 5' : fmt(q.va, 3)}</td></tr>`;
    const best = fits.reduce((b, v, i) => (v.va < fits[b].va ? i : b), 0);
    if (d <= 2) {
      status.className = 'status warn';
      status.innerHTML = '<b>Недонавчання.</b> Модель занадто проста: вона не може зігнутися так, як дані. Помилка велика скрізь — і на навчальних точках, і на нових.';
    } else if (d === MAXD) {
      status.className = 'status warn';
      status.innerHTML = '<b>Інтерполяція.</b> 12 параметрів на 12 точок: крива проходить точно через кожну, помилка навчання — нуль. Але між точками й біля країв вона робить дикі стрибки, і на нових даних провалюється.';
    } else if (q.va > fits[best].va * 1.35) {
      status.className = 'status warn';
      status.innerHTML = `<b>Перенавчання.</b> Помилка на навчальних даних ще менша, ніж за степеня ${best}, але на нових — більша. Модель почала «запам'ятовувати» шум.`;
    } else {
      status.className = 'status success';
      status.innerHTML = `<b>Вдалий баланс.</b> Найменша помилка на нових даних цього разу — за степеня ${best}. Модель вловлює форму залежності, але не шум.`;
    }
  }

  slider.addEventListener('input', update);
  trueBox.addEventListener('change', update);
  $('[data-action="reroll"]', root).addEventListener('click', () => {
    seed += 1;
    regenerate();
  });
  regenerate();
}

initBasis();
initCircle();
initOverfit();
