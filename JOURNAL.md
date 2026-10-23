# JOURNAL — EconOS

> Dated log of decisions, pivots, incidents, and quotes. Add entries as
> things happen — retrospectives need this raw material to land.
> Reverse-chronological; one paragraph max per entry.

## 2026-10-23: Ship CPU-only torch in the kernel image #decision

The kernel image was 9.5 GB, and 4.1 GB of it was CUDA: the default PyPI torch wheel pulls the `nvidia-*` libraries and Triton even though the kernel only runs PPO inference on CPU and no host it runs on has a GPU. The Dockerfile now installs torch from PyTorch's CPU index before the project install, which then finds torch already satisfied. The compiler needed for `tinyscaler` moved to a builder stage, and only `site-packages` reaches the runtime image. The image is now 1.35 GB, and `/healthz` still reports `policies_loaded: true`. `uv.lock` now takes torch from the same CPU index on Linux, which shrank the local test venv from 4.7 GB to under 1 GB, while macOS keeps PyPI's torch, which has no CUDA there. The image still installs torch without the lock, because `uv pip install .` has never read it; moving the image to `uv sync --locked` is a separate change. pip-audit cannot look up `+cpu` builds on PyPI, so it skips torch with a warning.

## 2026-10-22: Rebuild the desktop as a tiling window manager #decision

The old floating-window dashboard was removed and rebuilt from scratch as an i3 and sway style tiling desktop: panes share hairline borders with no gaps, numbered workspaces live in a text bar, and a dmenu-style launcher opens apps or runs shell commands. Three themes were written inside that family; "Temper" won because it gives data colors a material origin (the oxide colors of tempered steel) and marks focus with a double engraved rule instead of a borrowed dotfiles palette. `DESIGN.md` records the references, the scores and the genericness changes. The window manager is plain TypeScript with no UI framework: the layout is a small tree of containers and panes that saves to local storage and is rebuilt and validated on load, so a framework would only have added a renderer to keep in sync with it.

## 2026-10-22: Use a binding mode instead of a modifier key #decision

Browsers and operating systems already claim Super, Alt (menus, and Firefox tab switching on Linux), Cmd and most Ctrl letters, and pages cannot override Ctrl+W, Ctrl+T or Ctrl+N. The desktop borrows i3's binding modes instead: `` Ctrl+` `` enters `wm` mode, the bar says so, and single keys act until Escape. No browser or OS uses that chord. Every action also has a pointer path in the bar or the pane title bar, and the Keys pane reads the same binding table as the key handler.

## 2026-10-22: Draw charts on a plain canvas #decision

The wage and price plots stream a 500 ms tick into a ring buffer and redraw one polyline per series on a 2D canvas. That is the smallest route that keeps up without a charting library; the whole desktop ships about 23 KB of gzipped JavaScript. The kernel sends no history, so a new viewer's plot starts at the step they joined, and the pane says so instead of padding the line with invented values. A history frame on connect would fill the plot at once, but it is a protocol change and is left for a separate decision.

## 2026-10-22: Glaxnimate and Blender assets, and one renderer gap #incident

The icon sprite, mark, wordmark and OG image were authored in Glaxnimate, and the wallpapers were rendered from one Blender scene of an engine-turned plate in blued and bright finishes. The first OG render lost the mark's hatching: the Glaxnimate CLI renderer drops `clip-path`, so the hatch lines are now cut to the curve as separate segments. Browsers still render the clipped icon sprite correctly. The analytics script now loads only on the split-host build, because the standalone kernel has no `/_vercel/insights/` route and its 404 would show up in every console.

## 2026-10-21: Keep the browser Linux lab local #decision

A separate v86 prototype now boots Linux and runs a guest `econos` command that reads the shared kernel export through a fixed local proxy. Chromium, Firefox, and WebKit each returned three advancing snapshots through keyboard input. The lab transferred about 12 MiB of assets; Chromium runs used 557–610 MiB of browser-process RSS after their queries. The command adds no research ability beyond the desktop yet. Keep it out of the shipped interface until a named experiment justifies the cost and the Linux image's source and redistribution rights are documented.

## 2026-10-21: Drop the delivery figure #decision

The figure joined two unrelated paths, the CI deploy and the manual kernel update, and both are short linear chains. The paragraph and stage table already say everything it did.

## 2026-10-21: Verify the public snapshot export #incident

