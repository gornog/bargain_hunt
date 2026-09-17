import PocketBase from 'pocketbase';

export const pocketBaseUrl = import.meta.env.POCKETBASE_URL || 'http://bargain_hunt_db:8090';
export const pb = new PocketBase(pocketBaseUrl);
export const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const value = (v: unknown) => Number(v || 0);
export const teamTotal = (team: any, key: 'buy' | 'sell') => [1, 2, 3, 'bonus'].reduce((sum, n) => {
  if (team?.items?.length) {
    const item = team.items.find((entry: any) => Number(entry.slot) === (n === 'bonus' ? 4 : n));
    if (!item) return sum;
    if (key === 'sell' && (item.disqualified || item.challenge_result === 'failed')) return sum;
    return sum + value(item[`${key}_price`]);
  }
  if (n === 'bonus' && !team?.bonus_accepted) return sum;
  if (key === 'sell' && n !== 'bonus' && team?.[`item_${n}_disqualified`]) return sum;
  return sum + value(team?.[`${n === 'bonus' ? 'bonus' : `item_${n}`}_${key}`]);
}, 0);
export const teamProfit = (team: any) => team?.result_mode === 'final' ? value(team.final_profit) : teamTotal(team, 'sell') - teamTotal(team, 'buy');
export const hasTeamData = (team: any) => Boolean((team?.result_mode === 'final' && (team?.final_profit !== null && team?.final_profit !== undefined && team?.final_profit !== '')) || team?.expert || team?.bonus_accepted || [1, 2, 3].some((n) => team?.[`item_${n}_name`] || value(team?.[`item_${n}_buy`]) || value(team?.[`item_${n}_sell`])) || team?.bonus_name || value(team?.bonus_buy) || value(team?.bonus_sell));
export const fileUrl = (record: any, filename: string) => filename ? `/api/pocketbase-file?collection=${encodeURIComponent(record.collectionId)}&record=${encodeURIComponent(record.id)}&file=${encodeURIComponent(filename)}` : '';

export async function loadArchive() {
  const optional = async (collection: string) => { try { return await pb.collection(collection).getFullList({ requestKey: null, expand: 'auction_house,auctioneer' }); } catch { return []; } };
  const [experts, episodes, performances, items, auctionHouses, auctioneers] = await Promise.all([
    pb.collection('experts').getFullList({ sort: 'name' }),
    pb.collection('episodes').getFullList({ sort: '-series,-episod_number,-broadcast_date', expand: 'presenter' }),
    pb.collection('team_performances').getFullList({ expand: 'expert,episode', sort: '-created' }),
    optional('items'),
    optional('auction_houses'),
    optional('auctioneers')
  ]);
  performances.forEach((performance: any) => { performance.items = items.filter((item: any) => item.team_performance === performance.id || item.expand?.team_performance?.id === performance.id); });
  const details = episodes.map((episode: any) => {
    const teams = performances.filter((team: any) => team.episode === episode.id || team.expand?.episode?.id === episode.id);
    const scored = teams.filter(hasTeamData).map((team: any) => ({ ...team, profit: teamProfit(team) })).sort((a: any, b: any) => b.profit - a.profit);
    const isLogged = scored.length > 0;
    const isComplete = scored.length >= 2;
    return { ...episode, teams, scored, isLogged, isComplete, status: isComplete ? 'logged' : isLogged ? 'in-progress' : 'unlogged', winner: scored[0]?.team_color, winnerProfit: scored[0]?.profit || 0 };
  });
  return { experts, episodes, performances, items, auctionHouses, auctioneers, details };
}
