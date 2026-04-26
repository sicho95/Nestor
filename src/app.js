import { loadAgents } from './storage/agents-db.js';
import { initBackends } from './api/backends.js';
import { renderDashboard } from './ui/dashboard.js';

async function main() {
  const root = document.getElementById('app-root');
  if (!root) { console.error('[Nestor] #app-root introuvable'); return; }

  // Service worker — chemins relatifs
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
    } catch (e) {
      console.warn('[Nestor] SW non enregistré :', e);
    }
  }

  try {
    await initBackends();
  } catch (e) {
    console.warn('[Nestor] initBackends échoué :', e);
  }

  let agents = [];
  try {
    agents = await loadAgents();
  } catch (e) {
    console.error('[Nestor] loadAgents échoué :', e);
  }

  const state = {
    view: 'agents',
    agents,
    activeAgent: null,      // corrigé (was activeAgentId)
    editingAgent: null,
    chatHistory: [],
  };

  renderFrame(root, state);
}

function renderFrame(root, state) {
  // Conserver la vue courante (chat/edit ont leur propre back btn)
  const safeViews = ['agents', 'settings', 'chat', 'edit', 'fabrique'];
  if (!safeViews.includes(state.view)) state.view = 'agents';

  root.innerHTML = '';

  const frame = document.createElement('div');
  frame.className = 'lvgl-frame';

  // Barre de statut
  const statusBar = document.createElement('div');
  statusBar.className = 'lvgl-status-bar';
  statusBar.innerHTML = '<span>🧠 Nestor</span><span style="font-size:11px;opacity:0.6">meta-agent</span>';

  // Layout principal
  const mainEl = document.createElement('div');
  mainEl.className = 'lvgl-main';

  // Sidebar (masquée en chat/edit/fabrique pour gagner de l\'espace)
  const hideSidebar = ['chat', 'edit', 'fabrique'].includes(state.view);
  const sidebar = document.createElement('div');
  sidebar.className = 'lvgl-sidebar';
  sidebar.style.display = hideSidebar ? 'none' : '';

  const mkNavBtn = (label, viewName) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('active', state.view === viewName);
    b.onclick = () => {
      state.view = viewName;
      state.activeAgent = null;
      state.editingAgent = null;
      renderFrame(root, state);
    };
    return b;
  };
  sidebar.append(mkNavBtn('Agents', 'agents'), mkNavBtn('Réglages', 'settings'));

  const content = document.createElement('div');
  content.className = 'lvgl-content';

  const rerender = () => renderFrame(root, state);
  renderDashboard(content, state, rerender);

  mainEl.append(sidebar, content);
  frame.append(statusBar, mainEl);
  root.appendChild(frame);
}

main().catch(e => console.error('[Nestor] main crash :', e));
