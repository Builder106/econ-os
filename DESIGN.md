# EconOS desktop design

EconOS is a tiling desktop for one shared economy. It belongs to the i3 and sway family: panes
tile the screen with no gaps, numbered workspaces sit in a text bar, a one-line launcher opens
apps and runs shell commands, and a binding mode drives everything from the keyboard. It is a
working research tool, so every number on screen comes from the kernel or from this browser
session.

## References

Collected 2026-10-22. Reference images were not stored, so the sources are listed for later
review.

| Source | What it shows | What we took |
| --- | --- | --- |
| [i3 screenshots](https://i3wm.org/screenshots/) 2, 6, 9, 13, 14 | Stock i3: hairline borders, a one-line title per window, i3bar and i3status text blocks | Zero gaps, one-line titles, bar blocks as plain text separated by rules |
| [i3 screenshot 7](https://i3wm.org/screenshots/) | Floating windows over a tiled workspace | Floating is the exception: a toggle on one pane |
| [i3 user guide](https://i3wm.org/docs/userguide.html) | Binding modes, `split`, `layout stacking/tabbed/toggle split`, scratchpad, `focus`/`move` | Command names, the mode indicator, scratchpad `-` keys |
| [sway](https://swaywm.org/) and its man pages | The same tree model under Wayland | Parity with i3 naming |
| [Waybar examples wiki](https://github.com/Alexays/Waybar/wiki/Examples) (Pipshag Nord, chaibronz, DN-debug sway, cjbassi, qoheniac) | Status bars from flat text to pill clusters | Avoid the pills, icon fonts and rounded clusters that most configs share |
| [dmenu](https://tools.suckless.org/dmenu/) | A single input line over the bar, matches inline to the right | The launcher is one line, matches inline, Tab cycles |
| [rofi themes](https://github.com/davatorium/rofi-themes) | Centered launcher cards | Rejected: a centered card reads as a web modal |
| [iTerm2 color schemes](https://iterm2colorschemes.com/) | Common terminal palettes | Checked for collisions: the chosen palette is not one of them |
| Research workstations (Jupyter, R terminals, exchange order-book monitors) | Dense numeric columns, tabular figures, monospace everywhere | Density and right-aligned tabular figures only. No Bloomberg look, palette or layout |

## Direction

The window manager family is fixed: i3 and sway style tiling, small or no gaps, hard edges,
thin borders that show focus, and fast motion. Three themes were written inside it.

### A. Temper

Blued steel and the oxide colors steel takes when it is tempered (straw, bronze, purple, blue)
carry the data, and a double engraved rule marks the focused pane.

- Default layout: workspace 1 splits Market (left, 58%) from a vertical stack of Agents over
  Shell. Workspace 2 is Lorenz beside a stack of Policy over a tabbed container that holds
  Events and Run.
- Signature moment: on a policy event, the focused pane's double rule and the bar's event block
  show the new value within one tick. The tax change prints in the bar as text, and the wage and
  price traces bend on the next ticks.
- Screenshot frame: four panes tiled edge to edge on blued steel, the wage trace in straw and
  the price trace in temper blue, the bar reading `1 2 | wm | connected | step 1832 | tax
  12.00% | gini 0.3114 | visitor`.
- Scores: quant feel 5, legibility 5, originality 4, feasibility 5, honesty 5. Total 24.

### B. Ledger

A light-first desk ledger: ruled paper, red and blue ruling ink, a bottom bar like a ledger's
total line, and panes separated by rulings instead of borders.

- Default layout: one workspace, tabbed, each app a ledger page.
- Signature moment: a new tick writes one ruled line into the Events page.
- Screenshot frame: a ruled light page with a red margin rule.
- Scores: quant feel 3 (tabbed by default hides density), legibility 4, originality 4,
  feasibility 4, honesty 5. Total 20. It also leans toward the broadsheet default the art
  direction guide warns about.

### C. Phosphor

A single amber phosphor on black: every pane, chart and glyph in one hue at different
intensities.

- Default layout: the same as A.
- Signature moment: the chart traces bloom at the newest tick.
- Screenshot frame: amber on black, scanlines.
- Scores: quant feel 4, legibility 2 (one hue cannot separate wage from price for many viewers),
  originality 2 (a popular retro dotfiles theme), feasibility 5, honesty 5. Total 18.

**Choice: Temper.** It scores highest, and the double rule plus the temper palette gives data
colors a real material origin instead of a borrowed dotfiles theme.

### Genericness test

"Would a generic model land on this?" Each part was checked and changed where it failed.

| Part | Generic answer | Changed to |
| --- | --- | --- |
| Palette | Nord, Catppuccin or Gruvbox; near-black plus one acid green | Blued steel ground with temper oxides as data roles; chrome stays neutral |
| Focus | A colored 2 px border | A 3 px double rule, like an engraved plate line |
| Bar | Rounded pills with icon-font glyphs | Flat text blocks separated by real vertical rules, tabular figures, glyphs drawn for this project |
| Font | JetBrains Mono | Azeret Mono, one family at three weights |
| Launcher | A centered rofi card | A dmenu line that replaces the bar |
| Wallpaper | A gradient or an anime still | A rendered engine-turned steel plate (guilloché) in blued and bright finishes |
| Splash | A fake boot log | A real connection log: kernel URL, socket state, first tick step |
| Icons | Lucide or Material symbols | An original 24 px line set with square caps, drawn in Glaxnimate |

## Palette

Chrome and data roles are separate. Chrome tokens never encode data, and data tokens never
decorate chrome. Signs are always printed (`+0.0123`, `−0.0040`); color only repeats them.

| Token | Role | Dark (blued steel) | Light (bright nickel) |
| --- | --- | --- | --- |
| `--ground` | Desktop and empty workspace | `#0b1115` | `#dfe5e9` |
| `--pane` | Pane body | `#10181d` | `#f3f5f7` |
| `--pane-2` | Title bars, table stripes, inputs | `#162127` | `#e7ecef` |
| `--ink` | Primary text | `#d9e1e6` | `#11181d` |
| `--muted` | Secondary text (AA on `--pane`) | `#8d9ca6` | `#4a5964` |
| `--line` | Unfocused hairlines | `#25333c` | `#b9c4cb` |
| `--focus` | Focused pane rule and focus rings | `#d7b25c` (straw) | `#7c5a0e` |
| `--urgent` | Errors and failures | `#ef7b66` | `#a93520` |
| `--d-wage` | Wage trace | `#d7b25c` (straw) | `#8a6410` |
| `--d-price` | Price trace | `#6aa6dc` (temper blue) | `#1d5c96` |
| `--d-lorenz` | Lorenz curve and Gini | `#b58fe0` (temper purple) | `#6a3ea3` |
| `--d-equal` | Line of equality | `#5d6d77` | `#8b98a1` |
| `--d-pos` | Positive values (with `+`) | `#7fc8b4` | `#1d6e5c` |
| `--d-neg` | Negative values (with `−`) | `#ef7b66` | `#a93520` |
| `--d-bronze` | Treasury and money totals | `#c98a55` | `#86501f` |

Straw is both the focus color and the wage color by origin (the first temper oxide). They never
meet: focus appears only on pane rules and focus rings, and wage only inside the Market plot and
its legend.

The light theme is cool nickel gray, never cream. The theme follows `prefers-color-scheme`
until the user picks one; the choice is stored locally.

## Type

One family: **Azeret Mono** (Displaay, SIL Open Font License 1.1, downloaded from Fontshare and self-hosted as woff2 at 400, 500 and 700).
Monospace carries data, the bar, the terminal and pane titles. Hierarchy comes from weight,
color and position, not from size jumps.

| Use | Size | Weight |
| --- | --- | --- |
| Bar, titles, tables, terminal | 12.5 px desktop, 13.5 px phone | 400 |
| Values and focused title | same | 500 |
| Readout figures (Market, Lorenz) | 20 px | 500 |
| Wordmark | Glaxnimate path from Azeret Mono 700 | n/a |

All numbers use `tabular-nums`. Units follow a non-breaking space.

## Space, radius, borders

- Spacing scale: 2, 4, 6, 8, 12, 16, 24 px (`--s1` to `--s7`).
- Radius rule: 0 everywhere. No exceptions.
- Gaps between panes: 0. Panes share hairlines.
- Unfocused pane: 1 px `--line` border. Its title-bar tools dim to 45% and leave the tab order;
  they return on hover or keyboard focus. The binding mode reaches every pane.
- Focused pane: 3 px double `--focus` border. The title text turns `--ink` at 500 weight.
- Keyboard focus inside a pane: 1 px solid `--focus` outline at 1 px offset.
- Hover: one verb for all chrome buttons (workspaces, bar buttons, title-bar tools, tabs): the
  colors invert to `--pane` on `--ink`. Close inverts on `--urgent`. An unfocused pane's border
  darkens to `--muted` under the pointer, previewing where a click lands.

## Bar

A 26 px text bar at the top (32 px on phones), with 25 px pane title bars (24 px inside their rule), so every pointer target is at least 24 px square. Left: workspace numbers (only occupied ones plus the current),
then the binding mode block when a mode is active. Right, in order: kernel state in words, step,
paused when paused, tax rate, Gini, action source (`trained` or `sampled actions`), connected viewers (the kernel's `/healthz` subscriber count, every 15 s), session role
(`visitor` or `admin`), latest event for 10 s, and the scratchpad count when it is not empty.
Blocks are separated by 1 px vertical rules, never dots. Every block is a button or plain text
with real data. Glyphs from the icon set sit before the connection and role words; the words
carry the meaning.

## Launcher

`` Ctrl+` `` then `d`, or the bar's `run` button, replaces the bar with a dmenu line:
a prompt, the input, and the inline matches. Apps match by name. Any other input runs as a
shell command, and its output is written to the Shell pane. `Enter` runs, `Tab` and the arrow
keys cycle matches, `Esc` closes.

## Icon grid

24 px grid, 1.5 px strokes, square caps, miter joins, no fills except hatching. App icons:
market, lorenz, agents, shell, policy, events, run, keys. Layout and bar glyphs use a 16 px grid
with 1.25 px strokes: splith, splitv, tabbed, stacked, fullscreen, floating, scratchpad, close,
move, link, unlink, lock, unlock, pause. All are `<symbol>`s in one sprite, colored with
`currentColor`.

## Keybindings

Browsers and operating systems claim most modifiers: Super, Alt (menus and Firefox tab
switching), Ctrl with letters, Cmd. EconOS uses an i3 binding mode instead. **`` Ctrl+` ``** (the
key above Tab) enters `wm` mode, and the bar shows `wm`. No browser or OS claims that chord.
Keys then act until `Esc`, `Enter` on a pane, or `` Ctrl+` `` again. Opening an app, the launcher
or help leaves the mode.

| Key in `wm` mode | Action |
| --- | --- |
| `h j k l` or arrows | Focus left, down, up, right |
| `Shift` + `h j k l` or arrows | Move (swap) the focused pane in that direction |
| `1`–`9` | Switch to workspace |
| `Shift` + `1`–`9` | Move the focused pane to workspace |
| `b` / `v` | Next open splits horizontally / vertically |
| `e` | Toggle split direction of the focused container |
| `w` / `s` | Tabbed / stacked layout for the focused container |
| `f` | Fullscreen the focused pane, again to restore |
| `Shift+Space` | Toggle floating for the focused pane |
| `Shift+-` / `-` | Send to scratchpad / show the next scratchpad pane |
| `r` | Resize mode: `h j k l` shrink and grow, `Esc` leaves |
| `Enter` | Open Shell |
| `d` | Launcher |
| `Shift+q` | Close the focused pane |
| `t` | Toggle light and dark theme |
| `?` | Keys help |

Every action also has a pointer path: the bar holds workspaces, layout, scratchpad, launcher and
theme buttons; each title bar holds split, layout, float, fullscreen, scratchpad, move and close
buttons (a pane inside a tabbed or stacked container has no title bar, as in i3: its tab is the
title, and the strip carries the tools for the visible pane); splits drag to resize; a floating pane drags by its title bar.

## Motion

Fast and flat: transforms and opacity only, no springs, bounce or overshoot. The one exception is the boot and splash mark, whose strokes draw on with `stroke-dashoffset` on a small SVG.

| Event | Motion | Time |
| --- | --- | --- |
| Pane open | Opacity 0 to 1, scale 0.985 to 1 | 90 ms ease-out |
| Split | The new pane enters from its split side by 8 px with opacity | 90 ms |
| Fullscreen and restore | FLIP from the pane's rect to the work area | 120 ms |
| Workspace switch | The work area enters from ±12 px in number order with opacity | 100 ms |
| Boot and splash | The mark draws itself in a loop: outer rule, inner rule, line of equality, Lorenz curve, then the hatching, then a fade. The loop starts in `index.html` before any script loads, and the splash keeps it until the first tick | 2.8 s per loop |
| Splash close | Opacity 1 to 0 | 160 ms |

Reduced motion: every change is instant. A workspace switch moves the work area; panes that appear on the same workspace get the open motion, so the two never stack. The boot screen and splash show the finished, static mark. No running
animations remain (`document.getAnimations()` is empty).

## Charts

The Market plots are hand-drawn on a 2D canvas: one polyline per series, redrawn on each 500 ms tick from a ring buffer of the last 600 steps (240 shown). It is the smallest route that streams without a charting library. Wage and price get separate plots because their scales differ, each with its own range labels, a quarter-height hairline grid and a vertical rule every 20 steps. The Lorenz pane draws the curve, the line of equality and the hatched gap from the tick's quantiles.

## Workspace maps

Wide screens (more than 600 px):

```text
+--------------------------------------------------------------------------+
| 1 2 | run |           connected | step 1832 | tax 12.00% | gini 0.3114 |
+---------------------------------------------+----------------------------+
| market                                      | agents                     |
|                                             |  id         role  balance  |
|  wage ~~~~~~~~/\~~~~~                        |  ...                       |
|  price ___/\______                          +----------------------------+
|                                             | shell                      |
|  gini  cpi  real gdp  money  treasury       | visitor@econos:~$ _        |
+---------------------------------------------+----------------------------+
workspace 2: lorenz | policy over [events | run] tabbed
```

Phones (600 px and less): every workspace uses the tabbed layout and shows one pane.

```text
+------------------------------+
| 1 2 | run | live | step 1832 |
+------------------------------+
| market | agents | shell  ... |  <- tab strip, scrolls sideways inside itself
+------------------------------+
| market                       |
|  wage / price plot           |
|  readouts                    |
+------------------------------+
```

## Assets

Sources and exports are listed in [desktop/design/README.md](desktop/design/README.md).

| Id | Route | Role | Format | Budget |
| --- | --- | --- | --- | --- |
| `mark` | Glaxnimate | Logo, splash, favicon source | inline SVG | 2 KB |
| `wordmark` | Glaxnimate text-to-path (Azeret Mono 700) | Splash and OG wordmark | inline SVG path | 4 KB |
| `icons` | Glaxnimate | App, layout and bar glyph sprite | inline SVG sprite | 12 KB |
| `favicon` | Glaxnimate | Browser tab icon | SVG + 180 px PNG | 2 KB + 8 KB |
| `og` | Glaxnimate | Link preview | 1200x630 PNG | 120 KB |
| `wall-dark`, `wall-light` | Blender (Cycles) | Wallpaper behind empty workspaces and the splash | 2560x1440 WebP | 350 KB each |
