import numpy as np
from itertools import combinations

# Три точки (x_i, y_i). Шукаємо пряму y = a + b·x.
x = np.array([1.0, 2.0, 3.0])
y = np.array([1.0, 2.0, 2.0])

# Кожна точка дає одне рівняння  1·a + x_i·b = y_i.
# Стовпці матриці A: одиниці (для a) та самі x (для b).
A = np.column_stack([np.ones_like(x), x])
print("A =\n", A)

# Критерій Кронекера–Капеллі: система сумісна, лише якщо ранги рівні.
rank_A = np.linalg.matrix_rank(A)
rank_Ab = np.linalg.matrix_rank(np.column_stack([A, y]))
print("rank A =", rank_A, " rank [A|y] =", rank_Ab)
print("Точний розв'язок існує?", rank_A == rank_Ab)

# Беремо лише два рівняння з трьох — щоразу отримуємо іншу пряму.
for i, j in combinations(range(3), 2):
    a, b = np.linalg.solve(A[[i, j]], y[[i, j]])
    residuals = y - (a + b * x)          # нев'язки для ВСІХ трьох точок
    print(f"рівняння {i+1}+{j+1}: y = {a:.2f} + {b:.2f}x,"
          f" нев'язки = {np.round(residuals, 2)}")
