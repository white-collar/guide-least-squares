import numpy as np

x = np.array([1.0, 2.0, 3.0])
y = np.array([1.0, 2.0, 2.0])
n = len(x)

# Таблиця сум — як рахували вручну: x, y, x², xy.
Sx, Sy, Sxx, Sxy = x.sum(), y.sum(), (x * x).sum(), (x * y).sum()
print(f"n = {n}, Σx = {Sx:g}, Σy = {Sy:g}, Σx² = {Sxx:g}, Σxy = {Sxy:g}")

# Нормальні рівняння:  n·a + Σx·b = Σy
#                     Σx·a + Σx²·b = Σxy
N = np.array([[n, Sx], [Sx, Sxx]])
u = np.array([Sy, Sxy])
a, b = np.linalg.solve(N, u)
print(f"з нормальних рівнянь: a = {a:.4f}, b = {b:.4f}")

# Те саме «шкільними» формулами через центровані дані.
b2 = ((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum()
a2 = y.mean() - b2 * x.mean()
print(f"через центровані суми: a = {a2:.4f}, b = {b2:.4f}")

# Дві умови рівноваги на дні чаші: Σr = 0 і Σx·r = 0.
r = y - (a + b * x)
print(f"нев'язки {np.round(r, 4)}, Σr = {r.sum():.2e}, Σx·r = {(x * r).sum():.2e}")

# Матричний запис того самого: AᵀA·θ = Aᵀy. Так працює для будь-якої кількості параметрів.
A = np.column_stack([np.ones(n), x])
print("AᵀA =", (A.T @ A).tolist(), " Aᵀy =", (A.T @ y).tolist())
print("θ =", np.linalg.solve(A.T @ A, A.T @ y), " polyfit:", np.polyfit(x, y, 1)[::-1])
