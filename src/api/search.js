import { lsGet } from '../storage/agents-db.js';

// Recherche web via Google Programmable Search (Custom Search JSON API)
// en passant par le proxy CORS perso de l'utilisateur.
//
// Le proxy attend un parametre ?url=... et se charge de faire le fetch
// cote Cloudflare, en ajoutant les bons headers CORS.
//
// On construit ici l'URL Google avec la cle et le CX stockes en local,
// puis on l'encode et on l'envoie au proxy.

const DEFAULT_PROXY_URL = 'https://proxy.sicho95.workers.dev/';

function getSearchConfig() {
  const proxyUrl = lsGet('SEARCH_PROXY_URL') || DEFAULT_PROXY_URL;
  const apiKey   = lsGet('GOOGLE_CSE_KEY') || '';
  const cx       = lsGet('GOOGLE_CSE_CX') || '';
  if (!apiKey || !cx) {
    throw new Error('Config recherche manquante : renseigne GOOGLE_CSE_KEY et GOOGLE_CSE_CX dans Reglages.');
  }
  return { proxyUrl, apiKey, cx };
}

export async function searchWeb(query, { maxResults = 5 } = {}) {
  const { proxyUrl, apiKey, cx } = getSearchConfig();

  const googleUrl = new URL('https://www.googleapis.com/customsearch/v1');
  googleUrl.searchParams.set('key', apiKey);
  googleUrl.searchParams.set('cx', cx);
  googleUrl.searchParams.set('q', query);
  googleUrl.searchParams.set('num', String(maxResults));

  const target = googleUrl.toString();
  const finalUrl = proxyUrl.replace(/\/$/, '') + '?url=' + encodeURIComponent(target);

  const res = await fetch(finalUrl);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('Erreur proxy recherche ' + res.status + (txt ? ' : ' + txt.slice(0, 120) : ''));
  }
  const data = await res.json();
  const items = data.items || [];

  return items.map((it) => ({
    title: it.title || it.htmlTitle || '',
    link: it.link || it.formattedUrl || '',
    snippet: it.snippet || it.htmlSnippet || '',
  }));
}
