const safeImageUrl = (value: string) => {
  try {
    const url = new URL(value, 'https://www.bbc.co.uk');
    return url.protocol === 'https:' && (url.hostname === 'ichef.bbci.co.uk' || url.hostname.endsWith('.bbci.co.uk')) ? url.href : '';
  } catch {
    return '';
  }
};

const imageFromMarkup = (markup: string) => {
  const srcset = markup.match(/\b(?:data-)?srcset=["']([^"']+)["']/i)?.[1] || '';
  const candidates = [...srcset.matchAll(/(https?:\/\/[^\s,]+|\/[^\s,]+)\s+(\d+)w/gi)]
    .map((match) => ({ url: safeImageUrl(match[1]), width: Number(match[2]) }))
    .filter((candidate) => candidate.url)
    .sort((a, b) => b.width - a.width);
  return candidates[0]?.url || safeImageUrl(markup.match(/\b(?:data-src|src)=["']([^"']+)["']/i)?.[1] || '');
};

export const imageFromUpcomingCard = (card: string) => {
  const box = card.match(/<div\b[^>]*class=["'][^"']*programme__img-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  return imageFromMarkup(box);
};

export const imageFromProgrammePage = (html: string, pid: string) => {
  const playout = pid ? html.match(new RegExp(`id=["']episode-playout-${pid}["'][\\s\\S]{0,6000}`, 'i'))?.[0] || '' : '';
  return imageFromMarkup(playout) || imageFromMarkup(html);
};

export const fetchBbcImage = async (url: string) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'BargainHuntFieldNotes/1.0', Accept: 'image/avif,image/webp,image/jpeg,image/png' } });
  if (!response.ok) throw new Error(`BBC image returned ${response.status}.`);
  const type = response.headers.get('content-type') || 'image/jpeg';
  if (!type.startsWith('image/')) throw new Error(`BBC image returned ${type}.`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('BBC image is larger than 8 MB.');
  return new File([bytes], 'episode-image.jpg', { type });
};
