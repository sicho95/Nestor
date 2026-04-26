import backends from './backends.json' assert { type: 'json' };

let activeBackends = {};

export async function initBackends() {
  activeBackends = backends;
}

export function listBackends() {
  return Object.entries(activeBackends).map(([id, cfg]) => ({ id, ...cfg }));
}

export async function callLLM(backendId, { messages, agentConfig }) {
  const cfg = activeBackends[backendId];
  if (!cfg) throw new Error('Backend inconnu: ' + backendId);

  if (cfg.type === 'puter-qwen') {
    if (!window.Puter) throw new Error('Puter.js non chargé');
    return await window.Puter.ai.chat({
      model: 'qwen/qwen-plus',
      messages,
    });
  }

  if (cfg.type === 'openai-compatible') {
    const apiKey = cfg.envKey ? localStorage.getItem(cfg.envKey) : '';
    if (cfg.requiresApiKey && !apiKey) {
      throw new Error('Clé API manquante pour ' + cfg.label);
    }
    const url = cfg.baseUrl + cfg.chatPath;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
      }),
    });
    if (!res.ok) throw new Error('Erreur LLM ' + res.status);
    const data = await res.json();
    const choice = data.choices && data.choices[0];
    return choice;
  }

  throw new Error('Type de backend non géré');
}
