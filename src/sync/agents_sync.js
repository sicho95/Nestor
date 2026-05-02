/**
 * agents_sync.js — Sync bidirectionnelle agents PWA ↔ ESP32
 */
import { bleSyncAgents, blePushAgents } from '../bt/ble_protocol.js';
import { loadAgents, saveAgent } from '../storage/agents-db.js';
import { bleConnected } from '../bt/ble.js';
import { deviceStatus } from '../bt/ble_status.js';

export async function syncAgentsWithDevice() {
  if (!bleConnected()) throw new Error('Compagnon non connecté');
  const local = await loadAgents();
  const merged = await bleSyncAgents(local);
  for (const a of merged) await saveAgent(a);
  deviceStatus.lastSync = new Date().toISOString();
  return merged;
}

export function getLastSyncTime() { return deviceStatus.lastSync; }

export async function autoSyncIfConnected() {
  if (!bleConnected()) return;
  try {
    const all = await loadAgents();
    await blePushAgents(all);
  } catch (e) { console.warn('[AgentSync] auto-sync:', e.message); }
}
