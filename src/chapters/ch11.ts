// Розділ 11. Підсумок: рекурсивний МНК і фільтр Калмана, вибір методу, наскрізні задачі.
import { renderMath, initQuizzes } from '../lib/common';
import { initCodeTabs } from '../lib/code';
import { createPlot, formatNumber as fmt, isCompact, svgEl } from '../lib/plot';
import { gaussian, seededRandom } from '../lib/linalg';

import summaryPy from '../snippets/ch11/summary.py?raw';
import summaryJs from '../snippets/ch11/summary.js?raw';

renderMath();
initQuizzes();
initCodeTabs({ summary: { py: summaryPy, js: summaryJs } });

function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Не знайдено ${sel}`);
  return node;
}

/* =====================================================================
   11.2. Виміри надходять по одному: рекурсивний МНК і фільтр Калмана
   ===================================================================== */
type Scenario = 'step' | 'drift' | 'const';

const SCENARIOS: Record<Scenario, { truth: (t: number) => number; calm: [number, number]; change: [number, number] | null; text: string }> = {
  step: { truth: (t) => (t < 60 ? 10 : 12), calm: [0, 60], change: [70, 120], text: 'стрибок на кроці 60' },
  drift: { truth: (t) => (t < 40 ? 10 : 10 + (3 * (t - 40)) / 80), calm: [0, 40], change: [50, 120], text: 'повільний дрейф після кроку 40' },
  const: { truth: () => 10, calm: [0, 120], change: null, text: 'величина стала' },
};

function initKalman(): void {
  const root = $('#w-kalman');
  const box = $('.plot-kalman', root);
  const qIn = $<HTMLInputElement>('input[name="q"]', root);
  const qOut = $('output[for="k-q"]', root);
  const status = $('[data-out="status"]', root);
  const scenarioBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-scenario]')];
  const compact = isCompact(box);
  const T = 120;
  const R = 1;

  const plot = createPlot(box, {
    width: compact ? 420 : 760,
    height: compact ? 340 : 320,
    x: [0, T],
    y: [6, 15],
    margin: { top: 14, right: 14, bottom: 34, left: 40 },
    xTicks: compact ? [0, 30, 60, 90, 120] : [0, 20, 40, 60, 80, 100, 120],
    yTicks: [6, 8, 10, 12, 14],
    xLabel: 'крок t',
    ariaLabel: 'Виміри, справжнє значення й оцінка фільтра Калмана',
  });
  const band = svgEl('path', { fill: 'var(--accent)', 'fill-opacity': 0.15, stroke: 'none' }, plot.layer);
  const dotsG = svgEl('g', {}, plot.layer);
  const truthLine = svgEl('path', { fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, plot.layer);
  const estLine = svgEl('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, plot.layer);

  let scenario: Scenario = 'step';
  let seed = 3;
  let z: number[] = [];
  let truth: number[] = [];
  let shown = T; // скільки вимірів уже «надійшло» (для анімації)
  let timer = 0;

  const qValue = () => (Number(qIn.value) <= -4 ? 0 : 10 ** Number(qIn.value));

  function makeData() {
    const rnd = seededRandom(seed);
    truth = Array.from({ length: T }, (_, t) => SCENARIOS[scenario].truth(t));
    z = truth.map((v) => v + Math.sqrt(R) * gaussian(rnd));
    dotsG.replaceChildren();
    z.forEach((v, t) => {
      svgEl('circle', { cx: plot.sx(t), cy: plot.sy(Math.max(6, Math.min(15, v))), r: compact ? 2.6 : 2.4, fill: 'var(--muted)', 'fill-opacity': 0.55, 'data-t': t }, dotsG);
    });
    truthLine.setAttribute('d', truth.map((v, t) => `${t ? 'L' : 'M'}${plot.sx(t)},${plot.sy(v)}`).join(''));
  }

  function filter(q: number) {
    let x = z[0];
    let P = R;
    const est = [x];
    const vars = [P];
    const gains = [1];
    for (let t = 1; t < T; t++) {
      P += q; // прогноз: величина могла змінитися
      const K = P / (P + R);
      x += K * (z[t] - x); // уточнення новим виміром
      P *= 1 - K;
      est.push(x);
      vars.push(P);
      gains.push(K);
    }
    return { est, vars, gains };
  }

  const lastN = (m: number) => {
    const d = m % 10;
    const teen = m % 100 >= 11 && m % 100 <= 14;
    if (d === 1 && !teen) return `${m} останній вимір`;
    if (d >= 2 && d <= 4 && !teen) return `${m} останні виміри`;
    return `${m} останніх вимірів`;
  };

  const rmse = (est: number[], [a, b]: [number, number]) => {
    let s = 0;
    for (let t = a; t < b; t++) s += (est[t] - truth[t]) ** 2;
    return Math.sqrt(s / (b - a));
  };

  function draw() {
    const q = qValue();
    qOut.textContent = q === 0 ? '0' : q >= 0.01 ? fmt(q, 2) : `${fmt(q * 1000, 1)}·10⁻³`;
    const { est, vars, gains } = filter(q);
    const n = Math.max(1, shown);
    const clampY = (v: number) => plot.sy(Math.max(6, Math.min(15, v)));
    estLine.setAttribute('d', est.slice(0, n).map((v, t) => `${t ? 'L' : 'M'}${plot.sx(t)},${clampY(v)}`).join(''));
    const up = est.slice(0, n).map((v, t) => `${plot.sx(t)},${clampY(v + 2 * Math.sqrt(vars[t]))}`);
    const down = est.slice(0, n).map((v, t) => `${plot.sx(t)},${clampY(v - 2 * Math.sqrt(vars[t]))}`).reverse();
    band.setAttribute('d', `M${up.join('L')}L${down.join('L')}Z`);
    dotsG.querySelectorAll<SVGCircleElement>('circle').forEach((c, t) => c.setAttribute('visibility', t < n ? 'visible' : 'hidden'));
    if (shown < T) {
      status.className = 'status info';
      status.textContent = `Надійшло вимірів: ${shown}. Оцінка ${fmt(est[n - 1], 2)}, коефіцієнт підсилення K = ${fmt(gains[n - 1], 3)}.`;
      return;
    }
    const sc = SCENARIOS[scenario];
    const Kend = gains[T - 1];
    const parts = [
      q === 0
        ? `q = 0: це рекурсивний МНК, тобто просто середнє всіх вимірів. Останній вимір має вагу K = 1/${T} ≈ ${fmt(Kend, 3)}.`
        : `Останній вимір має вагу K = ${fmt(Kend, 3)}: фільтр «пам'ятає» приблизно ${lastN(Math.round(1 / Kend))}.`,
      sc.change
        ? `Похибка оцінки (RMSE): на спокійній ділянці ${fmt(rmse(est, sc.calm), 3)}, після зміни ${fmt(rmse(est, sc.change), 3)}.`
        : `Похибка оцінки (RMSE): ${fmt(rmse(est, sc.calm), 3)}.`,
    ];
    status.textContent = parts.join(' ');
    const lag = sc.change && rmse(est, sc.change) > 0.6;
    status.className = `status ${lag ? 'warn' : 'success'}`;
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
  }

  qIn.addEventListener('input', () => {
    stop();
    shown = T;
    draw();
  });
  scenarioBtns.forEach((b) =>
    b.addEventListener('click', () => {
      stop();
      scenario = b.dataset.scenario as Scenario;
      scenarioBtns.forEach((o) => o.classList.toggle('active', o === b));
      shown = T;
      makeData();
      draw();
    }),
  );
  root.querySelector('[data-action="noise"]')?.addEventListener('click', () => {
    stop();
    seed += 1;
    shown = T;
    makeData();
    draw();
  });
  root.querySelector('[data-action="play"]')?.addEventListener('click', () => {
    stop();
    shown = 1;
    draw();
    timer = window.setInterval(() => {
      shown += 1;
      draw();
      if (shown >= T) stop();
    }, 45);
  });

  makeData();
  draw();
}

