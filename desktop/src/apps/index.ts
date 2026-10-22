import type { AppId } from '../wm/tree';
import { agents } from './agents';
import type { AppDef } from './app';
import { events } from './events';
import { keys } from './keys';
import { lorenz } from './lorenz';
import { market } from './market';
import { policy } from './policy';
import { run } from './run';
import { shell } from './shell';

export const APPS: Record<AppId, AppDef> = { market, lorenz, agents, shell, policy, events, run, keys };
