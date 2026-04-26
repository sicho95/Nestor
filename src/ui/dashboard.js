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
    const backendBadge = tag(agent.backendId || '?', '#1c2a1c');
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
  const backBtn = btn('\u2190', '', () => { state.view = 'agents'; state.activeAgent = null; rerender(); });
  const title = el('div', { fontWeight:'600', fontSize:'15px', flex:'1' });
  title.textContent = roleIcon(agent.role) + ' ' + agent.name;
  header.append(backBtn, title);
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
      const choice = await callLLM(agent.backendId || 'puter-qwen', { messages, agentConfig: agent });
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

async function tryAutoCreateAgent(reply, state, rerender) {
  try {
    const match = reply.match(/\{[\s\S]*?\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]);
    if (!parsed.name || !parsed.system_prompt) return;
    const newAgent = {
      id: 'agent-' + Date.now(),
      name: parsed.name,
      role: parsed.role || 'generic',
      description: parsed.description || '',
      tags: parsed.tags || [],
      backendId: parsed.backendId || 'puter-qwen',
      system_prompt: parsed.system_prompt,
      memory_profile: parsed.memory_profile || { level:'normal' },
      preferences: [], examples: [],
      metrics: { corrections:0, confidence:1, lastUsed:null },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (confirm('Orchestrateur propose un nouvel agent : "' + newAgent.name + '".\nL\'ajouter au registre ?')) {
      await saveAgent(newAgent);
      state.agents = state.agents.concat([newAgent]);
      showToast('Agent "' + newAgent.name + '" cree automatiquement.');
      rerender();
    }
  } catch (_) { /* JSON mal forme */ }
}

function renderFabriqueView(container, state, rerender) {
  const header = el('div', { display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' });
  const backBtn = btn('\u2190', '', () => { state.view = 'agents'; rerender(); });
  const title = el('div', { fontWeight:'600', fontSize:'15px' });
  title.textContent = '\uD83C\uDFED Fabrique d\'agents';
  header.append(backBtn, title);
  container.appendChild(header);

  const desc = el('div', { fontSize:'12px', color:'#888', marginBottom:'12px', lineHeight:'1.5' });
  desc.textContent = 'Decris l\'agent en quelques mots et clique "Generer". La Fabrique creera un agent specialise pret a l\'emploi.';
  container.appendChild(desc);

  const briefLabel = labelEl('Brief (ex: agent pour suivre mes abonnements)');
  const briefInput = document.createElement('textarea');
  Object.assign(briefInput.style, {
    width:'100%', background:'#111', color:'#ccc', border:'1px solid #333',
    borderRadius:'8px', padding:'8px', fontSize:'13px', boxSizing:'border-box'
  });
  briefInput.rows = 3;
  briefInput.placeholder = 'Agent pour gerer mes abonnements mensuels...';
  container.append(briefLabel, briefInput);

  const backendLabel = labelEl('Backend LLM');
  const backendSel = document.createElement('select');
  Object.assign(backendSel.style, {
    width:'100%', background:'#111', color:'#ccc', border:'1px solid #333',
    borderRadius:'8px', padding:'8px', fontSize:'13px', marginBottom:'10px'
  });
  listBackends().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.label;
    if (b.id === 'puter-qwen') opt.selected = true;
    backendSel.appendChild(opt);
  });
  container.append(backendLabel, backendSel);

  const previewZone = el('div', { display:'none' });
  container.appendChild(previewZone);

  const genBtn = btn('\u2728 Generer avec la Fabrique', 'primary', async () => {
    const brief = briefInput.value.trim();
    if (!brief) { showToast('Decris l\'agent d\'abord.', true); return; }
    genBtn.textContent = '\u23F3 Generation\u2026'; genBtn.disabled = true;
    previewZone.innerHTML = ''; previewZone.style.display = 'none';
    try {
      const fabAgent = state.agents.find(a => a.role === 'factory');
      if (!fabAgent) throw new Error('Agent Fabrique introuvable dans le registre.');
      const messages = [
        { role:'system', content: fabAgent.system_prompt },
        { role:'user', content: 'Brief : ' + brief }
      ];
      const choice = await callLLM(fabAgent.backendId || 'perplexity-sonar', { messages });
      const raw = choice?.message?.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('La Fabrique n\'a pas renvoye de JSON valide. Reessaie.');
      const parsed = JSON.parse(match[0]);
      if (!parsed.name || !parsed.system_prompt) throw new Error('JSON incomplet.');

      previewZone.style.display = 'block';
      const preTitle = el('div', { fontWeight:'600', marginBottom:'6px', marginTop:'12px' });
      preTitle.textContent = 'Previsualisation de l\'agent genere :';
      const preCard = el('div', { background:'#1a2a1a', border:'1px solid #2a4a2a', borderRadius:'10px', padding:'12px', fontSize:'12px', lineHeight:'1.6' });
      preCard.innerHTML = '\uD83D\uDCDB <b>' + esc(parsed.name) + '</b> <small>(' + esc(parsed.role || '') + ')</small><br>'
        + '<span style="color:#888">' + esc(parsed.description || '') + '</span><br><br>'
        + '<details><summary style="cursor:pointer;color:#5a9">Voir le prompt</summary><pre style="white-space:pre-wrap;font-size:11px;color:#aaa;margin-top:6px">'
        + esc(parsed.system_prompt) + '</pre></details>';

      const confirmBtn = btn('\u2714 Ajouter cet agent', 'primary', async () => {
        const newAgent = {
          id: 'agent-' + Date.now(),
          name: parsed.name, role: parsed.role || 'generic',
          description: parsed.description || '',
          tags: parsed.tags || [], backendId: backendSel.value,
          system_prompt: parsed.system_prompt,
          memory_profile: parsed.memory_profile || { level:'normal' },
          preferences: [], examples: [],
          metrics: { corrections:0, confidence:1, lastUsed:null },
          version: 1,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        await saveAgent(newAgent);
        state.agents = state.agents.concat([newAgent]);
        showToast('Agent "' + newAgent.name + '" ajoute.');
        state.view = 'agents'; rerender();
      });
      previewZone.append(preTitle, preCard, confirmBtn);
    } catch(e) {
      showToast('Erreur Fabrique : ' + e.message, true);
    }
    genBtn.textContent = '\u2728 Generer avec la Fabrique'; genBtn.disabled = false;
  });
  container.appendChild(genBtn);
}

function renderEditView(container, state, rerender) {
  const agent = state.editingAgent;
  const header = el('div', { display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' });
  const backBtn = btn('\u2190 Annuler', '', () => { state.view = 'agents'; state.editingAgent = null; rerender(); });
  const title = el('div', { fontWeight:'600', fontSize:'14px', flex:'1' });
  title.textContent = '\u270F\uFE0F ' + agent.name;
  header.append(backBtn, title);
  container.appendChild(header);

  const form = el('div', { display:'flex', flexDirection:'column', gap:'10px' });
  const fields = [
    { key:'name', lbl:'Nom', type:'text' },
    { key:'role', lbl:'Role (slug)', type:'text' },
    { key:'description', lbl:'Description', type:'textarea' },
    { key:'system_prompt', lbl:'System prompt', type:'textarea', rows:8 },
  ];
  fields.forEach(({ key, lbl, type, rows }) => {
    const lEl = labelEl(lbl);
    let inp;
    if (type === 'textarea') {
      inp = document.createElement('textarea');
      inp.rows = rows || 3;
    } else {
      inp = document.createElement('input');
      inp.type = 'text';
    }
    Object.assign(inp.style, {
      width:'100%', background:'#111', color:'#ccc', border:'1px solid #333',
      borderRadius:'8px', padding:'8px', fontSize:'13px', boxSizing:'border-box'
    });
    inp.value = agent[key] || '';
    inp.oninput = () => { agent[key] = inp.value; };
    form.append(lEl, inp);
  });

  const bLabel = labelEl('Backend');
  const bSel = document.createElement('select');
  Object.assign(bSel.style, { width:'100%', background:'#111', color:'#ccc', border:'1px solid #333', borderRadius:'8px', padding:'8px', fontSize:'13px' });
  listBackends().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.label;
    if (b.id === agent.backendId) opt.selected = true;
    bSel.appendChild(opt);
  });
  bSel.onchange = () => { agent.backendId = bSel.value; };
  form.append(bLabel, bSel);

  if (agent.preferences && agent.preferences.length > 0) {
    const pLabel = labelEl('\uD83D\uDCCB Preferences apprises (' + agent.preferences.length + ')');
    const pList = el('div', { background:'#111', border:'1px solid #222', borderRadius:'8px', padding:'8px', fontSize:'12px', color:'#5a9' });
    agent.preferences.forEach((p, i) => {
      const row = el('div', { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'6px', marginBottom:'4px' });
      const txt = el('span', {}); txt.textContent = '\u2022 ' + p;
      const delBtn = btn('\u2715', '', () => {
        agent.preferences.splice(i, 1);
        saveAgent(agent);
        state.agents = state.agents.map(a => a.id === agent.id ? agent : a);
        renderEditView(container, state, rerender);
      });
      delBtn.style.cssText = 'background:none;color:#f66;border:none;cursor:pointer;font-size:12px;padding:0;flex-shrink:0';
      row.append(txt, delBtn); pList.appendChild(row);
    });
    form.append(pLabel, pList);
  }

  const saveBtn = btn('\uD83D\uDCBE Enregistrer', 'primary', async () => {
    await saveAgent(agent);
    state.agents = state.agents.map(a => a.id === agent.id ? agent : a);
    state.view = 'agents'; state.editingAgent = null;
    showToast('Agent "' + agent.name + '" sauvegarde.');
    rerender();
  });
  form.appendChild(saveBtn);
  container.appendChild(form);
}

function renderSettings(container, state, rerender) {
  const backends = listBackends();
  const list = el('div', { display:'flex', flexDirection:'column', gap:'10px' });

  const noteEl = el('div', { fontSize:'12px', color:'#888', marginBottom:'8px', lineHeight:'1.5' });
  noteEl.innerHTML = '\uD83D\uDD11 Les cles API sont stockees localement sur cet appareil uniquement.<br>\uD83D\uDFE2 Puter.js ne necessite aucune cle.';
  list.appendChild(noteEl);

  backends.forEach((b) => {
    const card = el('div', { background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'12px' });
    const titleEl = el('div', { fontWeight:'600', fontSize:'13px', marginBottom:'4px' });
    titleEl.textContent = b.label;
    const typeEl = el('div', { fontSize:'11px', color:'#666', marginBottom:'8px' });
    typeEl.textContent = b.type;
    card.append(titleEl, typeEl);

    if (b.requiresApiKey && b.envKey) {
      const lEl = labelEl('Cle : ' + b.envKey);
      const inp = document.createElement('input');
      inp.type = 'password'; inp.autocomplete = 'off';
      Object.assign(inp.style, {
        width:'100%', background:'#111', color:'#ccc', border:'1px solid #333',
        borderRadius:'8px', padding:'8px', fontSize:'13px', boxSizing:'border-box'
      });
      inp.placeholder = 'sk-...';
      inp.value = lsGet(b.envKey) || '';
      inp.onchange = () => { lsSet(b.envKey, inp.value.trim()); showToast('Cle ' + b.envKey + ' sauvegardee.'); };
      card.append(lEl, inp);
    } else {
      const freeEl = el('div', { fontSize:'12px', color:'#5a9' });
      freeEl.textContent = '\u2705 Gratuit, aucune cle requise';
      card.appendChild(freeEl);
    }
    list.appendChild(card);
  });
  container.appendChild(list);
}

// ─── Utilitaires DOM ──────────────────────────────────────────────────────────
function el(tagName, styles) {
  const e = document.createElement(tagName);
  if (styles) Object.assign(e.style, styles);
  return e;
}
function btn(text, variant, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  Object.assign(b.style, {
    padding: variant === 'primary' ? '7px 14px' : '6px 12px',
    background: variant === 'primary' ? '#1a4a2a' : '#222',
    color: variant === 'primary' ? '#7ef' : '#ccc',
    border: '1px solid ' + (variant === 'primary' ? '#2a6a3a' : '#333'),
    borderRadius: '8px', fontSize: '13px', cursor:'pointer', whiteSpace:'nowrap',
  });
  b.onclick = onClick;
  return b;
}
function labelEl(text) {
  const l = el('div', { fontSize:'12px', color:'#888', marginBottom:'2px', marginTop:'6px' });
  l.textContent = text; return l;
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg, isError) {
  let toast = document.getElementById('nestor-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nestor-toast';
    Object.assign(toast.style, {
      position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
      padding:'10px 20px', borderRadius:'20px', fontSize:'13px',
      maxWidth:'80vw', textAlign:'center', zIndex:'9999',
      transition:'opacity 0.3s', pointerEvents:'none'
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? '#4a1a1a' : '#1a3a2a';
  toast.style.color = isError ? '#f88' : '#7ef';
  toast.style.border = '1px solid ' + (isError ? '#6a2a2a' : '#2a5a3a');
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}
