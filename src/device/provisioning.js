/**
 * provisioning.js — WiFi provisioning via BLE
 */
import { bleRequestWifiScan, bleProvisionWifi } from '../bt/ble_protocol.js';
import { lsGet, lsSet } from '../storage/agents-db.js';

const LS_NETS = 'nestor_saved_networks';

export function getSavedNetworks() {
  try { return JSON.parse(lsGet(LS_NETS)) || []; } catch { return []; }
}

export function saveNetwork(ssid) {
  const nets = getSavedNetworks().filter(n => n.ssid !== ssid);
  nets.unshift({ ssid, savedAt: new Date().toISOString() });
  lsSet(LS_NETS, JSON.stringify(nets.slice(0, 20)));
}

export const scanWifiNetworks = () => bleRequestWifiScan();

export async function provisionWifi(ssid, password, save = true) {
  const result = await bleProvisionWifi(ssid, password);
  if (save) saveNetwork(ssid);
  return result;
}
