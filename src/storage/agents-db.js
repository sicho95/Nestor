const DB_NAME = 'nestor-agents-v1';
const STORE_AGENTS = 'agents';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_AGENTS)) {
        db.createObjectStore(STORE_AGENTS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAgents() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AGENTS, 'readonly');
    const store = tx.objectStore(STORE_AGENTS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAgent(agent) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AGENTS, 'readwrite');
    const store = tx.objectStore(STORE_AGENTS);
    agent.updatedAt = new Date().toISOString();
    const req = store.put(agent);
    req.onsuccess = () => resolve(agent);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAgent(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AGENTS, 'readwrite');
    const store = tx.objectStore(STORE_AGENTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function exportAgentsJson(agents) {
  const payload = {
    format: 'nestor-agents-1',
    exportedAt: new Date().toISOString(),
    agents,
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importAgentsJson(json, gardenerMergeFn) {
  const parsed = JSON.parse(json);
  if (parsed.format !== 'nestor-agents-1') throw new Error('Format inconnu');
  const incoming = parsed.agents || [];
  const existing = await loadAgents();
  const merged = await gardenerMergeFn(existing, incoming);
  for (const agent of merged) {
    await saveAgent(agent);
  }
  return merged;
}
