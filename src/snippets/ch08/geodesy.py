import numpy as np

# ---------- 1) Нівелірна мережа: зважений МНК ----------
# Відомі репери та невідомі пункти A, B, C.
known = {"Rp1": 100.000, "Rp2": 103.500}
unknown = ["A", "B", "C"]
# Лінії: звідки, куди, виміряне перевищення h (м), довжина ходу L (км).
lines = [("Rp1", "A", 1.215, 1.2), ("A", "B", 0.843, 0.9), ("B", "Rp2", 1.438, 1.5),
         ("Rp1", "C", 2.012, 1.4), ("C", "B", 0.052, 0.8), ("C", "Rp2", 1.487, 1.1),
         ("A", "C", 0.797, 1.0)]

n, k = len(lines), len(unknown)
A = np.zeros((n, k)); l = np.zeros(n); L = np.zeros(n)
for i, (fr, to, h, length) in enumerate(lines):
    # Рівняння: H_to − H_from = h. Відомі висоти переносимо в праву частину.
    l[i] = h + known.get(fr, 0) - known.get(to, 0)
    if to in unknown: A[i, unknown.index(to)] += 1
    if fr in unknown: A[i, unknown.index(fr)] -= 1
    L[i] = length

P = np.diag(1 / L)                        # вага ходу обернено пропорційна його довжині
N = A.T @ P @ A                           # зважені нормальні рівняння
H = np.linalg.solve(N, A.T @ P @ l)
v = A @ H - l                             # поправки до вимірів
r = n - k                                 # кількість надлишкових вимірів
sigma0 = np.sqrt(v @ P @ v / r)           # СКП одиниці ваги (на 1 км ходу)
sigma_H = sigma0 * np.sqrt(np.diag(np.linalg.inv(N)))
for name, h_, s in zip(unknown, H, sigma_H):
    print(f"H_{name} = {h_:.4f} м  ± {s * 1000:.1f} мм")
print("поправки, мм:", np.round(v * 1000, 1), f"  σ₀ = {sigma0 * 1000:.1f} мм/√км")

# ---------- 2) Трилатерація методом Гаусса — Ньютона ----------
stations = np.array([[0.0, 0.0], [1000.0, 0.0], [300.0, 900.0], [900.0, 800.0]])
true_p = np.array([420.0, 310.0])
rng = np.random.default_rng(3)
d = np.linalg.norm(stations - true_p, axis=1) + rng.normal(0, 0.02, 4)   # виміряні відстані, м

p = np.array([800.0, 700.0])              # грубе початкове наближення
for it in range(6):
    diff = p - stations
    d0 = np.linalg.norm(diff, axis=1)     # відстані від поточного наближення
    J = diff / d0[:, None]                # матриця Якобі: одиничні вектори від станцій
    dp = np.linalg.lstsq(J, d - d0, rcond=None)[0]   # звичайний лінійний МНК для поправки
    p = p + dp
    print(f"ітерація {it + 1}: x = {p[0]:.4f}, y = {p[1]:.4f}, |Δ| = {np.linalg.norm(dp):.2e} м")

# Те саме однією функцією (Левенберг — Марквардт):
#   from scipy.optimize import least_squares
#   least_squares(lambda q: np.linalg.norm(stations - q, axis=1) - d, x0=[800, 700]).x
