// Розділ 1. Коли рівнянь більше, ніж невідомих.
import { renderMath, tex, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import {
  animate,
  clamp,
  createPlot,
  formatNumber as fmt,
  makeDraggable,
  residualColor,
  setAttrs,
  snap,
  svgEl,
} from '../lib/plot';
import { det3, gaussian, lineThrough, rank, seededRandom, type Pt } from '../lib/linalg';

import meanPy from '../snippets/ch01/mean.py?raw';
import meanJs from '../snippets/ch01/mean.js?raw';
import systemsPy from '../snippets/ch01/systems.py?raw';
import systemsJs from '../snippets/ch01/systems.js?raw';

renderMath();
initQuizzes();
initCodeTabs({
  mean: { py: meanPy, js: meanJs },
  systems: { py: systemsPy, js: systemsJs },
});

/** Невеликий хелпер: знайти елемент за селектором або кинути помилку. */
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
   1.1. Три виміри однієї довжини: числова вісь з рухомою оцінкою
   ===================================================================== */
function initMeanWidget(): void {
  const root = $('#w-mean');
  const measurements = [10.02, 10.05, 9.98];
  const plot = createPlot($('.plot', root), {
    width: 640,
    height: 210,
    x: [9.95, 10.08],
    y: [0, 4],
    margin: { top: 14, right: 20, bottom: 34, left: 20 },
    xTicks: [9.96, 9.98, 10.0, 10.02, 10.04, 10.06, 10.08],
    xLabel: 'м',
    ariaLabel: 'Три виміри довжини на числовій осі та рухома оцінка x',
  });
  const { sx, sy, layer, svg } = plot;
  const rows = [3, 2, 1];

  const arrows = measurements.map((m, i) => {
    const g = svgEl('g', {}, layer);
    svgEl('line', { x1: sx(m), x2: sx(m), y1: sy(rows[i]) + 10, y2: sy(0), stroke: 'var(--grid)', 'stroke-width': 1 }, g);
    const line = svgEl('line', { class: 'residual', y1: sy(rows[i]), y2: sy(rows[i]) }, g);
    svgEl('circle', { cx: sx(m), cy: sy(rows[i]), r: 6, class: 'data-point' }, g);
    const name = svgEl('text', { x: sx(m), y: sy(rows[i]) - 12, 'text-anchor': 'middle', class: 'plot-label' }, g);
    name.textContent = `вимір ${i + 1}: ${fmt(m, 2)}`;
    const label = svgEl('text', { y: sy(rows[i]) + 20, 'text-anchor': 'middle', class: 'residual-label' }, g);
    return { line, label, m, row: rows[i] };
  });

  // Рухома вертикальна лінія — наша оцінка x.
  const handle = svgEl('g', { class: 'draggable', tabindex: 0, role: 'slider', 'aria-label': 'Оцінка довжини x' }, svg);
  const hLine = svgEl('line', { y1: sy(3.8), y2: sy(0), stroke: 'var(--accent)', 'stroke-width': 2.5 }, handle);
  const hHalo = svgEl('circle', { cy: sy(3.8), r: 16, class: 'drag-halo' }, handle);
  const hDot = svgEl('circle', { cy: sy(3.8), r: 7, fill: 'var(--accent)' }, handle);
  // Широка невидима смуга, щоб лінію легко було «схопити».
  const hHit = svgEl('rect', { y: sy(3.8) - 16, height: sy(0) - sy(3.8) + 16, width: 24, fill: 'transparent' }, handle);

  const valueOut = $('[data-out="x"]', root);
  const devList = $('[data-out="devs"]', root);
  let x = 10.0;

  function render() {
    const px = sx(x);
    setAttrs(hLine, { x1: px, x2: px });
    setAttrs(hHalo, { cx: px });
    setAttrs(hDot, { cx: px });
    setAttrs(hHit, { x: px - 12 });
    handle.setAttribute('aria-valuenow', x.toFixed(3));
    valueOut.textContent = `${fmt(x, 3)} м`;
    const items: string[] = [];
    arrows.forEach(({ line, label, m, row }, i) => {
      const v = (x - m) * 1000; // мм
      const color = residualColor(v, 50);
      setAttrs(line, { x1: sx(m), x2: px, stroke: color });
      setAttrs(label, { x: (sx(m) + px) / 2, fill: color });
      label.textContent = Math.abs(v) < 0.5 ? '' : `${fmt(v, 0, true)} мм`;
      label.setAttribute('y', String(sy(row) + 20));
      const verdict = Math.abs(v) < 0.5 ? ' — виконано точно' : '';
      items.push(`<li>рівняння ${i + 1} (<span class="num">x = ${fmt(m, 2)}</span>): відхилення <b class="num" style="color:${color}">${fmt(v, 0, true)} мм</b>${verdict}</li>`);
    });
    devList.innerHTML = items.join('');
  }

  makeDraggable(handle, svg, (px) => {
    x = clamp(snap(plot.ix(px), 0.001), 9.95, 10.08);
    render();
  });
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.01 : 0.001;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') x = clamp(x - step, 9.95, 10.08);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') x = clamp(x + step, 9.95, 10.08);
    else return;
    e.preventDefault();
    render();
  });

  const moveTo = (target: number) => {
    const from = x;
    animate(450, (t) => {
      x = from + (target - from) * t;
      render();
    });
  };
  root.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.set;
      moveTo(v === 'mean' ? measurements.reduce((s, m) => s + m, 0) / measurements.length : Number(v));
    });
  });
  render();
}

