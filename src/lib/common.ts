// Спільна ініціалізація для всіх сторінок: стилі, формули, вправи.
import 'katex/dist/katex.min.css';
import '../styles.css';
import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';

export function renderMath(root: HTMLElement = document.body): void {
  renderMathInElement(root, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
    ],
    ignoredClasses: ['code-tabs', 'no-math'],
    throwOnError: false,
  });
}

/** Рендер однієї формули в елемент (для динамічних підписів). */
export function tex(target: HTMLElement, source: string, displayMode = false): void {
  katex.render(source, target, { throwOnError: false, displayMode });
}

/**
 * Прості вправи: `<div class="quiz" data-answer="1" data-tolerance="0">`
 * з полем введення, кнопкою та порожнім `.feedback`.
 */
export function initQuizzes(): void {
  document.querySelectorAll<HTMLElement>('.quiz[data-answer]').forEach((quiz) => {
    const input = quiz.querySelector('input');
    const button = quiz.querySelector('button');
    const feedback = quiz.querySelector<HTMLElement>('.feedback');
    if (!input || !button || !feedback) return;
    const answer = Number(quiz.dataset.answer);
    const tol = Number(quiz.dataset.tolerance ?? 0);
    const check = () => {
      const v = Number(input.value.replace(',', '.').trim());
      const ok = input.value.trim() !== '' && Math.abs(v - answer) <= tol;
      feedback.className = `feedback ${ok ? 'ok' : 'no'}`;
      feedback.textContent = ok
        ? quiz.dataset.ok ?? 'Правильно!'
        : quiz.dataset.no ?? 'Ще не так — спробуйте ще раз.';
    };
    button.addEventListener('click', check);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') check();
    });
  });
}
