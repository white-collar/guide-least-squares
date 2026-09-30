import numpy as np

x = np.array([1.0, 2.0, 3.0])
y = np.array([1.0, 2.0, 2.0])
A = np.column_stack([np.ones_like(x), x])     # стовпці: 1 і x

# Проєкція y на площину стовпців A.
theta = np.linalg.solve(A.T @ A, A.T @ y)      # нормальні рівняння
y_hat = A @ theta                               # найближча точка площини
r = y - y_hat                                   # перпендикуляр
print("θ =", theta, " ŷ =", y_hat, " r =", r)

# Перпендикулярність: r ортогональний кожному стовпцю A (це і є нормальні рівняння).
print("Aᵀr =", A.T @ r)

# Теорема Піфагора: |y|² = |ŷ|² + |r|².
print(f"|y|² = {y @ y:.4f},  |ŷ|² + |r|² = {y_hat @ y_hat + r @ r:.4f}")

# Матриця проєкції («hat matrix»): ŷ = P·y.
P = A @ np.linalg.inv(A.T @ A) @ A.T
print("P·6 =\n", np.round(6 * P, 6))
print("P² = P?", np.allclose(P @ P, P), "  Pᵀ = P?", np.allclose(P.T, P), "  слід P =", round(np.trace(P), 10))
print("важелі (діагональ P):", np.round(np.diag(P), 4))

# Коефіцієнт детермінації R² — частка «поясненого» розкиду.
ss_tot = ((y - y.mean()) ** 2).sum()
ss_res = r @ r
print(f"R² = 1 − {ss_res:.4f}/{ss_tot:.4f} = {1 - ss_res / ss_tot:.4f}",
      f"  (квадрат кореляції: {np.corrcoef(x, y)[0, 1] ** 2:.4f})")