/* =====================================================================
   1.2. Замкнений нівелірний хід: нев'язка і різні способи її «розкидати»
   ===================================================================== */
function initLevellingWidget(): void {
  const root = $('#w-level');
  const svg = svgEl('svg', { viewBox: '40 30 470 250', role: 'img', 'aria-label': 'Схема замкненого нівелірного ходу з чотирьох станцій' });
  $('.plot', root).appendChild(svg);

  const defs = svgEl('defs', {}, svg);
  const marker = svgEl('marker', { id: 'arrow-lvl', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
  svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--accent)' }, marker);

  const names = ['Rp', 'A', 'B', 'C'];
  const pos = [
    { x: 90, y: 250 },
    { x: 150, y: 70 },
    { x: 420, y: 60 },
    { x: 440, y: 245 },
  ];
  // Виміряні перевищення (м) і довжини ходів (км).
  const h = [1.254, 0.873, -0.612, -1.508];
  const len = [0.8, 1.2, 0.6, 1.4];
  const H0 = 100.0;
  const misclosure = h.reduce((s, v) => s + v, 0); // +0,007 м

  const legLabels = h.map((_, i) => {
    const p = pos[i];
    const q = pos[(i + 1) % 4];
    // Скорочуємо відрізок, щоб стрілка не наїжджала на кружки.
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    const k = 22 / d;
    svgEl('line', {
      x1: p.x + dx * k,
      y1: p.y + dy * k,
      x2: q.x - dx * k,
      y2: q.y - dy * k,
      stroke: 'var(--accent)',
      'stroke-width': 2,
      'marker-end': 'url(#arrow-lvl)',
    }, svg);
    // Підпис — трохи назовні від центру фігури.
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const ox = mx - 265;
    const oy = my - 160;
    const on = Math.hypot(ox, oy) || 1;
    const t = svgEl('text', {
      x: mx + (ox / on) * 26,
      y: my + (oy / on) * 26 + 4,
      'text-anchor': 'middle',
      class: 'residual-label',
      style: 'fill: var(--text); font-size: 16px',
    }, svg);
    return t;
  });

  pos.forEach((p, i) => {
    svgEl('circle', { cx: p.x, cy: p.y, r: 16, fill: i === 0 ? 'var(--accent)' : 'var(--surface)', stroke: 'var(--accent)', 'stroke-width': 2 }, svg);
    const t = svgEl('text', { x: p.x, y: p.y + 5, 'text-anchor': 'middle', class: 'plot-label', style: `font-size: 14px; font-weight: 700; fill: ${i === 0 ? '#fff' : 'var(--text)'}` }, svg);
    t.textContent = names[i];
  });
  const center = svgEl('text', { x: 265, y: 150, 'text-anchor': 'middle', class: 'plot-label', style: 'font-size: 17px' }, svg);
  const center2 = svgEl('text', { x: 265, y: 178, 'text-anchor': 'middle', class: 'residual-label', style: 'font-size: 20px' }, svg);

  const table = $('[data-out="table"]', root);
  const status = $('[data-out="status"]', root);

  type Mode = 'none' | 'last' | 'equal' | 'length';
  const corrections: Record<Mode, number[]> = {
    none: [0, 0, 0, 0],
    last: [0, 0, 0, -misclosure],
    equal: h.map(() => -misclosure / 4),
    length: len.map((L) => (-misclosure * L) / len.reduce((s, v) => s + v, 0)),
  };
  const notes: Record<Mode, string> = {
    none: 'Обійшли коло й повернулися на репер Rp — а він «виріс» на 7 мм. Сума перевищень мала б дорівнювати нулю, але дорівнює <b>+7 мм</b>. Це і є <b>нев\'язка</b>.',
    last: 'Хід замкнувся, але всю помилку ми звалили на останній хід. Чому саме на нього? Жодної причини немає.',
    equal: 'Хід замкнувся. Порівну — звучить справедливо… але ходи різної довжини: чи однаково ми довіряємо кілометровому й 600-метровому?',
    length: 'Хід замкнувся. Довшим ходам дісталося більше. Виглядає розумно — але це вже <i>інше</i> рішення, ніж «порівну».',
  };

  function render(mode: Mode) {
    const v = corrections[mode];
    const hc = h.map((hi, i) => hi + v[i]);
    legLabels.forEach((t, i) => {
      t.textContent = `${fmt(hc[i], mode === 'none' ? 3 : 4, true)} м`;
    });
    const sum = hc.reduce((s, x) => s + x, 0);
    center.textContent = 'Σh =';
    center2.textContent = `${fmt(sum * 1000, 1, true)} мм`;
    center2.setAttribute('fill', Math.abs(sum) < 1e-9 ? 'var(--good)' : 'var(--bad)');

    let H = H0;
    const rows = [`<tr><td>Rp</td><td>—</td><td>—</td><td class="num">${fmt(H0, 3)}</td></tr>`];
    for (let i = 0; i < 4; i++) {
      H += hc[i];
      const to = i === 3 ? 'Rp (знову)' : names[i + 1];
      const corr = v[i] === 0 ? '0' : fmt(v[i] * 1000, 2, true);
      rows.push(`<tr><td>${to}</td><td class="num">${fmt(h[i], 3, true)}</td><td class="num">${corr}</td><td class="num">${fmt(H, 4)}</td></tr>`);
    }
    table.innerHTML = `<thead><tr><th>Пункт</th><th>Виміряне h, м</th><th>Виправлення, мм</th><th>Висота H, м</th></tr></thead><tbody>${rows.join('')}</tbody>`;
    status.innerHTML = notes[mode];
    status.className = `status ${mode === 'none' ? 'warn' : 'info'}`;
  }

  root.querySelectorAll<HTMLInputElement>('input[name="lvl-mode"]').forEach((r) => {
    r.addEventListener('change', () => render(r.value as Mode));
  });
  render('none');
}

/* =====================================================================
   1.3. Головний інтерактив: пряма через три точки
   ===================================================================== */
type LineListener = (pts: Pt[]) => void;

function initLineWidget(onPointsChange: LineListener): void {
  const root = $('#w-line');
  const initial: Pt[] = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ];
  const pts: Pt[] = initial.map((p) => ({ ...p }));
  const X: [number, number] = [0, 4.4];
  const Y: [number, number] = [-1, 4];

  const plot = createPlot($('.plot', root), {
    width: 600,
    height: 440,
    x: X,
    y: Y,
    margin: { top: 16, right: 16, bottom: 30, left: 36 },
    xTicks: [0, 1, 2, 3, 4],
    yTicks: [-1, 0, 1, 2, 3, 4],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Три точки та пряма y = a + b·x з вертикальними нев\'язками',
  });
  const { sx, sy, layer, svg } = plot;

  const line = svgEl('line', { class: 'fit-line' }, layer);
  const residuals = pts.map(() => svgEl('line', { class: 'residual' }, layer));
  const resLabels = pts.map(() => svgEl('text', { class: 'residual-label' }, svg));
  const ring = svgEl('circle', { r: 14, class: 'abandoned-ring', visibility: 'hidden' }, svg);
  const handles = pts.map((_, i) => {
    const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}, перетягніть або рухайте стрілками` }, svg);
    svgEl('circle', { r: 18, class: 'drag-halo' }, g);
    svgEl('circle', { r: 7, class: 'data-point' }, g);
    const t = svgEl('text', { class: 'plot-label', 'font-weight': 700, x: -14, y: -12, 'text-anchor': 'middle' }, g);
    t.textContent = String(i + 1);
    return g;
  });

  const sliderA = $<HTMLInputElement>('input[name="a"]', root);
  const sliderB = $<HTMLInputElement>('input[name="b"]', root);
  const outA = $('output[for="line-a"]', root);
  const outB = $('output[for="line-b"]', root);
  const eqDisplay = $('[data-out="eq"]', root);
  const eqTable = $('[data-out="eqs"]', root);
  const status = $('[data-out="status"]', root);
  const exactBtn = $<HTMLButtonElement>('[data-action="exact"]', root);
  const pairBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-pair]')];

  let a = 0.2;
  let b = 0.8;
  /** Якщо обрано пару рівнянь — пряма «прив'язана» до неї й перераховується при русі точок. */
  let pair: [number, number] | null = null;

  const EPS = 0.005;

  function collinear(): boolean {
    return Math.abs(det3(pts)) < 1e-9;
  }

  function render() {
    // Пряма через увесь графік.
    setAttrs(line, { x1: sx(X[0]), y1: sy(a + b * X[0]), x2: sx(X[1]), y2: sy(a + b * X[1]) });

    const r = pts.map((p) => p.y - (a + b * p.x));
    pts.forEach((p, i) => {
      const yl = a + b * p.x;
      const color = residualColor(r[i], 1.2);
      setAttrs(residuals[i], { x1: sx(p.x), x2: sx(p.x), y1: sy(p.y), y2: sy(yl), stroke: color });
      const midY = (sy(p.y) + sy(yl)) / 2;
      const show = Math.abs(r[i]) >= EPS;
      setAttrs(resLabels[i], { x: sx(p.x) + 10, y: clamp(midY + 4, 20, 420), fill: color, visibility: show ? 'visible' : 'hidden' });
      resLabels[i].textContent = fmt(r[i], 2, true);
      handles[i].setAttribute('transform', `translate(${sx(p.x)},${sy(p.y)})`);
    });

    // Покинута точка (коли пряму провели лише через два рівняння).
    const abandoned = pair ? [0, 1, 2].find((k) => !pair!.includes(k))! : -1;
    if (abandoned >= 0 && Math.abs(r[abandoned]) >= EPS) {
      setAttrs(ring, { cx: sx(pts[abandoned].x), cy: sy(pts[abandoned].y), visibility: 'visible' });
    } else {
      ring.setAttribute('visibility', 'hidden');
    }

    // Повзунки та рівняння прямої.
    sliderA.value = String(a);
    sliderB.value = String(b);
    outA.textContent = fmt(a, 2);
    outB.textContent = fmt(b, 2);
    const sign = b < 0 ? '-' : '+';
    tex(eqDisplay, `y = ${texNum(a, 2)} ${sign} ${texNum(Math.abs(b), 2)}\\,x`);

    // Таблиця рівнянь: що виконано, що ні.
    eqTable.innerHTML =
      '<thead><tr><th>№</th><th>Рівняння</th><th>Ліва частина</th><th>Нев\'язка</th><th></th></tr></thead><tbody>' +
      pts
        .map((p, i) => {
          const lhs = a + b * p.x;
          const ok = Math.abs(r[i]) < EPS;
          return `<tr><td>${i + 1}</td><td class="num">a + ${fmt(p.x, 1)}·b = ${fmt(p.y, 1)}</td><td class="num">${fmt(lhs, 2)}</td><td class="num" style="color:${residualColor(r[i], 1.2)}">${fmt(r[i], 2, true)}</td><td class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</td></tr>`;
        })
        .join('') +
      '</tbody>';

    pairBtns.forEach((btn) => {
      const [i, j] = btn.dataset.pair!.split('').map((c) => Number(c) - 1);
      btn.classList.toggle('active', !!pair && pair[0] === i && pair[1] === j);
    });

    // Повідомлення під графіком.
    const allOk = r.every((v) => Math.abs(v) < EPS);
    const isCollinear = collinear();
    exactBtn.hidden = !(isCollinear && !allOk && lineThrough(pts[0], pts[2]) !== null);
    if (allOk) {
      status.className = 'status success';
      status.innerHTML = '<b>Усі три рівняння виконано!</b> Пряма проходить через кожну точку — система сумісна.';
    } else if (isCollinear) {
      const vertical = pts.every((p) => Math.abs(p.x - pts[0].x) < 1e-9);
      status.className = 'status success';
      status.innerHTML = vertical
        ? 'Точки на одній <i>вертикалі</i>: пряма x = const не записується як y = a + b·x.'
        : '<b>Точний розв\'язок існує!</b> Ви поставили точки на одну пряму — тепер система сумісна. Спробуйте кнопку «Провести точно».';
    } else if (abandoned >= 0) {
      status.className = 'status warn';
      const [i, j] = pair!;
      status.innerHTML = `Рівняння ${i + 1} і ${j + 1} виконуються точно, а точку ${abandoned + 1} <b>кинуто</b>: її нев'язка ${fmt(r[abandoned], 2, true)}. Ми просто проігнорували третє вимірювання.`;
    } else if (pair) {
      status.className = 'status warn';
      status.textContent = 'У цих двох точок однаковий x — через них не провести пряму виду y = a + b·x.';
    } else {
      status.className = 'status';
      status.innerHTML = 'Спробуйте повзунками провести пряму так, щоб <b>усі три</b> нев\'язки стали нулем. Або перетягніть точки.';
    }

    onPointsChange(pts);
  }

  function solvePair(i: number, j: number) {
    const s = lineThrough(pts[i], pts[j]);
    if (!s) return false;
    a = s.a;
    b = s.b;
    return true;
  }

  function animateTo(ta: number, tb: number) {
    const [fa, fb] = [a, b];
    animate(500, (t) => {
      a = fa + (ta - fa) * t;
      b = fb + (tb - fb) * t;
      render();
    });
  }

  sliderA.addEventListener('input', () => {
    pair = null;
    a = Number(sliderA.value);
    render();
  });
  sliderB.addEventListener('input', () => {
    pair = null;
    b = Number(sliderB.value);
    render();
  });

  pairBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const [i, j] = btn.dataset.pair!.split('').map((c) => Number(c) - 1);
      pair = [i, j];
      const s = lineThrough(pts[i], pts[j]);
      if (s) animateTo(s.a, s.b);
      else render();
    });
  });

  exactBtn.addEventListener('click', () => {
    pair = null;
    const s = lineThrough(pts[0], pts[2]) ?? lineThrough(pts[0], pts[1]);
    if (s) animateTo(s.a, s.b);
  });

  $('[data-action="reset"]', root).addEventListener('click', () => {
    initial.forEach((p, i) => Object.assign(pts[i], p));
    pair = null;
    animateTo(0.2, 0.8);
  });

  const onPointMoved = () => {
    if (pair) solvePair(pair[0], pair[1]);
    render();
  };

  handles.forEach((g, i) => {
    makeDraggable(g, svg, (px, py) => {
      pts[i].x = clamp(snap(plot.ix(px), 0.1), 0.2, 4.2);
      pts[i].y = clamp(snap(plot.iy(py), 0.1), -0.8, 3.8);
      onPointMoved();
    });
    g.addEventListener('keydown', (e) => {
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-0.1, 0],
        ArrowRight: [0.1, 0],
        ArrowUp: [0, 0.1],
        ArrowDown: [0, -0.1],
      };
      const step = d[e.key];
      if (!step) return;
      e.preventDefault();
      pts[i].x = clamp(+(pts[i].x + step[0]).toFixed(1), 0.2, 4.2);
      pts[i].y = clamp(+(pts[i].y + step[1]).toFixed(1), -0.8, 3.8);
      onPointMoved();
    });
  });

  render();
}