The section 2 kernel is healthy, and the hosted dashboard now downloads a version 1 snapshot over public HTTPS. The first deployment check found that nginx held port 443 on every address, leaving Tailscale unable to listen on its own address. Binding nginx to the host's LAN address restored tailnet HTTPS without changing the existing sites' responses. Public Funnel TLS still failed after a route reset and daemon restart, then recovered by the next day's check. A browser test on a tailnet-connected verifier hit Chromium's local network access check because tailnet DNS resolved the public hostname to a private address; forcing the public relay address confirmed live ticks and the export button without disabling that browser protection.

## 2026-10-20: Keep private tax trials off the shared kernel #decision

A local runner now starts two market instances from a saved snapshot's observed values and feeds both the same seeded action stream. It compares the captured tax rate with a chosen rate and records money drift in each arm. The trial does not load the live PPO checkpoints or restore pending shocks, so it is a reproducible model sensitivity check rather than a replay or empirical policy estimate. Python unit and conservation tests cover the new logic; it adds no browser or API boundary. Phase-space and data comparisons remain gated on a named dataset and calibration plan.

## 2026-10-20: Stop unfunded wages from creating money #incident

The saved-state tax trial exposed a 3,752-unit increase in total money over 50 steps. Producers with empty balances were clamped to zero after paying a full wage bill, while consumers still received those wages. A producer now pays only from its balance and current sales, and consumer wages and tax use the amount actually paid. The same trial conserves money in both arms; single-role training environments keep their synthetic counterparty behavior.

## 2026-10-20: Compare saved runs locally #decision

The first comparison tool reads two version 1 exports from disk and reports market, metric, and agent-balance changes with run identity, initial conditions, model checkpoint matching, and recorded policy actions. It never contacts or mutates the shared kernel. The report calls the differences descriptive because exported runs omit per-step actions and random state; a private experiment runner still needs a defined economic question and controlled action path.

## 2026-10-19: Redraw both README figures #decision

Both figures lose the cream background and uppercase lane labels. The user flow now shows read-only and admin sessions feeding one kernel that pushes to every dashboard, without crossing wires. The delivery figure keeps its point: the dashboard deploys from CI and the kernel is updated by hand.

## 2026-10-19: Explain the shared run in a snapshot #decision

The Apps menu now downloads a versioned JSON snapshot from the shared kernel. It includes the current state, initial conditions, checkpoint digests or sampled-action status, and the admin changes made during the run. A reset starts a new run ID. The file explicitly says exact replay is unavailable because the kernel does not record each action or random generator state. The format is documented before adding a Files app or private experiments.

## 2026-10-19: Make the shared economy a working desktop #milestone

Market and Agents now open as windows on the work surface. The app launcher opens the other tools, while the taskbar switches between running apps and shows the kernel's real connection state and step. Visitors can move, resize, minimize, and maximize windows; their layout stays in local storage and is clamped after a viewport change. Phones show one app at a time. The shared WebSocket and admin boundary stay in the existing kernel client.

## 2026-10-19: Put the desktop and Linux lab on separate tracks #decision

The live-first redesign made the economy easier to read but weakened the OS feel. The roadmap now restores working desktop behavior around the shared kernel and tests a browser Linux image separately. A Linux distro remains a decision for after the prototype proves a useful research workflow, acceptable browser performance, and a viable license.

## 2026-10-19: Restore the production deploy gate #incident

The push passed CI, but the Vercel job was skipped because it depended on commit lint, a job that runs only for pull requests. Deployment now depends on the secret scan and browser checks; those checks include the Python suite. Commit lint still runs for pull requests.

## 2026-10-19: Put the live economy first #decision

The dashboard now opens directly on the wage and price plot beside the agent ledger. Those two instruments dock into the workspace; the shell, policy controls, and guide remain separate windows. Removed the timed boot and first-visit guide because they covered the data and implied a successful connection before the WebSocket had proved it. `DESIGN.md` records the color roles, type, spacing, layout, and states so later UI changes can use the same system.

## 2026-10-15: Separated user roles from deployment paths #decision

The README figures now use a swimlane for viewer, admin, and shared-kernel behavior and a topology for the two deployment routes. The user flow shows invalid tokens staying read-only and valid actions reaching every viewer. The delivery figure keeps CI-gated Vercel deployment separate from the manual kernel update. Both figures use the dashboard's warm paper and dark terminal palettes, with cyan for connections, green for valid actions, and red for invalid input. Each light and dark PNG pair comes from one editable HTML source.

## 2026-10-13: Replaced README Mermaid diagrams #decision

The README now has separate figures for the shared-kernel user flow and the delivery paths, each with a PNG embed and editable HTML source. The delivery drawing follows the current workflow: CI gates the Vercel hook, while the kernel update is manual. Old fixed pytest and Playwright counts were removed because the workflow no longer promises those counts.

