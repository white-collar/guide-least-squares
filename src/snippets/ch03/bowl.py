import numpy as np
import matplotlib.pyplot as plt

x = np.array([1.0, 2.0, 3.0])
y = np.array([1.0, 2.0, 2.0])

# S(a, b) — многочлен другого степеня. Його коефіцієнти — п'ять сум по даних.
n, sx, sxx = len(x), x.sum(), (x * x).sum()
sy, sxy, syy = y.sum(), (x * y).sum(), (y * y).sum()
print(f"S(a, b) = {n}a² + {2*sx:g}ab + {sxx:g}b² − {2*sy:g}a − {2*sxy:g}b + {syy:g}")

# Рахуємо S на сітці значень параметрів — це і є «ландшафт» функції втрат.
a = np.linspace(-1.5, 2.5, 201)
b = np.linspace(-0.75, 1.75, 201)
A, B = np.meshgrid(a, b)
S = ((y[:, None, None] - A - B * x[:, None, None]) ** 2).sum(axis=0)

i = np.unravel_index(S.argmin(), S.shape)
print(f"дно чаші на сітці: a = {A[i]:.2f}, b = {B[i]:.2f}, S = {S[i]:.3f}")

fig = plt.figure(figsize=(11, 4.5))
ax1 = fig.add_subplot(1, 2, 1)
ax1.contour(A, B, S, levels=S.min() + np.array([0.02, 0.08, 0.18, 0.32, 0.5, 0.72, 0.98, 1.28]))
ax1.plot(A[i], B[i], "gx", markersize=10)
ax1.set_xlabel("a"); ax1.set_ylabel("b"); ax1.set_title("Лінії рівня S(a, b)")

ax2 = fig.add_subplot(1, 2, 2, projection="3d")
ax2.plot_surface(A, B, np.minimum(S, 3), cmap="viridis", alpha=0.8)
ax2.set_xlabel("a"); ax2.set_ylabel("b"); ax2.set_title("Чаша S(a, b)")
plt.show()
