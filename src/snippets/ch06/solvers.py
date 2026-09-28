import numpy as np

# Пряма через 10 точок, але x — «роки» далеко від нуля (x ≈ 1 000 000).
# Справжні параметри: зсув у точці X0 дорівнює 2, нахил 0.5.
X0 = 1_000_000.0
t = np.arange(10.0)
x = X0 + t
y = 2 + 0.5 * t + 0.01 * np.array([1, -2, 0, 1, -1, 2, 0, -1, 1, -1])
A = np.column_stack([np.ones_like(x), x])

print(f"число обумовленості A:     {np.linalg.cond(A):.2e}")
print(f"число обумовленості AᵀA:   {np.linalg.cond(A.T @ A):.2e}  (≈ квадрат)")

# Еталон: центрована формула (без катастрофічного скорочення).
b_ref = ((t - t.mean()) * (y - y.mean())).sum() / ((t - t.mean()) ** 2).sum()

def report(name, theta):
    err = abs(theta[1] - b_ref) / abs(b_ref)
    print(f"{name:28s} b = {theta[1]:.10f}   відносна похибка {err:.1e}")

# 1) «Як у формулі»: обернена матриця нормальних рівнянь. Так робити не варто.
report("inv(AᵀA)·Aᵀy", np.linalg.inv(A.T @ A) @ A.T @ y)
# 2) Нормальні рівняння, але через розв'язок системи, без явного оберненого.
report("solve(AᵀA, Aᵀy)", np.linalg.solve(A.T @ A, A.T @ y))
# 3) QR-розклад: A = QR, тоді R·θ = Qᵀy.
Q, R = np.linalg.qr(A)
report("QR", np.linalg.solve(R, Q.T @ y))
# 4) SVD: так працює numpy.linalg.lstsq (і sklearn LinearRegression).
report("lstsq (SVD)", np.linalg.lstsq(A, y, rcond=None)[0])
# 5) Найкраще — прибрати причину: центрувати x.
Ac = np.column_stack([np.ones_like(t), t - t.mean()])
report("центровані x + lstsq", np.linalg.lstsq(Ac, y, rcond=None)[0])
