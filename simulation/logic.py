import numpy as np

def utility_function(consumption, labor, alpha=0.7):
    """
    Cobb-Douglas Utility: U = (C^alpha) * ((1-L)^(1-alpha))
    consumption: amount of goods consumed
    labor: fraction of time spent working [0, 1]
    """
    consumption = max(1e-6, consumption)
    leisure = max(1e-6, 1.0 - labor)
    return (consumption ** alpha) * (leisure ** (1 - alpha))

def production_function(labor, efficiency=1.0, beta=0.8):
    """
    Production: Q = efficiency * (labor^beta)
    Returns amount produced.
    """
    return efficiency * (labor ** beta)

def calculate_gini(wealths):
    """
    Standard Gini Index calculation.
    """
    if not wealths:
        return 0
    sorted_wealths = sorted(wealths)
    n = len(wealths)
    if n == 0 or sum(wealths) == 0:
        return 0
    cumulative_wealths = np.cumsum(sorted_wealths)
    sum_wealths = cumulative_wealths[-1]
    index = np.arange(1, n + 1)
    return (2 * np.sum(index * sorted_wealths) / (n * sum_wealths)) - (n + 1) / n
