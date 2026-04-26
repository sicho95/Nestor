import { listBackends, callLLM } from '../api/backends.js';
import { saveAgent, deleteAgent, exportAgentsJson, downloadText, importAgentsJson } from '../storage/agents-db.js';
import { gardenerMerge } from '../core/gardener.js';

// Vue principale: Agents ou Réglages
export function renderDashboard(container, state, rerender) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('div');
  title.textContent = state.view === 'agents' ? 'Agents' : 'Réglages';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';

  const btnGardener = document.createElement('button');
  btnGardener.textContent = 'Jardinier';
  btnGardener.onclick = async () => {
    const merged = await gardenerMerge(state.agents, []);
    for (const a of merged) await saveAgent(a);
    state.agents = merged;
    alert('Jardinier exécuté sur ' + merged.length + ' agent(s).');
    rerender();
  };

  const btnNew = document.createElement('button');
  btnNew.className = 'primary';
  btnNew.textContent = state.view === 'agents' ? 'Nouvel agent' : 'Importer agents';
  btnNew.onclick = async () => {
    if (state.view === 'agents') {
      const id = 'agent-' + Date.now();
      const agent = {
        id,
        name: 'Nouvel agent',
        role: 'generic',
        description: '',
        tags: [],
        backendId: 'perplexity-sonar',
        system_prompt: 'Tu es un agent générique.',
        memory_profile: { level: 'normal' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveAgent(agent);
      state.agents = state.agents.concat([agent]);
      rerender();
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const text = await file.text();
        state.agents = await importAgentsJson(text, gardenerMerge);
        rerender();
      };
      input.click();
    }
  };

  if (state.view === 'agents') actions.appendChild(btnGardener);
  actions.appendChild(btnNew);

  header.append(title, actions);
  container.appendChild(header);

  if (state.view === 'agents') {
    renderAgentsList(container, state, rerender);
  } else {
    renderSettings(container, state, rerender);
  }
}

function renderAgentsList(container, state, rerender) {
  const list = document.createElement('div');
  list.className = 'lvgl-list';

  state.agents.forEach((agent) => {
    const card = document.createElement('div');
    card.className = 'lvgl-card';

    const name = document.createElement('div');
    name.textContent = agent.name + ' (' + agent.role + ')';

    const backend = document.createElement('div');
    backend.style.fontSize = '11px';
    backend.style.color = '#888';
    backend.textContent = 'Backend: ' + (agent.backendId || '—');

    const desc = document.createElement('div');
    desc.style.fontSize = '11px';
    desc.style.color = '#aaa';
    desc.textContent = agent.description || '';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    row.style.marginTop = '6px';

    const btnChat = document.createElement('button');
    btnChat.textContent = 'Parler';
    btnChat.onclick = () => {
      const msg = prompt('Message texte pour ' + agent.name + ' :');
      if (!msg) return;
      simpleChat(agent, msg);
    };

    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Éditer';
    btnEdit.onclick = async () => {
      await editAgentDialog(agent);
      state.agents = state.agents.map((a) => (a.id === agent.id ? agent : a));
      rerender();
    };

    const btnExport = document.createElement('button');
    btnExport.textContent = 'Export';
    btnExport.onclick = () => {
      const json = exportAgentsJson([agent]);
      downloadText(agent.id + '.json', json);
    };

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Supprimer';
    btnDelete.onclick = async () => {
      if (!confirm('Supprimer cet agent ?')) return;
      await deleteAgent(agent.id);
      state.agents = state.agents.filter((a) => a.id !== agent.id);
      rerender();
    };

    row.append(btnChat, btnEdit, btnExport, btnDelete);
    card.append(name, backend, desc, row);
    list.appendChild(card);
  });

  container.appendChild(list);
}

async function editAgentDialog(agent) {
  const name = prompt('Nom de l\'agent', agent.name || '');
  if (name !== null) agent.name = name;

  const role = prompt('Rôle / type (ex: jardinier, lecteur, planner)', agent.role || '');
  if (role !== null) agent.role = role;

  const description = prompt('Description courte', agent.description || '');
  if (description !== null) agent.description = description;

  const backendId = prompt('Backend (id dans backends.json)', agent.backendId || 'perplexity-sonar');
  if (backendId !== null) agent.backendId = backendId;

  const systemPrompt = prompt('System prompt', agent.system_prompt || '');
  if (systemPrompt !== null) agent.system_prompt = systemPrompt;

  agent.updatedAt = new Date().toISOString();
  await saveAgent(agent);
}

async function simpleChat(agent, message) {
  try {
    const backendId = agent.backendId || 'perplexity-sonar';
    const messages = [
      { role: 'system', content: agent.system_prompt || '' },
      { role: 'user', content: message },
    ];
    const choice = await callLLM(backendId, { messages, agentConfig: agent });
    const content = choice?.message?.content || '(aucune réponse)';
    alert(agent.name + ' :\n\n' + content);
  } catch (e) {
    alert('Erreur LLM: ' + e.message);
  }
}

function renderSettings(container, state, rerender) {
  const backends = listBackends();
  const div = document.createElement('div');
  div.className = 'lvgl-list';

  backends.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'lvgl-card';

    const title = document.createElement('div');
    title.textContent = b.label;

    const desc = document.createElement('div');
    desc.style.fontSize = '11px';
    desc.style.color = '#888';
    desc.textContent = b.type;

    card.append(title, desc);

    if (b.requiresApiKey && b.envKey) {
      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'Clé ' + b.envKey;
      input.value = localStorage.getItem(b.envKey) || '';
      input.onchange = () => {
        localStorage.setItem(b.envKey, input.value);
      };
      input.style.width = '100%';
      input.style.marginTop = '6px';
      card.appendChild(input);
    }

    div.appendChild(card);
  });

  container.appendChild(div);
}
