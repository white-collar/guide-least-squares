// Розділ 8. Геодезія всерйоз: ваги, нівелірна мережа, Гаусс — Ньютон.
import { renderMath, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { clamp, createPlot, formatNumber as fmt, isCompact, makeDraggable, pointerToSvg, setAttrs, svgEl } from '../lib/plot';
import { lstsq } from '../lib/linalg';

import geoPy from '../snippets/ch08/geodesy.py?raw';
import geoJs from '../snippets/ch08/geodesy.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ geodesy: { py: geoPy, js: geoJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

/** Обернена симетрична матриця методом Гаусса — Жордана (маленькі k). */
function inverse(M: number[][]): number[][] {
  const k = M.length;
  const a = M.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let i = c + 1; i < k; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * k; j++) a[c][j] /= d;
    for (let i = 0; i < k; i++) {
      if (i === c) continue;
      const f = a[i][c];
      for (let j = 0; j < 2 * k; j++) a[i][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(k));
}

/* =====================================================================
   8.2. Ваги: замкнений хід з ходами різної довжини
   ===================================================================== */
function initWeights(): void {
  const root = $('#w-weights');
  const sliders = [...root.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  const outs = [...root.querySelectorAll<HTMLElement>('output')];
  const table = $('[data-out="table"]', root);
  const W = 7;

  const svg = svgEl('svg', { viewBox: '0 0 440 220', role: 'img', 'aria-label': 'Поправки до ходів без ваг і з вагами' });
  $('.plot', root).appendChild(svg);
  const V: [number, number] = [-5, 0.5];
  const sy = (v: number) => 20 + ((V[1] - clamp(v, V[0], V[1])) / (V[1] - V[0])) * 160;
  for (let t = -5; t <= 0; t++) {
    svgEl('line', { x1: 40, x2: 430, y1: sy(t), y2: sy(t), stroke: t === 0 ? 'var(--axis)' : 'var(--grid)' }, svg);
    const l = svgEl('text', { x: 34, y: sy(t) + 4, 'text-anchor': 'end', class: 'plot-label' }, svg);
    l.textContent = fmt(t, 0);
  }
  const bars = [0, 1, 2, 3].map((i) => {
    const x = 60 + i * 95;
    const eq = svgEl('rect', { x, width: 32, rx: 3, fill: 'var(--muted)', opacity: 0.45 }, svg);
    const wt = svgEl('rect', { x: x + 36, width: 32, rx: 3, fill: 'var(--accent)', opacity: 0.85 }, svg);
    const val = svgEl('text', { x: x + 52, 'text-anchor': 'middle', class: 'residual-label', style: 'fill: var(--accent)' }, svg);
    const name = svgEl('text', { x: x + 34, y: 212, 'text-anchor': 'middle', class: 'plot-label' }, svg);
    return { eq, wt, val, name };
  });
  const lg1 = svgEl('text', { x: 44, y: 14, class: 'plot-label' }, svg);
  lg1.textContent = 'сірі — без ваг, сині — з вагами p = 1/L (мм)';

  function update() {
    const L = sliders.map((s) => Number(s.value));
    L.forEach((v, i) => (outs[i].textContent = `${fmt(v, 1)} км`));
    const sumL = L.reduce((s, v) => s + v, 0);
    const vEq = L.map(() => -W / 4);
    const vW = L.map((Li) => (-W * Li) / sumL);
    bars.forEach((b, i) => {
      setAttrs(b.eq, { y: sy(0), height: sy(vEq[i]) - sy(0) });
      setAttrs(b.wt, { y: sy(0), height: Math.max(1, sy(vW[i]) - sy(0)) });
      setAttrs(b.val, { y: sy(vW[i]) + 15 });
      b.val.textContent = fmt(vW[i], 2);
      b.name.textContent = `хід ${i + 1}`;
    });
    const sq = (v: number[], p: number[]) => v.reduce((s, x, i) => s + p[i] * x * x, 0);
    const ones = L.map(() => 1);
    const P = L.map((Li) => 1 / Li);
    table.innerHTML = `<thead><tr><th></th><th>Σ v²</th><th>Σ p·v²</th></tr></thead><tbody>
      <tr><td>без ваг (порівну)</td><td class="num">${fmt(sq(vEq, ones), 2)}</td><td class="num">${fmt(sq(vEq, P), 2)}</td></tr>
      <tr><td>з вагами (пропорційно L)</td><td class="num">${fmt(sq(vW, ones), 2)}</td><td class="num"><b>${fmt(sq(vW, P), 2)}</b></td></tr></tbody>`;
  }
  sliders.forEach((s) => s.addEventListener('input', update));
  update();
}

/* =====================================================================
   8.3. Нівелірна мережа: зважений МНК, оцінка точності, промах
   ===================================================================== */
function initLevNet(): void {
  const root = $('#w-levnet');
  const svgBox = $('.plot', root);
  const tbody = $('[data-out="lines"]', root);
  const resOut = $('[data-out="heights"]', root);
  const status = $('[data-out="status"]', root);
  const blunderBox = $<HTMLInputElement>('input[name="blunder"]', root);

  const known: Record<string, number> = { Rp1: 100, Rp2: 103.5 };
  const unknown = ['A', 'B', 'C'];
  const pos: Record<string, [number, number]> = { Rp1: [60, 200], A: [190, 60], B: [380, 70], Rp2: [520, 190], C: [300, 250] };
  const lines = [
    { from: 'Rp1', to: 'A', h: 1.215, L: 1.2 },
    { from: 'A', to: 'B', h: 0.843, L: 0.9 },
    { from: 'B', to: 'Rp2', h: 1.438, L: 1.5 },
    { from: 'Rp1', to: 'C', h: 2.012, L: 1.4 },
    { from: 'C', to: 'B', h: 0.052, L: 0.8 },
    { from: 'C', to: 'Rp2', h: 1.487, L: 1.1 },
    { from: 'A', to: 'C', h: 0.797, L: 1.0 },
  ];
  const BLUNDER_LINE = 4;
  const BLUNDER = 0.025;

  // Схема мережі.
  const svg = svgEl('svg', { viewBox: '20 20 540 270', role: 'img', 'aria-label': 'Схема нівелірної мережі: два репери, три пункти, сім ліній' });
  svgBox.appendChild(svg);
  const defs = svgEl('defs', {}, svg);
  const mk = svgEl('marker', { id: 'arr8', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
  svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--muted)' }, mk);
  const edgeEls = lines.map((ln) => {
    const [x1, y1] = pos[ln.from];
    const [x2, y2] = pos[ln.to];
    const d = Math.hypot(x2 - x1, y2 - y1);
    const k = 20 / d;
    const line = svgEl('line', { x1: x1 + (x2 - x1) * k, y1: y1 + (y2 - y1) * k, x2: x2 - (x2 - x1) * k, y2: y2 - (y2 - y1) * k, 'stroke-width': 3, 'marker-end': 'url(#arr8)' }, svg);
    const label = svgEl('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle', class: 'residual-label' }, svg);
    return { line, label };
  });
  Object.entries(pos).forEach(([name, [x, y]]) => {
    const isKnown = name in known;
    svgEl('circle', { cx: x, cy: y, r: 17, fill: isKnown ? 'var(--accent)' : 'var(--surface)', stroke: 'var(--accent)', 'stroke-width': 2 }, svg);
    const t = svgEl('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'plot-label', style: `font-weight: 700; font-size: 13px; fill: ${isKnown ? '#fff' : 'var(--text)'}` }, svg);
    t.textContent = name;
  });

  // Таблиця вимірів з полями для редагування.
  tbody.innerHTML = lines
    .map(
      (ln, i) =>
        `<tr><td>${i + 1}</td><td>${ln.from} → ${ln.to}</td><td><input type="number" step="0.001" value="${ln.h.toFixed(3)}" data-i="${i}" aria-label="Перевищення лінії ${i + 1}, м" /></td><td class="num">${fmt(ln.L, 1)}</td><td class="num" data-v="${i}"></td></tr>`,
    )
    .join('');
  const inputs = [...tbody.querySelectorAll<HTMLInputElement>('input')];
  const vCells = [...tbody.querySelectorAll<HTMLElement>('[data-v]')];

  function solve() {
    const h = lines.map((_, i) => Number(inputs[i].value.replace(',', '.')) + (blunderBox.checked && i === BLUNDER_LINE ? BLUNDER : 0));
    if (h.some((v) => !Number.isFinite(v))) return;
    // Рядки A (з вагами √p) та права частина: H_to − H_from = h.
    const rows: number[][] = [];
    const rhs: number[] = [];
    const sp = lines.map((ln) => 1 / Math.sqrt(ln.L));
    lines.forEach((ln, i) => {
      const row = unknown.map((u) => (u === ln.to ? 1 : 0) - (u === ln.from ? 1 : 0));
      const l = h[i] + (known[ln.from] ?? 0) - (known[ln.to] ?? 0);
      rows.push(row.map((a) => a * sp[i]));
      rhs.push(l * sp[i]);
    });
    const H = lstsq(rows, rhs)!;
    const v = lines.map((ln, i) => {
      const row = unknown.map((u) => (u === ln.to ? 1 : 0) - (u === ln.from ? 1 : 0));
      const l = h[i] + (known[ln.from] ?? 0) - (known[ln.to] ?? 0);
      return row.reduce((s, a, j) => s + a * H[j], 0) - l;
    });
    const r = lines.length - unknown.length;
    const vpv = v.reduce((s, vi, i) => s + (vi * vi) / lines[i].L, 0);
    const sigma0 = Math.sqrt(vpv / r);
    // Коваріація висот: σ₀²·(AᵀPA)⁻¹.
    const N = unknown.map((_, a) => unknown.map((_, b) => rows.reduce((s, row) => s + row[a] * row[b], 0)));
    const Q = inverse(N);
    const norm = v.map((vi, i) => Math.abs(vi) / Math.sqrt(lines[i].L));
    const worst = norm.indexOf(Math.max(...norm));

    v.forEach((vi, i) => {
      const bad = norm[i] > 3 * 0.002;
      vCells[i].innerHTML = `<span style="color:${bad ? 'var(--bad)' : 'inherit'}">${fmt(vi * 1000, 1, true)}</span>`;
      const color = norm[i] > 0.006 ? 'var(--bad)' : norm[i] > 0.003 ? 'var(--warn)' : 'var(--good)';
      setAttrs(edgeEls[i].line, { stroke: color });
      edgeEls[i].label.textContent = `${fmt(vi * 1000, 1, true)}`;
      edgeEls[i].label.setAttribute('style', `fill: ${color}`);
    });
    resOut.innerHTML =
      unknown.map((u, j) => `<tr><td>H<sub>${u}</sub></td><td class="num">${fmt(H[j], 4)} м</td><td class="num">± ${fmt(sigma0 * Math.sqrt(Q[j][j]) * 1000, 1)} мм</td></tr>`).join('') +
      `<tr><td>σ₀</td><td class="num" colspan="2">${fmt(sigma0 * 1000, 1)} мм на 1 км ходу (r = ${r})</td></tr>`;

    if (sigma0 * 1000 > 5) {
      status.className = 'status warn';
      status.innerHTML = `<b>σ₀ = ${fmt(sigma0 * 1000, 1)} мм/√км — підозріло багато.</b> Найбільша нормована поправка — у лінії ${worst + 1} (${lines[worst].from} → ${lines[worst].to}). ${
        blunderBox.checked ? 'Там справді промах. Але зверніть увагу: помилку «розмазано» й на сусідні лінії — МНК намагається всім догодити. Як з цим боротися, розповімо в розділі 10.' : 'Перевірте цей вимір.'
      }`;
    } else {
      status.className = 'status success';
      status.innerHTML = `Мережу зрівняно: σ₀ = ${fmt(sigma0 * 1000, 1)} мм на 1 км — звичайна точність технічного нівелювання. Поправки малі й «рівномірні», промахів не видно.`;
    }
  }

  inputs.forEach((i) => i.addEventListener('input', solve));
  blunderBox.addEventListener('change', solve);
  solve();
}

/* =====================================================================
   8.4. Трилатерація: ітерації Гаусса — Ньютона
   ===================================================================== */
function initGaussNewton(): void {
  const root = $('#w-gn');
  const box = $('.plot', root);
  const tbody = $('[data-out="iters"]', root);
  const status = $('[data-out="status"]', root);
  const truthBox = $<HTMLInputElement>('input[name="truth"]', root);
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const compact = isCompact(box);

  const PRESETS: Record<string, [number, number][]> = {
    good: [
      [80, 80],
      [920, 120],
      [300, 900],
      [880, 820],
    ],
    line: [
      [100, 520],
      [380, 520],
      [650, 520],
      [920, 520],
    ],
  };
  const TRUE: [number, number] = [420, 310];
  const NOISE = [0.6, -0.4, 0.5, -0.3]; // м — щоб розв'язок не був ідеально точним

  const plot = createPlot(box, {
    width: compact ? 400 : 480,
    height: compact ? 400 : 480,
    x: [0, 1000],
    y: [0, 1000],
    margin: { top: 14, right: 14, bottom: 28, left: 40 },
    xTicks: [0, 250, 500, 750, 1000],
    yTicks: [0, 250, 500, 750, 1000],
    ariaLabel: 'Станції, кола виміряних відстаней, лінеаризація та шлях ітерацій',
  });
  const k = plot.sx(1) - plot.sx(0);
  const circles = svgEl('g', {}, plot.layer);
  const tangents = svgEl('g', {}, plot.layer);
  const path = svgEl('polyline', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2 }, plot.layer);
  const iterDots = svgEl('g', {}, plot.layer);
  const truth = svgEl('g', {}, plot.layer);
  svgEl('circle', { r: 7, fill: 'none', stroke: 'var(--good)', 'stroke-width': 2.5 }, truth);
  const stationLayer = svgEl('g', {}, plot.svg);
  const est = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': 'Початкове наближення' }, plot.svg);
  svgEl('circle', { r: 18, class: 'drag-halo' }, est);
  svgEl('circle', { r: 7, fill: 'var(--warn)', stroke: 'var(--surface)', 'stroke-width': 2 }, est);

  let stations = PRESETS.good.map((s) => [...s] as [number, number]);
  let preset = 'good';
  let start: [number, number] = [820, 660];
  let iters: { p: [number, number]; S: number; step: number }[] = [];

  const measured = () => stations.map(([sx, sy], i) => Math.hypot(TRUE[0] - sx, TRUE[1] - sy) + NOISE[i]);
  const misfit = (p: [number, number], d: number[]) => stations.reduce((s, [sx, sy], i) => s + (d[i] - Math.hypot(p[0] - sx, p[1] - sy)) ** 2, 0);

  /** Один крок: лінеаризуємо відстані в поточній точці й розв'язуємо лінійний МНК. */
  function gnStep(p: [number, number], d: number[]): [number, number] | null {
    const J: number[][] = [];
    const r: number[] = [];
    stations.forEach(([sx, sy], i) => {
      const d0 = Math.hypot(p[0] - sx, p[1] - sy);
      J.push([(p[0] - sx) / d0, (p[1] - sy) / d0]);
      r.push(d[i] - d0);
    });
    const dp = lstsq(J, r);
    return dp ? [p[0] + dp[0], p[1] + dp[1]] : null;
  }

  function buildStations() {
    stationLayer.replaceChildren();
    stations.forEach((s, i) => {
      const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Станція ${i + 1}` }, stationLayer);
      svgEl('circle', { r: 18, class: 'drag-halo' }, g);
      svgEl('path', { d: 'M0,-10 L9,7 L-9,7 Z', fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 1.5 }, g);
      const t = svgEl('text', { x: 12, y: -8, class: 'plot-label', style: 'font-weight: 700' }, g);
      t.textContent = `S${i + 1}`;
      makeDraggable(g, plot.svg, (px, py) => {
        s[0] = clamp(Math.round(plot.ix(px) / 10) * 10, 0, 1000);
        s[1] = clamp(Math.round(plot.iy(py) / 10) * 10, 0, 1000);
        iters = [];
        render();
      });
    });
  }

  function render() {
    const d = measured();
    // Кола відстаней.
    circles.replaceChildren();
    stations.forEach(([sx, sy], i) => {
      svgEl('circle', { cx: plot.sx(sx), cy: plot.sy(sy), r: d[i] * k, fill: 'none', stroke: 'var(--accent)', 'stroke-opacity': 0.35, 'stroke-width': 1.5 }, circles);
    });
    [...stationLayer.children].forEach((g, i) => g.setAttribute('transform', `translate(${plot.sx(stations[i][0])},${plot.sy(stations[i][1])})`));

    // Поточна точка і лінеаризація в ній: кожне коло замінюємо дотичною прямою.
    const cur = iters.length ? iters[iters.length - 1].p : start;
    tangents.replaceChildren();
    stations.forEach(([sx, sy], i) => {
      const d0 = Math.hypot(cur[0] - sx, cur[1] - sy);
      if (d0 < 1) return;
      const u = [(cur[0] - sx) / d0, (cur[1] - sy) / d0];
      const foot = [sx + u[0] * d[i], sy + u[1] * d[i]];
      const t = [-u[1] * 700, u[0] * 700];
      svgEl('line', { x1: plot.sx(foot[0] - t[0]), y1: plot.sy(foot[1] - t[1]), x2: plot.sx(foot[0] + t[0]), y2: plot.sy(foot[1] + t[1]), stroke: 'var(--ml)', 'stroke-width': 1.5, 'stroke-dasharray': '6 5', opacity: 0.8 }, tangents);
    });

    const all = [start, ...iters.map((it) => it.p)];
    path.setAttribute('points', all.map(([x, y]) => `${plot.sx(x)},${plot.sy(y)}`).join(' '));
    iterDots.replaceChildren();
    iters.forEach((it, i) => {
      svgEl('circle', { cx: plot.sx(it.p[0]), cy: plot.sy(it.p[1]), r: 4, fill: 'var(--warn)' }, iterDots);
      if (i < 4) {
        const t = svgEl('text', { x: plot.sx(it.p[0]) + 7, y: plot.sy(it.p[1]) - 6, class: 'plot-label', style: 'fill: var(--warn); font-weight: 700' }, iterDots);
        t.textContent = String(i + 1);
      }
    });
    est.setAttribute('transform', `translate(${plot.sx(start[0])},${plot.sy(start[1])})`);
    truth.setAttribute('transform', `translate(${plot.sx(TRUE[0])},${plot.sy(TRUE[1])})`);
    truth.setAttribute('visibility', truthBox.checked ? 'visible' : 'hidden');

    tbody.innerHTML =
      `<tr><td>0</td><td class="num">${fmt(start[0], 2)}</td><td class="num">${fmt(start[1], 2)}</td><td class="num">${fmt(misfit(start, d), 1)}</td><td>—</td></tr>` +
      iters.map((it, i) => `<tr><td>${i + 1}</td><td class="num">${fmt(it.p[0], 2)}</td><td class="num">${fmt(it.p[1], 2)}</td><td class="num">${fmt(it.S, 3)}</td><td class="num">${it.step < 0.001 ? it.step.toExponential(0) : fmt(it.step, 3)}</td></tr>`).join('');

    presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));
    const last = iters[iters.length - 1];
    if (!last) {
      status.className = 'status';
      status.innerHTML = 'Помаранчева точка — початкове наближення (його можна тягти). Фіолетові пунктири — кола відстаней, замінені дотичними прямими в околі поточної точки. Натисніть «Крок».';
    } else if (last.step < 1e-3) {
      const err = Math.hypot(last.p[0] - TRUE[0], last.p[1] - TRUE[1]);
      status.className = err > 50 ? 'status warn' : 'status success';
      status.innerHTML =
        err > 50
          ? `<b>Ітерації зійшлися — але не туди.</b> Станції стоять у ряд, і кола перетинаються у двох симетричних точках. Метод знайшов «дзеркальну» відповідь: вона так само добре узгоджується з вимірами. Потрібна краща геометрія або краще наближення.`
          : `<b>Зійшлося за ${iters.length} ітерац${iters.length < 5 ? 'ії' : 'ій'}.</b> Кожен крок — звичайний лінійний МНК. Зверніть увагу на стовпчик |Δ|: кількість правильних цифр приблизно подвоюється на кожному кроці.`;
    } else {
      status.className = 'status info';
      status.innerHTML = `Крок ${iters.length}: точка перемістилася на ${fmt(last.step, 2)} м. Дотичні перебудовано в новій точці — знову лінійна задача.`;
    }
  }

  function step() {
    const d = measured();
    const cur = iters.length ? iters[iters.length - 1].p : start;
    const next = gnStep(cur, d);
    if (!next) return;
    iters.push({ p: next, S: misfit(next, d), step: Math.hypot(next[0] - cur[0], next[1] - cur[1]) });
    render();
  }

  makeDraggable(est, plot.svg, (px, py) => {
    start = [clamp(plot.ix(px), 0, 1000), clamp(plot.iy(py), 0, 1000)];
    iters = [];
    render();
  });
  plot.svg.addEventListener('dblclick', (e) => {
    const p = pointerToSvg(plot.svg, e as PointerEvent);
    start = [clamp(plot.ix(p.x), 0, 1000), clamp(plot.iy(p.y), 0, 1000)];
    iters = [];
    render();
  });
  $('[data-action="step"]', root).addEventListener('click', step);
  $('[data-action="run"]', root).addEventListener('click', () => {
    let n = 0;
    const tick = () => {
      step();
      n++;
      const last = iters[iters.length - 1];
      if (n < 10 && last && last.step > 1e-6) setTimeout(tick, 350);
    };
    tick();
  });
  $('[data-action="reset"]', root).addEventListener('click', () => {
    iters = [];
    render();
  });
  truthBox.addEventListener('change', render);
  presetBtns.forEach((b) =>
    b.addEventListener('click', () => {
      preset = b.dataset.preset!;
      stations = PRESETS[preset].map((s) => [...s] as [number, number]);
      start = preset === 'line' ? [520, 820] : [820, 660];
      iters = [];
      buildStations();
      render();
    }),
  );
  buildStations();
  render();
}

initWeights();
initLevNet();
initGaussNewton();
