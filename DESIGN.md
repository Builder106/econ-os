# EconOS design system

EconOS is a shared economic simulation shown through live instruments. The wage and price plot is the main visual. Agent balances, policy controls, and shell commands explain what is happening around it. The interface should feel like a workbench for inspecting an economy, with no invented telemetry or decorative system messages.

This is an improvement of the existing desktop, not a new brand. The live EconOS page is the visual reference. `dashboard/index.html` supplies the font stack and tool entry points, `dashboard/styles.css` supplies the theme tokens, and `dashboard/main.js` supplies the chart, ledger, shell, and window behavior. There is no motion library or previous design spec.

## Layout

At desktop width, use a compact masthead, a 164px tool rail, and two docked instruments. The market plot gets roughly twice the width of the agent ledger. The kernel status stays in a narrow footer. This reflects the actual relationship between the market and its agents.

Below 980px, turn the rail into a horizontal tool strip and stack the instruments. Below 600px, stack the two macro readouts as well. The page must work at 320px without horizontal page overflow. Secondary tools can float on desktop; on a phone they join the reading flow. A first visit opens directly on live data, with the guide available on request.

## Tokens

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| Page | `#10161b` | `#e9eef0` | Space behind the instruments |
| Instrument | `#1b252b` | `#ffffff` | Windows, footer, and help surfaces |
| Primary ink | White at 92% | `#141820` at 92% | Headings and important numbers |
| Secondary ink | White at 65% | `#141820` at 62% | Labels and explanations |
| Cyan | `#76cbd9` | `#086579` | Agent IDs, Gini, focus, links |
| Green | `#76d7aa` | `#13704a` | Price and positive values |
| Gold | `#efc879` | `#805600` | Wage and treasury |
| Red | `#f18f84` | `#b63c32` | Losses and errors |

These are data roles, not a set of decorative accents. Status is always written as text. A color must never be the only way to identify a series or a result. Do not use cream surfaces, decorative status dots, neon glows, or an accent stripe on a panel.

## Type and space

Inter carries product names, headings, navigation, explanations, and controls. JetBrains Mono carries tick values, money, agent IDs, and shell input. The product name is 30 to 42px with a tight line height. Window titles are 18px. Reading copy is 14 to 15px. Data labels and metadata are 11 to 13px. Use sentence case except for real command syntax and agent IDs.

The spacing vocabulary is 4, 8, 12, 18, and 24px. Keep ledger rows compact, about 37px high, so all twelve agents can be scanned together. Give the chart more room than the readouts. Use a rule between major instruments or table headings, not around every value.

## Components

- **Market monitor:** One streamed Chart.js plot with wage and price named in its legend. The Gini coefficient and money in circulation sit beneath it with plain-language labels. The chart is the signature element because it draws actual kernel data.
- **Agent ledger:** Four columns for ID, role, balance, and latest reward. Preserve the short `C-` and `P-` IDs. Use aligned mono numbers and a quiet row rule. Positive and negative rewards keep a visible sign as well as color.
- **Tool rail:** Native buttons with an icon and a readable label. Market and Agents reopen their docked instruments; Shell and Policy open auxiliary windows; Tour starts the walkthrough.
- **Windows:** Solid surfaces with one title and one working Close button. Dock the two default instruments. Other windows may be moved on desktop.
- **Kernel footer:** Show connection state and the current step in words. A clock is supporting information. Do not fabricate uptime, viewers, or a successful connection.
- **Guide:** Explain the shared simulation, the plot, and a few useful commands. Keep it on demand so it does not hide the live economy.

## Behavior and accessibility

Show `Connecting`, `Live`, or `Reconnecting` from the WebSocket state. Announce a connection change politely, but do not announce every tick. Keep focus visible on buttons, inputs, and links. Use native controls and an explicit label for each interactive element. The chart needs an accessible name, and numeric data remains available in adjacent readouts and the ledger.

The chart update is the main motion. Avoid a fake boot sequence, value flashes, and continuous pulsing status. No scroll smoothing layer is needed. Theme switching updates chart ink as well as CSS colors.

Preserve the shared WebSocket, admin gating, shell, tour, theme preference, and the chart and ledger IDs used by browser tests. `dashboard/index.html`, `dashboard/styles.css`, and `dashboard/main.js` are the implementation source for this system.
