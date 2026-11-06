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

  const XT = [9.94, 9.96, 9.98, 10.0, 10.02, 10.04, 10.06, 10.08];
  const XT_COMPACT = [9.94, 9.98, 10.02, 10.06];

  // ① Один експеримент: n вимірів і їх середнє.
  const one = createPlot($('.plot-one', root), {
    width: 1000,
    height: 130,
    x: X,
    y: [0, 1],
    margin: { top: 26, right: 20, bottom: 30, left: 20 },
    xTicks: XT,
    xLabel: 'м',
    ariaLabel: 'Один експеримент: виміри та їх середнє',
    compact: { width: 440, height: 150, xTicks: XT_COMPACT },
  });
  // ② Той самий експеримент 400 разів: гістограма середніх.
  const plot = createPlot($('.plot-hist', root), {
    width: 1000,
    height: 280,
    x: X,
    y: [0, 10],
    margin: { top: 26, right: 20, bottom: 34, left: 20 },
    xTicks: XT,
    xLabel: 'м',
    ariaLabel: 'Гістограма середніх з багатьох експериментів',
    compact: { width: 440, height: 300, xTicks: XT_COMPACT },
  });
  const { sx, sy, layer } = plot;
  const compact = plot.opts.width < 1000;

  for (const p of [one, plot]) {
    const [y0, y1] = p.opts.y;
    svgEl('line', { x1: p.sx(TRUE), x2: p.sx(TRUE), y1: p.sy(y1), y2: p.sy(y0), stroke: 'var(--good)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, p.layer);
  }
  const trueLbl = svgEl('text', { x: one.sx(TRUE) + 6, y: one.sy(0.12), class: 'plot-label', style: 'fill: var(--good)' }, one.layer);
  trueLbl.textContent = 'істинна довжина';
  const topLbl = svgEl('text', { x: 4, y: 16, class: 'plot-label', style: 'font-weight: 600' }, one.svg);
  const botLbl = svgEl('text', { x: 4, y: 16, class: 'plot-label', style: 'font-weight: 600' }, plot.svg);
  botLbl.textContent = compact
    ? `② ${EXPERIMENTS} таких експериментів: гістограма середніх`
    : `② Повторюємо цей експеримент ${EXPERIMENTS} разів: куди падають середні`;
  const dots = svgEl('g', {}, one.layer);
  const bars = svgEl('g', {}, layer);
  const spreadG = svgEl('g', {}, layer);

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

  const mm = (v: number) => fmt(v, 3);

  function render() {
    const n = Number(nInput.value);
    const blunder = blunderBox.checked;
    nOut.textContent = String(n);
    topLbl.textContent =
      n === 1
        ? '① Один експеримент: 1 вимір (він же і «середнє»)'
        : compact
          ? `① Один експеримент: ${n} вимірів і їх середнє`
          : `① Один експеримент: ${n} вимірів (точки) і їх середнє (синя риска)`;

    // Один показовий експеримент.
    const rand = seededRandom(seed);
    const sample = experiment(rand, n, blunder);
    const mean = sample.reduce((s, v) => s + v, 0) / n;
    dots.replaceChildren();
    const jitter = seededRandom(seed + 1);
    sample.forEach((v, k) => {
      const cy = one.sy(0.5 + (jitter() - 0.5) * 0.45);
      const isBlunder = blunder && k === 0;
      svgEl('circle', { cx: one.sx(clamp(v, X[0], X[1])), cy, r: 4.5, fill: isBlunder ? 'var(--bad)' : 'var(--point)', opacity: 0.75 }, dots);
    });
    if (n > 1) {
      svgEl('line', { x1: one.sx(mean), x2: one.sx(mean), y1: one.sy(0.92), y2: one.sy(0.08), stroke: 'var(--accent)', 'stroke-width': 3 }, dots);
    }

    // Багато експериментів → гістограма середніх.
    const rand2 = seededRandom(seed * 31 + n);
    const means: number[] = [];
    for (let e = 0; e < EXPERIMENTS; e++) {
      const smp = experiment(rand2, n, blunder);
      means.push(smp.reduce((acc, v) => acc + v, 0) / n);
    }
    const BIN = 0.002;
    const counts = new Map<number, number>();
    for (const m of means) {
      const b = Math.round(m / BIN);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const maxCount = Math.max(...counts.values());
    const H = 7.4; // висота найвищого стовпчика в одиницях осі y
    bars.replaceChildren();
    for (const [b, c] of counts) {
      const x0 = b * BIN - BIN / 2;
      if (x0 < X[0] || x0 > X[1]) continue;
      const h = (c / maxCount) * H;
      const rect = svgEl('rect', { x: sx(x0) + 0.5, width: Math.max(1, sx(x0 + BIN) - sx(x0) - 1), y: sy(h), height: sy(0) - sy(h), fill: 'var(--accent)', opacity: 0.55, style: 'cursor: pointer' }, bars);
      const text = `${c} з ${EXPERIMENTS} експериментів дали середнє між ${mm(x0)} і ${mm(x0 + BIN)} м.`;
      svgEl('title', {}, rect).textContent = text;
      rect.addEventListener('click', () => {
        bars.querySelectorAll('rect').forEach((r) => r.setAttribute('opacity', '0.55'));
        rect.setAttribute('opacity', '1');
        status.className = 'status info';
        status.innerHTML = `<b>Цей стовпчик:</b> ${text} Що вищий стовпчик, то частіше виходить таке середнє.`;
      });
    }
    // Висота найвищого стовпчика числом.
    const peak = [...counts.entries()].find(([, c]) => c === maxCount)![0] * BIN;
    const peakLbl = svgEl('text', { x: sx(peak), y: sy(H) - 5, 'text-anchor': 'middle', class: 'plot-label' }, bars);
    peakLbl.textContent = `${maxCount} разів`;

    const avg = means.reduce((s, v) => s + v, 0) / means.length;
    const sd = Math.sqrt(means.reduce((s, v) => s + (v - avg) ** 2, 0) / (means.length - 1));
    spreadOut.textContent = `±${fmt(sd * 1000, 1)} мм`;

    // Ширина «гори»: ±σ навколо середнього.
    spreadG.replaceChildren();
    const yb = H + 1.6;
    const xl = sx(clamp(avg - sd, X[0], X[1]));
    const xr = sx(clamp(avg + sd, X[0], X[1]));
    svgEl('line', { x1: xl, x2: xr, y1: sy(yb), y2: sy(yb), stroke: 'var(--warn)', 'stroke-width': 2 }, spreadG);
    for (const x of [xl, xr]) svgEl('line', { x1: x, x2: x, y1: sy(yb) - 6, y2: sy(yb) + 6, stroke: 'var(--warn)', 'stroke-width': 2 }, spreadG);
    const wl = svgEl('text', { x: xr + 8, y: sy(yb) + 4, class: 'plot-label', style: 'fill: var(--warn); font-weight: 600' }, spreadG);
    wl.textContent = `ширина гори ±${fmt(sd * 1000, 1)} мм`;

    let msg: string;
    if (!blunder) {
      msg =
        n === 1
          ? 'Один вимір — одне число. Гора широка: окремий вимір легко помиляється і на 1, і на 3 см. Збільште n.'
          : `Середнє з ${n} вимірів: гора приблизно у ${fmt(Math.sqrt(n), 1)} раза вужча, ніж для одного виміру. Випадкові похибки частково гасять одна одну.`;
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

/* =====================================================================
   «Більше подробиць»: площина стовпців A і проєкція y на неї
   ===================================================================== */
type V3 = [number, number, number];

function initPlaneScene(): void {
  const root = $('#w-plane');
  const W = 520;
  const H = 400;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, style: 'max-width: 560px; margin: 0 auto', role: 'img', 'aria-label': 'Площина стовпців A, вектор вимірів y та його проєкція' }, $('.plot-plane', root));
  const scene = svgEl('g', {}, svg);

  const c1: V3 = [1, 1, 1];
  const c2: V3 = [1, 2, 3];
  const y: V3 = [1, 2, 2];
  const [a, b] = [2 / 3, 1 / 2]; // МНК-розв'язок для точок (1; 1), (2; 2), (3; 2)
  const comb = (s: number, t: number): V3 => [s * c1[0] + t * c2[0], s * c1[1] + t * c2[1], s * c1[2] + t * c2[2]];
  const yh = comb(a, b);
  const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const add = (p: V3, q: V3, k = 1): V3 => [p[0] + k * q[0], p[1] + k * q[1], p[2] + k * q[2]];
  const unit = (p: V3): V3 => {
    const l = Math.hypot(...p);
    return [p[0] / l, p[1] / l, p[2] / l];
  };

  // Власна система координат сцени: площина стовпців стає «підлогою» (z = 0),
  // нормаль до неї — віссю z. Так видно, що y стирчить з площини.
  const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const n0 = unit(cross(c1, c2));
  const N: V3 = dot(sub(y, yh), n0) > 0 ? n0 : [-n0[0], -n0[1], -n0[2]]; // y — «над» площиною
  const R = unit(yh);
  const M = cross(N, R);
  let yaw = -0.45;
  let pitch = 0.75;
  const C: V3 = [yh[0] / 2, yh[1] / 2, yh[2] / 2]; // обертаємо навколо середини сцени
  const SCALE = 88;
  // Ортографічна проєкція: поворот навколо нормалі, потім нахил до глядача.
  const proj = (p0: V3) => {
    const d = sub(p0, C);
    const p: V3 = [dot(d, R), dot(d, M), dot(d, N)];
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const x1 = c * p[0] - s * p[1];
    const y1 = s * p[0] + c * p[1];
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const z2 = cp * p[2] - sp * y1;
    return { x: W / 2 + SCALE * x1, y: H / 2 + 20 - SCALE * z2 };
  };
  const pt = (p: V3) => {
    const q = proj(p);
    return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
  };

  function arrow(from: V3, to: V3, color: string, label: string, dashed = false) {
    const p = proj(from);
    const q = proj(to);
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    svgEl('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: color, 'stroke-width': 3, 'stroke-dasharray': dashed ? '6 5' : 'none', 'stroke-linecap': 'round' }, scene);
    if (!dashed) {
      const h = 11;
      svgEl('path', { d: `M${q.x},${q.y} L${q.x - h * Math.cos(ang - 0.4)},${q.y - h * Math.sin(ang - 0.4)} L${q.x - h * Math.cos(ang + 0.4)},${q.y - h * Math.sin(ang + 0.4)} Z`, fill: color }, scene);
    }
    if (label) {
      const t = svgEl('text', { x: q.x + 8 * Math.cos(ang) + 4, y: q.y + 8 * Math.sin(ang) + 4, class: 'plot-label', style: `fill: ${color}; font-weight: 600; font-size: 18px` }, scene);
      t.textContent = label;
    }
  }

  function draw() {
    scene.replaceChildren();
    // Осі: кожна вісь — одне рівняння (один вимір).
    const AX = 2.6;
    (['рівн. 1', 'рівн. 2', 'рівн. 3'] as const).forEach((name, i) => {
      const e: V3 = [0, 0, 0];
      e[i] = AX;
      const p = proj([0, 0, 0]);
      const q = proj(e);
      svgEl('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: 'var(--muted)', 'stroke-width': 1 }, scene);
      const t = svgEl('text', { x: q.x + 4, y: q.y - 4, class: 'plot-label', style: 'font-size: 15px' }, scene);
      t.textContent = name;
    });
    // Шматок площини стовпців (прямокутник у її власних осях R, M) із сіткою.
    const inPlane = (u: number, v: number): V3 => add(add([0, 0, 0], R, u), M, v);
    const U0 = -0.4, U1 = 3.9, V0 = -1.3, V1 = 1.3;
    svgEl('polygon', { points: [inPlane(U0, V0), inPlane(U1, V0), inPlane(U1, V1), inPlane(U0, V1)].map(pt).join(' '), fill: 'var(--accent)', 'fill-opacity': 0.13, stroke: 'var(--accent)', 'stroke-opacity': 0.4 }, scene);
    for (let k = 1; k < 8; k++) {
      const u = U0 + ((U1 - U0) * k) / 8;
      const v = V0 + ((V1 - V0) * k) / 8;
      svgEl('polyline', { points: [inPlane(u, V0), inPlane(u, V1)].map(pt).join(' '), stroke: 'var(--accent)', 'stroke-opacity': 0.15, fill: 'none' }, scene);
      svgEl('polyline', { points: [inPlane(U0, v), inPlane(U1, v)].map(pt).join(' '), stroke: 'var(--accent)', 'stroke-opacity': 0.15, fill: 'none' }, scene);
    }
    const O: V3 = [0, 0, 0];
    arrow(O, c1, 'var(--accent)', '(1,1,1)');
    arrow(O, c2, 'var(--accent)', '(1,2,3)');
    arrow(O, yh, 'var(--good)', 'ŷ');
    arrow(O, y, 'var(--bad)', 'y');
    arrow(yh, y, 'var(--warn)', '', true);
    // Позначка прямого кута в основі перпендикуляра.
    const e = 0.18;
    const u = unit(sub(O, yh));
    const v = unit(sub(y, yh));
    svgEl('polyline', { points: [add(yh, u, e), add(add(yh, u, e), v, e), add(yh, v, e)].map(pt).join(' '), fill: 'none', stroke: 'var(--warn)', 'stroke-width': 1.5 }, scene);
    const g = proj(yh);
    svgEl('circle', { cx: g.x, cy: g.y, r: 4, fill: 'var(--good)' }, scene);
  }

  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  svg.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, yaw, pitch };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    yaw = drag.yaw - (ev.clientX - drag.x) * 0.01;
    pitch = clamp(drag.pitch + (ev.clientY - drag.y) * 0.01, -1.3, 1.3);
    draw();
  });
  const end = () => (drag = null);
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.style.cursor = 'grab';
  draw();
}

initMeanWidget();
initLevellingWidget();
initLineWidget(makeRankPanel());
initRedundancyWidget();
initPlaneScene();
