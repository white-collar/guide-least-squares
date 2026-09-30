// Розділ 10. МНК і машинне навчання.
import { renderMath, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { clamp, createPlot, formatNumber as fmt, isCompact, makeDraggable, setAttrs, snap, svgEl, type Plot } from '../lib/plot';
import { eigSym2, evalQuadratic, gaussian, lineQuadratic, lstsq, seededRandom, solve2, type Pt } from '../lib/linalg';

import mlPy from '../snippets/ch10/ml.py?raw';
import mlJs from '../snippets/ch10/ml.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ ml: { py: mlPy, js: mlJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

const LEVELS = [0.02, 0.08, 0.18, 0.32, 0.5, 0.72, 0.98, 1.28, 1.62];

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(6));
  return out;
}

const rmse = (r: number[]) => Math.sqrt(r.reduce((s, v) => s + v * v, 0) / r.length);

/* =====================================================================
   10.2. Градієнтний спуск проти аналітичного розв'язку
   ===================================================================== */
function initGD(): void {
  const root = $('#w-gd');
  const mapBox = $('.plot-map', root);
  const lossBox = $('.plot-loss', root);
  const lrIn = $<HTMLInputElement>('input[name="lr"]', root);
  const lrOut = $('output[for="gd-lr"]', root);
  const methodIns = [...root.querySelectorAll<HTMLInputElement>('input[name="method"]')];
  const stdBox = $<HTMLInputElement>('input[name="std"]', root);
  const status = $('[data-out="status"]', root);
  const iterOut = $('[data-out="iter"]', root);
  const compact = isCompact(mapBox);

  // Дані: 40 точок, x від 0 до 10.
  const rnd = seededRandom(21);
  const raw: Pt[] = Array.from({ length: 40 }, () => {
    const x = 10 * rnd();
    return { x, y: 1 + 0.5 * x + 0.4 * gaussian(rnd) };
  });
  const n = raw.length;
  const mx = raw.reduce((s, p) => s + p.x, 0) / n;
  const sd = Math.sqrt(raw.reduce((s, p) => s + (p.x - mx) ** 2, 0) / n);

  let pts: Pt[] = [];
  let map: Plot;
  let pathLine: SVGPolylineElement;
  let cur: SVGCircleElement;
  let theta: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let path: [number, number][] = [];
  let losses: number[] = [];
  let opt: [number, number] = [0, 0];
  let lossStar = 0;
  let L = 1;
  let timer = 0;
  let rand = seededRandom(5);

  const loss = (t: [number, number]) => evalQuadratic(lineQuadratic(pts), t[0], t[1]) / n;

  const lossPlot = createPlot(lossBox, {
    width: compact ? 420 : 380,
    height: 220,
    x: [0, 200],
    y: [-8, 2],
    margin: { top: 22, right: 12, bottom: 28, left: 44 },
    xTicks: [0, 50, 100, 150, 200],
    yTicks: [-8, -6, -4, -2, 0, 2],
    ariaLabel: 'Надлишкова помилка залежно від номера кроку',
  });
  lossPlot.svg.querySelectorAll('.plot-axis text').forEach((t, i, all) => {
    // Підписи осі y — степені десяти (другу половину підписів становлять саме вони).
    if (i >= all.length - 6) t.textContent = `10${String(Number((t.textContent ?? '').replace('−', '-'))).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
  });
  const lt = svgEl('text', { x: 50, y: 14, class: 'plot-label', style: 'font-weight: 600' }, lossPlot.svg);
  lt.textContent = 'MSE − MSE* (наскільки далеко від дна)';
  const lossLine = svgEl('path', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2 }, lossPlot.layer);

  function setup() {
    stop();
    const standardize = stdBox.checked;
    pts = raw.map((p) => ({ x: standardize ? (p.x - mx) / sd : p.x, y: p.y }));
    const q = lineQuadratic(pts);
    opt = solve2(q.M, q.v)!;
    lossStar = loss(opt);
    L = (2 * eigSym2(q.M).l1) / n; // найбільше власне число гессіана MSE
    const det = q.M[0][0] * q.M[1][1] - q.M[0][1] ** 2;
    // Межі карти: рамка еліпса рівня MSE* + 1,5.
    const Lv = 1.5 * n;
    const ha = 1.15 * Math.sqrt((Lv * q.M[1][1]) / det);
    const hb = 1.15 * Math.sqrt((Lv * q.M[0][0]) / det);
    const domA: [number, number] = [opt[0] - ha, opt[0] + ha];
    const domB: [number, number] = [opt[1] - hb, opt[1] + hb];
    mapBox.replaceChildren();
    map = createPlot(mapBox, {
      width: compact ? 420 : 460,
      height: compact ? 360 : 400,
      x: domA,
      y: domB,
      margin: { top: 14, right: 14, bottom: 30, left: 44 },
      xTicks: niceTicks(domA[0], domA[1]),
      yTicks: niceTicks(domB[0], domB[1]),
      xLabel: standardize ? 'c' : 'a',
      yLabel: 'b',
      ariaLabel: 'Лінії рівня функції втрат і шлях спуску',
    });
    // Еліпси рівня (точно, через власні числа).
    const kx = map.sx(1) - map.sx(0);
    const ky = map.sy(1) - map.sy(0);
    const g = svgEl('g', { transform: `matrix(${kx},0,0,${ky},${map.sx(0)},${map.sy(0)})` }, map.layer);
    const { l1, l2, angle } = eigSym2(q.M);
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      const lv = LEVELS[i] * n;
      svgEl('ellipse', { cx: 0, cy: 0, rx: Math.sqrt(lv / l1), ry: Math.sqrt(lv / l2), transform: `translate(${opt[0]},${opt[1]}) rotate(${(angle * 180) / Math.PI})`, fill: 'var(--accent)', 'fill-opacity': 0.07, stroke: 'var(--accent)', 'stroke-opacity': 0.4, 'vector-effect': 'non-scaling-stroke' }, g);
    }
    const star = svgEl('path', { d: 'M-7,-7 L7,7 M-7,7 L7,-7', stroke: 'var(--good)', 'stroke-width': 3 }, map.layer);
    star.setAttribute('transform', `translate(${map.sx(opt[0])},${map.sy(opt[1])})`);
    pathLine = svgEl('polyline', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, map.layer);
    cur = svgEl('circle', { r: 6, fill: 'var(--warn)', stroke: 'var(--surface)', 'stroke-width': 2 }, map.layer);
    start = [domA[0] + 0.12 * (domA[1] - domA[0]), domB[0] + 0.88 * (domB[1] - domB[0])];
    reset();
  }

  function reset() {
    stop();
    theta = [...start];
    path = [[...theta]];
    losses = [loss(theta)];
    rand = seededRandom(5);
    render();
  }

  /** Один крок обраного методу. */
  function step() {
    const method = methodIns.find((i) => i.checked)?.value ?? 'gd';
    const lr = (Number(lrIn.value) * 2) / L;
    let batch: number[];
    if (method === 'gd') batch = pts.map((_, i) => i);
    else if (method === 'mb') batch = Array.from({ length: 8 }, () => Math.floor(rand() * n));
    else batch = [Math.floor(rand() * n)];
    let ga = 0;
    let gb = 0;
    for (const i of batch) {
      const r = pts[i].y - theta[0] - theta[1] * pts[i].x;
      ga -= (2 * r) / batch.length;
      gb -= (2 * r * pts[i].x) / batch.length;
    }
    theta = [theta[0] - lr * ga, theta[1] - lr * gb];
    path.push([...theta]);
    losses.push(loss(theta));
  }

  function render() {
    const vis = path.map(([a, b]) => `${map.sx(a).toFixed(1)},${map.sy(b).toFixed(1)}`);
    pathLine.setAttribute('points', vis.join(' '));
    setAttrs(cur, { cx: map.sx(theta[0]), cy: map.sy(theta[1]) });
    // Перші 200 кроків — у масштабі осі; довші серії стискаємо в ту саму ширину.
    const N = Math.max(200, losses.length - 1);
    lossLine.setAttribute(
      'd',
      'M' +
        losses
          .map((v, i) => {
            const lv = Number.isFinite(v) ? clamp(Math.log10(Math.max(v - lossStar, 1e-9)), -8, 2) : 2;
            return `${(lossPlot.sx(0) + ((lossPlot.sx(200) - lossPlot.sx(0)) * i) / N).toFixed(1)},${lossPlot.sy(lv).toFixed(1)}`;
          })
          .join('L'),
    );
    lrOut.textContent = `${fmt(Number(lrIn.value), 2)}·2/L`;
    iterOut.textContent = `Кроків: ${path.length - 1}, MSE = ${Number.isFinite(losses[losses.length - 1]) && losses[losses.length - 1] < 1e6 ? fmt(losses[losses.length - 1], 4) : '∞'} (мінімум ${fmt(lossStar, 4)})`;

    const last = losses[losses.length - 1];
    const method = methodIns.find((i) => i.checked)?.value ?? 'gd';
    if (!Number.isFinite(last) || last > 1e4) {
      status.className = 'status warn';
      status.innerHTML = '<b>Розбіжність!</b> Крок більший за межу стійкості 2/L: кулька перестрибує дно щоразу далі. Зменшіть крок.';
      stop();
    } else if (path.length === 1) {
      status.className = 'status';
      status.innerHTML = 'Натисніть «Крок» або «Запустити». Зелений хрестик — дно, яке нормальні рівняння знаходять одразу.';
    } else if (last - lossStar < 1e-6) {
      status.className = 'status success';
      const first = losses.findIndex((v) => v - lossStar < 1e-6);
      status.innerHTML = `Дно досягнуто за ${first} кроків (MSE відрізняється від мінімуму менш ніж на 10⁻⁶). Нормальні рівняння дали б ту саму відповідь одним «стрибком».`;
    } else if (method !== 'gd' && path.length > 60) {
      status.className = 'status info';
      status.innerHTML = 'Стохастичний спуск не сідає точно на дно: кожен крок бачить лише частину даних і «тремтить» навколо мінімуму. Зате кроки в сотні разів дешевші — на мільйонах прикладів це вирішує все.';
    } else if (!stdBox.checked && path.length > 60) {
      status.className = 'status info';
      status.innerHTML = 'Без стандартизації чаша — вузька долина: крок обмежений крутим напрямком, а вздовж долини кулька ледве повзе (розділ 3).';
    } else {
      status.className = 'status info';
      status.innerHTML = `Крок ${path.length - 1}: кожна ітерація — лише множення на матрицю, без розв'язання системи.`;
    }
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
  }

  $('[data-action="step"]', root).addEventListener('click', () => {
    step();
    render();
  });
  $('[data-action="run"]', root).addEventListener('click', () => {
    stop();
    let k = 0;
    timer = window.setInterval(() => {
      for (let j = 0; j < 2; j++) step();
      render();
      k += 2;
      if (k >= 200) stop();
    }, 40);
  });
  $('[data-action="reset"]', root).addEventListener('click', reset);
  $('[data-action="jump"]', root).addEventListener('click', () => {
    stop();
    theta = [...opt];
    path.push([...theta]);
    losses.push(loss(theta));
    render();
    status.className = 'status success';
    status.innerHTML = '<b>Аналітичний розв\'язок</b>: нормальні рівняння ставлять точку одразу на дно. Для двох параметрів це найкращий вибір, для мільйона — неможливий.';
  });
  lrIn.addEventListener('input', () => render());
  methodIns.forEach((i) => i.addEventListener('change', reset));
  stdBox.addEventListener('change', setup);
  setup();
}

