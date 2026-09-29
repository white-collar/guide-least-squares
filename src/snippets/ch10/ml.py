import numpy as np

rng = np.random.default_rng(0)
x = rng.uniform(-2, 2, 50)
y = 1 + 0.5 * x + rng.normal(0, 0.3, x.size)
A = np.column_stack([np.ones_like(x), x])
n = x.size

# 1) Аналітичний розв'язок — один «стрибок» на дно чаші.
theta_star = np.linalg.lstsq(A, y, rcond=None)[0]

# 2) Градієнтний спуск для MSE = |y − Aθ|²/n. Градієнт: −2Aᵀ(y − Aθ)/n.
L = 2 * np.linalg.eigvalsh(A.T @ A / n).max()      # найбільше власне число гессіана
for lr_factor in [0.5, 0.95, 1.05]:                    # частка від межі стійкості 2/L
    theta = np.zeros(2)
    for _ in range(200):
        theta -= lr_factor * (2 / L) * (-2 * A.T @ (y - A @ theta) / n)
    print(f"крок {lr_factor:.2f}·(2/L): θ = {np.round(theta, 4)}  (точно {np.round(theta_star, 4)})")

# 3) Стохастичний градієнтний спуск: градієнт по одному випадковому прикладу.
theta = np.zeros(2)
for epoch in range(30):
    for i in rng.permutation(n):
        theta -= 0.02 * (-2 * (y[i] - A[i] @ theta) * A[i])
print("SGD, 30 епох:", np.round(theta, 3))

# 4) Ridge: (AᵀA + λI)θ = Aᵀy. Штрафуємо все, крім вільного члена.
lam = 5.0
D = np.diag([0.0, 1.0])
print("ridge λ=5:", np.round(np.linalg.solve(A.T @ A + lam * D, A.T @ y), 4))

# 5) Промахи: Губер (IRLS), RANSAC і тест Баарди.
xo = np.linspace(0.5, 9.5, 15)
yo = 1 + 0.5 * xo + rng.normal(0, 0.2, xo.size)
yo[[10, 12]] += [3.0, 2.5]                            # два промахи
Ao = np.column_stack([np.ones_like(xo), xo])
ls = np.linalg.lstsq(Ao, yo, rcond=None)[0]

th, delta = ls.copy(), 0.4                            # Губер: ітеративно перезважений МНК
for _ in range(50):
    r = yo - Ao @ th
    w = np.where(np.abs(r) <= delta, 1.0, delta / np.abs(r))
    sw = np.sqrt(w)
    th = np.linalg.lstsq(Ao * sw[:, None], yo * sw, rcond=None)[0]

best, t = None, 0.5                                    # RANSAC: пари точок → найбільший консенсус
for _ in range(200):
    i, j = rng.choice(xo.size, 2, replace=False)
    b = (yo[j] - yo[i]) / (xo[j] - xo[i]); a = yo[i] - b * xo[i]
    inl = np.abs(yo - a - b * xo) < t
    if best is None or inl.sum() > best.sum():
        best = inl
rs = np.linalg.lstsq(Ao[best], yo[best], rcond=None)[0]
print("МНК:", np.round(ls, 3), " Губер:", np.round(th, 3), " RANSAC:", np.round(rs, 3), " (дані згенеровано з [1, 0.5] + шум)")

clean = np.ones(xo.size, bool); clean[[10, 12]] = False
print("МНК без промахів (еталон):", np.round(np.linalg.lstsq(Ao[clean], yo[clean], rcond=None)[0], 3))

# Тест Баарди (data snooping): нормовані нев'язки w = v / (σ·√(1 − hᵢᵢ)), σ = 0.2 відома заздалегідь.
# Промах «розмазується», тож виключаємо по одному найгіршому вимірові й повторюємо.
keep = np.ones(xo.size, bool)
while True:
    Ak, yk = Ao[keep], yo[keep]
    th = np.linalg.lstsq(Ak, yk, rcond=None)[0]
    h = np.diag(Ak @ np.linalg.inv(Ak.T @ Ak) @ Ak.T)
    w = (yk - Ak @ th) / (0.2 * np.sqrt(1 - h))
    idx = np.flatnonzero(keep)
    print(f"  понад 3,29: {np.sum(np.abs(w) > 3.29)} вимірів, найгірший №{idx[np.argmax(np.abs(w))]} (w = {w[np.argmax(np.abs(w))]:.1f})")
    if np.abs(w).max() <= 3.29:
        break
    keep[idx[np.argmax(np.abs(w))]] = False
print("виключено:", np.flatnonzero(~keep), " розв'язок:", np.round(th, 3))
