import { loadAgents } from './storage/agents-db.js';
import { initBackends } from './api/backends.js';
import { renderDashboard } from './ui/dashboard.js';

async function main() {
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/service-worker.js'); } catch (e) {}
  }

  await initBackends();
  const state = {
    view: 'agents',
    agents: await loadAgents(),
    activeAgentId: null,
  };

  const root = document.getElementById('app-root');
  renderFrame(root, state);
}

function renderFrame(root, state) {
  root.innerHTML = '';
  const frame = document.createElement('div');
  frame.className = 'lvgl-frame';

  const status = document.createElement('div');
  status.className = 'lvgl-status-bar';
  status.innerHTML = '<span>Nestor</span><span>meta-agent</span>';

  const main = document.createElement('div');
  main.className = 'lvgl-main';

  const sidebar = document.createElement('div');
  sidebar.className = 'lvgl-sidebar';

  const btnAgents = document.createElement('button');
  btnAgents.textContent = 'Agents';
  btnAgents.classList.toggle('active', state.view === 'agents');
  btnAgents.onclick = () => { state.view = 'agents'; renderFrame(root, state); };

  const btnSettings = document.createElement('button');
  btnSettings.textContent = 'Réglages';
  btnSettings.classList.toggle('active', state.view === 'settings');
  btnSettings.onclick = () => { state.view = 'settings'; renderFrame(root, state); };

  sidebar.append(btnAgents, btnSettings);

  const content = document.createElement('div');
  content.className = 'lvgl-content';

  renderDashboard(content, state, () => renderFrame(root, state));

  main.append(sidebar, content);
  frame.append(status, main);
  root.appendChild(frame);
}

main();
