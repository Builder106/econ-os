# Contributing to EconOS

EconOS is a portfolio-scale project — small surface area, intentional design.
PRs are welcome; this doc explains the layout, dev loop, and conventions so
your first contribution lands cleanly.

## Architecture in 30 seconds

EconOS is **split-host** and **multi-tenant**:

- **Kernel** ([`server/`](server/), [`simulation/`](simulation/)) — one
  long-lived FastAPI process holding a single `MarketEnv` instance. It ticks
  every 500ms regardless of who's watching and fan-outs state diffs over
  WebSocket. Single-writer per connection (receive loop pushes acks onto the
  same queue the kernel pumps ticks/events into) so ack and tick frames never
  interleave bytes.
- **Dashboard** ([`dashboard/`](dashboard/)) — vanilla JS + Tailwind CDN +
  Chart.js. No build step besides a one-line config injection from
  [`scripts/build-config.js`](scripts/build-config.js).
- **Deploy** — kernel runs on Oracle Always Free behind Tailscale Funnel
  (outbound-only, no inbound ports needed); dashboard ships to Vercel as a
  static bundle. See [`deploy/`](deploy/) for the docker-compose + setup.sh.

If you change anything in `server/` or `simulation/`, the WS contract in
[`server/main.py`](server/main.py) (snapshot shape, ack envelope, event
envelope) is what holds the frontend and backend in sync — keep it stable or
update both sides in the same PR.

## Local dev setup

```bash
# Python side (kernel)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Node side (frontend tests / OG regen / demo recording)
npm install
npx playwright install chromium

# Run the kernel locally — serves dashboard at http://127.0.0.1:8000 too
python3 -m uvicorn server.main:app --reload --port 8000

# To exercise Fed mode locally, set ADMIN_TOKEN first:
ADMIN_TOKEN=hunter2 python3 -m uvicorn server.main:app --reload --port 8000
```

## Tests

| Suite      | Count | Command                                            | Runtime |
|------------|------:|----------------------------------------------------|---------|
| pytest     |    14 | `pytest`                                           | ~0.4 s  |
| Playwright |     9 | `npx playwright test`                              | ~30 s   |

Playwright's `webServer` config auto-spawns `uvicorn` with
`ADMIN_TOKEN=test-token-abc` injected — you don't need to start a server
yourself.

Both suites must stay green for a PR to land. CI parity: no CI is wired in
yet; reviewers run them locally.

## Common dev tasks

| What | How |
|---|---|
| Regenerate the OG image after editing `og-image.svg` | `node scripts/build-og-image.js` |
| Regenerate README demo GIFs | `./scripts/record-demos.sh` (needs `ffmpeg`) |
| Train fresh PPO policies | `python3 -m simulation.train` (commits to `models/*.zip`, gitignored) |
| Provision a fresh Oracle VM end-to-end | `./deploy/oracle-provision.sh` (needs `oci` CLI + Always-Free account) |

## PR conventions

- **Commit style:** Conventional-ish — `feat(area): summary`,
  `fix(area): summary`, `chore: …`, `test: …`, `docs: …`. Keep first line
  ≤ 72 chars; explain *why* (not what) in the body. `git log --oneline -20`
  for examples.
- **Scope per PR:** One logical change. The history is intentionally tidy
  (e.g., env extension landed separately from server scaffolding from
  dashboard wiring from command channel) — please don't mix infra changes
  with feature work.
- **No co-author trailers attributing AI tools** unless the user adds them.
- **Don't commit secrets.** `deploy/.env`, `deploy/oci-state.json`,
  `models/*.zip`, `data/trace.json`, and `node_modules/` are gitignored. If
  you touch deploy, double-check `git status` before pushing.

## What's open for contribution

Genuinely useful additions (in rough priority order):

1. **Live-deploy Playwright spec.** Targets
   `https://econ-os.vercel.app` + `wss://econos-kernel.tailcb96b4.ts.net`.
   Catches regressions on every push that the local suite can't.
2. **Better PPO training.** Current `train.py` trains each role in a
   counterparty-less world via `agent_filter`. Joint training (or
   role-conditioned shared policy) would produce policies that hold up under
   live wage/price movement.
3. **UBI redistribution mechanic.** Treasury accumulates but doesn't
   redistribute. A `redistribute` admin command that splits the treasury
   equally to consumers as UBI would close the loop.
4. **More macro analytics.** Lorenz curve, CPI tracking, real GDP — alluded
   to in the README's "Deep Macro Analytics" line but not implemented.
5. **ONNX-exported PPO** for sub-50 MB Docker image — current torch
   dependency is the bulk of the container.

If you're picking one of these up, open an issue first so we can sanity-check
the approach before you build.

## Code style

- **Python:** standard library + the existing deps only. No black/isort
  enforcement (yet) — match surrounding style.
- **JS:** vanilla, no transpiler. Tailwind utility classes for layout.
  Phosphor icons (already loaded) for any new iconography — no emoji in the
  UI.
- **Tests:** Playwright locators by accessible role or load-bearing ID
  (`#mainChart`, `#proc-rows`). Never add `data-testid` — IDs that the JS
  already needs to function are fine.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened,
browser/OS for frontend issues. If the kernel is unhealthy, include
`curl https://<kernel-host>/healthz` output.

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](LICENSE).
