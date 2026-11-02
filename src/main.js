// Bootstrap: lock screen first, then hash-routed tabs.
import { APP_VERSION } from './config.js';
import { state } from './state.js';
import { initLock, showLock } from './lock.js';
import { renderSwitcher } from './profiles.js';
import { renderOverview, renderSettings } from './views.js';
import { renderTrends } from './trends.js';
import { renderAdd } from './add.js';
import { renderReports } from './reports.js';
import { startSync, syncNow, setSyncListener } from './sync.js';

const VIEWS = {
  overview: renderOverview, reports: renderReports, add: renderAdd, trends: renderTrends, settings: renderSettings,
};

function route() {
  if (!state.vault) return;
  const [name, ...args] = (location.hash || '#overview').slice(1).split('/');
  state.view = VIEWS[name] ? name : 'overview';
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== state.view; });
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === state.view));
  VIEWS[state.view](document.getElementById(`view-${state.view}`), args);
  window.scrollTo(0, 0);
}

function renderAll() {
  renderSwitcher(route);
  route();
  syncNow();
}

const PILL = {
  off: ['Not synced', 'Sync is not set up. See Settings.'],
  pending: ['Changes waiting', 'Will sync shortly.'],
  syncing: ['Syncing…', 'Syncing with the gateway.'],
  synced: ['Synced', ''],
  offline: ['Offline', ''],
  error: ['Sync problem', ''],
};

function showSyncStatus({ state: s, detail }) {
  const pill = document.getElementById('syncStatus');
  const [text, title] = PILL[s] || PILL.off;
  pill.textContent = text;
  pill.title = detail || title;
  pill.dataset.state = s;
}

// Another device's changes arrived. A form the user is filling in stays as it is; its save merges in.
function remoteChanged() {
  renderSwitcher(route);
  if (!['add', 'settings'].includes(state.view) && !/\/(edit|new)$/.test(location.hash)) route();
}

document.getElementById('appVersion').textContent = `v${APP_VERSION}`;
document.getElementById('lockNow').addEventListener('click', showLock);
window.addEventListener('hashchange', route);
document.getElementById('syncStatus').addEventListener('click', syncNow);
setSyncListener(showSyncStatus);
startSync(remoteChanged);
initLock(renderAll);
