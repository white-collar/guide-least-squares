// Розділ 5. Матричний погляд і геометрія.
import { renderMath, tex, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { animate, clamp, createPlot, formatNumber as fmt, isCompact, makeDraggable, setAttrs, snap, svgEl } from '../lib/plot';
import { lineQuadratic, solve2, type Pt } from '../lib/linalg';

import projPy from '../snippets/ch05/projection.py?raw';
import projJs from '../snippets/ch05/projection.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ projection: { py: projPy, js: projJs } });

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

type V3 = [number, number, number];
const dot = (u: number[], v: number[]) => u.reduce((s, ui, i) => s + ui * v[i], 0);
const add = (u: V3, v: V3): V3 => [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
const sub = (u: V3, v: V3): V3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
const mul = (k: number, u: V3): V3 => [k * u[0], k * u[1], k * u[2]];
const norm = (u: number[]) => Math.sqrt(dot(u, u));

type Listener = (pts: Pt[]) => void;

/* =====================================================================
   5.2. Простір спостережень: y, площина стовпців і проєкція
   ===================================================================== */
function initProjection(listeners: Listener[]): void {
  const root = $('#w-proj');
  const canvas = $<HTMLCanvasElement>('canvas', root);
  const ctx = canvas.getContext('2d')!;
  const sliderA = $<HTMLInputElement>('input[name="a"]', root);
  const sliderB = $<HTMLInputElement>('input[name="b"]', root);
  const outA = $('output[for="p-a"]', root);
  const outB = $('output[for="p-b"]', root);
  const eqOut = $('[data-out="eq"]', root);
  const numsOut = $('[data-out="nums"]', root);
  const status = $('[data-out="status"]', root);
  const zoom = $<HTMLInputElement>('input[name="zoom"]', root);

  const pts: Pt[] = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ];
  let a = 0.2;
  let b = 0.4;
  let az = 0;
  let el = 0.8;
  let oriented = false;

  // --- Маленький графік даних: ті самі три числа y, але в звичному вигляді ---
  const X: [number, number] = [0, 4.5];
  const Y: [number, number] = [-0.5, 4.5];
  const dataBox = $('.plot-data', root);
  const plot = createPlot(dataBox, {
    width: isCompact(dataBox) ? 420 : 360,
    height: 300,
    x: X,
    y: Y,
    margin: { top: 14, right: 12, bottom: 28, left: 30 },
    xTicks: [0, 1, 2, 3, 4],
    yTicks: [0, 1, 2, 3, 4],
    xLabel: 'x',
    yLabel: 'y',
    ariaLabel: 'Простір даних: три точки й пряма',
  });
  const fit = svgEl('line', { class: 'fit-line' }, plot.layer);
  const res = svgEl('g', {}, plot.layer);
  const handles = pts.map((_, i) => {
    const g = svgEl('g', { class: 'draggable', tabindex: 0, role: 'button', 'aria-label': `Точка ${i + 1}` }, plot.svg);
    svgEl('circle', { r: 18, class: 'drag-halo' }, g);
    svgEl('circle', { r: 6.5, class: 'data-point' }, g);
    const t = svgEl('text', { x: -13, y: -10, 'text-anchor': 'middle', class: 'plot-label', style: 'font-weight: 700' }, g);
    t.textContent = String(i + 1);
    const move = (x: number, y: number) => {
      pts[i].x = clamp(x, 0.2, 4.3);
      pts[i].y = clamp(y, 0, 4.3);
      render();
    };
    makeDraggable(g, plot.svg, (px, py) => move(snap(plot.ix(px), 0.1), snap(plot.iy(py), 0.1)));
    g.addEventListener('keydown', (e) => {
      const d = ({ ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] } as Record<string, number[]>)[e.key];
      if (!d) return;
      e.preventDefault();
      move(+(pts[i].x + d[0]).toFixed(1), +(pts[i].y + d[1]).toFixed(1));
    });
    return g;
  });

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function geometry() {
    const u: V3 = [1, 1, 1];
    const v: V3 = [pts[0].x, pts[1].x, pts[2].x];
    const y: V3 = [pts[0].y, pts[1].y, pts[2].y];
    const q = lineQuadratic(pts);
    const opt = solve2(q.M, q.v);
    const cur = add(mul(a, u), mul(b, v));
    const yHat = opt ? add(mul(opt[0], u), mul(opt[1], v)) : null;
    return { u, v, y, cur, yHat, opt };
  }

  function draw3d() {
    const { u, v, y, cur, yHat } = geometry();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Центр і масштаб — за ключовими точками сцени; від обертання вони не залежать.
    // У режимі наближення дивимося лише на околицю y та Aθ: так добре видно нев'язку й прямий кут.
    const key: V3[] = zoom.checked ? [y, cur, ...(yHat ? [yHat] : [])] : [[0, 0, 0], y, cur, u, v, ...(yHat ? [yHat] : [])];
    const center = mul(1 / key.length, key.reduce((acc, p) => add(acc, p), [0, 0, 0] as V3));
    const radius = Math.max(...key.map((p) => norm(sub(p, center))), zoom.checked ? 0.35 : 1) * (zoom.checked ? 1.6 : 1);
    const s = (Math.min(w, h) * 0.4) / radius;
    const P = (p: V3) => {
      const q = sub(p, center);
      const X = q[0] * Math.cos(az) - q[1] * Math.sin(az);
      const Y = q[0] * Math.sin(az) + q[1] * Math.cos(az);
      return [w / 2 + X * s, h / 2 + Y * Math.sin(el) * s - q[2] * Math.cos(el) * s];
    };
    const line = (p: V3, q: V3, color: string, width = 1.5, dash: number[] = []) => {
      const [x1, y1] = P(p);
      const [x2, y2] = P(q);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const arrow = (p: V3, q: V3, color: string, width = 2.2) => {
      line(p, q, color, width);
      const [x1, y1] = P(p);
      const [x2, y2] = P(q);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 10 * Math.cos(ang - 0.35), y2 - 10 * Math.sin(ang - 0.35));
      ctx.lineTo(x2 - 10 * Math.cos(ang + 0.35), y2 - 10 * Math.sin(ang + 0.35));
      ctx.closePath();
      ctx.fill();
    };
    const label = (p: V3, text: string, color: string, dx = 6, dy = -6) => {
      const [x, y_] = P(p);
      ctx.fillStyle = color;
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(text, x + dx, y_ + dy);
    };
    const dotAt = (p: V3, color: string, r = 5) => {
      const [x, y_] = P(p);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y_, r, 0, 2 * Math.PI);
      ctx.fill();
    };

    // Осі y₁, y₂, y₃.
    const axisColor = css('--axis');
    const O: V3 = [0, 0, 0];
    const L = 4.2;
    ([[L, 0, 0], [0, L, 0], [0, 0, L]] as V3[]).forEach((e, i) => {
      arrow(O, e, axisColor, 1.2);
      label(e, ['y₁', 'y₂', 'y₃'][i], css('--muted'), 4, 4);
    });

    // Площина стовпців: ортонормований базис (Грам — Шмідт) і латка навколо ŷ/2.
    const accent = css('--accent');
    const e1 = mul(1 / norm(u), u);
    const vPerp = sub(v, mul(dot(v, e1), e1));
    const degenerate = norm(vPerp) < 1e-6;
    if (!degenerate) {
      const e2 = mul(1 / norm(vPerp), vPerp);
      const mid = mul(0.5, yHat ?? cur);
      const c0 = add(mul(dot(mid, e1), e1), mul(dot(mid, e2), e2));
      const R = Math.max(norm(yHat ?? cur) / 2 + 1.2, 2.2);
      const corner = (s1: number, s2: number) => add(c0, add(mul(s1 * R, e1), mul(s2 * R, e2)));
      const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      cs.forEach((c, i) => {
        const [x, y_] = P(c);
        if (i === 0) ctx.moveTo(x, y_);
        else ctx.lineTo(x, y_);
      });
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.28;
      for (let k = -4; k <= 4; k++) {
        line(corner(k / 4, -1), corner(k / 4, 1), accent, 1);
        line(corner(-1, k / 4), corner(1, k / 4), accent, 1);
      }
      ctx.globalAlpha = 1;
    }

    // Стовпці A.
    arrow(O, u, css('--ml'), 2.5);
    label(u, '1', css('--ml'));
    arrow(O, v, css('--warn'), 2.5);
    label(v, 'x', css('--warn'));

    // Поточна точка площини Aθ, найближча точка ŷ і вектор y.
    if (yHat) dotAt(yHat, css('--good'), 4.5);
    arrow(O, cur, accent, 2);
    dotAt(cur, accent, 5.5);
    label(cur, 'Aθ', accent, 8, 16);
    const text = css('--text');
    arrow(O, y, text, 2.6);
    label(y, 'y', text);
    line(cur, y, css('--bad'), 2.5, [6, 4]);
    label(mul(0.5, add(cur, y)), 'r', css('--bad'), 6, 0);

    // Прямий кут, коли Aθ збігається з проєкцією.
    const r = sub(y, cur);
    if (yHat && norm(sub(cur, yHat)) < 0.01 && norm(r) > 0.05) {
      const e1r = mul(1 / norm(r), r);
      const inPlane = norm(cur) > 1e-6 ? mul(1 / norm(cur), cur) : mul(1 / norm(u), u);
      const k = Math.min(0.18, norm(r) * 0.22);
      const p1 = add(cur, mul(k, e1r));
      const p2 = add(add(cur, mul(k, e1r)), mul(-k, inPlane));
      const p3 = add(cur, mul(-k, inPlane));
      line(p1, p2, css('--bad'), 1.5);
      line(p2, p3, css('--bad'), 1.5);
    }
  }

  function render() {
    const { u, v, y, cur, yHat, opt } = geometry();
    if (!oriented) {
      // Початковий ракурс: площину видно навскіс, а її нормаль (напрямок нев'язки) — збоку.
      // Шукаємо азимут, за якого одинична нормаль на екрані має довжину ≈ 0,8:
      // тоді нев'язку добре видно, а площина не стоїть ні ребром, ні фронтально.
      const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nn = mul(1 / (norm(n) || 1), n);
      let best = Infinity;
      for (let k = 0; k < 144; k++) {
        const t = (2 * Math.PI * k) / 144;
        const X = nn[0] * Math.cos(t) - nn[1] * Math.sin(t);
        const Y = nn[0] * Math.sin(t) + nn[1] * Math.cos(t);
        const len = Math.hypot(X, Y * Math.sin(el) - nn[2] * Math.cos(el));
        // Друга складова віддає перевагу ракурсам, де вісь y₁ дивиться на глядача (як у підручниках).
        const score = Math.abs(len - (zoom.checked ? 0.97 : 0.9)) + 0.05 * Math.abs(Math.sin(t + 0.8));
        if (score < best) [best, az] = [score, t];
      }
      oriented = true;
    }
    const r = sub(y, cur);

    // Графік даних.
    setAttrs(fit, { x1: plot.sx(X[0]), y1: plot.sy(a + b * X[0]), x2: plot.sx(X[1]), y2: plot.sy(a + b * X[1]) });
    res.replaceChildren();
    pts.forEach((p, i) => {
      const yl = a + b * p.x;
      if (Math.abs(p.y - yl) > 0.004) {
        svgEl('line', { x1: plot.sx(p.x), x2: plot.sx(p.x), y1: plot.sy(p.y), y2: plot.sy(yl), stroke: 'var(--bad)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, res);
      }
      handles[i].setAttribute('transform', `translate(${plot.sx(p.x)},${plot.sy(p.y)})`);
    });

    sliderA.value = String(a);
    sliderB.value = String(b);
    outA.textContent = fmt(a, 2);
    outB.textContent = fmt(b, 2);
    tex(
      eqOut,
      (eqOut.clientWidth < 560 ? '\\begin{gathered}' : '') +
      `A\\boldsymbol\\theta = ${tn(a, 2)}\\begin{pmatrix}1\\\\1\\\\1\\end{pmatrix} ${b < 0 ? '-' : '+'} ${tn(Math.abs(b), 2)}\\begin{pmatrix}${v.map((t) => tn(t, 1)).join('\\\\')}\\end{pmatrix} = \\begin{pmatrix}${cur.map((t) => tn(t, 2)).join('\\\\')}\\end{pmatrix}${eqOut.clientWidth < 560 ? '\\\\[4pt]' : ',\\quad '}\\mathbf y = \\begin{pmatrix}${y.map((t) => tn(t, 1)).join('\\\\')}\\end{pmatrix}` +
        (eqOut.clientWidth < 560 ? '\\end{gathered}' : ''),
      true,
    );

    const dist = norm(r);
    const rows = [
      ['Відстань |y − Aθ| = √S', fmt(dist, 3)],
      ['r · 1 = Σ rᵢ', fmt(dot(r, u), 3, true)],
      ['r · x = Σ xᵢrᵢ', fmt(dot(r, v), 3, true)],
    ];
    if (yHat) {
      const toFoot = norm(sub(y, yHat));
      const along = norm(sub(yHat, cur));
      rows.push(['Піфагор: |y − ŷ|² + |ŷ − Aθ|²', `${fmt(toFoot ** 2, 3)} + ${fmt(along ** 2, 3)} = ${fmt(dist ** 2, 3)}`]);
    }
    numsOut.innerHTML = rows.map(([k, v_]) => `<tr><td>${k}</td><td class="num">${v_}</td></tr>`).join('');

    if (!opt) {
      status.className = 'status warn';
      status.innerHTML = 'Усі x однакові: вектор x паралельний вектору 1, і «площина» сплющилась у пряму. Проєкція існує, але a і b визначити однозначно не можна.';
    } else if (norm(sub(cur, yHat!)) < 0.01) {
      status.className = 'status success';
      status.innerHTML = norm(r) < 0.01
        ? '<b>y лежить у площині</b>: точки на одній прямій, нев\'язка нульова.'
        : '<b>Це проєкція.</b> Червоний відрізок перпендикулярний площині: r · 1 = 0 і r · x = 0. Коротшого шляху від y до площини немає.';
    } else {
      status.className = 'status';
      status.innerHTML = 'Рухайте a і b: синя точка ковзає площиною. Червоний відрізок — нев\'язка, його довжина дорівнює √S. Найкоротшим він стане, коли стане перпендикулярним площині.';
    }
    draw3d();
    listeners.forEach((f) => f(pts));
  }

  sliderA.addEventListener('input', () => {
    a = Number(sliderA.value);
    render();
  });
  sliderB.addEventListener('input', () => {
    b = Number(sliderB.value);
    render();
  });
  $('[data-action="project"]', root).addEventListener('click', () => {
    const { opt } = geometry();
    if (!opt) return;
    const [fa, fb] = [a, b];
    if (!zoom.checked) {
      zoom.checked = true;
      oriented = false;
    }
    animate(800, (k) => {
      a = fa + (opt[0] - fa) * k;
      b = fb + (opt[1] - fb) * k;
      render();
    });
  });

  // Обертання сцени.
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    az += (e.clientX - drag.x) * 0.01;
    el = clamp(el - (e.clientY - drag.y) * 0.008, 0.1, 1.55);
    drag = { x: e.clientX, y: e.clientY };
    draw3d();
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('pointercancel', () => (drag = null));
  zoom.addEventListener('change', () => {
    // Наближення показуємо майже з ребра площини: тоді прямий кут між r і площиною очевидний.
    oriented = false;
    render();
  });
  window.addEventListener('resize', draw3d);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw3d);

  render();
}

