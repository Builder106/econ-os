# Run snapshot format

The Apps menu offers **Export snapshot**. It downloads the current state of the shared economy with enough context to explain what was running when the file was saved. The same JSON is available from `GET /export` on the kernel. The endpoint is public and read only, like `GET /state`; it does not need an admin token. Responses use `Cache-Control: no-store`.

The file has `format: "econos-run-snapshot"` and `schema_version: 1`. Consumers should check both fields before reading it. Times are UTC ISO 8601 strings.

| Field | Meaning |
| --- | --- |
| `captured_at` | Time the kernel assembled this file. |
| `run.id`, `run.started_at`, `run.start_reason` | Identity, start time, and cause of the current run. A manual reset or cycle limit starts a new run. |
| `run.step_interval` | Steps from the start of this run through the captured state. It does not contain each intermediate step. |
| `run.initial_conditions` | Market values, tax rate, treasury, agent balances, environment name, agent counts, cycle limit, and seed at the start of the run. `seed` is `null` because the live kernel does not set one. |
| `run.models` | SHA-256 digest of each loaded PPO checkpoint, or `null` if that role has no loaded model. `action_source` is `trained_ppo` or `sampled_actions` for each role. |
| `run.policy_changes` | Admin actions in this run, in order, with the step, time, command, and applied value. A queued shock is labeled `shock_queued` because it takes effect on the next tick. |
| `state` | The same current market, policy, metric, and agent fields as `GET /state`. |
| `replay` | Whether the file can reproduce the run exactly, with a reason when it cannot. |

This first format explains a captured result but cannot replay it exactly. PPO prediction can sample actions, and the kernel does not record each action or the random generator state. The export is a single state with its run context, not a time series. Keep this distinction when adding comparison tools or a Files app.

## Compare two snapshots

Save two exports and run:

```sh
python3 scripts/compare_snapshots.py earlier.json later.json
```

The command reads local files only. It shows changes in market values, policy, summary metrics, and balances for agents present in both files. It also reports whether the files belong to the same run and whether their initial conditions and model checkpoints match. Policy actions recorded in the later file appear below the values. For files from the same run, the list excludes actions already recorded in the earlier file.

These differences describe observations, not policy effects. The exports omit per-step actions and random state, so even matching initial conditions and checkpoints do not establish a controlled counterfactual. Keep the files local if they contain data you do not want to share.
