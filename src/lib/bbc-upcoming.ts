import { getPocketBase } from './archive';

const BBC_UPCOMING_URL = 'https://www.bbc.co.uk/programmes/b006nb9z/broadcasts/upcoming';
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

type UpcomingEpisode = {
  pid: string;
  url: string;
  series: number;
  episode: number;
  title: string;
  synopsis: string;
  broadcastDate: string;
  isToday: boolean;
  isTomorrow: boolean;
  recordId?: string;
};

export type UpcomingRefresh = {
  created: number;
  updated: number;
  today: UpcomingEpisode | null;
  todayRecordId: string | null;
  tomorrow: UpcomingEpisode | null;
  tomorrowRecordId: string | null;
  upcoming: UpcomingEpisode[];
  outcome?: 'updated' | 'no_changes' | 'too_soon';
  checkedAt: string;
};

let cachedRefresh: UpcomingRefresh | null = null;
let refreshInFlight: Promise<UpcomingRefresh> | null = null;

const clean = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const safeBbcUrl = (value: string) => {
  try {
    const url = new URL(value, 'https://www.bbc.co.uk');
    return url.protocol === 'https:' && (url.hostname === 'bbc.co.uk' || url.hostname.endsWith('.bbc.co.uk')) ? url.href : '';
  } catch {
    return '';
  }
};

const londonDate = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const dateFromLabel = (text: string) => {
  const today = new Date(`${londonDate()}T12:00:00.000Z`);
  if (/\btomorrow\b/i.test(text)) { today.setUTCDate(today.getUTCDate() + 1); return today.toISOString(); }
  if (/\btoday\b/i.test(text)) return today.toISOString();
  const match = text.match(/\b(today|tomorrow|next\s+)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!match) return '';
  const prefix = (match[1] || '').toLowerCase().trim();
  const day = match[2].toLowerCase();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = days.indexOf(day);
  let delta = (target - today.getUTCDay() + 7) % 7;
  if (prefix === 'tomorrow') delta = 1;
  if (prefix === 'next') delta = delta === 0 ? 7 : delta + 7;
  today.setUTCDate(today.getUTCDate() + delta);
  return today.toISOString();
};

