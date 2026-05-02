/**
 * companion.js — Vue gestion du Compagnon ESP32 dans Nestor PWA
 * Connexion BLE, WiFi provisioning, sync agents, clavier distant, config
 */
import { bleAvailable, bleConnect, bleDisconnect, bleConnected, bleDeviceName } from '../bt/ble.js';
import { deviceStatus, subscribeBleStatus, setBleConnected, setBleDisconnected } from '../bt/ble_status.js';
import { scanWifiNetworks, provisionWifi, getSavedNetworks } from '../device/provisioning.js';
import { syncAgentsWithDevice } from '../sync/agents_sync.js';
import { getDeviceConfig, saveDeviceConfig, pushDeviceConfig } from '../device/device_settings.js';
import { setupLlmRelay } from '../bt/ble_protocol.js';
import { createKeyboardOverlay } from '../input/bt_keyboard.js';
import { callLLM, listBackends } from '../api/backends.js';

export function renderCompanionView(container, state, rerender) {
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:auto;';

  // ── Bandeau connexion ────────────────────────────────
  const connBar = el('div', 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0e1a0e;border-bottom:1px solid #1a2a1a;position:sticky;top:0;z-index:2;');
  const connInfo = el('div', 'display:flex;flex-direction:column;gap:2px;');
  const connectBtn = document.createElement('button');
  connectBtn.style.cssText = 'padding:8px 14px;border:1px solid #333;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;';

  function refreshBar() {
    const ok = bleConnected();
    const mode = deviceStatus.mode;
    const modeLabel = mode === 'wifi' ? '📶 ' + (deviceStatus.wifiSSID || 'WiFi')
      : mode === 'ble_relay' ? '📱 Relais LLM' : '⚡ BLE seulement';
    connInfo.innerHTML = ok
      ? `<span style="color:#7ef;font-size:13px;font-weight:600;">🔗 ${bleDeviceName() || 'Nestor'}</span><span style="color:#5a7a5a;font-size:11px;">${modeLabel}</span>`
      : `<span style="color:#888;font-size:13px;">Compagnon non connecté</span><span style="color:#444;font-size:11px;">Bluetooth requis (Chrome Android/Desktop)</span>`;
    connectBtn.textContent = ok ? 'Déconnecter' : 'Connecter';
    connectBtn.style.background = ok ? '#2a1a1a' : '#1a3a1a';
    connectBtn.style.color = ok ? '#e87' : '#7ef';
  }

  connectBtn.onclick = async () => {
    if (bleConnected()) {
      await bleDisconnect(); setBleDisconnected();
    } else {
      if (!bleAvailable()) { alert('Web Bluetooth non disponible.\nUtilise Chrome sur Android ou desktop.'); return; }
      try {
        connectBtn.textContent = '⏳…'; connectBtn.disabled = true;
        const name = await bleConnect();
        setBleConnected(name);
        // Démarrer relay LLM automatiquement
        const backends = listBackends();
        const defaultB = backends[0];
        setupLlmRelay(async (messages, model) => {
          const choice = await callLLM(defaultB?.id || 'groq-llama', { messages });
          return choice?.message?.content || '';
        });
        // Auto-sync agents si configuré
        const cfg = getDeviceConfig();
        if (cfg.ble.autoSyncAgents) {
          try {
            const merged = await syncAgentsWithDevice();
            state.agents = merged;
            rerender();
          } catch {}
        }
      } catch (e) { alert('Connexion échouée: ' + e.message); }
      finally { connectBtn.disabled = false; }
    }
    refreshBar(); renderSections();
  };

  connBar.append(connInfo, connectBtn);
  container.appendChild(connBar);
  refreshBar();

  // ── Sections ─────────────────────────────────────────
  const sectionsWrap = el('div', 'display:flex;flex-direction:column;');
  container.appendChild(sectionsWrap);

  function renderSections() {
    sectionsWrap.innerHTML = '';
    if (!bleConnected()) {
      const hint = el('div', 'padding:40px 16px;text-align:center;color:#444;font-size:13px;line-height:1.7;');
      hint.innerHTML = `<div style="font-size:40px;margin-bottom:12px;">📡</div>
        <div style="color:#555;">Connecte-toi au Compagnon ESP32<br>pour gérer WiFi, agents, clavier et config.</div>
        <div style="color:#333;font-size:11px;margin-top:8px;">Chrome Android ou Chrome Desktop requis</div>`;
      sectionsWrap.appendChild(hint);
      return;
    }
    sectionsWrap.appendChild(mkSection('📶 Réseau WiFi', buildWifiSection()));
    sectionsWrap.appendChild(mkSection('🧠 Agents & Sync', buildAgentsSection(state, rerender)));
    sectionsWrap.appendChild(mkSection('⌨️ Clavier distant', buildKeyboardSection()));
    sectionsWrap.appendChild(mkSection('⚙️ Configuration', buildConfigSection()));
  }
  renderSections();

  subscribeBleStatus(() => { refreshBar(); renderSections(); });
}

// ── WiFi ─────────────────────────────────────────────────
function buildWifiSection() {
  const wrap = el('div', 'display:flex;flex-direction:column;gap:8px;');
  const status = el('div', 'font-size:12px;color:#5a7a5a;padding:4px 0;');
  status.textContent = deviceStatus.wifi === 'connected'
    ? `✅ Connecté : ${deviceStatus.wifiSSID || '?'}` : '⚠️ Pas de WiFi sur le compagnon';
  wrap.appendChild(status);

  const saved = getSavedNetworks();
  if (saved.length > 0) {
    const lbl = el('div', 'font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;');
    lbl.textContent = 'Réseaux enregistrés'; wrap.appendChild(lbl);
    for (const net of saved.slice(0, 5)) {
      const row = document.createElement('button');
      row.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:8px 12px;text-align:left;color:#aaa;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;width:100%;';
      row.innerHTML = `<span>📶 ${net.ssid}</span><span style="color:#555;font-size:11px;">→ Reconnecter</span>`;
      row.onclick = async () => {
        const pwd = prompt(`Mot de passe pour "${net.ssid}" :`);
        if (pwd === null) return;
        row.textContent = '⏳ Connexion…';
        try { await provisionWifi(net.ssid, pwd); status.textContent = `✅ Connecté : ${net.ssid}`; }
        catch (e) { status.textContent = '❌ ' + e.message; row.innerHTML = `<span>📶 ${net.ssid}</span><span style="color:#555;font-size:11px;">→ Reconnecter</span>`; }
      };
      wrap.appendChild(row);
    }
  }

  const scanBtn = document.createElement('button');
  scanBtn.textContent = '🔍 Scanner les réseaux WiFi';
  scanBtn.style.cssText = btnStyle('#1a2a3a', '#7af');
  scanBtn.onclick = async () => {
    scanBtn.textContent = '⏳ Scan…'; scanBtn.disabled = true;
    try {
      const nets = await scanWifiNetworks();
      showNetworkPicker(nets, wrap, status);
    } catch (e) { alert('Scan échoué: ' + e.message); }
    finally { scanBtn.textContent = '🔍 Scanner les réseaux WiFi'; scanBtn.disabled = false; }
  };
  wrap.appendChild(scanBtn);
  return wrap;
}

function showNetworkPicker(networks, wrap, statusEl) {
  wrap.querySelector('.wifi-list')?.remove();
  if (!networks.length) { alert('Aucun réseau trouvé.'); return; }
  const list = el('div', 'display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;');
  list.className = 'wifi-list';
  for (const net of networks) {
    const bars = net.rssi > -60 ? '▂▄▆█' : net.rssi > -75 ? '▂▄▆_' : '▂▄__';
    const b = document.createElement('button');
    b.style.cssText = 'background:#111;border:1px solid #222;border-radius:6px;padding:8px 12px;color:#ccc;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;width:100%;';
    b.innerHTML = `<span>${net.secured ? '🔒' : '🔓'} ${net.ssid}</span><span style="color:#555;font-size:10px;">${bars}</span>`;
    b.onclick = async () => {
      const pwd = net.secured ? prompt(`Mot de passe pour "${net.ssid}" :`) : '';
      if (pwd === null) return;
      b.textContent = '⏳ Connexion…';
      try { await provisionWifi(net.ssid, pwd, true); statusEl.textContent = `✅ Connecté : ${net.ssid}`; list.remove(); }
      catch (e) { statusEl.textContent = '❌ ' + e.message; b.innerHTML = `<span>${net.secured ? '🔒' : '🔓'} ${net.ssid}</span><span style="color:#555;font-size:10px;">${bars}</span>`; }
    };
    list.appendChild(b);
  }
  wrap.appendChild(list);
}

// ── Agents ───────────────────────────────────────────────
function buildAgentsSection(state, rerender) {
  const wrap = el('div', 'display:flex;flex-direction:column;gap:8px;');
  const info = el('div', 'font-size:11px;color:#555;');
  info.textContent = deviceStatus.lastSync
    ? `Dernière sync : ${new Date(deviceStatus.lastSync).toLocaleTimeString()}`
    : 'Aucune sync effectuée';
  wrap.appendChild(info);

  const syncBtn = document.createElement('button');
  syncBtn.textContent = '🔄 Synchroniser les agents';
  syncBtn.style.cssText = btnStyle('#1a3a1a', '#7ef');
  syncBtn.onclick = async () => {
    syncBtn.textContent = '⏳ Sync…'; syncBtn.disabled = true;
    try {
      const merged = await syncAgentsWithDevice();
      state.agents = merged;
      info.textContent = `✅ Sync OK — ${merged.length} agent(s) — ${new Date().toLocaleTimeString()}`;
      rerender();
    } catch (e) { info.textContent = '❌ ' + e.message; }
    finally { syncBtn.textContent = '🔄 Synchroniser les agents'; syncBtn.disabled = false; }
  };
  wrap.appendChild(syncBtn);

  const note = el('div', 'font-size:11px;color:#333;line-height:1.5;');
  note.textContent = `${state.agents.length} agent(s) local — fusion par date de modification`;
  wrap.appendChild(note);
  return wrap;
}

// ── Clavier ───────────────────────────────────────────────
function buildKeyboardSection() {
  const wrap = el('div', 'display:flex;flex-direction:column;gap:8px;');
  const desc = el('div', 'font-size:12px;color:#555;line-height:1.5;');
  desc.textContent = 'Utilise le clavier de ton téléphone pour écrire dans le chat du Compagnon sans parler.';
  const kbBtn = document.createElement('button');
  kbBtn.textContent = '⌨️ Ouvrir le clavier distant';
  kbBtn.style.cssText = btnStyle('#2a1a3a', '#c7f');
  kbBtn.onclick = () => document.body.appendChild(createKeyboardOverlay(() => {}));
  wrap.append(desc, kbBtn);
  return wrap;
}

// ── Config ────────────────────────────────────────────────
function buildConfigSection() {
  const wrap = el('div', 'display:flex;flex-direction:column;gap:8px;');
  const cfg = getDeviceConfig();

  wrap.appendChild(mkToggle('📱 Relais LLM si pas de WiFi', cfg.ble.relayLlmOnNoWifi, v => { cfg.ble.relayLlmOnNoWifi = v; saveDeviceConfig(cfg); }));
  wrap.appendChild(mkToggle('🔄 Sync auto agents à la connexion', cfg.ble.autoSyncAgents, v => { cfg.ble.autoSyncAgents = v; saveDeviceConfig(cfg); }));

  const pushBtn = document.createElement('button');
  pushBtn.textContent = '📤 Envoyer la config au Compagnon';
  pushBtn.style.cssText = btnStyle('#2a2a1a', '#fa8');
  pushBtn.onclick = async () => {
    pushBtn.textContent = '⏳ Envoi…'; pushBtn.disabled = true;
    try { await pushDeviceConfig(cfg); pushBtn.textContent = '✅ Config envoyée'; }
    catch { pushBtn.textContent = '❌ Erreur'; }
    finally { setTimeout(() => { pushBtn.textContent = '📤 Envoyer la config au Compagnon'; pushBtn.disabled = false; }, 2000); }
  };
  wrap.appendChild(pushBtn);
  return wrap;
}

// ── Helpers DOM ───────────────────────────────────────────
function el(tag, css) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css; return e;
}
function btnStyle(bg, color) {
  return `background:${bg};color:${color};border:1px solid ${color}22;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:600;cursor:pointer;width:100%;text-align:left;`;
}
function mkSection(title, content) {
  const w = el('div', 'background:#0a0a0a;border-bottom:1px solid #1a1a1a;');
  const h = el('button', 'width:100%;background:none;border:none;text-align:left;padding:12px 16px;color:#888;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:space-between;cursor:pointer;text-transform:uppercase;letter-spacing:0.06em;');
  h.innerHTML = `<span>${title}</span><span style="font-size:10px;color:#444;">▼</span>`;
  const b = el('div', 'padding:0 16px 14px;'); b.appendChild(content);
  let open = true;
  h.onclick = () => { open = !open; b.style.display = open ? '' : 'none'; h.querySelector('span:last-child').textContent = open ? '▼' : '▶'; };
  w.append(h, b); return w;
}
function mkToggle(label, value, onChange) {
  const row = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;');
  const lbl = el('div', 'font-size:12px;color:#888;flex:1;'); lbl.textContent = label;
  const btn = el('button', '');
  let state = value;
  const refresh = () => { btn.textContent = state ? 'ON' : 'OFF'; btn.style.cssText = `padding:4px 10px;border:none;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;${state ? 'background:#1a3a1a;color:#7ef;' : 'background:#1a1a1a;color:#555;'}`; };
  btn.onclick = () => { state = !state; refresh(); onChange(state); };
  refresh(); row.append(lbl, btn); return row;
}
