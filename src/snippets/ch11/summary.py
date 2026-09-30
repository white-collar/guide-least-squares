import numpy as np

def adjust(A, y, P=None, sigma_known=None):
    """Повне зрівнювання МНК: розв'язок, поправки, σ₀, точність і тест Баарди."""
    n, k = A.shape
    P = np.eye(n) if P is None else P
    W = np.sqrt(P)                                   # ваги → масштабуємо рядки
    theta, *_ = np.linalg.lstsq(W @ A, W @ y, rcond=None)
    v = A @ theta - y                                # поправки до вимірів
    r = n - k                                        # надлишкові виміри
    sigma0 = np.sqrt(v @ P @ v / r)
    Q = np.linalg.inv(A.T @ P @ A)
    sigma_theta = sigma0 * np.sqrt(np.diag(Q))
    s = sigma_known if sigma_known else sigma0
    Qvv = np.linalg.inv(P) - A @ Q @ A.T              # коваріація поправок (у частках σ²)
    w = v / (s * np.sqrt(np.diag(Qvv)))              # нормовані поправки (тест Баарди)
    return theta, v, sigma0, sigma_theta, w

# Приклад: пряма через 5 точок.
x = np.array([0, 1, 2, 3, 4.0]); y = np.array([1.1, 2.9, 5.2, 6.8, 9.0])
A = np.column_stack([np.ones_like(x), x])
theta, v, s0, st, w = adjust(A, y)
print("θ =", theta.round(3), " σθ =", st.round(3), " σ₀ =", round(s0, 3), " max|w| =", np.abs(w).max().round(2))

# Рекурсивний МНК: виміри надходять по одному, результат той самий, що й «пакетний».
theta_r = np.zeros(2); Pinv = np.eye(2) * 1e-9       # майже нульова апріорна інформація
b = np.zeros(2)
for xi, yi in zip(x, y):
    a = np.array([1, xi])
    Pinv += np.outer(a, a); b += a * yi              # накопичуємо AᵀA і Aᵀy
    theta_r = np.linalg.solve(Pinv, b)
print("рекурсивно:", theta_r.round(3))

# Фільтр Калмана в 1D: величина повільно змінюється (шум процесу q), виміри з шумом R.
rng = np.random.default_rng(1)
T = 120
truth = np.where(np.arange(T) < 60, 10.0, 12.0)      # стрибок на кроці 60 (скажімо, просідання)
z = truth + rng.normal(0, 1.0, T)
for q in [0.0, 0.01, 0.1]:
    xk, Pk, est = z[0], 1.0, [z[0]]                  # старт: перший вимір, дисперсія R
    for t in range(1, T):
        Pk += q                                      # прогноз: невизначеність зростає
        K = Pk / (Pk + 1.0)                          # коефіцієнт підсилення
        xk += K * (z[t] - xk)                        # уточнення за новим виміром
        Pk *= 1 - K
        est.append(xk)
    est = np.array(est)
    print(f"q = {q:<5}: RMSE до стрибка {np.sqrt(np.mean((est[:60] - truth[:60])**2)):.3f},"
          f" після {np.sqrt(np.mean((est[70:] - truth[70:])**2)):.3f}")
