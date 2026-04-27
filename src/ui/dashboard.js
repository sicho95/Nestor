import { listBackends, callLLM } from '../api/backends.js';
import { saveAgent, deleteAgent, exportAgentsJson, downloadText, importAgentsJson, lsGet, lsSet } from '../storage/agents-db.js';
import { gardenerMerge } from '../core/gardener.js';

const ROLE_ICONS = {
  orchestrator: '🧠', gardener: '🌿', factory: '🏭',
  'monthly-payments': '📅', 'pea-portfolio': '📈', stories: '📚',
  research: '🔍', generic: '🤖',
};
function roleIcon(role) { return ROLE_ICONS[role] || '🤖'; }
function tag(text, color) {
  const s = document.createElement('span');
  s.textContent = text;
  Object.assign(s.style, { fontSize:'10px', padding:'2px 6px', borderRadius:'10px',
    background: color || '#2a2a2a', color:'#ccc', display:'inline-block', marginRight:'4px' });
  return s;
}

export function renderDashboard(container, state, rerender) {
  container.innerHTML = '';

  if (state.view === 'chat' && state.activeAgent) { renderChatView(container, state, rerender); return; }
  if (state.view === 'edit' && state.editingAgent) { renderEditView(container, state, rerender); return; }
  if (state.view === 'fabrique') { renderFabriqueView(container, state, rerender); return; }

  const header = el('div', { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' });
  const title = el('div', { fontWeight:'600', fontSize:'15px' });
  title.textContent = state.view === 'settings' ? '\u2699\uFE0F Reglages' : '\uD83E\uDD16 Agents';

  const actions = el('div', { display:'flex', gap:'8px', flexWrap:'wrap' });

  if (state.view === 'agents') {
    const btnFabrique = btn('+ Fabrique', 'primary', () => { state.view = 'fabrique'; rerender(); });
    const btnJardinier = btn('\uD83C\uDF3F Jardinier', '', async () => {
      btnJardinier.textContent = '\u23F3 En cours\u2026';
      btnJardinier.disabled = true;
      try {
        const merged = await gardenerMerge(state.agents, []);
        for (const a of merged) await saveAgent(a);
        state.agents = merged;
        showToast('Jardinier : ' + merged.length + ' agent(s) revise(s).');
      } catch(e) { showToast('Erreur Jardinier : ' + e.message, true); }
      rerender();
    });
    const btnExportAll = btn('\u2B07 Export', '', () => { downloadText('nestor-agents.json', exportAgentsJson(state.agents)); });
    const btnImport = btn('\u2B06 Import', '', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json';
      input.onchange = async () => {
        try {
          const text = await input.files[0].text();
          state.agents = await importAgentsJson(text, gardenerMerge);
          showToast('Import OK : ' + state.agents.length + ' agents.');
          rerender();
        } catch(e) { showToast('Erreur import : ' + e.message, true); }
      };
      input.click();
    });
    actions.append(btnFabrique, btnJardinier, btnExportAll, btnImport);
  }

  header.append(title, actions);
  container.appendChild(header);

  if (state.view === 'agents') renderAgentsList(container, state, rerender);
  else renderSettings(container, state, rerender);
}

function renderAgentsList(container, state, rerender) {
  if (!state.agents || state.agents.length === 0) {
    const empty = el('div', { textAlign:'center', padding:'40px 0', color:'#666' });
    empty.textContent = 'Aucun agent. Utilisez la Fabrique pour en créer un.';
    container.appendChild(empty);
    return;
  }

  const list = el('div', { display:'flex', flexDirection:'column', gap:'10px' });

  state.agents.forEach((agent) => {
    const card = el('div', {
      background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'10px',
      padding:'12px', display:'flex', flexDirection:'column', gap:'6px'
    });

    const topRow = el('div', { display:'flex', alignItems:'center', gap:'8px' });
    const icon = el('span', { fontSize:'20px' }); icon.textContent = roleIcon(agent.role);
    const nameEl = el('div', { fontWeight:'600', fontSize:'14px', flex:'1' });
    nameEl.textContent = agent.name;
    const backendBadge = tag(agent.backendId || 'groq-llama', '#1c2a1c');
    topRow.append(icon, nameEl, backendBadge);

    const descEl = el('div', { fontSize:'12px', color:'#888', lineHeight:'1.4' });
    descEl.textContent = agent.description || '';

    const tagsRow = el('div', { display:'flex', flexWrap:'wrap', gap:'4px' });
    (agent.tags || []).forEach(t => tagsRow.appendChild(tag(t)));

    card.append(topRow, descEl, tagsRow);

    if (agent.preferences && agent.preferences.length > 0) {
      const prefEl = el('div', { fontSize:'11px', color:'#5a9', fontStyle:'italic' });
      prefEl.textContent = '\uD83D\uDCCB ' + agent.preferences.slice(-2).join(' \u2022 ');
      card.appendChild(prefEl);
    }

    const btnsRow = el('div', { display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'4px' });

    const btnChat = btn('\uD83D\uDCAC Parler', 'primary', () => {
      if (!agent.backendId) agent.backendId = 'groq-llama';
      state.activeAgent = agent;
      state.chatHistory = [{ role: 'system', content: agent.system_prompt || '' }];
      state.view = 'chat';
      rerender();
    });

    const btnEdit = btn('\u270F\uFE0F Editer', '', () => {
      state.editingAgent = JSON.parse(JSON.stringify(agent));
      state.view = 'edit';
      rerender();
    });

    const btnDel = btn('\uD83D\uDDD1', '', async () => {
      if (!confirm('Supprimer ' + agent.name + ' ?')) return;
      await deleteAgent(agent.id);
      state.agents = state.agents.filter(a => a.id !== agent.id);
      rerender();
    });
    btnDel.style.marginLeft = 'auto';

    btnsRow.append(btnChat, btnEdit, btnDel);
    card.appendChild(btnsRow);
    list.appendChild(card);
  });

  container.appendChild(list);
}

function renderChatView(container, state, rerender) {
  const agent = state.activeAgent;
  state.chatHistory = state.chatHistory || [{ role:'system', content: agent.system_prompt || '' }];

  const header = el('div', { display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' });
  const title = el('div', { fontWeight:'600', fontSize:'15px', flex:'1' });
  title.textContent = roleIcon(agent.role) + ' ' + agent.name;
  header.append(title);
  container.appendChild(header);

  const msgArea = el('div', {
    flex:'1', overflowY:'auto', display:'flex', flexDirection:'column', gap:'8px',
    padding:'8px 0', maxHeight:'55vh', minHeight:'120px'
  });

  const renderMessages = () => {
    msgArea.innerHTML = '';
    state.chatHistory.filter(m => m.role !== 'system').forEach(m => {
      const bubble = el('div', {
        maxWidth:'85%', padding:'8px 12px', borderRadius:'12px', fontSize:'13px', lineHeight:'1.5',
        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
        background: m.role === 'user' ? '#1a3a2a' : '#1e1e2e',
        color: '#ddd', whiteSpace:'pre-wrap'
      });
      bubble.textContent = m.content;
      msgArea.appendChild(bubble);
    });
    msgArea.scrollTop = msgArea.scrollHeight;
  };
  renderMessages();
  container.appendChild(msgArea);

  const feedbackZone = el('div', { margin:'4px 0' });
  const feedbackToggle = btn('\uD83D\uDCDD Corriger / Feedback', '', () => {
    feedbackInput.style.display = feedbackInput.style.display === 'none' ? 'block' : 'none';
    feedbackSend.style.display = feedbackSend.style.display === 'none' ? 'inline-block' : 'none';
  });
  feedbackToggle.style.fontSize = '11px';
  const feedbackInput = document.createElement('textarea');
  Object.assign(feedbackInput.style, {
    display:'none', width:'100%', marginTop:'4px', background:'#111', color:'#ccc',
    border:'1px solid #333', borderRadius:'6px', padding:'6px', fontSize:'12px', boxSizing:'border-box'
  });
  feedbackInput.placeholder = 'Correction ou preference pour cet agent\u2026';
  feedbackInput.rows = 2;
  const feedbackSend = btn('\u2714 Enregistrer', 'primary', async () => {
    const txt = feedbackInput.value.trim();
    if (!txt) return;
    agent.preferences = agent.preferences || [];
    agent.preferences.push(txt);
    agent.metrics = agent.metrics || {};
    agent.metrics.corrections = (agent.metrics.corrections || 0) + 1;
    await saveAgent(agent);
    state.agents = state.agents.map(a => a.id === agent.id ? agent : a);
    feedbackInput.value = '';
    feedbackInput.style.display = 'none';
    feedbackSend.style.display = 'none';
    showToast('Correction enregistree pour ' + agent.name);
  });
  feedbackSend.style.display = 'none'; feedbackSend.style.marginTop = '4px';
  feedbackZone.append(feedbackToggle, feedbackInput, feedbackSend);
  container.appendChild(feedbackZone);

  const inputRow = el('div', { display:'flex', gap:'8px', marginTop:'4px' });
  const input = document.createElement('input');
  Object.assign(input.style, {
    flex:'1', background:'#111', color:'#fff', border:'1px solid #333',
    borderRadius:'8px', padding:'8px 10px', fontSize:'14px'
  });
  input.placeholder = 'Ton message\u2026';
  input.setAttribute('autocomplete', 'off');

  const sendBtn = btn('Envoyer', 'primary', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  async function send() {
    const msg = input.value.trim(); if (!msg) return;
    input.value = ''; sendBtn.disabled = true; sendBtn.textContent = '\u23F3';
    state.chatHistory.push({ role:'user', content: msg });
    renderMessages();

    const prefs = (agent.preferences || []).join('\n');
    const sysContent = agent.system_prompt + (prefs ? '\n\nPreferences utilisateur :\n' + prefs : '');
    const messages = [
      { role:'system', content: sysContent },
      ...state.chatHistory.filter(m => m.role !== 'system')
    ];

    try {
      const backendId = agent.backendId || 'groq-llama';
      const choice = await callLLM(backendId, { messages, agentConfig: agent });
      const reply = choice?.message?.content || '(pas de reponse)';
      state.chatHistory.push({ role:'assistant', content: reply });

      if (agent.role === 'orchestrator' && reply.includes('"name"') && reply.includes('"system_prompt"')) {
        tryAutoCreateAgent(reply, state, rerender);
      }
    } catch(e) {
      state.chatHistory.push({ role:'assistant', content:'\u26A0\uFE0F Erreur : ' + e.message });
    }
    sendBtn.disabled = false; sendBtn.textContent = 'Envoyer';
    renderMessages();
    agent.metrics = agent.metrics || {};
    agent.metrics.lastUsed = new Date().toISOString();
    await saveAgent(agent);
  }

  inputRow.append(input, sendBtn);
  container.appendChild(inputRow);
}

// ... reste du fichier identique ...
