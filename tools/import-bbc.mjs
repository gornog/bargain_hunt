import PocketBase from 'pocketbase';

const pocketBaseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
const pb = new PocketBase(pocketBaseUrl);
const superuserToken = process.env.POCKETBASE_SUPERUSER_TOKEN;
if (superuserToken) pb.authStore.save(superuserToken);
else if (process.env.NODE_ENV === 'production') throw new Error('POCKETBASE_SUPERUSER_TOKEN must be configured in production.');
const pocketBaseAdminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const pocketBaseAdminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
if (Boolean(pocketBaseAdminEmail) !== Boolean(pocketBaseAdminPassword)) {
  throw new Error('Set both POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD, or neither.');
}
if (pocketBaseAdminEmail) {
  await pb.collection('_superusers').authWithPassword(pocketBaseAdminEmail, pocketBaseAdminPassword);
}
const guideUrl = 'https://www.bbc.co.uk/programmes/b006nb9z/episodes/guide';
const profileUrls = [
  ['presenter', 'https://www.bbc.co.uk/programmes/profiles/1DHTTlgtN56NkJjFT91dBX7/meet-the-presenters'],
  ['expert', 'https://www.bbc.co.uk/programmes/profiles/2rCG4qJkhKWc0qM38gy20hj/meet-the-experts']
];
const headers = { 'User-Agent': 'BargainHuntFieldNotes/1.0' };
const requestTimeoutMs = Number(process.env.BBC_REQUEST_TIMEOUT_MS || 15_000);
const maxImageBytes = Number(process.env.BBC_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
const refreshImages = process.env.BBC_REFRESH_IMAGES === 'true';
const clean = (value) => (value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase().replace(/[’']/g, "'");
const bbcUrl = (value, base = 'https://www.bbc.co.uk') => {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    const isBbcOwned = url.hostname === 'bbc.co.uk' || url.hostname.endsWith('.bbc.co.uk') || url.hostname === 'bbci.co.uk' || url.hostname.endsWith('.bbci.co.uk');
    return url.protocol === 'https:' && isBbcOwned ? url.href : '';
  } catch { return ''; }
};
const retryable = (status) => status === 408 || status === 429 || status >= 500;
const fetchBbc = async (url, kind = 'page') => {
  const safeUrl = bbcUrl(url);
  if (!safeUrl) throw new Error(`Refusing non-BBC ${kind} URL: ${url}`);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(safeUrl, { headers, signal: controller.signal, redirect: 'follow' });
      if (!bbcUrl(response.url)) throw new Error(`BBC ${kind} redirected to an untrusted host`);
      if (response.ok || !retryable(response.status) || attempt === 2) return response;
      lastError = new Error(`${response.status} ${safeUrl}`);
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
    await pause(400 * (2 ** attempt) + Math.floor(Math.random() * 150));
  }
  throw new Error(`Could not fetch BBC ${kind} ${safeUrl}: ${lastError?.message || 'unknown error'}`);
};
const fetchHtml = async (url) => { const response = await fetchBbc(url); const body = await response.text(); if (!response.ok) throw new Error(`${response.status} ${url} (${body.length} bytes)`); return body; };
const fetchImage = async (url) => {
  const response = await fetchBbc(url, 'image');
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const type = response.headers.get('content-type') || '';
  const length = Number(response.headers.get('content-length') || 0);
  if (!type.startsWith('image/') || (length && length > maxImageBytes)) throw new Error(`Rejected image (${type || 'unknown type'}, ${length || 'unknown'} bytes)`);
  if (!response.body) throw new Error('Image response had no body');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxImageBytes) { await reader.cancel(); throw new Error(`Rejected image larger than ${maxImageBytes} bytes`); }
    chunks.push(value);
  }
  return new Blob(chunks, { type });
};
const absolute = (value) => bbcUrl(value);

