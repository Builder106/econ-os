# EconOS roadmap

EconOS runs one shared economy. Visitors watch the same kernel, and an authorized policy change reaches everyone. The next interface should work like a desktop built for studying that economy. A separate prototype will test whether running Linux in the browser adds useful research tools.

## 1. Restore the desktop (complete)

Market and Agents now open as windows on the work surface. The desktop keeps their live data and provides application behavior:

- Make the work surface the first screen. Put running apps, connection state, and the current simulation step in a compact system bar and taskbar. Keep the product name out of the way of the work.
- Let Market, Agents, Shell, and Policy open from an app launcher. Add minimize, maximize, resize, focus, and keyboard switching. Windows must remain reachable after a viewport change.
- Remember each visitor's window layout and theme locally. On narrow screens, show one app at a time with a clear way to switch apps.
- Build the desktop's visual identity from actual economy data, such as the wage and price traces. Don't invent disk activity, CPU load, processes, or files to sell the OS metaphor.

**Done when:** a new visitor can recognize and use the desktop, open and switch apps with a keyboard, and inspect the shared market on desktop and phone. Browser tests cover window restoration and the existing admin boundary.

## 2. Make it a research workspace

The first read-only run snapshot is available from the Apps menu and `GET /export`. Its [versioned format](docs/run-export.md) records the current state and run context, and states why exact replay is unavailable. A local comparison command now describes differences between two exports. The remaining work in this section is isolated private experiment runs and question-led validation.

- Add a read-only snapshot or export with the kernel step, model status, policy settings, and market and agent state. The export must say when trained policies are unavailable and the kernel is sampling actions.
- Record enough run information to explain a result: model version, initial conditions, policy changes, and the interval captured. Define the format before adding a Files app.
- Explore private experiment runs for comparisons. Keep them separate from the public shared kernel so one visitor's trial cannot change everyone else's economy.
- Add phase-space views and empirical validation only when there is a specific economic question and a dataset to test against.

**Done when:** someone can reproduce or explain a captured result without relying on a screenshot of the live page.

## 3. Test a Linux lab in the browser

Build this as a separate prototype before making it part of the main experience.

- Try a small custom Linux image in [v86](https://github.com/copy/v86), which boots a Linux kernel in the browser. Compare it with [WebVM](https://github.com/leaningtech/webvm), which runs a Linux-compatible environment, and a hosted desktop reached through [Guacamole](https://guacamole.apache.org/).
- Give the guest one useful EconOS tool first: a read-only command that queries the existing shared kernel. The guest should not start another public economy or bypass the admin boundary.
- Measure startup time, transferred bytes, memory and CPU use, browser support, keyboard access, and whether the guest can maintain a reliable connection to the kernel. Check image redistribution and runtime licensing before choosing a platform.

**Decision gate:** continue toward a distributable EconOS Linux image only if the guest helps someone run or inspect an experiment better than the web desktop. Call the browser interface a desktop environment until an actual Linux image is built and shipped.

## Simulation backlog

- Extend the agent-based market model to study price formation and monetary shocks. State the hypothesis and validation method for each addition.
- Add parameter sweeps, then profile them before choosing vectorization or SIMD work.
- Keep real-time phase-space visualization and statistical comparison with empirical macro data as research goals tied to reproducible runs.

## Out of scope

- Financial trading advice or speculation models.
- Closed-source proprietary data feeds.
- Decorative OS features with no working behavior or research use.

The current UI tokens and behavior are documented in [DESIGN.md](DESIGN.md). Update that document when the desktop prototype establishes a new direction.
