// One path for every shell line, whether typed in Shell, run from the launcher or sent by
// a Policy control: echo it masked, run local verbs here, send the rest to the kernel.

import { send } from './kernel';
import { type Ack, maskLine, verbOf } from './protocol';
import { session } from './session';
import { track } from './platform';

export const KERNEL_VERBS = ['help', 'who', 'gini', 'inspect', 'top', 'sudo', 'pause', 'resume', 'tax', 'redistribute', 'shock', 'reset'];
export const LOCAL_VERBS = ['clear', 'open'];

type Opener = (name: string) => boolean;
let opener: Opener = () => false;
export function setOpener(fn: Opener): void {
  opener = fn;
}

export async function runLine(line: string): Promise<Ack> {
  const trimmed = line.trim();
  const verb = verbOf(trimmed);
  session.print('in', maskLine(trimmed));
  if (!trimmed) return { type: 'ack', id: null, ok: true, output: '' };
  track('shell_command_run', { verb });

  if (verb === 'clear') {
    session.clearShell();
    return { type: 'ack', id: null, ok: true, output: '' };
  }
  if (verb === 'open') {
    const name = trimmed.split(/\s+/)[1] ?? '';
    const ok = opener(name);
    const ack: Ack = ok
      ? { type: 'ack', id: null, ok: true, output: `opened ${name}` }
      : { type: 'ack', id: null, ok: false, error: `no app named '${name}'` };
    report(ack);
    return ack;
  }

  const ack = await send(trimmed);
  report(ack);
  if (ack.ok && verb === 'sudo' && ack.auth?.is_admin) track('sudo_succeeded');
  if (ack.ok && verb === 'shock') track('admin_shock_fired');
  return ack;
}

function report(ack: Ack): void {
  if (ack.ok) {
    if (ack.output) session.print('out', ack.output);
  } else {
    session.print('err', ack.error ?? 'command failed');
  }
}
