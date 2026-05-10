# EconOS | Economic Operating System

> **A high-fidelity Multi-Agent Reinforcement Learning (MARL) desktop environment for decentralized economic simulation.**

EconOS is a sophisticated "Operating System" for market simulations. It treats economic agents as system processes, providing a unique, glassmorphic desktop interface to monitor and interact with emergent market behaviors. Using state-of-the-art RL (PPO), agents discover optimal pricing, wage-setting, and consumption strategies within a closed-loop economy.

![EconOS Desktop Showcase](econos_full_walkthrough_final_1775621404633.png)

## Key Features

- **EconOS Desktop**: A custom, library-free window management system in vanilla JS.
- **MARL Core**: Built on [PettingZoo](https://pettingzoo.farama.org/) and [Stable-Baselines3](https://stable-baselines3.readthedocs.io/).
- **Economic Invariants**: Mathematically verified closed-loop economy (No money leakage).
- **Process Explorer**: Monitor agent "memory" (wealth) and "status" (RL policy state) in real-time.
- **Root Shell**: Interactive terminal for kernel commands and policy overrides.
- **Deep Macro Analytics**: Real-time Gini Index, Lorenz Curves, and CPI tracking.

## Architecture

- **`simulation/`**: Core Gym/PettingZoo environment and economic logic.
- **`dashboard/`**: Glassmorphic terminal interface (Tailwind + Chart.js).
- **`logic.py`**: Mathematical bedrock (Utility, Production functions).

## Getting Started

1. **Setup**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Run Simulation**:
   ```bash
   python3 simulation/train.py
   ```

3. **View Dashboard**:
   Open `dashboard/index.html` in your browser.

## Theory vs. Agentic Emergence

The simulation is built on formal economic objective functions, but the market dynamics are purely emergent from agent learning.

### Agent Objectives
- **Consumers**: Maximize Lifetime Utility $U$ subject to budget constraints:
  $$U = \sum_{t} \gamma^t (C_t^\alpha \cdot (1 - L_t)^{1-\alpha})$$
  *Where $C$ is consumption, $L$ is labor, and $\alpha$ (~0.7) is the consumption preference.*

- **Producers**: Maximize Profit $\Pi$ by optimizing production $Q$ vs. Wage costs $W$:
  $$\Pi = P \cdot A(L)^\beta - W \cdot L$$
  *Where $A$ is technology efficiency and $\beta$ is the returns to scale.*

### Key Observations
1. **Price Discovery**: Agents successfully find a stable price-wage ratio within 5,000 timesteps of PPO training.
2. **Shock Response**: When "God Mode" policy shifts are applied (e.g., higher taxes), agents dynamically adjust their labor supply to maintain utility levels, reflecting real-world labor elasticity.

---