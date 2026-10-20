# Private tax experiment

The first private experiment asks: **How does a higher income tax rate change consumer inequality and spending in this market model?** It compares the tax rate in a saved run snapshot with a rate you choose. Both scenarios start with the snapshot's market values, agent balances, and treasury. They receive the same seeded sequence of consumer and producer actions for the requested number of steps.

Run the trial from the repository root in a Linux environment with the project dependencies available, using a saved version 1 snapshot:

```sh
uv run --frozen python -m scripts.private_tax_experiment snapshot.json --tax-rate 0.2 --steps 50 --seed 42 > private-tax.json
```

The command reads one local file and writes JSON to standard output. It does not contact the shared kernel or send admin commands. The output identifies the source run and step, the seed and action method, both scenario summaries, and the treatment minus baseline difference. Keep the snapshot and report together to rerun the same trial.

The trial uses uniform random actions, not the saved PPO checkpoints. It does not restore pending shocks, action history, or random generator state from the live run. Tax receipts stay in the treasury; there is no redistribution. When producers cannot fund the posted wage bill, the model pays only the amount available from their balances and current sales. Both scenario summaries include `money_drift`; it should be close to zero. A material drift means the trial is not suitable for interpretation.

This is a controlled sensitivity check inside the EconOS model. Its difference is not an estimate of a real-world tax effect, and it does not replay the captured live run. An empirical comparison needs a named dataset, comparable units, and a calibration plan before adding phase-space or statistical views.