## 2026-09-17 — Guarded dashboard WebSocket and browser boundaries #type-safety

Added typed kernel state, acknowledgement, and event guards before accepting WebSocket frames, plus canvas constructor checks and a malformed-frame browser regression scenario. The existing single-writer connection and reconnect behavior remain unchanged; dynamic JSON is rejected or retained as an explicitly guarded boundary.

## 2026-09-07 — Kept the admin broadcast invariant in deterministic QA #decision

The dashboard smoke test now uses two local WebSocket clients and accounts for the server broadcasting an admin event before returning that command's acknowledgement. This keeps the shared-kernel contract explicit without relying on a live deployment, and the test retains the warnings-as-errors and 100% coverage gates.

## 2026-09-06 — Standardized Playwright tooling on Node 24 #decision

Pinned the dashboard Playwright tooling to Node 24 in CI and npm 10.9.9 in the existing package manifest. The Python 3.14 application runtime and Docker configuration remain unchanged.

## 2026-08-14: Accessible plain-English documentation update #decision

Refactored the README introductory pitch and tagline to introduce the multi-agent economic simulator as a flight-simulator sandbox for testing economic policies. Framed the AI agents and market behavior in clear, non-specialist terms while maintaining the rigorous PPO/MARL and PettingZoo documentation.

## 2026-07-24 — UBI Treasury Redistribution and Real GDP / CPI Macro Analytics #feature #milestone

Added Universal Basic Income (UBI) treasury redistribution alongside real-time macro indicators (CPI, Real GDP, and Lorenz curve quantiles). Admin users can now issue the `redistribute`command via the Fed shell, which evenly disburses accumulated income tax revenue from`env.treasury` back to active consumer agents while maintaining closed-loop money conservation. All macro metrics calculate live on each 500ms kernel tick and stream over WebSockets to all connected clients.

## 2026-05-10 — Silent fallback hid missing models in Docker container #incident

The trained PPO zips landed in the repo and the VM had them on disk after `git pull`, but `/healthz`still reported`policies_loaded: false`even after a rebuild. The Dockerfile only`COPY`'d `simulation/`, `server/`, and `dashboard/`— never`models/`. So inside the container `/app/models/`didn't exist,`kernel.py:_try_load_ppo()`hit`FileNotFoundError`on both paths, returned`None`twice, and the kernel fell back to random actions. The graceful fallback is exactly what hid the bug: nothing crashed, the dashboard kept ticking, and the only tell was a boolean buried in a health endpoint. Fix was a one-line`COPY models/ models/`. Lesson: a fallback that's too quiet turns a hard failure into a silent regression — the health flag is the only reason this got caught at all.

## 2026-05-10 — PPO policies trained against a frozen counterparty #decision

Shipped the trained consumer + producer checkpoints (10K and 5K timesteps) so the live kernel runs real inference. But `train.py`trains each role in a counterparty-less world via`MarketGymEnv(agent_filter=...)`: the consumer policy learns against frozen wage/price, the producer policy learns against zero consumer demand. Neither has ever seen the other move. Kept it anyway — the policies behave plausibly in the live mixed environment and the demo reads as "alive," which is what the portfolio piece needs. Logged the honest limitation in `CONTRIBUTING.md` rather than papering over it; joint or role-conditioned shared-policy training is the real fix and it's on the open-contribution list. Calling it "MARL" is a slight stretch given the training regime, and that's worth remembering before pitching it as such.

## 2026-05-10 — Three tunnels in one day: Caddy → Cloudflare → Tailscale #pivot

The backend needed a free, browser-trusted HTTPS URL on Oracle Always Free, and it took three swaps to get there. Started with Caddy + Let's Encrypt, but DuckDNS's nameservers intermittently returned SERVFAIL to LE's secondary validators — ACME validation failed on both HTTP-01 and TLS-ALPN-01 even though DNS resolved fine for actual users, and Caddy auto-fell-back to the staging CA after tripping prod's 5-failures-per-hour rate limit. Switched to Cloudflare Tunnel (outbound-only, CF terminates TLS, no inbound ports) — clean, but it requires a domain already on Cloudflare DNS, so no path to a *free* static URL. Landed on Tailscale Funnel: a permanent `https://<host>.<tailnet>.ts.net`with an auto-managed cert, zero inbound ports, kernel bound to`127.0.0.1:8000` only. The takeaway: the bottleneck was never the proxy, it was the free-DNS-to-cert-authority handshake. Tailscale wins by sidestepping public DNS validation entirely.

## 2026-05-10 — Single-writer-per-WebSocket as the core concurrency contract #decision

