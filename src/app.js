import { loadAgents } from './storage/agents-db.js';
import { initBackends } from './api/backends.js';
import { renderDashboard } from './ui/dashboard.js';

async function main() {
  const root = document.getElementById('app-root');
  if (!root) { console.error('[Nestor] #app-root introuvable'); return; }

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js'); }
    catch (e) { console.warn('[Nestor] SW:', e); }
  }

  try { await initBackends(); }
  catch (e) { console.warn('[Nestor] initBackends:', e); }

  let agents = [];
  try { agents = await loadAgents(); }
  catch (e) { console.error('[Nestor] loadAgents:', e); }

  const orchestrator = agents.find(a => a.role === 'orchestrator') || null;

  const state = {
    view: orchestrator ? 'chat' : 'agents',
    agents,
    activeAgent: orchestrator,
    editingAgent: null,
    chatHistory: orchestrator
      ? [{ role: 'system', content: orchestrator.system_prompt || '' }]
      : [],
    menuOpen: false,
  };

  renderFrame(root, state);
}

export function renderFrame(root, state) {
  const safeViews = ['agents', 'settings', 'chat', 'edit', 'fabrique'];
  if (!safeViews.includes(state.view)) state.view = 'chat';

  root.innerHTML = '';

  const frame = document.createElement('div');
  frame.className = 'lvgl-frame';

  const statusBar = document.createElement('div');
  statusBar.className = 'lvgl-status-bar';

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-weight:600;font-size:13px;';
  if (state.view === 'chat' && state.activeAgent) {
    titleEl.textContent = '\uD83E\uDDE0 ' + state.activeAgent.name;
  } else if (state.view === 'settings') {
    titleEl.textContent = '\u2699\uFE0F Reglages';
  } else if (state.view === 'fabrique') {
    titleEl.textContent = '\uD83C\uDFED Fabrique';
  } else if (state.view === 'edit') {
    titleEl.textContent = '\u270F\uFE0F Edition';
  } else {
    titleEl.textContent = '\uD83E\uDD16 Agents';
  }

  const hamburger = document.createElement('button');
  hamburger.innerHTML = state.menuOpen
    ? '\u2715'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  hamburger.style.cssText = 'background:none;border:none;color:#aaa;padding:4px 8px;font-size:16px;cursor:pointer;-webkit-tap-highlight-color:transparent;';
  hamburger.onclick = () => {
    state.menuOpen = !state.menuOpen;
    renderFrame(root, state);
  };

  statusBar.append(titleEl, hamburger);

  const rerender = () => renderFrame(root, state);

  let drawer = null;
  let drawerOverlay = null;
  if (state.menuOpen) {
    drawerOverlay = document.createElement('div');
    drawerOverlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);z-index:10;';
    drawerOverlay.onclick = () => { state.menuOpen = false; renderFrame(root, state); };

    drawer = document.createElement('div');
    drawer.style.cssText = [
      'position:absolute;top:0;left:0;bottom:0;width:220px;',
      'background:#0e0e0e;border-right:1px solid #222;',
      'z-index:11;display:flex;flex-direction:column;padding:12px 0;',
      'overflow-y:auto;-webkit-overflow-scrolling:touch;',
      'animation:slideIn 0.18s ease;'
    ].join('');

    const drawerTitle = document.createElement('div');
    drawerTitle.style.cssText = 'padding:8px 16px 12px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #1a1a1a;margin-bottom:8px;';
    drawerTitle.textContent = 'Nestor';
    drawer.appendChild(drawerTitle);

    const mkItem = (icon, label, action, isActive) => {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'background:' + (isActive ? '#1a2a1a' : 'none') + ';',
        'border:none;color:' + (isActive ? '#7ef' : '#bbb') + ';',
        'padding:12px 16px;text-align:left;font-size:13px;',
        'cursor:pointer;display:flex;align-items:center;gap:10px;',
        'border-left:2px solid ' + (isActive ? '#3a8a5a' : 'transparent') + ';',
        '-webkit-tap-highlight-color:transparent;width:100%;',
      ].join('');
      btn.innerHTML = '<span style="font-size:16px">' + icon + '</span><span>' + label + '</span>';
      btn.onclick = action;
      return btn;
    };

    const orch = state.agents.find(a => a.role === 'orchestrator');
    if (orch) {
      drawer.appendChild(mkItem('\uD83E\uDDE0', 'Parler a l\'Orchestrateur',
        () => {
          state.activeAgent = orch;
          state.chatHistory = [{ role: 'system', content: orch.system_prompt || '' }];
          state.view = 'chat';
          state.menuOpen = false;
          rerender();
        },
        state.view === 'chat' && state.activeAgent?.role === 'orchestrator'
      ));
    }

    const sep1 = document.createElement('div');
    sep1.style.cssText = 'height:1px;background:#1a1a1a;margin:6px 0;';
    drawer.appendChild(sep1);

    const otherAgents = state.agents.filter(a => a.role !== 'orchestrator' && a.role !== 'gardener' && a.role !== 'factory');
    if (otherAgents.length > 0) {
      const agentsLabel = document.createElement('div');
      agentsLabel.style.cssText = 'padding:4px 16px 6px;font-size:10px;color:#444;text-transform:uppercase;letter-spacing:0.08em;';
      agentsLabel.textContent = 'Parler a un agent';
      drawer.appendChild(agentsLabel);

      const ICONS = { 'monthly-payments':'\uD83D\uDCC5', 'pea-portfolio':'\uD83D\uDCC8', stories:'\uD83D\uDCDA', research:'\uD83D\uDD0D', generic:'\uD83E\uDD16' };
      otherAgents.forEach(a => {
        drawer.appendChild(mkItem(
          ICONS[a.role] || '\uD83E\uDD16', a.name,
          () => {
            state.activeAgent = a;
            state.chatHistory = [{ role: 'system', content: a.system_prompt || '' }];
            state.view = 'chat';
            state.menuOpen = false;
            rerender();
          },
          state.view === 'chat' && state.activeAgent?.id === a.id
        ));
      });
    }

    const sep2 = document.createElement('div');
    sep2.style.cssText = 'height:1px;background:#1a1a1a;margin:6px 0;';
    drawer.appendChild(sep2);

    drawer.appendChild(mkItem('\uD83E\uDD16', 'Gerer les agents', () => { state.view = 'agents'; state.menuOpen = false; rerender(); }, state.view === 'agents'));
    drawer.appendChild(mkItem('\uD83C\uDFED', 'Fabrique', () => { state.view = 'fabrique'; state.menuOpen = false; rerender(); }, state.view === 'fabrique'));
    drawer.appendChild(mkItem('\u2699\uFE0F', 'Reglages', () => { state.view = 'settings'; state.menuOpen = false; rerender(); }, state.view === 'settings'));
  }

  const mainEl = document.createElement('div');
  mainEl.className = 'lvgl-main';
  mainEl.style.position = 'relative';

  const content = document.createElement('div');
  content.className = 'lvgl-content';
  renderDashboard(content, state, rerender);

  mainEl.appendChild(content);
  if (drawerOverlay) mainEl.appendChild(drawerOverlay);
  if (drawer) mainEl.appendChild(drawer);

  frame.append(statusBar, mainEl);
  root.appendChild(frame);

  if (!document.getElementById('nestor-anim')) {
    const style = document.createElement('style');
    style.id = 'nestor-anim';
    style.textContent = '@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}';
    document.head.appendChild(style);
  }
}

main().catch(e => console.error('[Nestor] crash:', e));
