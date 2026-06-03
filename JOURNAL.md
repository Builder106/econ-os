# JOURNAL — EconOS

> Dated log of decisions, pivots, incidents, and quotes. Add entries as
> things happen — retrospectives need this raw material to land.
> Reverse-chronological; one paragraph max per entry.

## 2026-05-10 — Docker image silently ran random actions, not PPO #incident

The trained PPO zips landed in the repo and the VM had them on disk after `git pull`, but `/healthz` still reported `policies_loaded: false` even after a rebuild. The Dockerfile only `COPY`'d `simulation/`, `server/`, and `dashboard/` — never `models/`. So inside the container `/app/models/` didn't exist, `kernel.py:_try_load_ppo()` hit `FileNotFoundError` on both paths, returned `None` twice, and the kernel fell back to random actions. The graceful fallback is exactly what hid the bug: nothing crashed, the dashboard kept ticking, and the only tell was a boolean buried in a health endpoint. Fix was a one-line `COPY models/ models/`. Lesson: a fallback that's too quiet turns a hard failure into a silent regression — the health flag is the only reason this got caught at all.

## 2026-05-10 — PPO policies trained against a frozen counterparty #decision

Shipped the trained consumer + producer checkpoints (10K and 5K timesteps) so the live kernel runs real inference. But `train.py` trains each role in a counterparty-less world via `MarketGymEnv(agent_filter=...)`: the consumer policy learns against frozen wage/price, the producer policy learns against zero consumer demand. Neither has ever seen the other move. Kept it anyway — the policies behave plausibly in the live mixed environment and the demo reads as "alive," which is what the portfolio piece needs. Logged the honest limitation in `CONTRIBUTING.md` rather than papering over it; joint or role-conditioned shared-policy training is the real fix and it's on the open-contribution list. Calling it "MARL" is a slight stretch given the training regime, and that's worth remembering before pitching it as such.

## 2026-05-10 — Three tunnels in one day: Caddy → Cloudflare → Tailscale #pivot

The backend needed a free, browser-trusted HTTPS URL on Oracle Always Free, and it took three swaps to get there. Started with Caddy + Let's Encrypt, but DuckDNS's nameservers intermittently returned SERVFAIL to LE's secondary validators — ACME validation failed on both HTTP-01 and TLS-ALPN-01 even though DNS resolved fine for actual users, and Caddy auto-fell-back to the staging CA after tripping prod's 5-failures-per-hour rate limit. Switched to Cloudflare Tunnel (outbound-only, CF terminates TLS, no inbound ports) — clean, but it requires a domain already on Cloudflare DNS, so no path to a *free* static URL. Landed on Tailscale Funnel: a permanent `https://<host>.<tailnet>.ts.net` with an auto-managed cert, zero inbound ports, kernel bound to `127.0.0.1:8000` only. The takeaway: the bottleneck was never the proxy, it was the free-DNS-to-cert-authority handshake. Tailscale wins by sidestepping public DNS validation entirely.

## 2026-05-10 — Single-writer-per-WebSocket as the core concurrency contract #decision

The kernel runs one `MarketEnv` per process with an asyncio tick loop at 500ms fanning out to a per-subscriber broadcast queue. The non-obvious call: each `/ws` connection has exactly one writer. The receive loop never sends — it pushes acks onto the *same* queue the kernel pumps ticks and events into, and the send loop is the only coroutine that touches the socket. This avoids interleaved-write corruption without locks. Reconnect uses exponential backoff and deliberately *drops* admin elevation on reconnect — re-auth is required after any drop, so a flaky connection can't silently retain Fed-mode privileges. Anyone changing one side of this contract in isolation will break it; that warning is now the first thing in `CONTRIBUTING.md`.

## 2026-05-10 — ADMIN_TOKEN unset means admin is denied, not open #decision

The command dispatcher splits public verbs (`help`, `who`, `gini`, `inspect`, `top`, `sudo`) from admin verbs (`pause`, `resume`, `tax`, `shock`, `reset`), gated behind `sudo <token>`. The token comes from the `ADMIN_TOKEN` env var, and the chosen behavior when it's unset is to deny admin *universally* — no insecure default, no "blank token works." A public live deploy with an accidentally-empty env var fails closed, not open. Shell echoes also mask the token so it never appears in scrollback, and the analytics events log only the command verb, never the args, so tokens can't leak into the Vercel dashboard either.

## 2026-05-10 — The dotted feedback edge is the whole point #milestone

Wired the dashboard to the live kernel and got the "shared mainframe" invariant working end to end: one admin's `tax 25` in the shell mutates the running kernel and shows up on *every other viewer's* Macro Monitor within one tick. As the README puts it, "without it EconOS would be N independent simulations." That single broadcast path — admin action → kernel mutation → fan-out to all subscribers — is what separates this from N people each watching their own private sim. Everything else (the glassmorphic WM, the Process Explorer, the tour) is dressing on top of that one piece of magic.

## 2026-05-10 — Vercel "Bounce Rate" is meaningless for a SPA #decision

Added Vercel Analytics via the static-site script path (vanilla JS, no npm package — just the `window.va` queue stub plus the deferred `/_vercel/insights/script.js` that Vercel's edge auto-serves). The realization that shaped the work: Bounce Rate is structurally meaningless here because a single-page app records exactly one pageview per session, so every session is a "bounce." Replaced that dead metric with seven custom engagement events — `tour_started`, `tour_skipped` (with the drop-off step), `shell_command_run` (verb only), `sudo_succeeded`, `admin_shock_fired`, etc. All gated on `typeof window.va === 'function'` so a blocked analytics script never crashes the app. The script 404s under local uvicorn, which is expected — the smoke spec filters that one URL out of its console-error assertion rather than loosening the whole check.

## 2026-05-10 — Bare `pytest` failed; CWD isn't on sys.path #incident

Running `pytest simulation/tests/` from the repo root blew up with `ModuleNotFoundError` on `from server.kernel import KernelService`, while `python -m pytest` worked fine. The difference: the `-m` form adds the current directory to `sys.path` via the module loader, but bare `pytest` does not. Added `pythonpath = .` plus `testpaths = simulation/tests` to `pytest.ini` so both invocations resolve the same way. Small thing, but it's the kind of footgun that makes a contributor's first `pytest` run fail for a reason that has nothing to do with their change.

## 2026-04-08 — Closed-loop economy with a money-conservation test #decision

The economic kernel was built as a PettingZoo `ParallelEnv` with a hard design constraint: no money is created or destroyed inside `step()`. Consumers earn wage income, spend on consumption, producers collect revenue and pay the wage bill — every flow has a matching counterparty, so total money across all agents stays constant. `test_money_conservation` pins this down explicitly, since it's the invariant that makes the Gini and Lorenz analytics trustworthy. When the tax feature came later, the skim went into an explicit `env.treasury` rather than vanishing — taxes move money, they don't delete it, so conservation still holds with the treasury counted in.