The kernel runs one `MarketEnv`per process with an asyncio tick loop at 500ms fanning out to a per-subscriber broadcast queue. The non-obvious call: each`/ws`connection has exactly one writer. The receive loop never sends — it pushes acks onto the *same*queue the kernel pumps ticks and events into, and the send loop is the only coroutine that touches the socket. This avoids interleaved-write corruption without locks. Reconnect uses exponential backoff and deliberately*drops* admin elevation on reconnect — re-auth is required after any drop, so a flaky connection can't silently retain Fed-mode privileges. Anyone changing one side of this contract in isolation will break it; that warning is now the first thing in`CONTRIBUTING.md`.

## 2026-05-10 — ADMIN_TOKEN unset means admin is denied, not open #decision

The command dispatcher splits public verbs (`help`, `who`, `gini`, `inspect`, `top`, `sudo`) from admin verbs (`pause`, `resume`, `tax`, `shock`, `reset`), gated behind `sudo <token>`. The token comes from the `ADMIN_TOKEN` env var, and the chosen behavior when it's unset is to deny admin *universally* — no insecure default, no "blank token works." A public live deploy with an accidentally-empty env var fails closed, not open. Shell echoes also mask the token so it never appears in scrollback, and the analytics events log only the command verb, never the args, so tokens can't leak into the Vercel dashboard either.

## 2026-05-10 — The dotted feedback edge is the whole point #milestone

Wired the dashboard to the live kernel and got the "shared mainframe" invariant working end to end: one admin's `tax 25` in the shell mutates the running kernel and shows up on *every other viewer's* Macro Monitor within one tick. As the README puts it, "without it EconOS would be N independent simulations." That single broadcast path — admin action → kernel mutation → fan-out to all subscribers — is what separates this from N people each watching their own private sim. Everything else (the glassmorphic WM, the Process Explorer, the tour) is dressing on top of that one piece of magic.

## 2026-05-10 — Vercel "Bounce Rate" is meaningless for a SPA #decision

Added Vercel Analytics via the static-site script path (vanilla JS, no npm package — just the `window.va`queue stub plus the deferred`/_vercel/insights/script.js`that Vercel's edge auto-serves). The realization that shaped the work: Bounce Rate is structurally meaningless here because a single-page app records exactly one pageview per session, so every session is a "bounce." Replaced that dead metric with seven custom engagement events —`tour_started`, `tour_skipped`(with the drop-off step),`shell_command_run`(verb only),`sudo_succeeded`, `admin_shock_fired`, etc. All gated on `typeof window.va === 'function'` so a blocked analytics script never crashes the app. The script 404s under local uvicorn, which is expected — the smoke spec filters that one URL out of its console-error assertion rather than loosening the whole check.

## 2026-05-10 — Bare `pytest` failed; CWD isn't on sys.path #incident

Running `pytest simulation/tests/`from the repo root blew up with`ModuleNotFoundError`on`from server.kernel import KernelService`, while `python -m pytest`worked fine. The difference: the`-m`form adds the current directory to`sys.path`via the module loader, but bare`pytest`does not. Added`pythonpath = .`plus`testpaths = simulation/tests`to`pytest.ini`so both invocations resolve the same way. Small thing, but it's the kind of footgun that makes a contributor's first`pytest` run fail for a reason that has nothing to do with their change.

## 2026-04-08 — Closed-loop economy with a money-conservation test #decision

The economic kernel was built as a PettingZoo `ParallelEnv`with a hard design constraint: no money is created or destroyed inside`step()`. Consumers earn wage income, spend on consumption, producers collect revenue and pay the wage bill — every flow has a matching counterparty, so total money across all agents stays constant. `test_money_conservation`pins this down explicitly, since it's the invariant that makes the Gini and Lorenz analytics trustworthy. When the tax feature came later, the skim went into an explicit`env.treasury` rather than vanishing — taxes move money, they don't delete it, so conservation still holds with the treasury counted in.

## 2026-09-14 — Filter non-critical Vercel Analytics 404s in live smoke suite #incident

The scheduled live smoke workflow (`Live deployment smoke` on main) failed because production Vercel returned 404 for `/_vercel/insights/script.js`, tripping Playwright's strict zero-console-error assertion in `e2e/live.spec.js`. While the original local smoke spec had filtered this non-critical route, `e2e/live.spec.js` lacked the filter. The dashboard already gates analytics calls safely behind `typeof window.va === 'function'`, so an unprovisioned or blocked analytics script does not impair functionality. Aligned `e2e/live.spec.js` by ignoring console errors originating from `/_vercel/insights/script.js`.
