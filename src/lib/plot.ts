// Мінімальний SVG-«движок» для інтерактивних графіків:
// перетворення координат, сітка з осями та перетягування елементів.

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  setAttrs(node, attrs);
  parent?.appendChild(node);
  return node;
}

export function setAttrs(node: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

export interface PlotOptions {
  width: number;
  height: number;
  x: [number, number];
  y: [number, number];
  margin?: { top: number; right: number; bottom: number; left: number };
  xTicks?: number[];
  yTicks?: number[];
  xLabel?: string;
  yLabel?: string;
  ariaLabel?: string;
}

export interface Plot {
  svg: SVGSVGElement;
  /** Шар для даних (усе, що над сіткою). */
  layer: SVGGElement;
  sx(x: number): number;
  sy(y: number): number;
  /** Зворотні перетворення: пікселі SVG → дані. */
  ix(px: number): number;
  iy(py: number): number;
  opts: Required<Pick<PlotOptions, 'width' | 'height' | 'x' | 'y'>> & {
    margin: NonNullable<PlotOptions['margin']>;
  };
}

export function createPlot(container: Element, o: PlotOptions): Plot {
  const margin = o.margin ?? { top: 16, right: 16, bottom: 36, left: 40 };
  const { width, height } = o;
  const [x0, x1] = o.x;
  const [y0, y1] = o.y;
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  const sx = (x: number) => margin.left + ((x - x0) / (x1 - x0)) * iw;
  const sy = (y: number) => margin.top + (1 - (y - y0) / (y1 - y0)) * ih;
  const ix = (px: number) => x0 + ((px - margin.left) / iw) * (x1 - x0);
  const iy = (py: number) => y0 + (1 - (py - margin.top) / ih) * (y1 - y0);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': o.ariaLabel ?? '',
  });
  container.appendChild(svg);

  // Обрізання, щоб лінії не вилазили за область графіка.
  const clipId = `clip-${Math.random().toString(36).slice(2, 9)}`;
  const defs = svgEl('defs', {}, svg);
  const clip = svgEl('clipPath', { id: clipId }, defs);
  svgEl('rect', { x: margin.left, y: margin.top, width: iw, height: ih }, clip);

  const grid = svgEl('g', { class: 'plot-grid' }, svg);
  const axes = svgEl('g', { class: 'plot-axis' }, svg);

  for (const t of o.xTicks ?? []) {
    svgEl('line', { x1: sx(t), x2: sx(t), y1: margin.top, y2: margin.top + ih }, grid);
    const label = svgEl('text', { x: sx(t), y: margin.top + ih + 18, 'text-anchor': 'middle' }, axes);
    label.textContent = formatNumber(t, decimalsOf(t));
  }
  for (const t of o.yTicks ?? []) {
    svgEl('line', { x1: margin.left, x2: margin.left + iw, y1: sy(t), y2: sy(t) }, grid);
    const label = svgEl('text', { x: margin.left - 8, y: sy(t) + 4, 'text-anchor': 'end' }, axes);
    label.textContent = formatNumber(t, decimalsOf(t));
  }

  // Осі координат, якщо нуль потрапляє в область, інакше — рамка знизу/зліва.
  const axisY = y0 <= 0 && y1 >= 0 ? sy(0) : margin.top + ih;
  const axisX = x0 <= 0 && x1 >= 0 ? sx(0) : margin.left;
  svgEl('line', { x1: margin.left, x2: margin.left + iw, y1: axisY, y2: axisY }, axes);
  svgEl('line', { x1: axisX, x2: axisX, y1: margin.top, y2: margin.top + ih }, axes);

  if (o.xLabel) {
    const t = svgEl('text', { x: margin.left + iw - 4, y: axisY - 6, 'text-anchor': 'end', class: 'plot-axis-title' }, svg);
    t.textContent = o.xLabel;
  }
  if (o.yLabel) {
    const t = svgEl('text', { x: axisX + 8, y: margin.top + 12, class: 'plot-axis-title' }, svg);
    t.textContent = o.yLabel;
  }

  const layer = svgEl('g', { 'clip-path': `url(#${clipId})` }, svg);

  return { svg, layer, sx, sy, ix, iy, opts: { width, height, x: o.x, y: o.y, margin } };
}

/** Позиція вказівника у координатах viewBox. */
export function pointerToSvg(svg: SVGSVGElement, e: PointerEvent): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/**
 * Робить елемент перетягуваним. Колбек отримує координати у пікселях viewBox,
 * а перетворення в дані та обмеження виконує сам виклик.
 */
export function makeDraggable(
  target: SVGElement,
  svg: SVGSVGElement,
  onMove: (px: number, py: number) => void,
  onEnd?: () => void,
): void {
  let active = false;
  target.addEventListener('pointerdown', (e) => {
    active = true;
    target.setPointerCapture(e.pointerId);
    target.classList.add('dragging');
    e.preventDefault();
  });
  target.addEventListener('pointermove', (e) => {
    if (!active) return;
    const p = pointerToSvg(svg, e);
    onMove(p.x, p.y);
  });
  const stop = (e: PointerEvent) => {
    if (!active) return;
    active = false;
    target.releasePointerCapture(e.pointerId);
    target.classList.remove('dragging');
    onEnd?.();
  };
  target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const snap = (v: number, step: number) => Math.round(v / step) * step;

function decimalsOf(v: number): number {
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Число в українському форматі: десяткова кома, справжній мінус, без «−0». */
export function formatNumber(v: number, digits = 2, signed = false): string {
  let s = v.toFixed(digits);
  if (Number(s) === 0) s = (0).toFixed(digits);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  s = s.replace('.', ',');
  if (neg) return '−' + s;
  return signed && Number(v.toFixed(digits)) > 0 ? '+' + s : s;
}

/** Колір нев'язки: зелений → помаранчевий → червоний. */
export function residualColor(r: number, scale: number): string {
  const t = clamp(Math.abs(r) / scale, 0, 1);
  // Інтерполяція відтінку в HSL: 140° (зелений) → 5° (червоний).
  const hue = 140 - 135 * t;
  return `hsl(${hue.toFixed(0)} 70% 42%)`;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Плавна анімація значення (або миттєво, якщо користувач вимкнув анімації). */
export function animate(duration: number, step: (t: number) => void): void {
  if (prefersReducedMotion()) {
    step(1);
    return;
  }
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    step(eased);
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
