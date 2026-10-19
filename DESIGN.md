# EconOS design system

EconOS is a shared economic simulation shown through live instruments. The wage and price plot is the main visual. Agent balances, policy controls, and shell commands explain what is happening around it. The interface should feel like a workbench for inspecting an economy, with no invented telemetry or decorative system messages.

This is an improvement of the existing desktop, not a new brand. The live EconOS page is the visual reference. `dashboard/index.html` supplies the font stack and tool entry points, `dashboard/styles.css` supplies the theme tokens, and `dashboard/main.js` supplies the chart, ledger, shell, and window behavior. There is no motion library or previous design spec.

## Layout

The work surface fills the space between a compact system bar and the taskbar. Market and Agents open side by side for a new visitor, with the market taking about two thirds of the width. The app launcher opens Market, Agents, Shell, Policy, and the guide, and downloads a run snapshot. The taskbar switches between running apps and shows the real connection state and kernel step.

Windows can move, resize, minimize, maximize, and close. Their positions and sizes are stored in the visitor's browser and clamped when the viewport changes. Use Ctrl+Alt+Left or Ctrl+Alt+Right to switch apps; focus a window title and use the arrow keys to move it. At 600px or below, show one app at a time and use the taskbar to switch. A first visit shows Market on a phone. The page must work at 320px without horizontal page overflow.

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

Inter carries product names, headings, navigation, explanations, and controls. JetBrains Mono carries tick values, money, agent IDs, and shell input. The product name is compact in the system bar. Window titles are 18px. Reading copy is 14 to 15px. Data labels and metadata are 11 to 13px. Use sentence case except for real command syntax and agent IDs.

The spacing vocabulary is 4, 8, 12, 18, and 24px. Keep ledger rows compact, about 37px high, so all twelve agents can be scanned together. Give the chart more room than the readouts. Use a rule between major instruments or table headings, not around every value.

## Components

- **Market monitor:** One streamed Chart.js plot with wage and price named in its legend. The Gini coefficient and money in circulation sit beneath it with plain-language labels. The chart is the signature element because it draws actual kernel data.
- **Agent ledger:** Four columns for ID, role, balance, and latest reward. Preserve the short `C-` and `P-` IDs. Use aligned mono numbers and a quiet row rule. Positive and negative rewards keep a visible sign as well as color.
- **App launcher:** Native buttons with an icon and a readable label. Export snapshot downloads the shared run's state and provenance, with completion or failure announced in the taskbar. Tour starts the walkthrough; Guide opens the plain-language explanation.
- **Windows:** Solid surfaces with a title, minimize, maximize, and close controls. Each app can be moved and resized on desktop. The title is also a keyboard movement handle.
- **Taskbar:** Show running apps, connection state, and the current step in words. A clock is supporting information. Do not fabricate uptime, viewers, or a successful connection.
- **Guide:** Explain the shared simulation, the plot, and a few useful commands. Keep it on demand so it does not hide the live economy.

## Behavior and accessibility

Show `Connecting`, `Live`, or `Reconnecting` from the WebSocket state. Announce a connection change politely, but do not announce every tick. Keep focus visible on buttons, inputs, and links. Use native controls and an explicit label for each interactive element. The chart needs an accessible name, and numeric data remains available in adjacent readouts and the ledger.

The chart update is the main motion. Avoid a fake boot sequence, value flashes, and continuous pulsing status. No scroll smoothing layer is needed. Theme switching updates chart ink as well as CSS colors.

Preserve the shared WebSocket, admin gating, shell, tour, theme preference, and the chart and ledger IDs used by browser tests. `dashboard/index.html`, `dashboard/styles.css`, and `dashboard/main.js` are the implementation source for this system.