/* =====================================================================
   11.1. Який метод обрати: інтерактивна «блок-схема»
   ===================================================================== */
interface Rule {
  key: string;
  html: string;
}

const BASE_START: Rule[] = [
  { key: 'base', html: 'Скласти модель, матрицю $A$ і вектор вимірів $\\mathbf y$. Перевірити, що вимірів більше, ніж невідомих: $r = n - k &gt; 0$ (<a href="./01-overdetermined.html">розділ 1</a>).' },
];
const RULES: Rule[] = [
  { key: 'nonlinear', html: '<strong>Нелінійна модель</strong> → лінеаризувати й ітерувати: Гаусс — Ньютон, за проблем зі збіжністю — Левенберг — Марквардт (<a href="./08-geodesy.html">розділ 8</a>). Потрібне добре початкове наближення.' },
  { key: 'weights', html: '<strong>Різна точність</strong> → ваги $p_i = 1/\\sigma_i^2$, розв\'язувати $A^\\mathsf{T}PA\\,\\boldsymbol\\theta = A^\\mathsf{T}P\\mathbf y$ або масштабувати рядки на $\\sqrt{p_i}$ (<a href="./08-geodesy.html">розділ 8</a>).' },
  { key: 'illcond', html: '<strong>Погана обумовленість або багато параметрів</strong> → центрувати й масштабувати ознаки, QR/SVD замість $(A^\\mathsf{T}A)^{-1}$ (<a href="./06-programming.html">розділ 6</a>); ridge з λ, підібраним на валідації (<a href="./07-beyond-lines.html">розділ 7</a>, <a href="./10-machine-learning.html">розділ 10</a>).' },
  { key: 'stream', html: '<strong>Дані надходять потоком або величина змінюється</strong> → рекурсивний МНК, фільтр Калмана (розділ 11.2).' },
  { key: 'huge', html: '<strong>Мільйони невідомих</strong> → розріджені матриці, ітераційні методи (CG, LSQR), Ceres / g2o / GTSAM (розділ 11.3); градієнтні методи, якщо навіть це задорого (<a href="./10-machine-learning.html">розділ 10</a>).' },
];
const BASE_SOLVE: Rule = { key: 'solve', html: 'Розв\'язати через <code>lstsq</code> (QR/SVD), а не через обернення $A^\\mathsf{T}A$ (<a href="./06-programming.html">розділ 6</a>).' };
const OUTLIER_RULES: Rule[] = [
  { key: 'outliers', html: '<strong>Можливі промахи</strong> → після розв\'язання тест Баарди: викидати найбільший $|w_i| &gt; 3{,}29$ по одному й перераховувати. Якщо промахів багато — Губер (IRLS) або RANSAC (<a href="./10-machine-learning.html">розділ 10</a>).' },
];
const BASE_END: Rule[] = [
  { key: 'check', html: 'Поправки $\\mathbf v$, $\\hat\\sigma_0 = \\sqrt{\\mathbf v^\\mathsf{T}P\\mathbf v / r}$, точність $\\sigma_0\\sqrt{Q_{jj}}$ і еліпси похибок (<a href="./09-statistics.html">розділ 9</a>). Подивитися на графік поправок: чи немає в них закономірності (<a href="./07-beyond-lines.html">розділ 7</a>).' },
];

