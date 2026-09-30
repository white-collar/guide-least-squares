import numpy as np

x = np.array([1.0, 2.0, 3.0])
y = np.array([1.0, 2.0, 2.0])

# Чотири кандидати на «функцію якості» прямої y = a + b·x.
def residuals(a, b):
    return y - (a + b * x)

criteria = {
    "Σ r":     lambda r: r.sum(),
    "Σ |r|":   lambda r: np.abs(r).sum(),
    "max |r|": lambda r: np.abs(r).max(),
    "Σ r²":    lambda r: (r ** 2).sum(),
}

lines = {"y = x": (0, 1), "y = 2": (2, 0), "y = 0.5 + 0.5x": (0.5, 0.5),
         "y = 2/3 + 0.5x": (2 / 3, 0.5)}
for name, (a, b) in lines.items():
    r = residuals(a, b)
    values = ", ".join(f"{k} = {f(r):.3f}" for k, f in criteria.items())
    print(f"{name:15s} → {values}")

# «Навчання» перебором: пробуємо всі (a, b) на сітці й беремо найкращу пару.
# Найпримітивніший спосіб оптимізації — але працює для будь-якого критерію.
A, B = np.meshgrid(np.linspace(-1, 3, 401), np.linspace(-1, 2, 301))
R = y[:, None, None] - (A + B * x[:, None, None])   # нев'язки для всіх пар одразу
for name, loss in [("Σ |r|", np.abs(R).sum(0)), ("max |r|", np.abs(R).max(0)),
                   ("Σ r²", (R ** 2).sum(0))]:
    i = np.unravel_index(loss.argmin(), loss.shape)
    print(f"мінімум {name:8s}: a = {A[i]:.2f}, b = {B[i]:.2f}, значення {loss[i]:.3f}")
