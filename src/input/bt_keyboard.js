/**
 * bt_keyboard.js — Clavier virtuel téléphone → ESP32 via BLE
 */
import { bleSendText } from '../bt/ble_protocol.js';
import { bleConnected } from '../bt/ble.js';

export async function sendTextToDevice(text) {
  if (!text?.trim()) return;
  if (!bleConnected()) throw new Error('Compagnon non connecté');
  await bleSendText(text.trim());
}

export function createKeyboardOverlay(onClose) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;';

  const panel = document.createElement('div');
  panel.style.cssText = 'width:100%;max-width:600px;background:#111;border-radius:16px 16px 0 0;padding:16px;display:flex;flex-direction:column;gap:10px;';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  hdr.innerHTML = '<span style="color:#7ef;font-size:13px;font-weight:600;">⌨️ Clavier → Compagnon ESP32</span>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px 8px;';
  closeBtn.onclick = () => { overlay.remove(); if (onClose) onClose(); };
  hdr.appendChild(closeBtn);

  const ta = document.createElement('textarea');
  ta.placeholder = 'Écrire pour Nestor Compagnon…'; ta.rows = 3;
  ta.style.cssText = 'width:100%;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;padding:10px 12px;font-size:15px;resize:none;font-family:inherit;outline:none;';
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); } });

  const sendBtn = document.createElement('button');
  sendBtn.textContent = '📤 Envoyer au Compagnon';
  sendBtn.style.cssText = 'background:#1a5a3a;color:#7ef;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;width:100%;';

  let sending = false;
  sendBtn.onclick = async () => {
    if (sending || !ta.value.trim()) return;
    sending = true; sendBtn.textContent = '⏳ Envoi…';
    try {
      await sendTextToDevice(ta.value);
      ta.value = ''; sendBtn.textContent = '✅ Envoyé !';
      setTimeout(() => { sendBtn.textContent = '📤 Envoyer au Compagnon'; }, 1500);
    } catch (e) {
      sendBtn.textContent = '❌ ' + e.message;
      setTimeout(() => { sendBtn.textContent = '📤 Envoyer au Compagnon'; }, 2500);
    }
    sending = false;
  };

  panel.append(hdr, ta, sendBtn);
  overlay.appendChild(panel);
  setTimeout(() => ta.focus(), 100);
  return overlay;
}
