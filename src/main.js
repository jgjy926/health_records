// Bootstrap: lock screen first, then hash-routed tabs.
import { APP_VERSION } from './config.js';
import { state } from './state.js';
import { initLock, showLock } from './lock.js';
import { renderSwitcher } from './profiles.js';
import { renderOverview, renderReports, renderAdd, renderTrends, renderSettings } from './views.js';

const VIEWS = {
  overview: renderOverview, reports: renderReports, add: renderAdd, trends: renderTrends, settings: renderSettings,
};

function route() {
  if (!state.vault) return;
  const name = (location.hash || '#overview').slice(1);
  state.view = VIEWS[name] ? name : 'overview';
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== state.view; });
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === state.view));
  VIEWS[state.view](document.getElementById(`view-${state.view}`));
  window.scrollTo(0, 0);
}

function renderAll() { renderSwitcher(route); route(); }

document.getElementById('appVersion').textContent = `v${APP_VERSION}`;
document.getElementById('lockNow').addEventListener('click', showLock);
window.addEventListener('hashchange', route);
initLock(renderAll);