/* =====================================================================
   10.3. Гребенева регресія (ridge) для многочлена степеня 9
   ===================================================================== */
function initRidge(): void {
  const root = $('#w-ridge');
  const box = $('.plot', root);
  const errBox = $('.plot-err', root);
  const coefBox = $('.plot-coef', root);
  const lamIn = $<HTMLInputElement>('input[name="lam"]', root);
  const lamOut = $('output[for="ridge-lam"]', root);
  const statsOut = $('[data-out="stats"]', root);
  const compact = isCompact(box);
  const DEG = 9;
  const f = (x: number) => Math.sin(3 * x);
  const u = (x: number) => (2 * x) / 3 - 1;
  const rnd = seededRandom(7919);
  const xtr = Array.from({ length: 12 }, (_, i) => 0.1 + (2.8 * i) / 11 + (rnd() - 0.5) * 0.2);
  const ytr = xtr.map((x) => f(x) + 0.25 * gaussian(rnd));
  const xva = Array.from({ length: 80 }, () => 0.1 + 2.8 * rnd());
  const yva = xva.map((x) => f(x) + 0.25 * gaussian(rnd));
  const feats = (x: number) => Array.from({ length: DEG + 1 }, (_, j) => u(x) ** j);

  /** Ridge як звичайний МНК з «уявними вимірами» √λ·θⱼ = 0 (вільний член не штрафуємо). */
  function ridge(lam: number): number[] {
    const A = xtr.map(feats);
    const y = [...ytr];
    for (let j = 1; j <= DEG; j++) {
      A.push(Array.from({ length: DEG + 1 }, (_, i) => (i === j ? Math.sqrt(lam) : 0)));
      y.push(0);
    }
    return lstsq(A, y) ?? new Array(DEG + 1).fill(0);
  }
  const predict = (w: number[], x: number) => feats(x).reduce((s, v, j) => s + v * w[j], 0);

  const plot = createPlot(box, {
    width: compact ? 420 : 520,
    height: compact ? 300 : 320,
    x: [0, 3],
    y: [-2.2, 2.2],
    margin: { top: 14, right: 12, bottom: 28, left: 32 },
    xTicks: [0, 1, 2, 3],
    yTicks: [-2, -1, 0, 1, 2],
    ariaLabel: 'Дані й многочлен 9-го степеня з гребеневою регуляризацією',
  });
  const truth = svgEl('path', { fill: 'none', stroke: 'var(--good)', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, plot.layer);
  xva.forEach((x, i) => svgEl('circle', { cx: plot.sx(x), cy: plot.sy(clamp(yva[i], -2.1, 2.1)), r: 2.8, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 1.2, opacity: 0.7 }, plot.layer));
  const curve = svgEl('path', { class: 'fit-line' }, plot.layer);
  xtr.forEach((x, i) => svgEl('circle', { cx: plot.sx(x), cy: plot.sy(ytr[i]), r: 5.5, class: 'data-point' }, plot.layer));
  const tpath = (fn: (x: number) => number) => {
    let d = '';
    for (let i = 0; i <= 300; i++) {
      const x = (3 * i) / 300;
      const y = clamp(fn(x), -3, 3);
      d += `${i ? 'L' : 'M'}${plot.sx(x).toFixed(1)},${plot.sy(y).toFixed(1)}`;
    }
    return d;
  };
  truth.setAttribute('d', tpath(f));

  // Помилка на навчальних і нових даних залежно від λ.
  const LG: [number, number] = [-8, 2];
  const grid = Array.from({ length: 61 }, (_, i) => LG[0] + ((LG[1] - LG[0]) * i) / 60);
  const errs = grid.map((lg) => {
    const w = ridge(10 ** lg);
    return { tr: rmse(xtr.map((x, i) => ytr[i] - predict(w, x))), va: rmse(xva.map((x, i) => yva[i] - predict(w, x))) };
  });
  const eplot = createPlot(errBox, {
    width: compact ? 420 : 360,
    height: 200,
    x: LG,
    y: [0, 0.8],
    margin: { top: 22, right: 12, bottom: 28, left: 38 },
    xTicks: [-8, -6, -4, -2, 0, 2],
    yTicks: [0, 0.2, 0.4, 0.6, 0.8],
    ariaLabel: 'Помилка залежно від сили регуляризації',
  });
  eplot.svg.querySelectorAll('.plot-axis text').forEach((t, i) => {
    if (i < 6) t.textContent = `10${(t.textContent ?? '').replace('−', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
  });
  const et = svgEl('text', { x: 44, y: 14, class: 'plot-label', style: 'font-weight: 600' }, eplot.svg);
  et.textContent = 'RMSE залежно від λ';
  const pathOf = (key: 'tr' | 'va') => 'M' + errs.map((e, i) => `${eplot.sx(grid[i]).toFixed(1)},${eplot.sy(clamp(e[key], 0, 0.8)).toFixed(1)}`).join('L');
  svgEl('path', { d: pathOf('tr'), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5 }, eplot.layer);
  svgEl('path', { d: pathOf('va'), fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2.5 }, eplot.layer);
  const cursor = svgEl('line', { stroke: 'var(--text)', 'stroke-dasharray': '4 3', y1: eplot.sy(0), y2: eplot.sy(0.8) }, eplot.layer);

  // Величини коефіцієнтів (логарифмічна шкала).
  const cplot = createPlot(coefBox, {
    width: compact ? 420 : 360,
    height: 170,
    x: [-0.6, DEG + 0.6],
    y: [-3, 4],
    margin: { top: 22, right: 12, bottom: 26, left: 38 },
    xTicks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    yTicks: [-2, 0, 2, 4],
    ariaLabel: 'Модулі коефіцієнтів многочлена в логарифмічній шкалі',
  });
  cplot.svg.querySelectorAll('.plot-axis text').forEach((t, i, all) => {
    if (i >= all.length - 4) t.textContent = `10${(t.textContent ?? '').replace('−', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
  });
  const ct = svgEl('text', { x: 44, y: 14, class: 'plot-label', style: 'font-weight: 600' }, cplot.svg);
  ct.textContent = '|θⱼ| — модулі коефіцієнтів при uʲ';
  const bars = Array.from({ length: DEG + 1 }, () => svgEl('rect', { width: 18, rx: 2, fill: 'var(--accent)', opacity: 0.8 }, cplot.layer));

  function update() {
    const lg = Number(lamIn.value);
    const lam = 10 ** lg;
    lamOut.textContent = `10${String(lg).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
    const w = ridge(lam);
    curve.setAttribute('d', tpath((x) => predict(w, x)));
    setAttrs(cursor, { x1: eplot.sx(lg), x2: eplot.sx(lg) });
    w.forEach((c, j) => {
      const v = clamp(Math.log10(Math.max(Math.abs(c), 1e-3)), -3, 4);
      setAttrs(bars[j], { x: cplot.sx(j) - 9, y: cplot.sy(v), height: Math.max(1, cplot.sy(-3) - cplot.sy(v)) });
    });
    const tr = rmse(xtr.map((x, i) => ytr[i] - predict(w, x)));
    const va = rmse(xva.map((x, i) => yva[i] - predict(w, x)));
    const best = grid[errs.reduce((b, e, i) => (e.va < errs[b].va ? i : b), 0)];
    statsOut.innerHTML = `<tr><td><i class="swatch" style="border-color:var(--accent)"></i>RMSE навчання</td><td class="num">${fmt(tr, 3)}</td></tr>
      <tr><td><i class="swatch" style="border-color:var(--warn)"></i>RMSE нові дані</td><td class="num">${va > 5 ? '&gt; 5' : fmt(va, 3)}</td></tr>
      <tr><td>|θ| (довжина вектора параметрів)</td><td class="num">${Math.hypot(...w) > 1e4 ? Math.hypot(...w).toExponential(1) : fmt(Math.hypot(...w), 1)}</td></tr>
      <tr><td>найкраще λ на нових даних</td><td class="num">≈ 10${String(Math.round(best)).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}</td></tr>`;
  }
  lamIn.addEventListener('input', update);
  update();
}

/* =====================================================================
   10.4. Промахи: МНК, Губер, L1, RANSAC і тест Баарди
   ===================================================================== */
function initRobust(): void {
  const root = $('#w-robust');
  const box = $('.plot', root);
  const deltaIn = $<HTMLInputElement>('input[name="delta"]', root);
  const deltaOut = $('output[for="rob-delta"]', root);
  const tIn = $<HTMLInputElement>('input[name="thr"]', root);
  const tOut = $('output[for="rob-thr"]', root);
  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);
  const baardaOut = $('[data-out="baarda"]', root);
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const compact = isCompact(box);
  const SIGMA = 0.2;
  const X: [number, number] = [0, 10];
  const Y: [number, number] = [0, 8];

  const base = (() => {
    const r = seededRandom(33);
    return Array.from({ length: 15 }, (_, i) => {
      const x = 0.5 + (9 * i) / 14;
      return { x: +x.toFixed(2), y: +(1 + 0.5 * x + SIGMA * gaussian(r)).toFixed(2) };
    });
  })();
  const PRESETS: Record<string, () => Pt[]> = {
    clean: () => base.map((p) => ({ ...p })),
    two: () => base.map((p, i) => ({ x: p.x, y: i === 10 ? p.y + 3 : i === 12 ? p.y + 2.5 : p.y })),
    leverage: () => base.map((p, i) => (i === 14 ? { x: 9.5, y: 1.2 } : { ...p })),
  };
  let preset = 'two';
  let pts: Pt[] = PRESETS.two();
  let removed: number[] = [];

  const plot = createPlot(box, {
    width: compact ? 420 : 560,
    height: compact ? 320 : 380,
    x: X,
    y: Y,
    margin: { top: 14, right: 14, bottom: 30, left: 32 },
    xTicks: [0, 2, 4, 6, 8, 10],
    yTicks: [0, 2, 4, 6, 8],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Точки з промахами та прямі різних методів',
  });
  const METHODS = [
    { key: 'ls', name: 'МНК', color: 'var(--bad)', dash: '' },
    { key: 'huber', name: 'Губер', color: 'var(--accent)', dash: '' },
    { key: 'l1', name: 'L1 (модулі)', color: 'var(--warn)', dash: '8 5' },
    { key: 'ransac', name: 'RANSAC', color: 'var(--good)', dash: '3 4' },
  ];
  const lines = METHODS.map((m) => svgEl('line', { stroke: m.color, 'stroke-width': 2.5, 'stroke-dasharray': m.dash }, plot.layer));
  const band = svgEl('polygon', { fill: 'var(--good)', 'fill-opacity': 0.08 }, plot.layer);
  const marks = svgEl('g', {}, plot.svg);
  const handles = svgEl('g', {}, plot.svg);

  const wls = (w: number[]): [number, number] => {
    const A = pts.map((p, i) => [Math.sqrt(w[i]), Math.sqrt(w[i]) * p.x]);
    const y = pts.map((p, i) => Math.sqrt(w[i]) * p.y);
    const t = lstsq(A, y);
    return t ? [t[0], t[1]] : [0, 0];
  };
  const resid = (t: [number, number]) => pts.map((p) => p.y - t[0] - t[1] * p.x);

  function irls(weight: (r: number) => number): [number, number] {
    let t = wls(pts.map(() => 1));
    for (let it = 0; it < 60; it++) t = wls(resid(t).map(weight));
    return t;
  }

  function ransac(thr: number): { t: [number, number]; inl: boolean[] } {
    const rnd = seededRandom(8);
    let best: boolean[] = pts.map(() => true);
    let bestN = -1;
    for (let it = 0; it < 150; it++) {
      const i = Math.floor(rnd() * pts.length);
      let j = Math.floor(rnd() * pts.length);
      if (j === i) j = (j + 1) % pts.length;
      if (Math.abs(pts[j].x - pts[i].x) < 1e-9) continue;
      const b = (pts[j].y - pts[i].y) / (pts[j].x - pts[i].x);
      const a = pts[i].y - b * pts[i].x;
      const inl = pts.map((p) => Math.abs(p.y - a - b * p.x) < thr);
      const cnt = inl.filter(Boolean).length;
      if (cnt > bestN) [best, bestN] = [inl, cnt];
    }
    return { t: wls(best.map((v) => (v ? 1 : 1e-12))), inl: best };
  }

  function buildHandles() {
    handles.replaceChildren();
    pts.forEach((_, i) => {
      const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}` }, handles);
      svgEl('circle', { r: 15, class: 'drag-halo' }, g);
      svgEl('circle', { r: 5.5, class: 'data-point' }, g);
      makeDraggable(g, plot.svg, (px, py) => {
        pts[i].x = clamp(snap(plot.ix(px), 0.05), X[0] + 0.1, X[1] - 0.1);
        pts[i].y = clamp(snap(plot.iy(py), 0.05), Y[0] + 0.1, Y[1] - 0.1);
        removed = [];
        baardaOut.innerHTML = '';
        update();
      });
    });
  }

  function update() {
    const delta = Number(deltaIn.value);
    const thr = Number(tIn.value);
    deltaOut.textContent = fmt(delta, 2);
    tOut.textContent = fmt(thr, 2);
    const ls = wls(pts.map(() => 1));
    const hub = irls((r) => (Math.abs(r) <= delta ? 1 : delta / Math.abs(r)));
    const l1 = irls((r) => 1 / Math.max(Math.abs(r), 1e-4));
    const rs = ransac(thr);
    const sols: [number, number][] = [ls, hub, l1, rs.t];
    sols.forEach((t, k) => setAttrs(lines[k], { x1: plot.sx(X[0]), y1: plot.sy(t[0] + t[1] * X[0]), x2: plot.sx(X[1]), y2: plot.sy(t[0] + t[1] * X[1]) }));
    const [a, b] = rs.t;
    band.setAttribute('points', [
      [X[0], a + b * X[0] - thr],
      [X[1], a + b * X[1] - thr],
      [X[1], a + b * X[1] + thr],
      [X[0], a + b * X[0] + thr],
    ].map(([x, y]) => `${plot.sx(x)},${plot.sy(y)}`).join(' '));
    [...handles.children].forEach((g, i) => g.setAttribute('transform', `translate(${plot.sx(pts[i].x)},${plot.sy(pts[i].y)})`));
    marks.replaceChildren();
    pts.forEach((p, i) => {
      if (!rs.inl[i]) svgEl('circle', { cx: plot.sx(p.x), cy: plot.sy(p.y), r: 10, fill: 'none', stroke: 'var(--good)', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }, marks);
      if (removed.includes(i)) svgEl('path', { d: `M${plot.sx(p.x) - 9},${plot.sy(p.y) - 9} l18,18 m0,-18 l-18,18`, stroke: 'var(--bad)', 'stroke-width': 2.5 }, marks);
    });
    table.innerHTML = `<thead><tr><th>Метод</th><th>a</th><th>b</th></tr></thead><tbody>${METHODS.map(
      (m, k) => `<tr><td><i class="swatch" style="border-color:${m.color}; border-top-style:${m.dash ? 'dashed' : 'solid'}"></i>${m.name}</td><td class="num">${fmt(sols[k][0], 3)}</td><td class="num">${fmt(sols[k][1], 3)}</td></tr>`,
    ).join('')}</tbody>`;
    presetBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.preset === preset));
    const shift = Math.abs(ls[1] - rs.t[1]);
    status.className = shift > 0.05 ? 'status warn' : 'status info';
    status.innerHTML =
      shift > 0.05
        ? `Червона пряма МНК відхилилася: кожен промах «тягне» її з силою, пропорційною своїй нев'язці. Губер і L1 обмежують цю силу, а RANSAC просто не бере промахи до уваги (обведені кружечки).`
        : 'Промахів немає — усі методи дають майже ту саму пряму. МНК тут найточніший (розділ 9).';
  }

  /** Тест Баарди: нормовані нев'язки МНК, виключаємо найгіршу, повторюємо. */
  function baarda() {
    removed = [];
    const lines_: string[] = [];
    for (let round = 0; round < 6; round++) {
      const keep = pts.map((_, i) => !removed.includes(i));
      const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
      const A = idx.map((i) => [1, pts[i].x]);
      const y = idx.map((i) => pts[i].y);
      const t = lstsq(A, y)!;
      const q = lineQuadratic(idx.map((i) => pts[i]));
      const det = q.M[0][0] * q.M[1][1] - q.M[0][1] ** 2;
      const w = idx.map((i) => {
        const x = pts[i].x;
        const h = (q.M[1][1] - 2 * q.M[0][1] * x + q.M[0][0] * x * x) / det; // важіль (розділ 5)
        return (pts[i].y - t[0] - t[1] * x) / (SIGMA * Math.sqrt(Math.max(1 - h, 1e-9)));
      });
      const over = w.filter((v) => Math.abs(v) > 3.29).length;
      const k = w.reduce((bi, v, i) => (Math.abs(v) > Math.abs(w[bi]) ? i : bi), 0);
      if (over === 0) {
        lines_.push(`Крок ${round + 1}: усі |w| ≤ 3,29 — промахів більше немає.`);
        break;
      }
      lines_.push(`Крок ${round + 1}: понад 3,29 — <b>${over}</b> вимір(и), найгірший — точка ${idx[k] + 1} (w = ${fmt(w[k], 1)}). Виключаємо.`);
      removed.push(idx[k]);
    }
    baardaOut.innerHTML = `<ol class="baarda">${lines_.map((l) => `<li>${l}</li>`).join('')}</ol>`;
    update();
  }

  deltaIn.addEventListener('input', update);
  tIn.addEventListener('input', update);
  presetBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      preset = btn.dataset.preset!;
      pts = PRESETS[preset]();
      removed = [];
      baardaOut.innerHTML = '';
      buildHandles();
      update();
    }),
  );
  $('[data-action="baarda"]', root).addEventListener('click', baarda);
  buildHandles();
  update();
}

initGD();
initRidge();
initRobust();
