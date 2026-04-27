import { lsGet } from '../storage/agents-db.js';

let activeBackends = {};

// Backends par defaut si backends.json absent
const DEFAULT_BACKENDS = {
  // GROQ par defaut partout (texte)
  'groq-llama': {
    label: 'Groq LLaMA 3 (gratuit)',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatPath: '/chat/completions',
    model: 'llama3-70b-8192',
    requiresApiKey: true,
    envKey: 'GROQ_API_KEY'
  },
  // Variante plus legere si tu veux
  'groq-llama-small': {
    label: 'Groq LLaMA 3 8B (gratuit)',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatPath: '/chat/completions',
    model: 'llama3-8b-8192',
    requiresApiKey: true,
    envKey: 'GROQ_API_KEY'
  },
  // Puter en secours (aucune cle, mais session necessaire)
  'puter-qwen': {
    label: 'Puter Qwen (secours)',
    type: 'puter-qwen',
    model: 'qwen/qwen-plus',
    requiresApiKey: false
  },
  // Perplexity pour la recherche web si tu actives la cle
  'perplexity-sonar': {
    label: 'Perplexity Sonar (web)',
    type: 'openai-compatible',
    baseUrl: 'https://api.perplexity.ai',
    chatPath: '/chat/completions',
    model: 'sonar',
    requiresApiKey: true,
    envKey: 'PERPLEXITY_API_KEY'
  }
};

export async function initBackends() {
  try {
    const res = await fetch('./src/api/backends.json');
    if (!res.ok) throw new Error('backends.json absent');
    activeBackends = await res.json();
  } catch (_) {
    // Fallback sur les backends integres
    activeBackends = DEFAULT_BACKENDS;
  }
}

export function listBackends() {
  return Object.entries(activeBackends).map(([id, cfg]) => ({ id, ...cfg }));
}

// Attendre que puter.js soit pret (il se charge en async)
function waitForPuter(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.puter && window.puter.ai) return resolve(window.puter);
    const start = Date.now();
    const check = setInterval(() => {
      if (window.puter && window.puter.ai) {
        clearInterval(check);
        resolve(window.puter);
      } else if (Date.now() - start > timeout) {
        clearInterval(check);
        reject(new Error('Puter.js non charge apres ' + timeout + 'ms. Verifie ta connexion.'));
      }
    }, 100);
  });
}

export async function callLLM(backendId, { messages, agentConfig }) {
  const cfg = activeBackends[backendId] || activeBackends['groq-llama'];
  if (!cfg) throw new Error('Aucun backend disponible.');

  // --- Backends Puter.js (gratuits, sans cle) ---
  if (cfg.type === 'puter-qwen' || cfg.type === 'puter-gpt4o') {
    const puter = await waitForPuter();
    const model = cfg.model || (cfg.type === 'puter-gpt4o' ? 'gpt-4o' : 'qwen/qwen-plus');
    const res = await puter.ai.chat(messages, { model });
    const content = typeof res === 'string' ? res
      : res?.message?.content || res?.content || res?.toString() || '';
    return { message: { role: 'assistant', content } };
  }

  // --- Backends OpenAI-compatible (Groq, Perplexity, etc.) ---
  if (cfg.type === 'openai-compatible') {
    const apiKey = cfg.envKey ? (lsGet(cfg.envKey) || '') : '';
    if (cfg.requiresApiKey && !apiKey) {
      throw new Error('Cle API manquante pour "' + cfg.label + '". Va dans Reglages pour la saisir.');
    }
    const res = await fetch(cfg.baseUrl + cfg.chatPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
      },
      body: JSON.stringify({ model: cfg.model, messages })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error('Erreur LLM ' + res.status + (errText ? ' : ' + errText.slice(0, 120) : ''));
    }
    const data = await res.json();
    return data.choices?.[0] || { message: { role: 'assistant', content: '(reponse vide)' } };
  }

  throw new Error('Type backend non gere : ' + cfg.type);
}
