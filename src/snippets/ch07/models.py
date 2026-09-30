import numpy as np

rng = np.random.default_rng(1)

# 1) Будь-яка модель, лінійна за параметрами: стовпці A — «базисні функції» від x.
#    Станція GNSS: висота = зсув + швидкість·t + річне коливання (sin і cos).
t = np.arange(0, 3.01, 1 / 12)                       # 3 роки щомісяця
up = 2 + 3.0 * t + 4 * np.sin(2 * np.pi * t) + 2 * np.cos(2 * np.pi * t) + rng.normal(0, 1.5, t.size)
A = np.column_stack([np.ones_like(t), t, np.sin(2 * np.pi * t), np.cos(2 * np.pi * t)])
theta = np.linalg.lstsq(A, up, rcond=None)[0]
amp = np.hypot(theta[2], theta[3])
print(f"швидкість {theta[1]:.2f} мм/рік, амплітуда річного коливання {amp:.2f} мм")

# 2) Коло через точки: x² + y² = 2x₀·x + 2y₀·y + c — лінійно за (x₀, y₀, c).
phi = np.linspace(0.3, 2.2, 7)
px = 3 + 2.5 * np.cos(phi) + rng.normal(0, 0.05, phi.size)
py = 2 + 2.5 * np.sin(phi) + rng.normal(0, 0.05, phi.size)
x0, y0, c = np.linalg.lstsq(np.column_stack([2 * px, 2 * py, np.ones_like(px)]), px**2 + py**2, rcond=None)[0]
print(f"коло: центр ({x0:.3f}; {y0:.3f}), радіус {np.sqrt(c + x0**2 + y0**2):.3f}")

# 3) Перенавчання: многочлени різних степенів, помилка на навчальних і на нових даних.
f = lambda x: np.sin(3 * x)
x_tr = np.linspace(0.1, 2.9, 12) + rng.uniform(-0.1, 0.1, 12)   # 12 точок для навчання
y_tr = f(x_tr) + rng.normal(0, 0.25, 12)
x_va = rng.uniform(0.1, 2.9, 200)                                # нові дані для перевірки
y_va = f(x_va) + rng.normal(0, 0.25, 200)
u = lambda x: 2 * x / 3 - 1                           # масштабуємо x у [−1, 1]
rmse = lambda r: np.sqrt(np.mean(r ** 2))
for deg in [0, 1, 2, 4, 6, 8, 10, 11]:
    V = np.vander(u(x_tr), deg + 1)
    w = np.linalg.lstsq(V, y_tr, rcond=None)[0]
    tr = rmse(y_tr - V @ w)
    va = rmse(y_va - np.vander(u(x_va), deg + 1) @ w)
    print(f"степінь {deg:2d}: RMSE навчання {tr:.3f}, RMSE на нових даних {va:.3f}")

# Те саме «по-машинному»:
#   from sklearn.pipeline import make_pipeline
#   from sklearn.preprocessing import PolynomialFeatures
#   from sklearn.linear_model import LinearRegression
#   model = make_pipeline(PolynomialFeatures(5), LinearRegression()).fit(x_tr[:, None], y_tr)
