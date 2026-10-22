// The binding table. The key handler and the Keys help pane both read it, so the help
// can never drift from what the keys do.

export type Action =
  | { do: 'focus'; dir: 'left' | 'right' | 'up' | 'down' }
  | { do: 'move'; dir: 'left' | 'right' | 'up' | 'down' }
  | { do: 'workspace'; n: number }
  | { do: 'send'; n: number }
  | { do: 'split'; layout: 'splith' | 'splitv' }
  | { do: 'layout'; layout: 'tabbed' | 'stacked' | 'toggle' }
  | { do: 'fullscreen' }
  | { do: 'floating' }
  | { do: 'scratch-send' }
  | { do: 'scratch-show' }
  | { do: 'resize-mode' }
  | { do: 'open'; app: 'shell' | 'keys' }
  | { do: 'launcher' }
  | { do: 'close' }
  | { do: 'theme' }
  | { do: 'exit' };

export const MODE_KEY = { code: 'Backquote', ctrl: true, label: 'Ctrl+`' };

const DIRS: Record<string, 'left' | 'right' | 'up' | 'down'> = {
  KeyH: 'left', KeyJ: 'down', KeyK: 'up', KeyL: 'right',
  ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up', ArrowRight: 'right',
};

/** Map a keydown in wm mode to an action. Uses physical key codes, so layouts agree. */
export function wmAction(e: KeyboardEvent): Action | null {
  const dir = DIRS[e.code];
  if (dir) return e.shiftKey ? { do: 'move', dir } : { do: 'focus', dir };
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) return e.shiftKey ? { do: 'send', n: Number(digit[1]) } : { do: 'workspace', n: Number(digit[1]) };
  switch (e.code) {
    case 'KeyB': return { do: 'split', layout: 'splith' };
    case 'KeyV': return { do: 'split', layout: 'splitv' };
    case 'KeyE': return { do: 'layout', layout: 'toggle' };
    case 'KeyW': return { do: 'layout', layout: 'tabbed' };
    case 'KeyS': return { do: 'layout', layout: 'stacked' };
    case 'KeyF': return { do: 'fullscreen' };
    case 'Space': return e.shiftKey ? { do: 'floating' } : null;
    case 'Minus': return e.shiftKey ? { do: 'scratch-send' } : { do: 'scratch-show' };
    case 'KeyR': return { do: 'resize-mode' };
    case 'Enter': return { do: 'open', app: 'shell' };
    case 'KeyD': return { do: 'launcher' };
    case 'KeyQ': return e.shiftKey ? { do: 'close' } : null;
    case 'KeyT': return { do: 'theme' };
    case 'Slash': return e.shiftKey ? { do: 'open', app: 'keys' } : null;
    case 'Escape': return { do: 'exit' };
    default: return null;
  }
}

export const HELP: [string, string][] = [
  [`${MODE_KEY.label}`, 'enter wm mode (the bar shows wm); again or Esc leaves'],
  ['h j k l, arrows', 'focus left, down, up, right'],
  ['Shift + h j k l, arrows', 'swap the focused pane in that direction'],
  ['1 to 9', 'switch workspace'],
  ['Shift + 1 to 9', 'send the focused pane to a workspace'],
  ['b / v', 'next pane opens beside / below'],
  ['e', 'toggle the split direction'],
  ['w / s', 'tabbed / stacked layout'],
  ['f', 'fullscreen the focused pane, again to restore'],
  ['Shift+Space', 'toggle floating'],
  ['Shift+- / -', 'send to scratchpad / show scratchpad'],
  ['r', 'resize mode: h j k l shrink and grow, Esc leaves'],
  ['Enter', 'open shell'],
  ['d', 'launcher: open an app or run a shell command'],
  ['Shift+q', 'close the focused pane'],
  ['t', 'toggle light and dark'],
  ['?', 'this help'],
];
