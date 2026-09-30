// Розділ 9. Чому саме квадрати: статистика.
import { renderMath, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { clamp, createPlot, formatNumber as fmt, isCompact, makeDraggable, setAttrs, svgEl, type Plot } from '../lib/plot';
import { eigSym2, gaussian, lstsq, seededRandom } from '../lib/linalg';

import statPy from '../snippets/ch09/statistics.py?raw';
import statJs from '../snippets/ch09/statistics.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ statistics: { py: statPy, js: statJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

type Noise = 'gauss' | 'laplace' | 'uniform';

/** Генератори шуму з однаковим стандартним відхиленням 1. */
function sampler(kind: Noise, rand: () => number): () => number {
  if (kind === 'gauss') return () => gaussian(rand);
  if (kind === 'laplace') {
    const b = 1 / Math.SQRT2;
    return () => {
      const u = rand() - 0.5;
      return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    };
  }
  const a = Math.sqrt(3);
  return () => (2 * rand() - 1) * a;
}

function density(kind: Noise, x: number): number {
  if (kind === 'gauss') return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  if (kind === 'laplace') {
    const b = 1 / Math.SQRT2;
    return Math.exp(-Math.abs(x) / b) / (2 * b);
  }
  const a = Math.sqrt(3);
  return Math.abs(x) <= a ? 1 / (2 * a) : 0;
}

const std = (v: number[]) => {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};

/** Гістограма як SVG-стовпчики в заданій смузі графіка. */
function histogram(plot: Plot, g: SVGGElement, values: number[], lo: number, hi: number, bins: number, y0: number, h: number, color: string) {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const v of values) {
    const b = Math.floor((v - lo) / w);
    if (b >= 0 && b < bins) counts[b]++;
  }
  const max = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    if (!c) return;
    const top = y0 + (c / max) * h;
    svgEl('rect', { x: plot.sx(lo + i * w) + 0.5, width: Math.max(0.5, plot.sx(lo + (i + 1) * w) - plot.sx(lo + i * w) - 1), y: plot.sy(top), height: plot.sy(y0) - plot.sy(top), fill: color, opacity: 0.7 }, g);
  });
}

/* =====================================================================
   9.2. Змагання оцінок: середнє, медіана, середина розмаху
   ===================================================================== */
