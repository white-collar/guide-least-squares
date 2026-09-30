// Розділ 3. Мінімум помилки: чаша.
import { renderMath, tex, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import {
  animate,
  clamp,
  createPlot,
  formatNumber as fmt,
  isCompact,
  makeDraggable,
  pointerToSvg,
  residualColor,
  setAttrs,
  snap,
  svgEl,
  type Plot,
} from '../lib/plot';
import { eigSym2, evalQuadratic, gradQuadratic, lineQuadratic, solve2, type Pt, type Quadratic } from '../lib/linalg';

import bowlPy from '../snippets/ch03/bowl.py?raw';
import bowlJs from '../snippets/ch03/bowl.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ bowl: { py: bowlPy, js: bowlJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

const texNum = (v: number, digits: number) => fmt(v, digits).replace('−', '-').replace(',', '{,}');

/** «Круглий» крок поділок, щоб на осі було приблизно `count` підписів. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(6));
  return out;
}

/** Рівні ліній рівня: S_min + L·q, де √q рівномірні — еліпси йдуть з рівним кроком. */
const LEVELS = [0.02, 0.08, 0.18, 0.32, 0.5, 0.72, 0.98, 1.28, 1.62];

/** Спільний стан, який головний інтерактив передає 3D-чаші. */
export interface BowlState {
  q: Quadratic;
  theta: [number, number];
  opt: [number, number] | null;
  sMin: number;
  domA: [number, number];
  domB: [number, number];
  centered: boolean;
}

/* =====================================================================
   3.2. Два простори: дані й параметри
   ===================================================================== */
function initBowl(onState: (s: BowlState) => void): void {
  const root = $('#w-bowl');
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
    far: [
      { x: 4, y: 1.9 },
      { x: 4.5, y: 2.3 },
      { x: 5, y: 2.4 },
      { x: 5.5, y: 2.9 },
    ],
  };

  const dataBox = $('.plot-data', root);
  const mapBox = $('.plot-map', root);
  const compact = isCompact(dataBox);
  const X: [number, number] = [0, 6];
  const Y: [number, number] = [-1, 4];

  // --- Простір даних ---
  const data = createPlot(dataBox, {
    width: compact ? 420 : 480,
    height: compact ? 330 : 400,
    x: X,
    y: Y,
    margin: { top: 16, right: 14, bottom: 30, left: 34 },
    xTicks: [0, 1, 2, 3, 4, 5, 6],
    yTicks: [-1, 0, 1, 2, 3, 4],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Простір даних: точки та поточна пряма',
  });
  const shiftLine = svgEl('line', { stroke: 'var(--muted)', 'stroke-dasharray': '3 4', y1: data.sy(Y[0]), y2: data.sy(Y[1]) }, data.layer);
  const shiftLbl = svgEl('text', { y: data.sy(Y[1]) + 14, class: 'plot-label' }, data.svg);
  shiftLbl.textContent = 'x̄';
  const fitLine = svgEl('line', { class: 'fit-line' }, data.layer);
  const resLayer = svgEl('g', {}, data.layer);
  const handleLayer = svgEl('g', {}, data.svg);

  const aOut = $('[data-out="a"]', root);
  const bOut = $('[data-out="b"]', root);
  const sOut = $('[data-out="S"]', root);
  const eqOut = $('[data-out="eq"]', root);
  const status = $('[data-out="status"]', root);
  const formOut = $('[data-out="form"]', root);
  const centerBox = $<HTMLInputElement>('input[name="center"]', root);
  const presetBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const sliceBoxes = [$('.slice-a', root), $('.slice-b', root)];

  let preset = 'three';
  let pts: Pt[] = [];
  let centered = false;
  let theta: [number, number] = [0.2, 0.8];
  let path: [number, number][] = [];
  let running = false;

  // --- Простір параметрів (перебудовується при зміні набору даних або центрування) ---
  let map: Plot;
  let domA: [number, number] = [0, 1];
  let domB: [number, number] = [0, 1];
  let ellipseLayer: SVGGElement;
  let pathLine: SVGPolylineElement;
  let optMark: SVGGElement;
  let curMark: SVGGElement;
  let slices: { plot: Plot; curve: SVGPathElement; cursor: SVGLineElement; dot: SVGCircleElement; minLine: SVGLineElement }[] = [];

  const shift = () => (centered ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 0);
  const quad = () => lineQuadratic(pts, shift());

  function buildMap() {
    const q = quad();
    const opt = solve2(q.M, q.v) ?? theta;
    // Межі карти: рамка найбільшого еліпса з невеликим запасом.
    const det = q.M[0][0] * q.M[1][1] - q.M[0][1] ** 2;
    const Lmax = LEVELS[LEVELS.length - 1];
    const ha = 1.15 * Math.sqrt((Lmax * q.M[1][1]) / det);
    const hb = 1.15 * Math.sqrt((Lmax * q.M[0][0]) / det);
    domA = [opt[0] - ha, opt[0] + ha];
    domB = [opt[1] - hb, opt[1] + hb];

    mapBox.replaceChildren();
    map = createPlot(mapBox, {
      width: compact ? 420 : 440,
      height: compact ? 330 : 400,
      x: domA,
      y: domB,
      margin: { top: 16, right: 14, bottom: 30, left: 44 },
      xTicks: niceTicks(domA[0], domA[1]),
      yTicks: niceTicks(domB[0], domB[1]),
      xLabel: centered ? 'c' : 'a',
      yLabel: 'b',
      ariaLabel: 'Простір параметрів: лінії рівня суми квадратів S',
    });
    ellipseLayer = svgEl('g', {}, map.layer);
    pathLine = svgEl('polyline', { fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, map.layer);
    optMark = svgEl('g', {}, map.layer);
    svgEl('path', { d: 'M-7,-7 L7,7 M-7,7 L7,-7', stroke: 'var(--good)', 'stroke-width': 3 }, optMark);
    curMark = svgEl('g', { class: 'draggable', tabindex: 0, role: 'slider', 'aria-label': 'Параметри прямої на карті' }, map.svg);
    svgEl('circle', { r: 18, class: 'drag-halo' }, curMark);
    svgEl('circle', { r: 7, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }, curMark);

    // Карта — одна велика «ручка»: натиснули будь-де — точка туди й стрибнула.
    const setFromPx = (px: number, py: number) => {
      theta = [clamp(map.ix(px), domA[0], domA[1]), clamp(map.iy(py), domB[0], domB[1])];
      path = [];
      render();
    };
    const hit = svgEl('rect', { x: 0, y: 0, width: map.opts.width, height: map.opts.height, fill: 'transparent', class: 'draggable' }, map.svg);
    map.svg.insertBefore(hit, curMark);
    makeDraggable(hit, map.svg, setFromPx);
    hit.addEventListener('pointerdown', (e) => {
      const p = pointerToSvg(map.svg, e);
      setFromPx(p.x, p.y);
    });
    makeDraggable(curMark, map.svg, setFromPx);
    curMark.addEventListener('keydown', (e) => {
      const da = (domA[1] - domA[0]) / 100;
      const db = (domB[1] - domB[0]) / 100;
      const d = ({ ArrowLeft: [-da, 0], ArrowRight: [da, 0], ArrowUp: [0, db], ArrowDown: [0, -db] } as Record<string, number[]>)[e.key];
      if (!d) return;
      e.preventDefault();
      theta = [theta[0] + d[0], theta[1] + d[1]];
      path = [];
      render();
    });

    // Перерізи: S як функція одного параметра при фіксованому іншому.
    slices = sliceBoxes.map((box, k) => {
      box.replaceChildren();
      const dom = k === 0 ? domA : domB;
      const plot = createPlot(box, {
        width: compact ? 420 : 480,
        height: compact ? 170 : 180,
        x: dom,
        y: [0, 1],
        margin: { top: 22, right: 10, bottom: 26, left: 10 },
        xTicks: niceTicks(dom[0], dom[1], 4),
        ariaLabel: k === 0 ? 'Переріз S уздовж a при фіксованому b' : 'Переріз S уздовж b при фіксованому a',
      });
      const t = svgEl('text', { x: 12, y: 15, class: 'plot-label', style: 'font-weight: 600' }, plot.svg);
      t.textContent = k === 0 ? `S(${centered ? 'c' : 'a'}) при фіксованому b` : `S(b) при фіксованому ${centered ? 'c' : 'a'}`;
      const minLine = svgEl('line', { stroke: 'var(--good)', 'stroke-dasharray': '3 3', y1: plot.sy(0), y2: plot.sy(1) }, plot.layer);
      const curve = svgEl('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5 }, plot.layer);
      const cursor = svgEl('line', { stroke: 'var(--accent)', 'stroke-dasharray': '4 3', y1: plot.sy(0), y2: plot.sy(1) }, plot.layer);
      const dot = svgEl('circle', { r: 5.5, fill: 'var(--accent)' }, plot.layer);
      return { plot, curve, cursor, dot, minLine };
    });
  }

  function buildHandles() {
    handleLayer.replaceChildren();
    pts.forEach((_, i) => {
      const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}` }, handleLayer);
      svgEl('circle', { r: 18, class: 'drag-halo' }, g);
      svgEl('circle', { r: 6.5, class: 'data-point' }, g);
      const move = (x: number, y: number) => {
        pts[i].x = clamp(x, X[0] + 0.1, X[1] - 0.1);
        pts[i].y = clamp(y, Y[0] + 0.1, Y[1] - 0.1);
        path = [];
        render();
      };
      makeDraggable(g, data.svg, (px, py) => move(snap(data.ix(px), 0.1), snap(data.iy(py), 0.1)));
      g.addEventListener('keydown', (e) => {
        const d = ({ ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] } as Record<string, number[]>)[e.key];
        if (!d) return;
        e.preventDefault();
        move(+(pts[i].x + d[0]).toFixed(1), +(pts[i].y + d[1]).toFixed(1));
      });
    });
  }

  function drawEllipses(q: Quadratic, opt: [number, number]) {
    ellipseLayer.replaceChildren();
    // Еліпси малюємо в координатах параметрів: матриця переводить їх у пікселі.
    const kx = (map.sx(1) - map.sx(0));
    const ky = (map.sy(1) - map.sy(0));
    const g = svgEl('g', { transform: `matrix(${kx},0,0,${ky},${map.sx(0)},${map.sy(0)})` }, ellipseLayer);
    const { l1, l2, angle } = eigSym2(q.M);
    const deg = (angle * 180) / Math.PI;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      const L = LEVELS[i];
      const r1 = Math.sqrt(L / l1);
      const r2 = Math.sqrt(L / Math.max(l2, 1e-9));
      svgEl('ellipse', {
        cx: 0,
        cy: 0,
        rx: r1,
        ry: Math.min(r2, 1e4),
        transform: `translate(${opt[0]},${opt[1]}) rotate(${deg})`,
        fill: 'var(--accent)',
        'fill-opacity': 0.07,
        stroke: 'var(--accent)',
        'stroke-opacity': 0.45,
        'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke',
      }, g);
    }
  }

  function render() {
    const s0 = shift();
    const q = quad();
    const opt = solve2(q.M, q.v);
    const [a, b] = theta;
    const S = evalQuadratic(q, a, b);
    const sMin = opt ? evalQuadratic(q, opt[0], opt[1]) : NaN;

    // Дані: пряма y = a + b(x − s0) та нев'язки.
    const yAt = (x: number) => a + b * (x - s0);
    setAttrs(fitLine, { x1: data.sx(X[0]), y1: data.sy(yAt(X[0])), x2: data.sx(X[1]), y2: data.sy(yAt(X[1])) });
    resLayer.replaceChildren();
    pts.forEach((p, i) => {
      const r = p.y - yAt(p.x);
      if (Math.abs(r) > 0.004) {
        svgEl('line', { class: 'residual', x1: data.sx(p.x), x2: data.sx(p.x), y1: data.sy(p.y), y2: data.sy(yAt(p.x)), stroke: residualColor(r, 1.2) }, resLayer);
      }
      handleLayer.children[i]?.setAttribute('transform', `translate(${data.sx(p.x)},${data.sy(p.y)})`);
    });
    shiftLine.setAttribute('visibility', centered ? 'visible' : 'hidden');
    shiftLbl.setAttribute('visibility', centered ? 'visible' : 'hidden');
    setAttrs(shiftLine, { x1: data.sx(s0), x2: data.sx(s0) });
    setAttrs(shiftLbl, { x: data.sx(s0) + 4 });

    // Карта параметрів.
    if (opt) {
      drawEllipses(q, opt);
      optMark.setAttribute('transform', `translate(${map.sx(opt[0])},${map.sy(opt[1])})`);
      optMark.setAttribute('visibility', 'visible');
    } else {
      ellipseLayer.replaceChildren();
      optMark.setAttribute('visibility', 'hidden');
    }
    curMark.setAttribute('transform', `translate(${map.sx(clamp(a, domA[0], domA[1]))},${map.sy(clamp(b, domB[0], domB[1]))})`);
    pathLine.setAttribute('points', path.map(([pa, pb]) => `${map.sx(pa)},${map.sy(pb)}`).join(' '));

    // Перерізи через поточну точку.
    slices.forEach(({ plot, curve, cursor, dot, minLine }, k) => {
      const dom = k === 0 ? domA : domB;
      const f = (t: number) => (k === 0 ? evalQuadratic(q, t, b) : evalQuadratic(q, a, t));
      const N = 120;
      const ts = Array.from({ length: N + 1 }, (_, i) => dom[0] + ((dom[1] - dom[0]) * i) / N);
      const vs = ts.map(f);
      const lo = Math.min(...vs, 0);
      const hi = Math.max(...vs) * 1.05 || 1;
      const yy = (v: number) => plot.sy((v - lo) / (hi - lo));
      curve.setAttribute('d', 'M' + ts.map((t, i) => `${plot.sx(t).toFixed(1)},${yy(vs[i]).toFixed(1)}`).join('L'));
      const cur = k === 0 ? a : b;
      setAttrs(cursor, { x1: plot.sx(cur), x2: plot.sx(cur) });
      setAttrs(dot, { cx: plot.sx(cur), cy: yy(f(cur)) });
      // Мінімум перерізу: 1D-парабола, вершина в точці, де нахил дорівнює нулю.
      const m = q.M;
      const tMin = k === 0 ? (q.v[0] - m[0][1] * b) / m[0][0] : (q.v[1] - m[1][0] * a) / m[1][1];
      setAttrs(minLine, { x1: plot.sx(tMin), x2: plot.sx(tMin) });
    });

    // Числа й формули.
    const pa = centered ? 'c' : 'a';
    aOut.textContent = `${pa} = ${fmt(a, 3)}`;
    bOut.textContent = `b = ${fmt(b, 3)}`;
    sOut.innerHTML = `S = <b>${fmt(S, 3)}</b>` + (opt ? ` <span class="widget-hint">(мінімум ${fmt(sMin, 3)})</span>` : '');
    const xs = centered ? `(x - ${texNum(s0, 2)})` : 'x';
    tex(eqOut, `y = ${texNum(a, 2)} ${b < 0 ? '-' : '+'} ${texNum(Math.abs(b), 2)}\\,${xs}`);
    const [g0, g1] = gradQuadratic(q, a, b);
    const M = q.M;
    const term = (coef: number, v: string, first = false) => {
      if (Math.abs(coef) < 5e-4) return '';
      const s = coef < 0 ? '-' : first ? '' : '+';
      // Без зайвих нулів: 3 замість 3,00, але 23,07 лишається.
      const num = texNum(Math.abs(coef), 2).replace(/\{,\}?0+$/, '').replace(/(\{,\}\d*?)0+$/, '$1');
      return ` ${s} ${num === '1' && v ? '' : num}${v}`;
    };
    tex(
      formOut,
      `S(${pa},b) =${term(M[0][0], pa + '^2', true)}${term(2 * M[0][1], pa + 'b')}${term(M[1][1], 'b^2')}${term(-2 * q.v[0], pa)}${term(-2 * q.v[1], 'b')}${term(q.c, '')}`,
    );

    if (!opt) {
      status.className = 'status warn';
      status.innerHTML = 'Усі точки мають однаковий $x$: дно чаші перетворилося на <b>жолоб</b>, і мінімумів нескінченно багато.';
      renderMath(status);
    } else if (S - sMin < 1e-4) {
      status.className = 'status success';
      status.innerHTML = '<b>Ви на дні чаші.</b> Обидва перерізи мають мінімум саме тут: нахил і вздовж $' + pa + '$, і вздовж $b$ дорівнює нулю.';
      renderMath(status);
    } else {
      status.className = 'status';
      status.innerHTML = `Нахили в цій точці: вздовж ${pa} — <b class="num">${fmt(g0, 2)}</b>, вздовж b — <b class="num">${fmt(g1, 2)}</b>. На дні обидва дорівнюють нулю.`;
    }

    presetBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.preset === preset));
    onState({ q, theta, opt, sMin, domA, domB, centered });
  }

  function animateTo(target: [number, number]) {
    const from = theta;
    path = [];
    animate(700, (k) => {
      theta = [from[0] + (target[0] - from[0]) * k, from[1] + (target[1] - from[1]) * k];
      render();
    });
  }

  function load(name: string) {
    preset = name;
    pts = PRESETS[name].map((p) => ({ ...p }));
    buildHandles();
    buildMap();
    // Стартуємо з точки на краю карти, щоб було куди «скочуватися».
    theta = [domA[0] + 0.2 * (domA[1] - domA[0]), domB[0] + 0.8 * (domB[1] - domB[0])];
    path = [];
    render();
  }

  centerBox.addEventListener('change', () => {
    // Та сама пряма в нових параметрах: a = c − b·x̄  ⇔  c = a + b·x̄.
    const m = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    centered = centerBox.checked;
    theta = centered ? [theta[0] + theta[1] * m, theta[1]] : [theta[0] - theta[1] * m, theta[1]];
    buildMap();
    path = [];
    render();
  });

  presetBtns.forEach((btn) => btn.addEventListener('click', () => load(btn.dataset.preset!)));
  $('[data-action="bottom"]', root).addEventListener('click', () => {
    const q = quad();
    const opt = solve2(q.M, q.v);
    if (opt) animateTo(opt);
  });
  $('[data-action="rebuild"]', root).addEventListener('click', () => {
    buildMap();
    render();
  });

  // Градієнтний спуск: кулька котиться в напрямку найшвидшого спуску.
  $('[data-action="descent"]', root).addEventListener('click', () => {
    if (running) return;
    running = true;
    const q = quad();
    const { l1 } = eigSym2(q.M);
    // Гессіан S дорівнює 2M, тож спуск стійкий при η < 1/λ₁. Беремо 0,9 від межі:
    // уздовж крутого напрямку кулька перестрибує дно й петляє.
    const eta = 0.9 / l1;
    path = [[theta[0], theta[1]]];
    let step = 0;
    const STEPS = 40;
    const tick = () => {
      const [g0, g1] = gradQuadratic(q, theta[0], theta[1]);
      theta = [theta[0] - eta * g0, theta[1] - eta * g1];
      path.push([theta[0], theta[1]]);
      render();
      step++;
      if (step < STEPS) setTimeout(tick, 70);
      else {
        running = false;
        const opt = solve2(q.M, q.v)!;
        const S = evalQuadratic(q, theta[0], theta[1]);
        const sMin = evalQuadratic(q, opt[0], opt[1]);
        status.className = 'status info';
        status.innerHTML = `Після ${STEPS} кроків градієнтного спуску S = <b>${fmt(S, 4)}</b>, а мінімум ${fmt(sMin, 4)}. ${
          S - sMin > 1e-3
            ? 'Кулька ще не дісталася дна: у витягнутій «долині» вона петляє від схилу до схилу й повільно повзе вздовж неї.'
            : 'Кулька практично на дні.'
        }`;
      }
    };
    tick();
  });

  load('three');
}

/* =====================================================================
   3.3. Чаша у 3D: обертання мишею або пальцем
   ===================================================================== */
function init3D(): (s: BowlState) => void {
  const root = $('#w-3d');
  const canvas = $<HTMLCanvasElement>('canvas', root);
  const ctx = canvas.getContext('2d')!;
  const elevInput = $<HTMLInputElement>('input[name="elev"]', root);
  let az = -0.6;
  let el = Number(elevInput.value);
  let state: BowlState | null = null;
  let oriented = false;

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function draw() {
    if (!state) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { q, domA, domB, theta, opt, sMin } = state;
    // Висота: S − S_min, нормована на рівень краю чаші (найбільший еліпс з карти).
    const base = Number.isFinite(sMin) ? sMin : 0;
    const RIM = LEVELS[LEVELS.length - 1];
    const scale = Math.min(w, h * 1.6) * 0.3;
    const cx = w / 2;
    const cy = h * 0.6;

    // Нормовані координати: u, v ∈ [−1, 1] (межі карти), висота z = (S − S_min) / RIM.
    const toN = (a: number, b: number, s: number) => [
      (2 * (a - domA[0])) / (domA[1] - domA[0]) - 1,
      (2 * (b - domB[0])) / (domB[1] - domB[0]) - 1,
      clamp((s - base) / RIM, 0, 1.6),
    ];
    const project = (u: number, v: number, z: number) => {
      const X = u * Math.cos(az) - v * Math.sin(az);
      const Y = u * Math.sin(az) + v * Math.cos(az);
      return [cx + X * scale, cy + Y * Math.sin(el) * scale - z * 0.8 * Math.cos(el) * scale];
    };

    // Підлога.
    ctx.strokeStyle = css('--grid');
    ctx.lineWidth = 1;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], i) => {
      const [px, py] = project(u, v, 0);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    // Поверхня з «кілець» (ліній рівня, як на карті) і «меридіанів» від дна до краю.
    // Точка δ = ρ·(r₁·cos t·e₁ + r₂·sin t·e₂) лежить на висоті S_min + RIM·ρ².
    const accent = css('--accent');
    if (opt) {
      const { l1, l2, angle } = eigSym2(q.M);
      const e1 = [Math.cos(angle), Math.sin(angle)];
      const e2 = [-Math.sin(angle), Math.cos(angle)];
      const r1 = Math.sqrt(RIM / l1);
      const r2 = Math.sqrt(RIM / Math.max(l2, 1e-9));
      const at = (rho: number, t: number) => {
        const d1 = rho * r1 * Math.cos(t);
        const d2 = rho * r2 * Math.sin(t);
        const a = opt[0] + d1 * e1[0] + d2 * e2[0];
        const b = opt[1] + d1 * e1[1] + d2 * e2[1];
        const [u, v] = toN(a, b, 0);
        return project(clamp(u, -1.05, 1.05), clamp(v, -1.05, 1.05), rho * rho);
      };
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.1;
      const RINGS = 12;
      for (let k = 1; k <= RINGS; k++) {
        const rho = k / RINGS;
        ctx.globalAlpha = k === RINGS ? 0.9 : 0.45;
        ctx.beginPath();
        for (let j = 0; j <= 96; j++) {
          const [px, py] = at(rho, (2 * Math.PI * j) / 96);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35;
      for (let m = 0; m < 24; m++) {
        const t = (2 * Math.PI * m) / 24;
        ctx.beginPath();
        for (let j = 0; j <= 30; j++) {
          const [px, py] = at(j / 30, t);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Мінімум і поточна точка з «ніжкою» до підлоги.
    const mark = (a: number, b: number, color: string, r: number) => {
      const S = evalQuadratic(q, a, b);
      const [u, v, z] = toN(clamp(a, domA[0], domA[1]), clamp(b, domB[0], domB[1]), S);
      const [fx, fy] = project(u, v, 0);
      const [px, py] = project(u, v, z);
      ctx.strokeStyle = color;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    };
    if (opt) mark(opt[0], opt[1], css('--good'), 5);
    mark(theta[0], theta[1], css('--warn'), 6.5);

    // Підписи осей.
    ctx.fillStyle = css('--muted');
    ctx.font = '13px system-ui, sans-serif';
    const [ax, ay] = project(1.12, -1, 0);
    ctx.fillText(state.centered ? 'c' : 'a', ax, ay);
    const [bx, by] = project(-1, 1.12, 0);
    ctx.fillText('b', bx, by);
  }

  // Обертання: тягнемо по горизонталі — азимут, по вертикалі — нахил.
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    az += (e.clientX - drag.x) * 0.01;
    el = clamp(el - (e.clientY - drag.y) * 0.008, 0.05, 1.5);
    elevInput.value = String(el);
    drag = { x: e.clientX, y: e.clientY };
    draw();
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointercancel', () => (drag = null));
  elevInput.addEventListener('input', () => {
    el = Number(elevInput.value);
    draw();
  });
  window.addEventListener('resize', draw);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

  return (s) => {
    state = s;
    // Уперше повертаємо чашу так, щоб її довга вісь ішла зліва направо.
    if (!oriented) {
      const { angle } = eigSym2(s.q.M);
      const du = (-Math.sin(angle) * 2) / (s.domA[1] - s.domA[0]);
      const dv = (Math.cos(angle) * 2) / (s.domB[1] - s.domB[0]);
      az = -Math.atan2(dv, du);
      oriented = true;
    }
    draw();
  };
}

/* =====================================================================
   3.1. Кожна пряма — одна точка в просторі параметрів
   ===================================================================== */
function initDual(): void {
  const root = $('#w-dual');
  const status = $('[data-out="status"]', root);
  const LINES = [
    { a: 1, b: 0.5, color: 'var(--accent)' },
    { a: 3, b: -0.5, color: 'var(--warn)' },
    { a: 0, b: 1, color: 'var(--good)' },
    { a: 2, b: 0, color: 'var(--bad)' },
  ];
  const data = createPlot($('.plot-lines', root), {
    width: 320,
    height: 260,
    x: [0, 4],
    y: [-1, 5],
    margin: { top: 14, right: 12, bottom: 30, left: 32 },
    xTicks: [0, 1, 2, 3, 4],
    yTicks: [-1, 0, 1, 2, 3, 4, 5],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Простір даних: чотири прямі',
  });
  const par = createPlot($('.plot-points', root), {
    width: 320,
    height: 260,
    x: [-1, 4],
    y: [-1, 1.5],
    margin: { top: 14, right: 12, bottom: 30, left: 36 },
    xTicks: [-1, 0, 1, 2, 3, 4],
    yTicks: [-1, -0.5, 0, 0.5, 1, 1.5],
    xLabel: 'a',
    yLabel: 'b',
    ariaLabel: 'Простір параметрів: чотири точки',
  });
  const titles = [
    [data, 'Простір даних'],
    [par, 'Простір параметрів'],
  ] as const;
  for (const [p, t] of titles) {
    const el = svgEl('text', { x: p.opts.width - 14, y: p.opts.margin.top + 14, 'text-anchor': 'end', class: 'plot-label', style: 'font-weight: 600' }, p.svg);
    el.textContent = t;
  }

  const eq = (a: number, b: number) => {
    const bs = b === 0 ? '' : ` ${b < 0 ? '−' : '+'} ${fmt(Math.abs(b), 1)}x`.replace(' 1,0x', ' x');
    return `y = ${fmt(a, 0)}${bs}`.replace('y = 0 + ', 'y = ');
  };

  const items = LINES.map((l) => {
    const line = svgEl('line', { x1: data.sx(0), y1: data.sy(l.a), x2: data.sx(4), y2: data.sy(l.a + 4 * l.b), stroke: l.color, 'stroke-width': 2.5 }, data.layer);
    const hit = svgEl('line', { x1: data.sx(0), y1: data.sy(l.a), x2: data.sx(4), y2: data.sy(l.a + 4 * l.b), stroke: 'transparent', 'stroke-width': 16, style: 'cursor: pointer' }, data.layer);
    const dot = svgEl('circle', { cx: par.sx(l.a), cy: par.sy(l.b), r: 7, fill: l.color, stroke: 'var(--surface)', 'stroke-width': 2, style: 'cursor: pointer' }, par.layer);
    return { l, line, hit, dot };
  });

  function select(k: number) {
    items.forEach((it, i) => {
      const on = i === k;
      setAttrs(it.line, { 'stroke-width': on ? 4.5 : 2, 'stroke-opacity': on ? 1 : 0.35 });
      setAttrs(it.dot, { r: on ? 10 : 6, 'fill-opacity': on ? 1 : 0.35 });
    });
    const { a, b } = items[k].l;
    status.textContent = `Пряма ${eq(a, b)} ↔ точка (a; b) = (${fmt(a, 0)}; ${fmt(b, Number.isInteger(b) ? 0 : 1)}). Висота перетину з віссю y — це a, нахил — b.`;
  }
  items.forEach((it, i) => {
    it.hit.addEventListener('click', () => select(i));
    it.dot.addEventListener('click', () => select(i));
  });
  select(0);
}

initDual();
initBowl(init3D());
