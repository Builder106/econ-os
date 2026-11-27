import numpy as np


def utility_function(consumption, labor, alpha=0.7):
    """
    Cobb-Douglas Utility: U = (C^alpha) * ((1-L)^(1-alpha))
    consumption: amount of goods consumed
    labor: fraction of time spent working [0, 1]
    """
    consumption = max(1e-6, consumption)
    leisure = max(1e-6, 1.0 - labor)
    return (consumption**alpha) * (leisure ** (1 - alpha))


def production_function(labor, efficiency=1.0, beta=0.8):
    """
    Production: Q = efficiency * (labor^beta)
    Returns amount produced.
    """
    return efficiency * (labor**beta)


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


def calculate_lorenz_curve(wealths, num_points=10):
    """
    Calculates population quantiles and cumulative wealth ratios for Lorenz curve plotting.
    """
    if not wealths:
        return {"quantiles": [0.0, 1.0], "cumulative_wealth": [0.0, 1.0]}
    sorted_w = np.sort(wealths)
    total_w = np.sum(sorted_w)
    if total_w == 0:
        return {"quantiles": [0.0, 1.0], "cumulative_wealth": [0.0, 1.0]}
    cum_w = np.cumsum(sorted_w) / total_w
    cum_w = np.insert(cum_w, 0, 0.0)
    pop_pct = np.linspace(0.0, 1.0, len(cum_w))

    # Interpolate to uniform grid of num_points
    grid_pop = np.linspace(0.0, 1.0, num_points + 1)
    grid_cum_w = np.interp(grid_pop, pop_pct, cum_w)
    return {
        "quantiles": [round(float(p), 3) for p in grid_pop],
        "cumulative_wealth": [round(float(w), 3) for w in grid_cum_w],
    }


def calculate_cpi(current_price, base_price=10.0):
    """
    Consumer Price Index relative to base price level (default 10.0 = 100.0).
    """
    if base_price <= 0:
        return 100.0
    return round(float((current_price / base_price) * 100.0), 2)


def calculate_real_gdp(nominal_spend, current_price, base_price=10.0):
    """
    Real GDP = Nominal Consumption Spend / (CPI / 100).
    """
    cpi = calculate_cpi(current_price, base_price)
    if cpi <= 0:
        return 0.0
    return round(float(nominal_spend / (cpi / 100.0)), 2)


def excess_demand_price_factor(
    nominal_spend: float,
    real_supply: float,
    current_price: float,
    sensitivity: float = 0.1,
) -> float:
    """Return a bounded multiplicative price adjustment driven by excess demand."""
    safe_price = max(float(current_price), 1e-6)
    real_demand = float(nominal_spend) / safe_price
    scale = max(float(real_supply), 1.0)
    excess_ratio = float(np.clip((real_demand - float(real_supply)) / scale, -0.5, 0.5))
    return 1.0 + float(sensitivity) * excess_ratio
