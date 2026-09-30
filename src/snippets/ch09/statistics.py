import numpy as np

rng = np.random.default_rng(0)
n, M = 9, 20000                     # 9 вимірів в експерименті, 20 000 експериментів

# Три види шуму з однаковим стандартним відхиленням 1.
noises = {
    "Гаусс":    lambda size: rng.normal(0, 1, size),
    "Лаплас":   lambda size: rng.laplace(0, 1 / np.sqrt(2), size),
    "рівномірний": lambda size: rng.uniform(-np.sqrt(3), np.sqrt(3), size),
}
for name, noise in noises.items():
    e = noise((M, n))                                   # справжнє значення = 0
    est = {"середнє": e.mean(1), "медіана": np.median(e, 1),
           "середина розмаху": (e.min(1) + e.max(1)) / 2}
    spread = {k: v.std() for k, v in est.items()}
    best = min(spread, key=spread.get)
    print(f"{name:12s}", "  ".join(f"{k} {s:.3f}" for k, s in spread.items()), f" → найкраще: {best}")

# Точність параметрів прямої: теорія σ²(AᵀA)⁻¹ проти повторних експериментів.
x = np.linspace(0, 5, 12)
A = np.column_stack([np.ones_like(x), x])
sigma = 0.3
cov_theory = sigma**2 * np.linalg.inv(A.T @ A)
thetas = np.array([np.linalg.lstsq(A, 1 + 0.5 * x + rng.normal(0, sigma, x.size), rcond=None)[0]
                   for _ in range(5000)])
print("σ(a), σ(b) за формулою:   ", np.sqrt(np.diag(cov_theory)).round(4))
print("σ(a), σ(b) з експериментів:", thetas.std(0).round(4))
print("кореляція a і b:", np.corrcoef(thetas.T)[0, 1].round(3),
      " (формула:", (cov_theory[0, 1] / np.sqrt(cov_theory[0, 0] * cov_theory[1, 1])).round(3), ")")

# Незміщена оцінка σ²: ділимо на n − k, а не на n.
S = []
for _ in range(20000):
    y = 1 + 0.5 * x + rng.normal(0, sigma, x.size)
    th = np.linalg.lstsq(A, y, rcond=None)[0]
    S.append(((y - A @ th) ** 2).sum())
S = np.array(S)
print(f"σ² = {sigma**2:.4f};  середнє S/n = {np.mean(S / x.size):.4f},  середнє S/(n−k) = {np.mean(S / (x.size - 2)):.4f}")
