let activeBackends = {};

export async function initBackends() {
  try {
    const res = await fetch('./src/api/backends.json');
    if (!res.ok) throw new Error('backends.json: ' + res.status);
    activeBackends = await res.json();
  } catch (e) {
    console.warn('[Nestor] backends.json non charge.', e);
    activeBackends = {};
  }
}

export function listBackends() {
  return Object.entries(activeBackends).map(([id, cfg]) => ({ id, ...cfg }));
}

export async function callLLM(backendId, { messages }) {
  const cfg = activeBackends[backendId];
  if (!cfg) throw new Error('Backend inconnu: ' + backendId);

  if (cfg.type === 'puter-qwen') {
    if (!window.puter) throw new Error('Puter.js non charge');
    const res = await window.puter.ai.chat(messages, { model: 'qwen/qwen-plus' });
    return { message: { role: 'assistant', content: res?.toString() || '' } };
  }

  if (cfg.type === 'openai-compatible') {
    let apiKey = '';
    try { apiKey = cfg.envKey ? (localStorage.getItem(cfg.envKey) || '') : ''; } catch (_) {}
    if (cfg.requiresApiKey && !apiKey) throw new Error('Cle API manquante pour ' + cfg.label);
    const res = await fetch(cfg.baseUrl + cfg.chatPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
      body: JSON.stringify({ model: cfg.model, messages }),
    });
    if (!res.ok) throw new Error('Erreur LLM ' + res.status);
    const data = await res.json();
    return data.choices && data.choices[0];
  }

  throw new Error('Type backend non gere: ' + cfg.type);
}
