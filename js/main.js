import { store } from './store.js';
import { initNav, refresh } from './nav.js';
import { toast } from './sheets.js';
import { TrainScreen } from './views/today.js';
import { HistoryScreen } from './views/history.js';
import { ProgressScreen } from './views/progress.js';
import { ProgramScreen } from './views/program.js';
import { initWorkout } from './views/workout.js';
import { applyTheme } from './views/settings.js';

store.load();
applyTheme();

initNav(document.getElementById('tabs'), document.getElementById('tabbar'), [
  ['train', 'Train', 'train', TrainScreen],
  ['history', 'History', 'history', HistoryScreen],
  ['progress', 'Progress', 'progress', ProgressScreen],
  ['program', 'Program', 'program', ProgramScreen],
]);
initWorkout();

store.on(() => {
  refresh();
  if (store.failed) toast('Couldn’t save — storage is full');
});

// Coming back on a new day: Today needs to move on.
let shownDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const d = new Date().toDateString();
  if (d !== shownDay) {
    shownDay = d;
    refresh();
  }
});

// Lets :active styles show on iOS; blocks pinch-zoom in the standalone app.
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// The app shell never scrolls, but focusing a field (keyboard) can scroll these
// overflow:hidden containers and leave the whole UI shifted. Snap them back.
document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (el instanceof Element && el.matches('#app, #tabs, .tab') && (el.scrollTop || el.scrollLeft)) el.scrollTo(0, 0);
}, { capture: true, passive: true });

// Offline cache. Skipped on localhost so local edits show up without a version bump.
const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !location.search.includes('sw');
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !local) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      next?.addEventListener('statechange', () => {
        if (next.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version is ready', { action: 'Reload', onAction: () => location.reload(), ms: 10000 });
        }
      });
    });
  }).catch(() => {});
}

requestAnimationFrame(() => document.body.classList.add('ready'));