/* =====================================================================
   «Більше подробиць»: живий критерій Кронекера–Капеллі для точок з 1.3
   ===================================================================== */
function makeRankPanel(): LineListener {
  const box = document.querySelector<HTMLElement>('#live-rank');
  if (!box) return () => {};
  const matrixOut = $('[data-out="matrix"]', box);
  const verdictOut = $('[data-out="verdict"]', box);
  return (pts) => {
    const A = pts.map((p) => [1, p.x]);
    const Ab = pts.map((p) => [1, p.x, p.y]);
    const rA = rank(A);
    const rAb = rank(Ab);
    const n = (v: number) => texNum(v, 1);
    const rowsA = pts.map((p) => `1 & ${n(p.x)}`).join('\\\\');
    const rowsAb = pts.map((p) => `1 & ${n(p.x)} & ${n(p.y)}`).join('\\\\');
    tex(
      matrixOut,
      `A=\\begin{pmatrix}${rowsA}\\end{pmatrix},\\quad [A\\,|\\,\\mathbf y]=\\left(\\begin{array}{cc|c}${rowsAb}\\end{array}\\right),\\quad \\det[A\\,|\\,\\mathbf y]=${texNum(det3(pts), 2)}`,
      true,
    );
    const ok = rA === rAb;
    verdictOut.className = `status ${ok ? 'success' : 'warn'}`;
    verdictOut.innerHTML = `rank A = <b>${rA}</b>, rank [A | y] = <b>${rAb}</b> → ${
      ok ? 'ранги рівні, система <b>сумісна</b>.' : 'ранги різні, система <b>несумісна</b>: точного розв\'язку немає.'
    }`;
  };
}

