// Розділ 4. Нормальні рівняння.
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
} from '../lib/plot';
import { eigSym2, evalQuadratic, gradQuadratic, lineQuadratic, solve2, type Pt } from '../lib/linalg';

import normalPy from '../snippets/ch04/normal.py?raw';
import normalJs from '../snippets/ch04/normal.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ normal: { py: normalPy, js: normalJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

/** Число для KaTeX без зайвих нулів у кінці: 3 замість 3,00, 0,5 замість 0,50. */
function tn(v: number, digits = 2): string {
  let s = fmt(v, digits);
  if (s.includes(',')) s = s.replace(/0+$/, '').replace(/,$/, '');
  if (s === '−0') s = '0';
  return s.replace('−', '-').replace(',', '{,}');
}
/** Те саме для звичайного тексту. */
const pn = (v: number, digits = 2) => tn(v, digits).replace('{,}', ',').replace('-', '−');

/** Доданок зі знаком для формул: «+ 3», «− 0,5». */
const signed = (v: number, digits = 2) => (v < 0 ? `- ${tn(-v, digits)}` : `+ ${tn(v, digits)}`);
/** Число в дужках, якщо від'ємне: 2·(−1). */
const paren = (v: number, digits = 2) => (v < 0 ? `(${tn(v, digits)})` : tn(v, digits));

type Listener = (pts: Pt[]) => void;

/* =====================================================================
   4.2. Дві умови рівноваги на дні чаші
   ===================================================================== */