const dateForCard = (card: string, text: string) => {
  const timeTag = card.match(/<[^>]*class=["'][^"']*broadcast-event__time[^"']*["'][^>]*>/i)?.[0] || '';
  const metadataDate = timeTag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
  if (metadataDate && !Number.isNaN(Date.parse(metadataDate))) return new Date(metadataDate).toISOString();
  const datetime = card.match(/(?:<time\b[^>]*\bdatetime|data-(?:start|broadcast)-date|data-start-date)=["']([^"']+)["']/i)?.[1] || card.match(/\b(20\d{2}-\d{2}-\d{2}(?:T[^\s"']+)?)\b/i)?.[1];
  if (datetime && !Number.isNaN(Date.parse(datetime))) return new Date(datetime).toISOString();
  const labelledDate = dateFromLabel(text);
  if (labelledDate) return labelledDate;
  const relativeDate = (days: number) => { const date = new Date(`${londonDate()}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); };
  if (/\btoday\b/i.test(text)) return relativeDate(0);
  if (/\btomorrow\b/i.test(text)) return relativeDate(1);
  return '';
};

const cardsFromPage = (html: string) => {
  const starts = [...html.matchAll(/<(?:article|li|div)\b[^>]*class=["'][^"']*\bprogramme--episode\b[^"']*["'][^>]*>/gi)];
  if (starts.length) return starts.map((match, index) => html.slice(match.index ?? 0, starts[index + 1]?.index ?? html.length));
  return [...html.matchAll(/<a\b[^>]*href=["'](?:https?:\/\/www\.bbc\.co\.uk)?\/programmes\/[a-z0-9]+["'][^>]*>[\s\S]*?<\/a>/gi)].map((match) => html.slice(Math.max(0, (match.index ?? 0) - 2200), Math.min(html.length, (match.index ?? 0) + 3500)));
};

const parseUpcoming = (html: string): UpcomingEpisode[] => {
  const seen = new Set<string>();
  return cardsFromPage(html).flatMap((card) => {
    const pid = card.match(/\bdata-pid=["']([a-z0-9]+)["']/i)?.[1] || card.match(/\/programmes\/([a-z0-9]+)["']/i)?.[1] || '';
    const href = card.match(/href=["']([^"']*\/programmes\/[a-z0-9]+[^"']*)["']/i)?.[1] || '';
    const url = safeBbcUrl(href);
    const titleMarkup = card.match(/class=["'][^"']*(?:programme__title|programme-title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span|h[1-6]|p)>/i)?.[1] || card.match(/<a\b[^>]*href=["'][^"']*\/programmes\/[a-z0-9]+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '';
    const rawTitle = clean(titleMarkup).replace(/^Episode\s*\d+\s*:\s*/i, '');
    const text = clean(card);
    const series = Number(text.match(/\bSeries\s+(\d+)\b/i)?.[1] || 0);
    const episode = Number(rawTitle.match(/\s(\d{1,3})$/)?.[1] || text.match(/\bEpisode\s+(\d{1,3})\b/i)?.[1] || 0);
    const title = /^Episode\s+\d+$/i.test(rawTitle) ? rawTitle : rawTitle.replace(/\s+\d{1,3}$/, '').trim();
    const synopsisMarkup = card.match(/<p\b[^>]*class=["'][^"']*programme__synopsis[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || card.match(/class=["'][^"']*programme__synopsis[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/i)?.[1] || '';
    const synopsis = clean(synopsisMarkup).replace(/\s*\(R\)\s*$/i, '').trim();
    const broadcastDate = dateForCard(card, text);
    if (!pid || !url || !title || !series || seen.has(pid)) return [];
    seen.add(pid);
    return [{ pid, url, series, episode, title, synopsis, broadcastDate, isToday: /\btoday\b/i.test(text), isTomorrow: /\btomorrow\b/i.test(text) }];
  });
};

const fetchUpcoming = async () => {
  const response = await fetch(BBC_UPCOMING_URL, { headers: { 'User-Agent': 'BargainHuntFieldNotes/1.0', Accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`BBC upcoming episodes returned ${response.status}.`);
  const episodes = parseUpcoming(await response.text());
  if (!episodes.length) throw new Error('BBC upcoming episodes page returned no recognised episode cards.');
  const earliestByPid = new Map<string, UpcomingEpisode>();
  for (const episode of episodes) {
    const existing = earliestByPid.get(episode.pid);
    if (!existing || (!existing.broadcastDate && episode.broadcastDate) || (episode.broadcastDate && existing.broadcastDate && Date.parse(episode.broadcastDate) < Date.parse(existing.broadcastDate))) earliestByPid.set(episode.pid, episode);
  }
  return [...earliestByPid.values()].sort((a, b) => (Date.parse(a.broadcastDate) || Number.MAX_SAFE_INTEGER) - (Date.parse(b.broadcastDate) || Number.MAX_SAFE_INTEGER));
};

const runRefresh = async (): Promise<UpcomingRefresh> => {
  const [pb, upcoming] = await Promise.all([getPocketBase(), fetchUpcoming()]);
  const existing = await pb.collection('episodes').getFullList({ requestKey: null });
  const byPid = new Map(existing.filter((episode: any) => episode.bbc_pid).map((episode: any) => [episode.bbc_pid, episode]));
  const byCoordinate = new Map(existing.filter((episode: any) => Number(episode.episod_number) > 0).map((episode: any) => [`${episode.series}|${episode.episod_number}`, episode]));
  let created = 0;
  let updated = 0;
  let todayRecordId: string | null = null;
  let tomorrowRecordId: string | null = null;
  const upcomingWithRecords: UpcomingEpisode[] = [];

  for (const episode of upcoming) {
    const record = byPid.get(episode.pid) || (episode.episode > 0 ? byCoordinate.get(`${episode.series}|${episode.episode}`) : undefined);
    const payload: Record<string, string | number> = { bbc_pid: episode.pid, bbc_url: episode.url };
    if (episode.broadcastDate) payload.broadcast_date = episode.broadcastDate;
    if (!record) {
      payload.series = episode.series;
      payload.episod_number = episode.episode;
      payload.title = episode.title;
      if (episode.synopsis) payload.synopsis = episode.synopsis;
      const saved = await pb.collection('episodes').create(payload);
      byPid.set(episode.pid, saved);
      if (episode.episode > 0) byCoordinate.set(`${episode.series}|${episode.episode}`, saved);
      created += 1;
      if (episode.isToday) todayRecordId = saved.id;
      if (episode.isTomorrow) tomorrowRecordId = saved.id;
    } else {
      const changed = Object.entries(payload).some(([key, value]) => String(record[key] ?? '') !== String(value));
      const saved = changed ? await pb.collection('episodes').update(record.id, payload) : record;
      if (changed) updated += 1;
      if (episode.isToday) todayRecordId = saved.id;
      if (episode.isTomorrow) tomorrowRecordId = saved.id;
    }
    const savedRecord = record || (episode.episode > 0 ? byCoordinate.get(`${episode.series}|${episode.episode}`) : undefined);
    if (savedRecord) upcomingWithRecords.push({ ...episode, recordId: savedRecord.id });
  }

  return { created, updated, today: upcoming.find((episode) => episode.isToday) || null, todayRecordId, tomorrow: upcoming.find((episode) => episode.isTomorrow) || null, tomorrowRecordId, upcoming: upcomingWithRecords, outcome: created || updated ? 'updated' : 'no_changes', checkedAt: new Date().toISOString() };
};

export async function refreshUpcomingEpisodes(force = false) {
  const isFresh = cachedRefresh && Date.now() - Date.parse(cachedRefresh.checkedAt) < REFRESH_INTERVAL_MS;
  if (!force && isFresh) return { ...cachedRefresh, outcome: 'too_soon' };
  if (!refreshInFlight) refreshInFlight = runRefresh().then((result) => {
    cachedRefresh = result;
    return result;
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
