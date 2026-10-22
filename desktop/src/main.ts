import './styles.css';
import { mountBar } from './bar';
import { setOpener } from './commands';
import { h, mountSprite } from './dom';
import { connect } from './kernel';
import { mountLauncher } from './launcher';
import { loadAnalytics } from './platform';
import { mountSplash } from './splash';
import { Desktop } from './wm/desktop';
import { APP_IDS, type AppId } from './wm/tree';

// Vercel serves its analytics script only on the split-host deploy, which is the build
// that names a remote kernel. The standalone kernel image has no such route.
if (__KERNEL_WS_URL__) loadAnalytics();
mountSprite();
mountSkipLink();
const bar = document.getElementById('bar') as HTMLElement;
const work = document.getElementById('work') as HTMLElement;
const desk = new Desktop(work);

function mountSkipLink(): void {
  const skip = h('a', { class: 'skip', href: '#work', text: 'skip to the focused pane' });
  skip.addEventListener('click', (e) => {
    e.preventDefault();
    desk.focusDom();
  });
  document.getElementById('desktop')?.prepend(skip);
}
const openLauncher = mountLauncher(bar, desk);
desk.setLauncher(openLauncher);
mountBar(bar, desk, openLauncher);
setOpener((name) => {
  if (!APP_IDS.includes(name as AppId)) return false;
  desk.open(name as AppId);
  return true;
});

mountSplash(() => {
  document.getElementById('desktop')?.removeAttribute('inert');
  desk.render();
});
desk.render();
connect();