function initEstimators(): void {
  const root = $('#w-est');
  const box = $('.plot', root);
  const pdfBox = $('.plot-pdf', root);
  const nInput = $<HTMLInputElement>('input[name="n"]', root);
  const nOut = $('output[for="est-n"]', root);
  const noiseInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="noise"]')];
  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);
  const compact = isCompact(box);
  const M = 2000;
  const EST = [
    { name: 'середнє (МНК, Σ квадратів)', color: 'var(--good)', f: (s: number[]) => s.reduce((a, b) => a + b, 0) / s.length },
    {
      name: 'медіана (Σ модулів)',
      color: 'var(--warn)',
      f: (s: number[]) => {
        const t = [...s].sort((a, b) => a - b);
        const n = t.length;
        return n % 2 ? t[(n - 1) / 2] : (t[n / 2 - 1] + t[n / 2]) / 2;
      },
    },
    { name: 'середина розмаху (max)', color: 'var(--ml)', f: (s: number[]) => (Math.min(...s) + Math.max(...s)) / 2 },
  ];

  const pdfPlot = createPlot(pdfBox, {
    width: compact ? 420 : 360,
    height: 150,
    x: [-3.2, 3.2],
    y: [0, 0.75],
    margin: { top: 20, right: 10, bottom: 24, left: 10 },
    xTicks: [-3, -2, -1, 0, 1, 2, 3],
    ariaLabel: 'Щільність розподілу похибки',
  });
  const pdfTitle = svgEl('text', { x: 14, y: 14, class: 'plot-label', style: 'font-weight: 600' }, pdfPlot.svg);
  pdfTitle.textContent = 'Розподіл похибки одного виміру';
  const pdfPath = svgEl('path', { fill: 'var(--accent)', 'fill-opacity': 0.15, stroke: 'var(--accent)', 'stroke-width': 2 }, pdfPlot.layer);

  const plot = createPlot(box, {
    width: compact ? 420 : 600,
    height: 330,
    x: [-1.6, 1.6],
    y: [0, 3],
    margin: { top: 10, right: 14, bottom: 28, left: 14 },
    xTicks: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
    ariaLabel: 'Гістограми трьох оцінок за багатьох повторних експериментів',
  });
  const hist = svgEl('g', {}, plot.layer);
  svgEl('line', { x1: plot.sx(0), x2: plot.sx(0), y1: plot.sy(0), y2: plot.sy(3), stroke: 'var(--text)', 'stroke-dasharray': '4 3' }, plot.layer);
  const labels = EST.map((e, i) => {
    const t = svgEl('text', { x: plot.sx(-1.55), y: plot.sy(3 - i) + 16, class: 'plot-label', style: `fill: ${e.color}; font-weight: 600` }, plot.svg);
    return t;
  });

  let seed = 3;

  function update() {
    const kind = (noiseInputs.find((i) => i.checked)?.value ?? 'gauss') as Noise;
    const n = Number(nInput.value);
    nOut.textContent = String(n);

    // Щільність похибки.
    const xs = Array.from({ length: 241 }, (_, i) => -3.2 + (6.4 * i) / 240);
    pdfPath.setAttribute('d', `M${pdfPlot.sx(-3.2)},${pdfPlot.sy(0)}` + xs.map((x) => `L${pdfPlot.sx(x).toFixed(1)},${pdfPlot.sy(Math.min(density(kind, x), 0.74)).toFixed(1)}`).join('') + `L${pdfPlot.sx(3.2)},${pdfPlot.sy(0)}Z`);

    // M повторних експериментів по n вимірів; справжнє значення — 0.
    const rand = seededRandom(seed * 131 + n);
    const draw = sampler(kind, rand);
    const results = EST.map(() => [] as number[]);
    for (let m = 0; m < M; m++) {
      const s = Array.from({ length: n }, draw);
      EST.forEach((e, k) => results[k].push(e.f(s)));
    }
    hist.replaceChildren();
    const spreads = results.map(std);
    const best = spreads.indexOf(Math.min(...spreads));
    results.forEach((vals, k) => {
      histogram(plot, hist, vals, -1.6, 1.6, 64, 2 - k + 0.05, 0.75, EST[k].color);
      labels[k].textContent = `${EST[k].name}: розкид ±${fmt(spreads[k], 3)}${k === best ? '  ★' : ''}`;
    });
    table.innerHTML = `<thead><tr><th>Оцінка</th><th>Розкид</th><th>Відносно найкращої</th></tr></thead><tbody>${EST.map(
      (e, k) => `<tr${k === best ? ' class="current"' : ''}><td><i class="swatch" style="border-color:${e.color}"></i>${e.name}</td><td class="num">±${fmt(spreads[k], 3)}</td><td class="num">×${fmt(spreads[k] / spreads[best], 2)}</td></tr>`,
    ).join('')}</tbody>`;
    const verdict: Record<Noise, string> = {
      gauss: 'За <b>гауссового</b> шуму найточніше середнє — оцінка МНК. Медіана помиляється приблизно на чверть більше: вона «викидає» частину інформації.',
      laplace: 'За шуму <b>Лапласа</b> (гостріший пік і товщі «хвости»: великі похибки трапляються помітно частіше, ніж у Гаусса) виграє медіана — оцінка суми модулів. Середнє страждає саме від цих великих похибок.',
      uniform: 'За <b>рівномірного</b> шуму (похибка ніколи не перевищує межу) виграє середина розмаху — оцінка мінімаксу. Тут крайні виміри найінформативніші.',
    };
    status.className = 'status info';
    status.innerHTML = verdict[kind];
  }

  nInput.addEventListener('input', update);
  noiseInputs.forEach((i) => i.addEventListener('change', update));
  $('[data-action="reroll"]', root).addEventListener('click', () => {
    seed += 1;
    update();
  });
  update();
}