/* =====================================================================
   5.4. Матриця проєкції P («hat matrix») для поточних точок
   ===================================================================== */
function makeHat(): Listener {
  const root = $('#w-hat');
  const matOut = $('[data-out="P"]', root);
  const levOut = $('[data-out="lev"]', root);
  const checkOut = $('[data-out="check"]', root);
  return (pts) => {
    const q = lineQuadratic(pts);
    const det = q.M[0][0] * q.M[1][1] - q.M[0][1] ** 2;
    if (Math.abs(det) < 1e-9) {
      matOut.textContent = 'Усі x однакові — матриця AᵀA вироджена.';
      levOut.textContent = '';
      checkOut.textContent = '';
      return;
    }
    // P = A (AᵀA)⁻¹ Aᵀ, рядки A — (1, xᵢ).
    const inv = [
      [q.M[1][1] / det, -q.M[0][1] / det],
      [-q.M[1][0] / det, q.M[0][0] / det],
    ];
    const A = pts.map((p) => [1, p.x]);
    const P = A.map((ri) => A.map((rj) => ri[0] * (inv[0][0] * rj[0] + inv[0][1] * rj[1]) + ri[1] * (inv[1][0] * rj[0] + inv[1][1] * rj[1])));
    const y = pts.map((p) => p.y);
    const yHat = P.map((row) => dot(row, y));
    const narrow = matOut.clientWidth < 560;
    const pTex = `P = \\begin{pmatrix}${P.map((row) => row.map((t) => tn(t, 3)).join(' & ')).join('\\\\')}\\end{pmatrix}`;
    const yTex = `\\hat{\\mathbf y} = P\\mathbf y = \\begin{pmatrix}${yHat.map((t) => tn(t, 3)).join('\\\\')}\\end{pmatrix}`;
    tex(matOut, narrow ? `\\begin{gathered}${pTex}\\\\[6pt]${yTex}\\end{gathered}` : `${pTex},\\qquad ${yTex}`, true);
    const P2 = P.map((row, i) => row.map((_, j) => dot(row, P.map((r) => r[j])) - P[i][j]));
    const err = Math.max(...P2.flat().map(Math.abs));
    const trace = P[0][0] + P[1][1] + P[2][2];
    levOut.innerHTML = P.map(
      (row, i) =>
        `<div class="lev-row"><span>точка ${i + 1} (x = ${fmt(pts[i].x, 1)})</span><div class="lev-track"><div class="lev-bar" style="width:${clamp(row[i], 0, 1) * 100}%"></div></div><span class="num">${fmt(row[i], 3)}</span></div>`,
    ).join('');
    checkOut.innerHTML = `Слід P (сума важелів) = <b class="num">${fmt(trace, 3)}</b> — рівно стільки, скільки параметрів. Перевірка P² = P: найбільше відхилення <span class="num">${err.toExponential(1)}</span>.`;
  };
}

initProjection([makeHat()]);