const parseSeriesLinks = (html) => [...html.matchAll(/(?:https?:\/\/www\.bbc\.co\.uk)?\/programmes\/([a-z0-9]+)\/episodes\/guide/gi)].map((match) => { const block = html.slice(Math.max(0, match.index - 1800), Math.min(html.length, match.index + 300)); return { url: `https://www.bbc.co.uk/programmes/${match[1]}/episodes/guide`, label: clean(block), series: Number(clean(block).match(/series\s*(\d+)/i)?.[1] || 0) }; }).filter((series, index, all) => series.series && all.findIndex((item) => item.url === series.url) === index);

const parseEpisodes = (html, series) => {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bprogramme--episode\b[^"']*["'][^>]*>/gi)];
  return starts.map((match, index) => {
  const start = match.index ?? 0;
  const end = starts[index + 1]?.index ?? html.length;
  const block = html.slice(start, end);
  const pid = match[0].match(/\bdata-pid=["']([a-z0-9]+)["']/i)?.[1] || block.match(/\bdata-pid=["']([a-z0-9]+)["']/i)?.[1];
  if (!pid) return null;
  const programmeLink = block.match(/href=["'](?:https?:\/\/www\.bbc\.co\.uk)?(\/programmes\/[a-z0-9]+)["']/i)?.[1];
  if (!programmeLink) return null;
  const titleText = clean(block.match(/class="[^"]*programme__title[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
  const title = titleText.replace(/^Episode\s*\d+\s*:\s*/i, '').trim();
  const episode = Number(title.match(/\s(\d{1,3})$/)?.[1] || 0);
  const image = absolute(block.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]);
  const synopsis = clean(block.match(/<p[^>]*class="[^"]*programme__synopsis[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  const watch = block.match(/href=["'](https?:\/\/www\.bbc\.co\.uk\/iplayer\/episode\/[a-z0-9]+)["']/i)?.[1] || '';
  return { pid, url: `https://www.bbc.co.uk${programmeLink}`, watch, series, episode, title: title.replace(/\s+\d{1,3}$/, '').trim() || title, synopsis, image };
  }).filter((episode) => episode && episode.title);
};

const parseProfileLinks = (html, role) => [...html.matchAll(/<a[^>]+href=["'](\/programmes\/profiles\/[^"'?]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
  const linkStart = match.index ?? 0;
  const itemStart = html.lastIndexOf('<li', linkStart);
  const itemEnd = html.indexOf('</li>', linkStart);
  const item = html.slice(itemStart >= 0 ? itemStart : Math.max(0, linkStart - 3000), itemEnd >= 0 ? itemEnd : Math.min(html.length, linkStart + 3000));
  const card = match[2];
  const slug = match[1].split('/').filter(Boolean).pop() || '';
  const name = clean(card.match(/<(?:h1|h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4)>/i)?.[1] || card).replace(/\s+(Read more|Find out more)$/i, '').trim() || slug.replace(/-/g, ' ');
  const image = absolute(item.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1] || '');
  return { name, profileUrl: `https://www.bbc.co.uk${match[1]}`, role, image };
}).filter((profile, index, all) => profile.name && profile.name.length < 80 && key(profile.name) !== 'n/a' && all.findIndex((item) => item.profileUrl === profile.profileUrl) === index);
const profileImage = (html, name) => {
  const nameIndex = html.toLowerCase().indexOf(name.toLowerCase());
  if (nameIndex < 0) return '';
  const local = html.slice(Math.max(0, nameIndex - 1000), Math.min(html.length, nameIndex + 7000));
  return absolute(local.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const episodesByPid = new Map();
const fetchedSeries = new Set();
for (let page = 1; page <= 4; page += 1) {
  const guidePageUrl = page === 1 ? guideUrl : `${guideUrl}?page=${page}`;
  const html = await fetchHtml(guidePageUrl);
  const seriesLinks = parseSeriesLinks(html);
  console.log(`Guide page ${page}: ${html.length} bytes, ${seriesLinks.length} series links`);
  for (const series of seriesLinks) {
    if (fetchedSeries.has(series.url)) continue;
    fetchedSeries.add(series.url);
    const seriesHtml = await fetchHtml(series.url); const found = parseEpisodes(seriesHtml, series.series); console.log(`  Series ${series.series}: ${found.length} episode cards`); for (const episode of found) episodesByPid.set(episode.pid, episode);
  }
  console.log(`Guide page ${page}: ${episodesByPid.size} unique episode links collected`);
}
const episodes = [...episodesByPid.values()];
if (!episodes.length) throw new Error('BBC guide returned no episode links. Check the saved HTML and parser selectors.');

const existingEpisodes = await pb.collection('episodes').getFullList({ requestKey: null });
const byPid = new Map(existingEpisodes.filter((record) => record.bbc_pid).map((record) => [record.bbc_pid, record]));
const byFallback = new Map(existingEpisodes.map((record) => [`${record.series}|${record.title}`.toLowerCase(), record]));
let created = 0; let updated = 0; let images = 0; let synopses = 0;
for (const episode of episodes) {
  const payload = { series: episode.series, episod_number: episode.episode, title: episode.title };
  if (episode.pid) payload.bbc_pid = episode.pid;
  if (episode.url) payload.bbc_url = episode.url;
  if (episode.watch) payload.watch = episode.watch;
  if (episode.synopsis) payload.synopsis = episode.synopsis;
  const record = byPid.get(episode.pid) || byFallback.get(`${episode.series}|${episode.title}`.toLowerCase());
  const saved = record ? await pb.collection('episodes').update(record.id, payload) : await pb.collection('episodes').create(payload);
  if (record) updated += 1; else { created += 1; existingEpisodes.push(saved); }
  byPid.set(episode.pid, saved); byFallback.set(`${episode.series}|${episode.title}`.toLowerCase(), saved);
  if (episode.synopsis) synopses += 1;
  if (episode.image && (refreshImages || !saved.image)) { try { const blob = await fetchImage(episode.image); await pb.collection('episodes').update(saved.id, { image: new File([blob], `${episode.pid}.jpg`, { type: blob.type || 'image/jpeg' }) }); images += 1; } catch (error) { console.warn(`Could not save image for ${episode.pid}: ${error.message}`); } }
}

const profileMap = new Map();
for (const [role, url] of profileUrls) {
  const profiles = parseProfileLinks(await fetchHtml(url), role);
  console.log(`${role} profile page: ${profiles.length} named profiles found`);
  for (const profile of profiles) {
    let image = profile.image || '';
    if (!image) {
      try {
        image = profileImage(await fetchHtml(profile.profileUrl), profile.name);
      } catch (error) {
        console.warn(`  Could not read profile page for ${profile.name}: ${error.message}`);
      }
    }
    console.log(`  ${profile.name}: ${image ? 'portrait found' : 'portrait not found'} (${profile.profileUrl})`);
    const person = profileMap.get(key(profile.name)) || { ...profile, is_presenter: false, is_expert: false, image: '' };
    person.is_presenter ||= role === 'presenter';
    person.is_expert ||= role === 'expert';
    if (image) person.image = image;
    profileMap.set(key(profile.name), person);
    await pause(350);
  }
}
const existingExperts = await pb.collection('experts').getFullList({ requestKey: null });
const expertByName = new Map(existingExperts.map((expert) => [key(expert.name), expert]));
let peopleCreated = 0; let peopleUpdated = 0; let portraits = 0;
for (const profile of profileMap.values()) {
  const fields = { name: profile.name, is_presenter: profile.is_presenter, is_expert: profile.is_expert };
  const existing = expertByName.get(key(profile.name));
  const person = existing ? await pb.collection('experts').update(existing.id, fields) : await pb.collection('experts').create(fields);
  if (existing) peopleUpdated += 1; else { peopleCreated += 1; expertByName.set(key(profile.name), person); }
  if (profile.image && (refreshImages || !person.avatar)) { try { const blob = await fetchImage(profile.image); await pb.collection('experts').update(person.id, { avatar: new File([blob], `${person.id}.jpg`, { type: blob.type || 'image/jpeg' }) }); portraits += 1; } catch (error) { console.warn(`Could not save portrait for ${profile.name}: ${error.message}`); } }
}
console.log(`BBC sync complete: ${episodes.length} cards, ${created} created, ${updated} updated, ${synopses} synopses, ${images} episode images, ${peopleCreated} experts created, ${peopleUpdated} experts updated, ${portraits} portraits.`);
