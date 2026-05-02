/**
 * ble_status.js — Store réactif état BLE/Device
 */
import { onDisconnect, onStatusChange } from './ble.js';

export const deviceStatus = {
  connected: false, deviceName: null,
  wifi: 'unknown', wifiSSID: null,
  battery: null, mode: 'unknown', lastSync: null,
};

const _listeners = new Set();
export const subscribeBleStatus = fn => { _listeners.add(fn); return () => _listeners.delete(fn); };
const notify = () => { for (const fn of _listeners) fn({ ...deviceStatus }); };

export function setBleConnected(name) {
  deviceStatus.connected = true; deviceStatus.deviceName = name; notify();
}
export function setBleDisconnected() {
  Object.assign(deviceStatus, { connected:false, deviceName:null, wifi:'unknown', battery:null, mode:'unknown' }); notify();
}
export function updateDeviceStatus(s) {
  for (const k of ['wifi','wifiSSID','battery','mode']) if (s[k] !== undefined) deviceStatus[k] = s[k];
  notify();
}

onDisconnect(() => setBleDisconnected());
onStatusChange(s => updateDeviceStatus(s));
