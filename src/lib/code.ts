// Блоки коду з вкладками Python / JavaScript.
// JavaScript-варіант можна виконати прямо на сторінці.

export interface Snippet {
  py: string;
  js: string;
}

const KEYWORDS: Record<'py' | 'js', string[]> = {
  py: ['import', 'from', 'as', 'for', 'in', 'if', 'else', 'elif', 'def', 'return', 'print', 'range', 'not', 'and', 'or', 'None', 'True', 'False', 'lambda', 'with'],
  js: ['const', 'let', 'var', 'for', 'of', 'in', 'if', 'else', 'function', 'return', 'new', 'null', 'true', 'false', 'undefined', 'console'],
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Дуже простий підсвічувач: коментарі, рядки, числа, ключові слова. */
export function highlight(code: string, lang: 'py' | 'js'): string {
  const comment = lang === 'py' ? '#[^\\n]*' : '\\/\\/[^\\n]*';
  const re = new RegExp(
    `(${comment})|(f?"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d+(?:\\.\\d+)?(?:e-?\\d+)?\\b)|(\\b[A-Za-z_]\\w*\\b)`,
    'g',
  );
  const kw = new Set(KEYWORDS[lang]);
  let out = '';
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    out += escapeHtml(code.slice(last, i));
    const [text, c, s, n, w] = m;
    if (c) out += `<span class="tok-comment">${escapeHtml(text)}</span>`;
    else if (s) out += `<span class="tok-string">${escapeHtml(text)}</span>`;
    else if (n) out += `<span class="tok-number">${text}</span>`;
    else if (w && kw.has(w)) out += `<span class="tok-keyword">${text}</span>`;
    else out += escapeHtml(text);
    last = i + text.length;
  }
  return out + escapeHtml(code.slice(last));
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  if (Array.isArray(v)) return '[' + v.map(formatValue).join(', ') + ']';
  return JSON.stringify(v);
}

/** Виконує JS-фрагмент із перехопленим console.log і повертає текстовий вивід. */
function runJs(code: string): string {
  const lines: string[] = [];
  const fakeConsole = { log: (...args: unknown[]) => lines.push(args.map(formatValue).join(' ')) };
  try {
    new Function('console', code)(fakeConsole);
  } catch (err) {
    lines.push(`Помилка: ${(err as Error).message}`);
  }
  return lines.join('\n');
}

/**
 * Знаходить на сторінці всі `<div class="code-tabs" data-snippet="…">`
 * і заповнює їх фрагментами коду з переданого словника.
 */
export function initCodeTabs(snippets: Record<string, Snippet>): void {
  document.querySelectorAll<HTMLElement>('.code-tabs[data-snippet]').forEach((box) => {
    const snippet = snippets[box.dataset.snippet ?? ''];
    if (!snippet) return;
    const langs = [
      { id: 'py' as const, label: 'Python', code: snippet.py.trimEnd() },
      { id: 'js' as const, label: 'JavaScript', code: snippet.js.trimEnd() },
    ];

    const bar = document.createElement('div');
    bar.className = 'tab-bar';
    bar.setAttribute('role', 'tablist');
    const actions = document.createElement('div');
    actions.className = 'tab-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Копіювати';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'primary';
    runBtn.textContent = '▶ Запустити';
    runBtn.title = 'Виконати JavaScript-код прямо в браузері';
    actions.append(copyBtn, runBtn);

    const output = document.createElement('pre');
    output.className = 'run-output';
    output.hidden = true;

    const pres = langs.map((l) => {
      const pre = document.createElement('pre');
      pre.setAttribute('role', 'tabpanel');
      pre.innerHTML = `<code>${highlight(l.code, l.id)}</code>`;
      return pre;
    });

    let current = 0;
    const tabs = langs.map((l, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.textContent = l.label;
      b.addEventListener('click', () => select(i));
      return b;
    });

    function select(i: number) {
      current = i;
      tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
      pres.forEach((p, j) => (p.hidden = i !== j));
      runBtn.hidden = langs[i].id !== 'js';
      output.hidden = langs[i].id !== 'js' || output.textContent === '';
    }

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(langs[current].code);
        copyBtn.textContent = 'Скопійовано ✓';
      } catch {
        copyBtn.textContent = 'Не вдалося';
      }
      setTimeout(() => (copyBtn.textContent = 'Копіювати'), 1500);
    });

    runBtn.addEventListener('click', () => {
      output.textContent = runJs(langs[1].code);
      output.hidden = false;
    });

    bar.append(...tabs, actions);
    box.replaceChildren(bar, ...pres, output);
    select(0);
  });
}