function initNormalWidget(listeners: Listener[]): void {
  const root = $('#w-normal');
  const PRESETS: Record<string, Pt[]> = {
    three: [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ],
    five: [
      { x: 0.5, y: 0.6 },
      { x: 1.5, y: 1.7 },
      { x: 2.5, y: 1.8 },
      { x: 3.5, y: 2.9 },
      { x: 5, y: 3.2 },
    ],
  };
  const X: [number, number] = [0, 6];
  const Y: [number, number] = [-1, 4];
  const box = $('.plot', root);
  const compact = isCompact(box);

  const plot = createPlot(box, {
    width: compact ? 420 : 520,
    height: compact ? 320 : 380,
    x: X,
    y: Y,
    margin: { top: 16, right: 14, bottom: 30, left: 34 },
    xTicks: [0, 1, 2, 3, 4, 5, 6],
    yTicks: [-1, 0, 1, 2, 3, 4],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Точки, пряма та нев\'язки',
  });
  const centroid = svgEl('g', {}, plot.svg);
  svgEl('circle', { r: 6, fill: 'none', stroke: 'var(--good)', 'stroke-width': 2 }, centroid);
  svgEl('path', { d: 'M-10,0 H10 M0,-10 V10', stroke: 'var(--good)', 'stroke-width': 1.5 }, centroid);
  const fit = svgEl('line', { class: 'fit-line' }, plot.layer);
  const res = svgEl('g', {}, plot.layer);
  const handles = svgEl('g', {}, plot.svg);

  // Графік нев'язок: rᵢ проти xᵢ. Для прямої МНК у ньому не лишається жодного нахилу.
  const rplot = createPlot($('.plot-res', root), {
    width: compact ? 420 : 520,
    height: 170,
    x: X,
    y: [-1.5, 1.5],
    margin: { top: 22, right: 14, bottom: 26, left: 34 },
    xTicks: [0, 1, 2, 3, 4, 5, 6],
    yTicks: [-1, 0, 1],
    ariaLabel: 'Графік нев\'язок: нев\'язки проти x',
  });
  const rTitle = svgEl('text', { x: 40, y: 14, class: 'plot-label', style: 'font-weight: 600' }, rplot.svg);
  rTitle.textContent = 'Нев\'язки rᵢ проти xᵢ і їхній «тренд»';
  const rTrend = svgEl('line', { stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, rplot.layer);
  const rDots = svgEl('g', {}, rplot.layer);

  const sliderA = $<HTMLInputElement>('input[name="a"]', root);
  const sliderB = $<HTMLInputElement>('input[name="b"]', root);
  const outA = $('output[for="n-a"]', root);
  const outB = $('output[for="n-b"]', root);
  const eqOut = $('[data-out="eq"]', root);
  const gauges = [$('[data-gauge="0"]', root), $('[data-gauge="1"]', root)];
  const status = $('[data-out="status"]', root);
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];

  let pts: Pt[] = [];
  let preset = 'three';
  let a = 0.3;
  let b = 0.8;

  function buildHandles() {
    handles.replaceChildren();
    pts.forEach((_, i) => {
      const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}` }, handles);
      svgEl('circle', { r: 18, class: 'drag-halo' }, g);
      svgEl('circle', { r: 6.5, class: 'data-point' }, g);
      const move = (x: number, y: number) => {
        pts[i].x = clamp(x, X[0] + 0.1, X[1] - 0.1);
        pts[i].y = clamp(y, Y[0] + 0.1, Y[1] - 0.1);
        render();
      };
      makeDraggable(g, plot.svg, (px, py) => move(snap(plot.ix(px), 0.1), snap(plot.iy(py), 0.1)));
      g.addEventListener('keydown', (e) => {
        const d = ({ ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] } as Record<string, number[]>)[e.key];
        if (!d) return;
        e.preventDefault();
        move(+(pts[i].x + d[0]).toFixed(1), +(pts[i].y + d[1]).toFixed(1));
      });
    });
  }

  function gauge(el: HTMLElement, value: number, scale: number) {
    const t = clamp(value / scale, -1, 1);
    const bar = $('.gauge-bar', el);
    bar.style.left = t < 0 ? `${50 + 50 * t}%` : '50%';
    bar.style.width = `${Math.abs(50 * t)}%`;
    bar.style.background = Math.abs(value) < 0.005 ? 'var(--good)' : 'var(--warn)';
    $('.gauge-value', el).textContent = fmt(value, 3, true);
  }

  function render() {
    const r = pts.map((p) => p.y - (a + b * p.x));
    setAttrs(fit, { x1: plot.sx(X[0]), y1: plot.sy(a + b * X[0]), x2: plot.sx(X[1]), y2: plot.sy(a + b * X[1]) });
    res.replaceChildren();
    rDots.replaceChildren();
    pts.forEach((p, i) => {
      const color = residualColor(r[i], 1.2);
      if (Math.abs(r[i]) > 0.004) {
        svgEl('line', { class: 'residual', x1: plot.sx(p.x), x2: plot.sx(p.x), y1: plot.sy(p.y), y2: plot.sy(a + b * p.x), stroke: color }, res);
      }
      handles.children[i]?.setAttribute('transform', `translate(${plot.sx(p.x)},${plot.sy(p.y)})`);
      const ry = clamp(r[i], -1.45, 1.45);
      svgEl('line', { x1: rplot.sx(p.x), x2: rplot.sx(p.x), y1: rplot.sy(0), y2: rplot.sy(ry), stroke: color, 'stroke-width': 2 }, rDots);
      svgEl('circle', { cx: rplot.sx(p.x), cy: rplot.sy(ry), r: 5, fill: color }, rDots);
    });

    // «Тренд» нев'язок — пряма МНК через точки (xᵢ, rᵢ). Для оптимальної прямої він нульовий.
    const q = lineQuadratic(pts.map((p, i) => ({ x: p.x, y: r[i] })));
    const trend = solve2(q.M, q.v) ?? [0, 0];
    setAttrs(rTrend, { x1: rplot.sx(X[0]), y1: rplot.sy(trend[0] + trend[1] * X[0]), x2: rplot.sx(X[1]), y2: rplot.sy(trend[0] + trend[1] * X[1]) });

    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    centroid.setAttribute('transform', `translate(${plot.sx(mx)},${plot.sy(my)})`);

    const s0 = r.reduce((s, v) => s + v, 0);
    const s1 = pts.reduce((s, p, i) => s + p.x * r[i], 0);
    gauge(gauges[0], s0, 3);
    gauge(gauges[1], s1, 8);

    sliderA.value = String(a);
    sliderB.value = String(b);
    outA.textContent = fmt(a, 2);
    outB.textContent = fmt(b, 2);
    tex(eqOut, `y = ${tn(a, 3)} ${signed(b, 3)}\\,x`);

    const ok0 = Math.abs(s0) < 0.005;
    const ok1 = Math.abs(s1) < 0.005;
    if (ok0 && ok1) {
      status.className = 'status success';
      status.innerHTML = '<b>Обидві умови виконано — це дно чаші.</b> Пряма проходить через центр ваги (зелений хрестик), а в графіку нев\'язок не лишилося жодного нахилу.';
    } else if (ok0) {
      status.className = 'status info';
      status.innerHTML = 'Σr = 0: пряма проходить через центр ваги. Але нев\'язки ще мають «тренд» уздовж x — пряму можна повернути навколо центру ваги й зменшити S.';
    } else {
      status.className = 'status';
      status.innerHTML = 'Змінюйте a і b, доки обидва індикатори не стануть нулем. Або натисніть кнопку — вона розв\'яже нормальні рівняння.';
    }
    presetBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.preset === preset));
    listeners.forEach((f) => f(pts));
  }

  function load(name: string) {
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
  presetBtns.forEach((btn) => btn.addEventListener('click', () => load(btn.dataset.preset!)));
  $('[data-action="solve"]', root).addEventListener('click', () => {
    const q = lineQuadratic(pts);
    const s = solve2(q.M, q.v);
    if (!s) return;
    const [fa, fb] = [a, b];
    animate(700, (k) => {
      a = fa + (s[0] - fa) * k;
      b = fb + (s[1] - fb) * k;
      render();
    });
  });
  $('[data-action="centroid"]', root).addEventListener('click', () => {
    // Лише перша умова: зберігаємо нахил, опускаємо/піднімаємо пряму до центру ваги.
    const n = pts.length;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    const fa = a;
    animate(500, (k) => {
      a = fa + (my - b * mx - fa) * k;
      render();
    });
  });

  load('three');
}

/* =====================================================================
   Таблиця сум і нормальні рівняння з поточними числами
   ===================================================================== */
function makeSumsTable(): Listener {
  const root = $('#w-sums');
  const table = $('[data-out="table"]', root);
  const eqs = $('[data-out="eqs"]', root);
  return (pts) => {
    const rows = pts
      .map((p, i) => `<tr><td>${i + 1}</td><td class="num">${pn(p.x, 1)}</td><td class="num">${pn(p.y, 1)}</td><td class="num">${pn(p.x * p.x)}</td><td class="num">${pn(p.x * p.y)}</td></tr>`)
      .join('');
    const q = lineQuadratic(pts);
    const [n, Sx, Sxx, Sy, Sxy] = [q.M[0][0], q.M[0][1], q.M[1][1], q.v[0], q.v[1]];
    table.innerHTML = `<thead><tr><th>i</th><th>xᵢ</th><th>yᵢ</th><th>xᵢ²</th><th>xᵢ·yᵢ</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><th>Σ</th><th class="num">${pn(Sx)}</th><th class="num">${pn(Sy)}</th><th class="num">${pn(Sxx)}</th><th class="num">${pn(Sxy)}</th></tr></tfoot>`;
    const s = solve2(q.M, q.v);
    tex(
      eqs,
      `\\begin{cases} ${tn(n)}\\,a ${signed(Sx)}\\,b = ${tn(Sy)} \\\\ ${tn(Sx)}\\,a ${signed(Sxx)}\\,b = ${tn(Sxy)} \\end{cases}` +
        (s ? `\\quad\\Longrightarrow\\quad a = ${tn(s[0], 4)},\\; b = ${tn(s[1], 4)}` : '\\quad\\text{(система вироджена)}'),
      true,
    );
  };
}

/* =====================================================================
   4.3. Покроковий вивід із «живими» числами
   ===================================================================== */
function makeSteps(): Listener {
  const root = $('#w-steps');
  const list = $('[data-out="steps"]', root);
  const counter = $('[data-out="counter"]', root);
  const prev = $<HTMLButtonElement>('[data-action="prev"]', root);
  const next = $<HTMLButtonElement>('[data-action="next"]', root);
  const all = $<HTMLButtonElement>('[data-action="all"]', root);
  let shown = 1;
  let pts: Pt[] = [];

  interface Step {
    title: string;
    general: string;
    numbers: string;
    text: string;
  }

  function steps(): Step[] {
    const q = lineQuadratic(pts);
    const [n, Sx, Sxx, Sy, Sxy] = [q.M[0][0], q.M[0][1], q.M[1][1], q.v[0], q.v[1]];
    const shown3 = pts.slice(0, 3);
    const more = pts.length > 3 ? ' + \\ldots' : '';
    // Коефіцієнт 1 не пишемо: «− b» замість «− 1 b».
    const coef = (v: number) => (Math.abs(Math.abs(v) - 1) < 1e-9 ? '' : tn(Math.abs(v), 1) + '\\,');
    const term = (p: Pt, withX: boolean) =>
      `${withX ? paren(p.x, 1) + '\\cdot' : ''}(${tn(p.y, 1)} - a ${p.x < 0 ? '+' : '-'} ${coef(p.x)}b)`;
    const det = n * Sxx - Sx * Sx;
    const s = solve2(q.M, q.v);
    const mx = Sx / n;
    const my = Sy / n;
    const cxy = pts.reduce((acc, p) => acc + (p.x - mx) * (p.y - my), 0);
    const cxx = pts.reduce((acc, p) => acc + (p.x - mx) ** 2, 0);
    return [
      {
        title: 'Функція, яку мінімізуємо',
        general: 'S(a, b) = \\sum_{i=1}^{n} \\bigl(y_i - a - b\\,x_i\\bigr)^2',
        numbers: `S(a, b) = ${shown3.map((p) => term(p, false) + '^2').join('¦')}${more}`,
        text: 'Звичайна сума квадратів нев\'язок з розділів 2–3.',
      },
      {
        title: 'Нахил уздовж a дорівнює нулю',
        general: '\\frac{\\partial S}{\\partial a} = -2\\sum \\bigl(y_i - a - b\\,x_i\\bigr) = 0 §\\Longleftrightarrow\\; \\sum r_i = 0',
        numbers: `${shown3.map((p) => term(p, false)).join('¦')}${more} = 0`,
        text: 'Похідна квадрата: 2·(вираз)·(похідна виразу), а похідна від (yᵢ − a − b·xᵢ) по a дорівнює −1. Множник −2 на нуль не впливає, тож умова проста: сума нев\'язок дорівнює нулю.',
      },
      {
        title: 'Нахил уздовж b дорівнює нулю',
        general: '\\frac{\\partial S}{\\partial b} = -2\\sum x_i\\bigl(y_i - a - b\\,x_i\\bigr) = 0 §\\Longleftrightarrow\\; \\sum x_i\\, r_i = 0',
        numbers: `${shown3.map((p) => term(p, true)).join('¦')}${more} = 0`,
        text: 'Тепер похідна виразу по b дорівнює −xᵢ, тож кожна нев\'язка множиться на свій xᵢ. Умова: зважена сума нев\'язок Σ xᵢ·rᵢ дорівнює нулю.',
      },
      {
        title: 'Розкриваємо дужки: нормальні рівняння',
        general:
          '\\begin{cases} n\\,a + \\bigl(\\sum x_i\\bigr)\\,b = \\sum y_i \\\\ \\bigl(\\sum x_i\\bigr)\\,a + \\bigl(\\sum x_i^2\\bigr)\\,b = \\sum x_i y_i \\end{cases}',
        numbers: `\\begin{cases} ${tn(n)}\\,a ${signed(Sx)}\\,b = ${tn(Sy)} \\\\ ${tn(Sx)}\\,a ${signed(Sxx)}\\,b = ${tn(Sxy)} \\end{cases}`,
        text: 'Дві лінійні умови перетворилися на систему двох лінійних рівнянь з двома невідомими. Її коефіцієнти — ті самі п\'ять сум з таблиці вище.',
      },
      {
        title: 'Розв\'язуємо систему',
        general:
          'b = \\frac{n\\sum x_i y_i - \\sum x_i \\sum y_i}{n\\sum x_i^2 - \\bigl(\\sum x_i\\bigr)^2} § a = \\frac{\\sum y_i - b\\sum x_i}{n}',
        numbers: s
          ? `b = \\frac{${tn(n)}\\cdot ${paren(Sxy)} - ${paren(Sx)}\\cdot ${paren(Sy)}}{${tn(n)}\\cdot ${paren(Sxx)} - ${paren(Sx)}^2} = \\frac{${tn(n * Sxy - Sx * Sy, 3)}}{${tn(det, 3)}} = ${tn(s[1], 4)} § a = \\frac{${tn(Sy)} - ${paren(s[1], 4)}\\cdot ${paren(Sx)}}{${tn(n)}} = ${tn(s[0], 4)}`
          : '\\text{знаменник дорівнює нулю: усі } x_i \\text{ однакові}',
        text: 'Друге рівняння множимо на n, перше на Σx і віднімаємо: a зникає, лишається рівняння лише для b. Потім a знаходимо з першого рівняння.',
      },
      {
        title: 'Та сама відповідь «по-людськи»',
        general: 'b = \\frac{\\sum (x_i - \\bar x)(y_i - \\bar y)}{\\sum (x_i - \\bar x)^2} § a = \\bar y - b\\,\\bar x',
        numbers: s
          ? `\\bar x = ${tn(mx, 3)},\\; \\bar y = ${tn(my, 3)} § b = \\frac{${tn(cxy, 3)}}{${tn(cxx, 3)}} = ${tn(s[1], 4)} § a = ${tn(my, 3)} - ${paren(s[1], 4)}\\cdot ${paren(mx, 3)} = ${tn(s[0], 4)}`
          : '\\text{—}',
        text: 'Нахил дорівнює «спільному розкиду» x і y, поділеному на розкид x. Зсув підбирається так, щоб пряма пройшла через центр ваги (x̄; ȳ). Саме цю пару формул дає будь-який підручник статистики.',
      },
    ];
  }

  /**
   * Верстка формул під ширину екрана. «§» розділяє незалежні формули в рядку,
   * «¦» — доданки довгої суми. На вузькому екрані вони йдуть стовпчиком.
   */
  function layout(src: string): string {
    const narrow = list.clientWidth < 560;
    if (!narrow) return src.replaceAll('§', '\\qquad ').replaceAll('¦', ' + ');
    if (src.includes('§')) return `\\begin{gathered}${src.split('§').map((part) => layout(part)).join('\\\\')}\\end{gathered}`;
    if (src.includes('¦')) return `\\begin{aligned}&${src.split('¦').join('\\\\ &+ ')}\\end{aligned}`;
    return src;
  }

  function render() {
    const all_ = steps();
    list.replaceChildren();
    all_.slice(0, shown).forEach((st, i) => {
      const li = document.createElement('li');
      li.className = 'step';
      li.innerHTML = `<div class="step-title"><span class="step-n">${i + 1}</span>${st.title}</div><div class="step-general"></div><div class="step-numbers"></div><p class="step-text">${st.text}</p>`;
      tex($('.step-general', li), layout(st.general), true);
      tex($('.step-numbers', li), layout(st.numbers), true);
      list.appendChild(li);
    });
    counter.textContent = `Крок ${shown} з ${all_.length}`;
    prev.disabled = shown <= 1;
    next.disabled = shown >= all_.length;
    all.disabled = shown >= all_.length;
  }

  prev.addEventListener('click', () => {
    shown = Math.max(1, shown - 1);
    render();
  });
  next.addEventListener('click', () => {
    shown += 1;
    render();
    list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  all.addEventListener('click', () => {
    shown = 6;
    render();
  });

  return (p) => {
    pts = p;
    render();
  };
}

/* =====================================================================
   4.5. Геодезія: нівелірна мережа з трьох перевищень
   ===================================================================== */
function initLevelNet(): void {
  const root = $('#w-net');
  const inputs = [...root.querySelectorAll<HTMLInputElement>('input[type="number"]')];
  const matOut = $('[data-out="mat"]', root);
  const solOut = $('[data-out="sol"]', root);
  const H0 = 100;

  function render() {
    const h = inputs.map((i) => Number(i.value.replace(',', '.')));
    if (h.some((v) => !Number.isFinite(v))) return;
    // Рівняння поправок: H_B − H0 = h1; H_C − H_B = h2; H_C − H0 = h3.
    const A = [
      [1, 0],
      [-1, 1],
      [0, 1],
    ];
    const l = [H0 + h[0], h[1], H0 + h[2]];
    const N = [
      [2, -1],
      [-1, 2],
    ];
    const u = [l[0] - l[1], l[1] + l[2]];
    const x = solve2(N, u)!;
    const v = A.map((row, i) => row[0] * x[0] + row[1] * x[1] - l[i]);
    const w = h[0] + h[1] - h[2];
    const narrow = matOut.clientWidth < 560;
    tex(
      matOut,
      (narrow ? '\\begin{gathered}' : '') +
      `A = \\begin{pmatrix} 1 & 0 \\\\ -1 & 1 \\\\ 0 & 1 \\end{pmatrix},\\quad
       \\mathbf l = \\begin{pmatrix} ${tn(l[0], 3)} \\\\ ${tn(l[1], 3)} \\\\ ${tn(l[2], 3)} \\end{pmatrix}${matOut.clientWidth < 560 ? '\\\\[4pt]' : ',\\quad'}
       A^\\mathsf{T}A = \\begin{pmatrix} 2 & -1 \\\\ -1 & 2 \\end{pmatrix},\\quad
       A^\\mathsf{T}\\mathbf l = \\begin{pmatrix} ${tn(u[0], 3)} \\\\ ${tn(u[1], 3)} \\end{pmatrix}` +
      (narrow ? '\\end{gathered}' : ''),
      true,
    );
    solOut.innerHTML = `
      <p>Нев'язка трикутника: h₁ + h₂ − h₃ = <b class="num">${fmt(w * 1000, 1, true)} мм</b>.</p>
      <p>Розв'язок нормальних рівнянь: <b class="num">H<sub>B</sub> = ${fmt(x[0], 4)} м</b>, <b class="num">H<sub>C</sub> = ${fmt(x[1], 4)} м</b>.</p>
      <p>Поправки до виміряних перевищень: <span class="num">${v.map((vi) => fmt(vi * 1000, 1, true)).join(' · ')}</span> мм.
      Нев'язку розподілено порівну між трьома ходами, як і обіцяв розділ 2.</p>`;
  }
  inputs.forEach((i) => i.addEventListener('input', render));
  render();
}

const sums = makeSumsTable();
const steps = makeSteps();
/* =====================================================================
   4.1. Де нахили дорівнюють нулю: карта чаші й два перерізи
   ===================================================================== */
function initSlopes(): void {
  const root = $('#w-slopes');
  const status = $('[data-out="status"]', root);
  // Чотири точки з x від −1 до 2: лінії нульових нахилів перетинаються під помітним кутом.
  const pts: Pt[] = [
    { x: -1, y: 0.5 },
    { x: 0, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2.2 },
  ];
  const q = lineQuadratic(pts);
  const opt = solve2(q.M, q.v)!;
  const S = (a: number, b: number) => evalQuadratic(q, a, b);
  const Smin = S(opt[0], opt[1]);
  const A: [number, number] = [-0.4, 2.6];
  const B: [number, number] = [-0.4, 1.6];
  const COL_A = 'var(--warn)';
  const COL_B = 'var(--good)';

  const map = createPlot($('.plot-map', root), {
    width: 440,
    height: 340,
    x: A,
    y: B,
    margin: { top: 14, right: 14, bottom: 30, left: 40 },
    xTicks: [0, 0.5, 1, 1.5, 2, 2.5],
    yTicks: [0, 0.5, 1, 1.5],
    xLabel: 'a',
    yLabel: 'b',
    ariaLabel: 'Карта чаші S(a, b) з лініями нульових нахилів',
    compact: { width: 340, height: 280, margin: { top: 12, right: 12, bottom: 28, left: 36 } },
  });
  // Еліпси рівня.
  const kx = map.sx(1) - map.sx(0);
  const ky = map.sy(1) - map.sy(0);
  const g = svgEl('g', { transform: `matrix(${kx},0,0,${ky},${map.sx(0)},${map.sy(0)})` }, map.layer);
  const { l1, l2, angle } = eigSym2(q.M);
  for (const lv of [0.25, 1, 2.25, 4, 6.25, 9, 12.25]) {
    svgEl('ellipse', { cx: 0, cy: 0, rx: Math.sqrt(lv / l1), ry: Math.sqrt(lv / l2), transform: `translate(${opt[0]},${opt[1]}) rotate(${(angle * 180) / Math.PI})`, fill: 'var(--accent)', 'fill-opacity': 0.06, stroke: 'var(--accent)', 'stroke-opacity': 0.35, 'vector-effect': 'non-scaling-stroke' }, g);
  }
  // Лінії нульових нахилів: ∂S/∂a = 0 ⇔ M₀₀a + M₀₁b = v₀; ∂S/∂b = 0 ⇔ M₁₀a + M₁₁b = v₁.
  const zeroLine = (row: 0 | 1, color: string) => {
    const [m0, m1] = q.M[row];
    const aAt = (b: number) => (q.v[row] - m1 * b) / m0;
    svgEl('line', { x1: map.sx(aAt(B[0])), y1: map.sy(B[0]), x2: map.sx(aAt(B[1])), y2: map.sy(B[1]), stroke: color, 'stroke-width': 2.5 }, map.layer);
  };
  zeroLine(0, COL_A);
  zeroLine(1, COL_B);
  const guideA = svgEl('line', { stroke: COL_A, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, map.layer);
  const guideB = svgEl('line', { stroke: COL_B, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, map.layer);
  const star = svgEl('path', { d: 'M-6,-6 L6,6 M-6,6 L6,-6', stroke: 'var(--text)', 'stroke-width': 2 }, map.layer);
  star.setAttribute('transform', `translate(${map.sx(opt[0])},${map.sy(opt[1])})`);
  const dot = svgEl('circle', { r: 9, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2.5, class: 'draggable' }, map.svg);

  const section = (box: HTMLElement, dom: [number, number], label: string, color: string) => {
    const p = createPlot(box, {
      width: 300,
      height: 170,
      x: dom,
      y: [Smin - 0.3, Smin + 6],
      margin: { top: 22, right: 12, bottom: 26, left: 12 },
      xTicks: dom === A ? [0, 1, 2] : [0, 0.5, 1, 1.5],
      xLabel: label,
      ariaLabel: `Переріз чаші вздовж ${label}`,
      compact: { height: 140 },
    });
    const t = svgEl('text', { x: 14, y: 15, class: 'plot-label', style: 'font-weight: 600' }, p.svg);
    t.textContent = `Переріз уздовж ${label}`;
    const curve = svgEl('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }, p.layer);
    const tangent = svgEl('line', { stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round' }, p.layer);
    const pt = svgEl('circle', { r: 5.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, p.layer);
    const slopeText = svgEl('text', { x: p.opts.width - 14, y: 15, 'text-anchor': 'end', class: 'plot-label', style: `fill: ${color}; font-weight: 600` }, p.svg);
    return { p, curve, tangent, pt, slopeText };
  };
  const secA = section($('.plot-sa', root), A, 'a', COL_A);
  const secB = section($('.plot-sb', root), B, 'b', COL_B);

  let a = 0.2;
  let b = 1.3;

  function drawSection(sec: ReturnType<typeof section>, dom: [number, number], at: number, f: (t: number) => number, slope: number) {
    const { p } = sec;
    const n = 80;
    const d = Array.from({ length: n + 1 }, (_, i) => {
      const t = dom[0] + ((dom[1] - dom[0]) * i) / n;
      return `${i ? 'L' : 'M'}${p.sx(t).toFixed(1)},${p.sy(f(t)).toFixed(1)}`;
    }).join('');
    sec.curve.setAttribute('d', d);
    const h = 0.18 * (dom[1] - dom[0]);
    const s0 = f(at);
    setAttrs(sec.tangent, { x1: p.sx(at - h), y1: p.sy(s0 - slope * h), x2: p.sx(at + h), y2: p.sy(s0 + slope * h) });
    setAttrs(sec.pt, { cx: p.sx(at), cy: p.sy(s0) });
    sec.slopeText.textContent = `нахил ${fmt(Math.abs(slope) < 0.005 ? 0 : slope, 2)}`;
  }

  function draw() {
    const [ga, gb] = gradQuadratic(q, a, b);
    setAttrs(dot, { cx: map.sx(a), cy: map.sy(b) });
    setAttrs(guideA, { x1: map.sx(A[0]), x2: map.sx(A[1]), y1: map.sy(b), y2: map.sy(b) });
    setAttrs(guideB, { x1: map.sx(a), x2: map.sx(a), y1: map.sy(B[0]), y2: map.sy(B[1]) });
    drawSection(secA, A, a, (t) => S(t, b), ga);
    drawSection(secB, B, b, (t) => S(a, t), gb);
    const zA = Math.abs(ga) < 0.05;
    const zB = Math.abs(gb) < 0.05;
    if (zA && zB) {
      status.className = 'status success';
      status.textContent = `Дно: обидва нахили нульові. a = ${pn(opt[0])}, b = ${pn(opt[1])}, S = ${pn(Smin)} — менше не буває.`;
    } else if (zA || zB) {
      status.className = 'status info';
      status.textContent = `Нахил уздовж ${zA ? 'a' : 'b'} нульовий (точка на ${zA ? 'помаранчевій' : 'зеленій'} лінії), а уздовж ${zA ? 'b' : 'a'} — ні: рухаючись уздовж ${zA ? 'b' : 'a'}, ще можна спуститися нижче.`;
    } else {
      status.className = 'status';
      status.textContent = `Нахил уздовж a: ${pn(ga)}, уздовж b: ${pn(gb)}. S = ${pn(S(a, b))}.`;
    }
  }

  const moveTo = (pa: number, pb: number) => {
    a = clamp(pa, A[0], A[1]);
    b = clamp(pb, B[0], B[1]);
    draw();
  };
  makeDraggable(dot, map.svg, (px, py) => moveTo(map.ix(px), map.iy(py)));
  map.svg.addEventListener('pointerdown', (e) => {
    if (e.target === dot) return;
    const r = map.svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * map.opts.width;
    const py = ((e.clientY - r.top) / r.height) * map.opts.height;
    moveTo(map.ix(px), map.iy(py));
  });
  const glide = (ta: number, tb: number) => {
    const a0 = a;
    const b0 = b;
    animate(700, (t) => moveTo(a0 + (ta - a0) * t, b0 + (tb - b0) * t));
  };
  root.querySelector('[data-action="bottom"]')?.addEventListener('click', () => glide(opt[0], opt[1]));
  // На лінію ∂S/∂a = 0 при поточному b і на лінію ∂S/∂b = 0 при поточному a.
  root.querySelector('[data-action="line-a"]')?.addEventListener('click', () => glide((q.v[0] - q.M[0][1] * b) / q.M[0][0], b));
  root.querySelector('[data-action="line-b"]')?.addEventListener('click', () => glide(a, (q.v[1] - q.M[1][0] * a) / q.M[1][1]));
  draw();
}

initSlopes();
initNormalWidget([sums, steps]);
initLevelNet();
