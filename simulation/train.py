import os
import json
from stable_baselines3 import PPO
from simulation.gym_wrapper import MarketGymEnv
from simulation.environment import MarketEnv
from simulation.logic import calculate_gini

MODELS_DIR = "models"
DATA_DIR = "data"
CONSUMER_PATH = os.path.join(MODELS_DIR, "consumer_policy.zip")
PRODUCER_PATH = os.path.join(MODELS_DIR, "producer_policy.zip")
TRACE_PATH = os.path.join(DATA_DIR, "trace.json")


def train_and_sim():
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    print("🚀 Initializing PPO Training (parameter-shared, per role)...")

    c_gym_env = MarketGymEnv(agent_filter="consumers")
    p_gym_env = MarketGymEnv(agent_filter="producers")

    print("--- Training Consumer Policy ---")
    c_model = PPO("MlpPolicy", c_gym_env, verbose=0, learning_rate=1e-3)
    c_model.learn(total_timesteps=10000)
    c_model.save(CONSUMER_PATH)
    print(f"   saved → {CONSUMER_PATH}")

    print("--- Training Producer Policy ---")
    p_model = PPO("MlpPolicy", p_gym_env, verbose=0, learning_rate=1e-3)
    p_model.learn(total_timesteps=5000)
    p_model.save(PRODUCER_PATH)
    print(f"   saved → {PRODUCER_PATH}")

    print("--- Generating Joint Rollout Trace ---")
    env = MarketEnv(num_consumers=10, num_producers=2, max_cycles=100)
    obs, _ = env.reset()
    data_log = []

    for i in range(100):
        actions = {}
        for agent in env.agents:
            model = c_model if "consumer" in agent else p_model
            action, _ = model.predict(obs[agent], deterministic=True)
            actions[agent] = action

        obs, rewards, _, truncations, _ = env.step(actions)

        consumer_balances = [
            env.agent_balances[a] for a in env.agents if "consumer" in a
        ]
        data_log.append({
            "step": i,
            "avg_wage": float(env.market_wage),
            "avg_price": float(env.market_price),
            "total_utility": float(sum(r for k, r in rewards.items() if "consumer" in k)),
            "gini": float(calculate_gini(consumer_balances)),
            "treasury": float(env.treasury),
            "tax_rate": float(env.tax_rate),
        })

        if any(truncations.values()):
            break

    with open(TRACE_PATH, "w") as f:
        json.dump(data_log, f, indent=4)
    print(f"✅ Wrote {len(data_log)} cycles → {TRACE_PATH}")


if __name__ == "__main__":
    train_and_sim()