/* =====================================================================
   9.3. Центральна гранична теорема
   ===================================================================== */
function initClt(): void {
  const root = $('#w-clt');
  const box = $('.plot', root);
  const kIn = $<HTMLInputElement>('input[name="k"]', root);
  const kOut = $('output[for="clt-k"]', root);
  const plot = createPlot(box, {
    width: isCompact(box) ? 420 : 600,
    height: 260,
    x: [-4, 4],
    y: [0, 0.6],
    margin: { top: 12, right: 14, bottom: 28, left: 14 },
    xTicks: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    ariaLabel: 'Гістограма суми k рівномірних похибок і гауссова крива',
  });
  const bars = svgEl('g', {}, plot.layer);
  const bell = svgEl('path', { fill: 'none', stroke: 'var(--good)', 'stroke-width': 2.5, 'stroke-dasharray': '6 4' }, plot.layer);
  const xs = Array.from({ length: 201 }, (_, i) => -4 + (8 * i) / 200);
  bell.setAttribute('d', 'M' + xs.map((x) => `${plot.sx(x).toFixed(1)},${plot.sy(density('gauss', x)).toFixed(1)}`).join('L'));

  function update() {
    const k = Number(kIn.value);
    kOut.textContent = String(k);
    const rand = seededRandom(17 + k);
    const N = 20000;
    const w = 0.2;
    const counts = new Array(40).fill(0);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += 2 * rand() - 1;
      const v = s / Math.sqrt(k / 3);
      const b = Math.floor((v + 4) / w);
      if (b >= 0 && b < 40) counts[b]++;
    }
    bars.replaceChildren();
    counts.forEach((c, i) => {
      const dens = c / (N * w);
      svgEl('rect', { x: plot.sx(-4 + i * w) + 0.5, width: plot.sx(w) - plot.sx(0) - 1, y: plot.sy(Math.min(dens, 0.6)), height: plot.sy(0) - plot.sy(Math.min(dens, 0.6)), fill: 'var(--accent)', opacity: 0.6 }, bars);
    });
  }
  kIn.addEventListener('input', update);
  update();
}

/* =====================================================================
   9.5. Еліпс похибок: теорія σ²(JᵀJ)⁻¹ проти повторних експериментів
   ===================================================================== */
