import { lsGet, lsSet } from '../storage/agents-db.js';

// ─────────────────────────────────────────────────────────────────────────────
// search.js — Moteur de recherche web pour Nestor
// Stratégie : Serper.dev (primaire) → SearXNG instances publiques (fallback)
//
// Serper.dev :
//   - 2 500 req/mois GRATUITES, sans CB
//   - Vrais résultats Google structurés en JSON
//   - Clé SERPER_KEY à renseigner dans Réglages
//   - Si quota épuisé (HTTP 429) → bascule auto sur SearXNG
//
// SearXNG (fallback) :
//   - Instances publiques, agrège Google + Bing + DuckDuckGo + Wikipedia
//   - Zéro clé, zéro inscription, illimité
//   - Plusieurs instances en cascade pour la résilience
//
// Proxy CORS perso (proxy.sicho95.workers.dev) :
//   - Toutes les requêtes passent par le proxy pour contourner le CORS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PROXY = 'https://proxy.sicho95.workers.dev/';

// Instances SearXNG publiques en ordre de préférence
// (vérifiées actives avril 2026 — format JSON disponible)
const SEARXNG_INSTANCES = [
  'https://search.inetol.net',
  'https://searx.be',
  'https://searxng.site',
  'https://search.sapti.me',
];

// Clé localStorage pour mémoriser l'état du quota Serper
const LS_SERPER_EXHAUSTED = 'SERPER_QUOTA_EXHAUSTED_MONTH';

// ─── Helpers localStorage ────────────────────────────────────────────────────

function getProxyUrl() {
  return (lsGet('SEARCH_PROXY_URL') || DEFAULT_PROXY).replace(/\/$/, '');
}

// Retourne true si le quota Serper a été épuisé CE mois-ci
function isSerperExhausted() {
  const stored = lsGet(LS_SERPER_EXHAUSTED);
  if (!stored) return false;
  const { month, year } = JSON.parse(stored);
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month;
}

// Marque Serper comme épuisé pour le mois courant
function markSerperExhausted() {
  const now = new Date();
  lsSet(LS_SERPER_EXHAUSTED, JSON.stringify({
    month: now.getMonth(),
    year:  now.getFullYear(),
  }));
}

// ─── Serper.dev ──────────────────────────────────────────────────────────────

async function searchViaSerper(query, maxResults) {
  const apiKey = lsGet('SERPER_KEY') || '';
  if (!apiKey) throw new Error('SERPER_KEY manquante — configure-la dans Réglages.');

  const proxy    = getProxyUrl();
  const endpoint = 'https://google.serper.dev/search';

  // Serper utilise POST avec JSON
  const proxyUrl = proxy + '?url=' + encodeURIComponent(endpoint);

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'X-API-KEY':     apiKey,
    },
    body: JSON.stringify({ q: query, num: maxResults, gl: 'fr', hl: 'fr' }),
  });

  if (res.status === 429) {
    markSerperExhausted();
    throw new Error('SERPER_QUOTA_EXCEEDED');
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Serper erreur ' + res.status + (txt ? ' : ' + txt.slice(0, 120) : ''));
  }

  const data = await res.json();
  const items = data.organic || [];

  return items.slice(0, maxResults).map((it) => ({
    title:   it.title   || '',
    link:    it.link    || '',
    snippet: it.snippet || '',
  }));
}

// ─── SearXNG (fallback) ──────────────────────────────────────────────────────

async function searchViaSearXNG(query, maxResults) {
  const proxy = getProxyUrl();
  const errors = [];

  for (const base of SEARXNG_INSTANCES) {
    try {
      const searxUrl = new URL(base + '/search');
      searxUrl.searchParams.set('q',          query);
      searxUrl.searchParams.set('format',     'json');
      searxUrl.searchParams.set('language',   'fr-FR');
      searxUrl.searchParams.set('categories', 'general');

      const proxyUrl = proxy + '?url=' + encodeURIComponent(searxUrl.toString());
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });

      if (!res.ok) { errors.push(`${base} → HTTP ${res.status}`); continue; }

      const data  = await res.json();
      const items = (data.results || []).slice(0, maxResults);

      if (items.length === 0) { errors.push(`${base} → 0 résultats`); continue; }

      return items.map((it) => ({
        title:   it.title   || '',
        link:    it.url     || '',
        snippet: it.content || '',
      }));
    } catch (e) {
      errors.push(`${base} → ${e.message}`);
    }
  }

  throw new Error('SearXNG : toutes les instances ont échoué.\n' + errors.join('\n'));
}

// ─── Point d'entrée principal ────────────────────────────────────────────────
//
// Ordre de priorité :
//   1. Serper.dev    — si SERPER_KEY présente ET quota non épuisé ce mois
//   2. SearXNG       — fallback automatique si Serper 429 ou quota épuisé
//
// Retourne : Array<{ title, link, snippet }>
// ─────────────────────────────────────────────────────────────────────────────

export async function searchWeb(query, { maxResults = 5 } = {}) {
  const hasSerperKey = !!(lsGet('SERPER_KEY') || '').trim();
  const serperDead   = isSerperExhausted();

  // ── Tentative Serper (primaire) ──
  if (hasSerperKey && !serperDead) {
    try {
      const results = await searchViaSerper(query, maxResults);
      return results;
    } catch (e) {
      if (e.message !== 'SERPER_QUOTA_EXCEEDED') {
        // Erreur technique Serper (pas quota) → log mais on tente quand même SearXNG
        console.warn('[Nestor/search] Serper erreur technique :', e.message);
      }
      // Dans tous les cas, fallback sur SearXNG
    }
  }

  // ── Fallback SearXNG ──
  return searchViaSearXNG(query, maxResults);
}

// ─── Export du statut (pour affichage dans Réglages) ─────────────────────────

export function getSearchStatus() {
  const hasSerperKey = !!(lsGet('SERPER_KEY') || '').trim();
  const exhausted    = isSerperExhausted();
  if (!hasSerperKey) return { engine: 'searxng', reason: 'Pas de clé Serper configurée' };
  if (exhausted)     return { engine: 'searxng', reason: 'Quota Serper épuisé ce mois' };
  return { engine: 'serper', reason: 'Actif' };
}