function initChooser(): void {
  const root = $('#w-chooser');
  const boxes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const out = $('[data-out="recipe"]', root);

  function update() {
    const on = new Set(boxes.filter((b) => b.checked).map((b) => b.name));
    const steps: Rule[] = [...BASE_START];
    for (const r of RULES) if (on.has(r.key)) steps.push(r);
    steps.push(BASE_SOLVE);
    if (on.has('outliers')) steps.push(...OUTLIER_RULES);
    steps.push(...BASE_END);
    out.innerHTML = steps.map((s) => `<li class="${s.key === 'base' || s.key === 'solve' || s.key === 'check' ? '' : 'extra'}">${s.html}</li>`).join('');
    renderMath(out);
  }
  boxes.forEach((b) => b.addEventListener('change', update));
  update();
}

/* =====================================================================
   11.4. Лічильник розв'язаних задач
   ===================================================================== */
function initProgress(): void {
  const root = $('#s-tasks-list');
  const out = $('[data-out="progress"]');
  const quizzes = [...root.querySelectorAll<HTMLElement>('.quiz')];
  const solved = new Set<number>();
  const update = () => {
    out.textContent = `Розв'язано: ${solved.size} з ${quizzes.length}${solved.size === quizzes.length ? ' 🎉 Ви пройшли весь підручник!' : ''}`;
    out.className = `status ${solved.size === quizzes.length ? 'success' : 'info'}`;
  };
  quizzes.forEach((quiz, i) => {
    const fb = quiz.querySelector('.feedback');
    if (!fb) return;
    new MutationObserver(() => {
      if (fb.classList.contains('ok')) solved.add(i);
      update();
    }).observe(fb, { attributes: true, attributeFilter: ['class'] });
  });
  update();
}

initChooser();
initKalman();
initProgress();