/* =====================================================================
   1.4. Навіщо зайві виміри: контроль і точність
   ===================================================================== */
function initRedundancyWidget(): void {
  const root = $('#w-redundancy');
  const TRUE = 10.0;
  const SIGMA = 0.02; // 2 см — навмисно груба рулетка, щоб розкид було добре видно
  const BLUNDER = 0.06; // промах: 6 см
  const EXPERIMENTS = 400;
  const X: [number, number] = [9.92, 10.1];

  const plot = createPlot($('.plot', root), {
    width: 1000,
    height: 340,
    x: X,
    y: [0, 10],
    margin: { top: 16, right: 20, bottom: 34, left: 20 },
    xTicks: [9.94, 9.96, 9.98, 10.0, 10.02, 10.04, 10.06, 10.08],
    xLabel: 'м',
    ariaLabel: 'Виміри одного експерименту та гістограма середніх з багатьох експериментів',
  });
  const { sx, sy, layer } = plot;

  svgEl('line', { x1: sx(TRUE), x2: sx(TRUE), y1: sy(10), y2: sy(0), stroke: 'var(--good)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, layer);
  const trueLbl = svgEl('text', { x: sx(TRUE) + 6, y: sy(9.4), class: 'plot-label', style: 'fill: var(--good)' }, layer);
  trueLbl.textContent = 'істинна довжина (невідома нам)';
  const topLbl = svgEl('text', { x: sx(X[0]) + 4, y: sy(8.9), class: 'plot-label' }, layer);
  const botLbl = svgEl('text', { x: sx(X[0]) + 4, y: sy(5.3), class: 'plot-label' }, layer);
  botLbl.textContent = `Середні з ${EXPERIMENTS} повторень такого експерименту`;
  const dots = svgEl('g', {}, layer);
  const bars = svgEl('g', {}, layer);

  const nInput = $<HTMLInputElement>('input[name="n"]', root);
  const nOut = $('output[for="red-n"]', root);
  const blunderBox = $<HTMLInputElement>('input[name="blunder"]', root);
  const status = $('[data-out="status"]', root);
  const spreadOut = $('[data-out="spread"]', root);
  let seed = 7;

  function experiment(rand: () => number, n: number, blunder: boolean): number[] {
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(TRUE + SIGMA * gaussian(rand) + (blunder && k === 0 ? BLUNDER : 0));
    return out;
  }

  function render() {
    const n = Number(nInput.value);
    const blunder = blunderBox.checked;
    nOut.textContent = String(n);
    topLbl.textContent = n === 1 ? 'Один експеримент: 1 вимір' : `Один експеримент: ${n} вимірів і їх середнє`;

    // Один показовий експеримент.
    const rand = seededRandom(seed);
    const one = experiment(rand, n, blunder);
    const mean = one.reduce((s, v) => s + v, 0) / n;
    dots.replaceChildren();
    const jitter = seededRandom(seed + 1);
    one.forEach((v, k) => {
      const cy = sy(7.2 + (jitter() - 0.5) * 1.6);
      const isBlunder = blunder && k === 0;
      svgEl('circle', { cx: sx(clamp(v, X[0], X[1])), cy, r: 4.5, fill: isBlunder ? 'var(--bad)' : 'var(--point)', opacity: 0.75 }, dots);
    });
    if (n > 1) {
      svgEl('line', { x1: sx(mean), x2: sx(mean), y1: sy(8.4), y2: sy(6.0), stroke: 'var(--accent)', 'stroke-width': 3 }, dots);
    }

    // Багато експериментів → гістограма середніх.
    const rand2 = seededRandom(seed * 31 + n);
    const means: number[] = [];
    for (let e = 0; e < EXPERIMENTS; e++) {
      const s = experiment(rand2, n, blunder);
      means.push(s.reduce((acc, v) => acc + v, 0) / n);
    }
    const BIN = 0.002;
    const counts = new Map<number, number>();
    for (const m of means) {
      const b = Math.round(m / BIN);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const maxCount = Math.max(...counts.values());
    bars.replaceChildren();
    for (const [b, c] of counts) {
      const x0 = b * BIN - BIN / 2;
      if (x0 < X[0] || x0 > X[1]) continue;
      const h = (c / maxCount) * 4.4;
      svgEl('rect', { x: sx(x0) + 0.5, width: sx(x0 + BIN) - sx(x0) - 1, y: sy(h), height: sy(0) - sy(h), fill: 'var(--accent)', opacity: 0.55 }, bars);
    }
    const avg = means.reduce((s, v) => s + v, 0) / means.length;
    const sd = Math.sqrt(means.reduce((s, v) => s + (v - avg) ** 2, 0) / (means.length - 1));
    spreadOut.textContent = `±${fmt(sd * 1000, 1)} мм`;

    let msg: string;
    if (!blunder) {
      msg =
        n === 1
          ? 'Один вимір — одне число. Наскільки воно точне, ми не знаємо: порівняти немає з чим.'
          : `Випадкові похибки частково взаємно гасяться: що більше вимірів, то вужча гістограма середніх.`;
    } else if (n === 1) {
      msg = '<b>Промах не помічено.</b> Вимір хибний на 6 см, але без другого виміру про це не дізнатися.';
    } else if (n === 2) {
      msg = '<b>Промах видно</b> — два виміри розходяться. Але який із них хибний, сказати неможливо.';
    } else {
      msg = '<b>Промах можна знайти:</b> один вимір (червоний) явно вибивається з решти. Надлишкові виміри дали <b>контроль</b>.';
    }
    status.innerHTML = msg;
    status.className = `status ${blunder && n === 1 ? 'warn' : blunder ? 'success' : 'info'}`;
  }

  nInput.addEventListener('input', render);
  blunderBox.addEventListener('change', render);
  $('[data-action="reroll"]', root).addEventListener('click', () => {
    seed = Math.floor(Math.random() * 1e6);
    render();
  });
  render();
}

initMeanWidget();
initLevellingWidget();
initLineWidget(makeRankPanel());
initRedundancyWidget();
