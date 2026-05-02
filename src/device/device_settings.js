/**
 * device_settings.js — Config ESP32 depuis le téléphone
 */
import { bleWrite, bleRead } from '../bt/ble.js';
import { lsGet, lsSet } from '../storage/agents-db.js';

const LS_CFG = 'nestor_device_config';
const DEFAULT = {
  llm: { provider:'github_models', model:'gpt-4o-mini', apiKey:'', proxyUrl:'https://proxy.sicho95.workers.dev' },
  display: { brightness:80, sleepAfterMs:30000, theme:'dark' },
  system: { name:'Nestor', language:'fr', ntpServer:'pool.ntp.org', timezone:'Europe/Paris' },
  ble: { relayLlmOnNoWifi:true, autoSyncAgents:true },
};

function deepMerge(base, over) {
  const r = { ...base };
  for (const k of Object.keys(over))
    r[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]))
      ? deepMerge(base[k] || {}, over[k]) : over[k];
  return r;
}

export function getDeviceConfig() {
  try { return deepMerge(DEFAULT, JSON.parse(lsGet(LS_CFG)) || {}); } catch { return { ...DEFAULT }; }
}
export function saveDeviceConfig(cfg) { lsSet(LS_CFG, JSON.stringify(cfg)); }

export async function pushDeviceConfig(cfg) {
  saveDeviceConfig(cfg);
  await bleWrite('AGENT_SYNC', { cmd: 'config', config: cfg });
}

export async function pullDeviceConfig() {
  await bleWrite('AGENT_SYNC', JSON.stringify({ cmd: 'get_config' }));
  const raw = await bleRead('AGENT_SYNC');
  const parsed = JSON.parse(raw);
  if (parsed.config) { const m = deepMerge(DEFAULT, parsed.config); saveDeviceConfig(m); return m; }
  return getDeviceConfig();
}