function initEllipse(): void {
  const root = $('#w-ellipse');
  const mapBox = $('.plot-map', root);
  const zoomBox = $('.plot-zoom', root);
  const statsOut = $('[data-out="stats"]', root);
  const status = $('[data-out="status"]', root);
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const compact = isCompact(mapBox);
  const TRUE: [number, number] = [500, 450];
  const SIGMA = 1; // м — похибка кожної відстані
  const Z = 9; // напівширина вікна наближення, м
  const M = 400;

  const PRESETS: Record<string, [number, number][]> = {
    around: [
      [120, 150],
      [880, 180],
      [500, 900],
    ],
    oneside: [
      [420, 60],
      [500, 40],
      [580, 60],
    ],
    four: [
      [120, 150],
      [880, 180],
      [500, 900],
      [150, 780],
    ],
  };
  let preset = 'around';
  let stations = PRESETS.around.map((s) => [...s] as [number, number]);

  const map = createPlot(mapBox, {
    width: compact ? 400 : 330,
    height: compact ? 400 : 330,
    x: [0, 1000],
    y: [0, 1000],
    margin: { top: 12, right: 12, bottom: 26, left: 38 },
    xTicks: [0, 500, 1000],
    yTicks: [0, 500, 1000],
    ariaLabel: 'Карта: станції та визначувана точка',
  });
  const rays = svgEl('g', {}, map.layer);
  svgEl('circle', { cx: map.sx(TRUE[0]), cy: map.sy(TRUE[1]), r: 6, fill: 'var(--warn)' }, map.layer);
  const stLayer = svgEl('g', {}, map.svg);

  const zoom = createPlot(zoomBox, {
    width: compact ? 400 : 400,
    height: compact ? 400 : 400,
    x: [-Z, Z],
    y: [-Z, Z],
    margin: { top: 12, right: 12, bottom: 26, left: 30 },
    xTicks: [-8, -4, 0, 4, 8],
    yTicks: [-8, -4, 0, 4, 8],
    ariaLabel: 'Наближення біля точки: розв\'язки повторних експериментів і еліпси похибок',
  });
  const zt = svgEl('text', { x: 36, y: 26, class: 'plot-label', style: 'font-weight: 600' }, zoom.svg);
  zt.textContent = 'Біля точки, метри';
  const cloud = svgEl('g', {}, zoom.layer);
  const e1 = svgEl('ellipse', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5 }, zoom.layer);
  const e2 = svgEl('ellipse', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, zoom.layer);

  function buildStations() {
    stLayer.replaceChildren();
    stations.forEach((s, i) => {
      const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Станція ${i + 1}` }, stLayer);
      svgEl('circle', { r: 16, class: 'drag-halo' }, g);
      svgEl('path', { d: 'M0,-10 L9,7 L-9,7 Z', fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 1.5 }, g);
      makeDraggable(
        g,
        map.svg,
        (px, py) => {
          s[0] = clamp(Math.round(map.ix(px) / 10) * 10, 0, 1000);
          s[1] = clamp(Math.round(map.iy(py) / 10) * 10, 0, 1000);
          render(false);
        },
        () => render(true),
      );
    });
  }

  /** Розв'язок трилатерації Гауссом — Ньютоном від справжньої точки (так швидко й стабільно). */
  function solveFix(d: number[]): [number, number] | null {
    let p: [number, number] = [...TRUE];
    for (let it = 0; it < 5; it++) {
      const J: number[][] = [];
      const r: number[] = [];
      for (let i = 0; i < stations.length; i++) {
        const [sx, sy] = stations[i];
        const d0 = Math.hypot(p[0] - sx, p[1] - sy);
        J.push([(p[0] - sx) / d0, (p[1] - sy) / d0]);
        r.push(d[i] - d0);
      }
      const dp = lstsq(J, r);
      if (!dp) return null;
      p = [p[0] + dp[0], p[1] + dp[1]];
    }
    return p;
  }

  function render(withCloud = true) {
    [...stLayer.children].forEach((g, i) => g.setAttribute('transform', `translate(${map.sx(stations[i][0])},${map.sy(stations[i][1])})`));
    rays.replaceChildren();
    stations.forEach(([sx, sy]) => svgEl('line', { x1: map.sx(sx), y1: map.sy(sy), x2: map.sx(TRUE[0]), y2: map.sy(TRUE[1]), stroke: 'var(--accent)', 'stroke-opacity': 0.4, 'stroke-width': 1.5 }, rays));

    // Теорія: Cov = σ²·(JᵀJ)⁻¹, J — одиничні вектори від станцій до точки.
    let a = 0, b = 0, c = 0;
    for (const [sx, sy] of stations) {
      const d0 = Math.hypot(TRUE[0] - sx, TRUE[1] - sy);
      const u = [(TRUE[0] - sx) / d0, (TRUE[1] - sy) / d0];
      a += u[0] * u[0];
      b += u[0] * u[1];
      c += u[1] * u[1];
    }
    const det = a * c - b * b;
    const cov = [
      [(SIGMA ** 2 * c) / det, (-(SIGMA ** 2) * b) / det],
      [(-(SIGMA ** 2) * b) / det, (SIGMA ** 2 * a) / det],
    ];
    const { l1, l2, angle } = eigSym2(cov);
    const ax1 = Math.sqrt(Math.max(l1, 0));
    const ax2 = Math.sqrt(Math.max(l2, 0));
    const k = zoom.sx(1) - zoom.sx(0);
    const deg = (-angle * 180) / Math.PI; // вісь y на екрані дивиться вниз
    const K95 = Math.sqrt(-2 * Math.log(0.05)); // 2,4477: еліпс, що містить 95 %
    setAttrs(e1, { cx: zoom.sx(0), cy: zoom.sy(0), rx: ax1 * k, ry: ax2 * k, transform: `rotate(${deg} ${zoom.sx(0)} ${zoom.sy(0)})` });
    setAttrs(e2, { cx: zoom.sx(0), cy: zoom.sy(0), rx: K95 * ax1 * k, ry: K95 * ax2 * k, transform: `rotate(${deg} ${zoom.sx(0)} ${zoom.sy(0)})` });

    const hdop = Math.sqrt((a + c) / det);
    let inside1 = 0;
    let inside95 = 0;
    let done = 0;
    if (withCloud) {
      cloud.replaceChildren();
      const rand = seededRandom(99);
      const inv = [
        [a / SIGMA ** 2, b / SIGMA ** 2],
        [b / SIGMA ** 2, c / SIGMA ** 2],
      ]; // Cov⁻¹
      for (let m = 0; m < M; m++) {
        const d = stations.map(([sx, sy]) => Math.hypot(TRUE[0] - sx, TRUE[1] - sy) + SIGMA * gaussian(rand));
        const p = solveFix(d);
        if (!p) continue;
        done++;
        const dx = p[0] - TRUE[0];
        const dy = p[1] - TRUE[1];
        const q = dx * (inv[0][0] * dx + inv[0][1] * dy) + dy * (inv[1][0] * dx + inv[1][1] * dy);
        if (q <= 1) inside1++;
        if (q <= K95 * K95) inside95++;
        svgEl('circle', { cx: zoom.sx(clamp(dx, -Z, Z)), cy: zoom.sy(clamp(dy, -Z, Z)), r: 2.2, fill: 'var(--warn)', opacity: 0.55 }, cloud);
      }
    } else {
      cloud.replaceChildren();
    }
    statsOut.innerHTML = `
      <tr><td>Півосі 1σ-еліпса</td><td class="num">${fmt(ax1, 2)} м і ${fmt(ax2, 2)} м</td></tr>
      <tr><td>Геометричний фактор (HDOP)</td><td class="num">${fmt(hdop, 2)}</td></tr>
      ${withCloud && done ? `<tr><td>У суцільному еліпсі (теорія 39 %)</td><td class="num">${fmt((100 * inside1) / done, 1)} %</td></tr><tr><td>У пунктирному еліпсі (теорія 95 %)</td><td class="num">${fmt((100 * inside95) / done, 1)} %</td></tr>` : ''}`;
    presetBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.preset === preset));
    status.className = hdop > 3 ? 'status warn' : 'status info';
    status.innerHTML =
      hdop > 3
        ? `Станції бачать точку майже з одного напрямку, тож їхні промені майже паралельні. Уздовж цього напрямку точку визначено добре, а впоперек — погано: еліпс витягнутий, похибка в <b>${fmt(hdop, 1)}</b> раза більша за похибку однієї відстані.`
        : `Помаранчеві точки — ${M} розв'язків тієї самої задачі з різним випадковим шумом. Еліпси порахувано заздалегідь формулою σ²(JᵀJ)⁻¹, жодного експерименту для цього не знадобилося.`;
  }

  presetBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      preset = btn.dataset.preset!;
      stations = PRESETS[preset].map((s) => [...s] as [number, number]);
      buildStations();
      render();
    }),
  );
  buildStations();
  render();
}

initEstimators();
initClt();
initEllipse();
