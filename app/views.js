// The four surfaces: board, one bounty, its leaderboard, a public profile.
// Board rows patch in place on refresh; long leaderboards paginate 50/page.
import { esc, usd, num, pct, left, date, sdate, abs } from './format.js';

const $ = (s, r) => r.querySelector(s);
const ST = 'style="border:1px solid #ddd;border-radius:8px;padding:8px 10px"', SB = 'style="display:block;font-size:19px"';
const feeOf = (b) => (+b.potUsd || 0) - (+b.rewardAmount || 0);
const potCell = (b) => usd(b.potUsd ?? b.rewardAmount) + '<i>reward ' + usd(b.rewardAmount) + ' · fees ' + usd(feeOf(b)) + '</i>';
const feeCell = (b) => b.entryFeeUsd ? usd(b.entryFeeUsd) : 'Free';
const openBy = (b) => new Date(b.deadline) > Date.now();

let sortK = 'pot', sortD = -1, items = [];
const val = (b, k) => k === 'pot' ? +b.potUsd || 0 : k === 'fee' ? +b.entryFeeUsd || 0 : k === 'left' ? +new Date(b.deadline) : k === 'n' ? +b.submissionCount || 0 : String(b.title);
const sorted = () => [...items].sort((a, b) => (val(a, sortK) > val(b, sortK) ? 1 : -1) * sortD);

function row(b) {
  return '<tr data-s="' + esc(b.slug) + '"><td><a href="#/bounty/' + encodeURIComponent(b.slug) + '">' + esc(b.title) + '</a><i>' + esc(b.category || '') + '</i></td>'
    + '<td class="c-pot">' + potCell(b) + '</td><td class="c-fee">' + feeCell(b) + '</td>'
    + '<td class="c-left">' + left(b.deadline) + '<i>' + sdate(b.deadline) + ' UTC</i></td>'
    + '<td class="c-n">' + num(b.submissionCount) + '</td>'
    + '<td><a href="https://make.fun' + esc(b.url || ('/bounty/' + b.slug)) + '">Enter ↗</a> · <a href="#/bounty/' + encodeURIComponent(b.slug) + '/leaderboard">Leaderboard</a></td></tr>';
}

function statsHtml(d) {
  const tot = d.reduce((s, b) => s + (+b.potUsd || 0), 0);
  const fees = d.reduce((s, b) => s + (+b.entryFeesUsd || 0), 0);
  const n = d.reduce((s, b) => s + (+b.submissionCount || 0), 0);
  const soon = d.filter((b) => new Date(b.deadline) > Date.now()).reduce((m, b) => !m || b.deadline < m ? b.deadline : m, '');
  return '<div ' + ST + '><b ' + SB + '>' + usd(tot) + '</b><i>total live pot</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + usd(fees) + '</b><i>entry fees in pots</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + (soon ? left(soon) : '—') + '</b><i>soonest deadline</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + num(n) + '</b><i>entries</i></div>';
}

export function list(app, d) {
  items = d.items || [];
  document.title = 'make.fun bounties';
  app.innerHTML = '<h1>Open bounties</h1><div class="stats" id="stats">' + statsHtml(items) + '</div>'
    + '<div style="overflow-x:auto"><table><thead><tr><th data-k="title">Bounty</th><th data-k="pot">Live pot</th><th data-k="fee">Entry fee</th><th data-k="left">Time left</th><th data-k="n">Entries</th><th></th></tr></thead><tbody id="rows">'
    + sorted().map(row).join('') + '</tbody></table></div>'
    + '<p>Live pots grow as entry fees are paid in. <a href="https://make.fun">Enter a bounty on make.fun ↗</a></p>';
  app.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    sortD = k === sortK ? -sortD : (k === 'title' || k === 'left' ? 1 : -1);
    sortK = k;
    $('#rows', app).innerHTML = sorted().map(row).join('');
  }));
}

export function patch(app, d) {
  items = d.items || [];
  const st = $('#stats', app);
  if (st) st.innerHTML = statsHtml(items);
  const tb = $('#rows', app);
  if (!tb) return;
  let miss = false;
  for (const b of items) {
    const tr = tb.querySelector('tr[data-s="' + b.slug + '"]');
    if (!tr) { miss = true; break; }
    $('.c-pot', tr).innerHTML = potCell(b);
    $('.c-fee', tr).textContent = feeCell(b);
    $('.c-left', tr).innerHTML = left(b.deadline) + '<i>' + sdate(b.deadline) + ' UTC</i>';
    $('.c-n', tr).textContent = num(b.submissionCount);
  }
  if (miss) tb.innerHTML = sorted().map(row).join('');
}

export function one(app, b) {
  document.title = b.title + ' | make.fun bounties';
  const fin = (b.phases || []).find((p) => p.key === 'final');
  const rw = (b.rewardsNow || []).map((r) => '<tr><td>#' + r.place + '</td><td>' + usd(r.baseUsd) + '</td><td>' + usd(r.feeShareUsd) + '</td><td><b>' + usd(r.amountUsd) + '</b></td></tr>').join('');
  app.innerHTML = '<p><a href="#/">← All bounties</a> · <a href="#/bounty/' + encodeURIComponent(b.slug) + '/leaderboard">Leaderboard</a></p>'
    + '<div style="display:flex;gap:24px;flex-wrap:wrap;border:1px solid #ddd;border-radius:10px;padding:14px;margin:10px 0"><div><span style="display:block;font-size:34px;font-weight:800">' + usd(b.potUsd ?? b.rewardAmount) + '</span><i>live pot — reward ' + usd(b.rewardAmount) + ' + ' + usd(feeOf(b)) + ' entry fees</i></div>'
    + '<div><b style="display:block;font-size:17px">' + (openBy(b) ? 'Taking entries' : 'Closed for entries') + '</b><i>' + left(b.deadline) + ' · ' + date(b.deadline) + '</i></div>'
    + '<div><b style="display:block;font-size:17px">' + (b.entryFeeUsd ? usd(b.entryFeeUsd) + ' entry fee' : 'Free to enter') + '</b><i>' + num(b.submissionCount) + ' entries · status ' + esc(b.status || '') + '</i></div></div>'
    + '<h1>' + esc(b.title) + '</h1><p>' + esc(b.summary || '') + '</p>'
    + '<p><a style="display:inline-block;background:#06c;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none" href="https://make.fun' + esc(b.url || ('/bounty/' + b.slug)) + '">Enter on make.fun ↗</a></p>'
    + '<h2>Rewards</h2><div style="overflow-x:auto"><table><thead><tr><th>Place</th><th>Base</th><th>Fee share</th><th>Pays now</th></tr></thead><tbody>' + rw + '</tbody></table></div>'
    + '<h2>Dates</h2><p><b>Deadline:</b> ' + date(b.deadline) + ' (' + left(b.deadline) + ')</p>'
    + (fin ? '<p><b>Final window:</b> ' + date(fin.startsAt) + ' – ' + date(fin.endsAt) + '</p>' : '')
    + '<p><b>Published:</b> ' + date(b.publishedAt) + '</p>'
    + '<h2>Description</h2><div style="white-space:pre-wrap">' + esc(b.description || '') + '</div>'
    + (b.rules ? '<details><summary>Rules</summary><div style="white-space:pre-wrap">' + esc(b.rules) + '</div></details>' : '');
}

let pg = 0, lsortD = -1, lastLb = '';
export function lead(app, l, b) {
  if (lastLb !== b.slug) { pg = 0; lastLb = b.slug; }
  document.title = 'Leaderboard · ' + (b.title || l.competition?.title) + ' | make.fun bounties';
  const es = l.entries || [];
  const key = l.rank_key || 'judge';
  const rw = new Map((b.rewardsNow || []).map((r) => [r.place, r.amountUsd]));
  const score = (e) => { const v = (e.values || {})[key]; return key === 'judge' ? pct(v) : num(v); };
  const iv = (e) => { const v = e.values || {}; return v.judge_low != null ? pct(v.judge_low) + '–' + pct(v.judge_high) : '—'; };
  const av = (e) => abs(e.image) || 'https://make.fun/api/profiles/' + encodeURIComponent(e.handle) + '/picture.png';
  const ord = [...es].sort((a, c) => ((a.values || {})[key] > (c.values || {})[key] ? 1 : -1) * lsortD);
  const pages = Math.max(1, Math.ceil(ord.length / 50));
  pg = Math.min(pg, pages - 1);
  const slice = ord.slice(pg * 50, pg * 50 + 50);
  const rows = slice.map((e) => '<tr><td>' + num(e.rank) + '</td><td><a href="#/u/' + encodeURIComponent(e.handle) + '"><img crossorigin="anonymous" style="border-radius:50%;vertical-align:-8px" src="' + esc(av(e)) + '" alt="" width="28" height="28"> ' + esc(e.handle) + '</a><i>' + esc(e.title || '') + '</i></td>'
    + '<td><b>' + score(e) + '</b></td><td>' + iv(e) + '</td><td>' + (e.prize_rank ? usd(rw.get(e.prize_rank)) : '—') + '</td></tr>').join('');
  app.innerHTML = '<p><a href="#/bounty/' + encodeURIComponent(b.slug) + '">← ' + esc(b.title || '') + '</a></p>'
    + '<h1>Leaderboard</h1><p>' + num(es.length) + ' ranked entries · judge win rate, 90% interval, prize now</p>'
    + '<div style="overflow-x:auto"><table><thead><tr><th>Rank</th><th>Entrant</th><th id="sc">Win rate ↕</th><th>90% interval</th><th>Prize now</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<p><button id="pv"' + (pg === 0 ? ' disabled' : '') + '>← Prev</button> Rows ' + (pg * 50 + 1) + '–' + Math.min(ord.length, pg * 50 + 50) + ' of ' + num(ord.length)
    + ' <button id="nx"' + (pg >= pages - 1 ? ' disabled' : '') + '>Next →</button></p>';
  $('#sc', app).addEventListener('click', () => { lsortD = -lsortD; lead(app, l, b); });
  const pv = $('#pv', app), nx = $('#nx', app);
  if (pv) pv.addEventListener('click', () => { pg--; lead(app, l, b); });
  if (nx) nx.addEventListener('click', () => { pg++; lead(app, l, b); });
}

export function prof(app, p) {
  document.title = (p.display_name || p.handle) + ' | make.fun bounties';
  const r = p.record || {};
  const av = abs((p.avatar && p.avatar.url) || p.image) || 'https://make.fun/api/profiles/' + encodeURIComponent(p.handle) + '/picture.png';
  const sols = [...(p.solutions || [])].sort((a, b) => (a.placement == null) - (b.placement == null) || (a.placement || 1e9) - (b.placement || 1e9) || ((b.score || {}).value || 0) - ((a.score || {}).value || 0));
  app.innerHTML = '<div style="max-width:560px;margin:0 auto"><img crossorigin="anonymous" style="width:96px;height:96px;border-radius:50%;margin-top:14px" src="' + esc(av) + '" alt="">'
    + '<h1>' + esc(p.display_name || p.handle) + '</h1><p>@' + esc(p.handle) + (p.joined_at ? ' · joined ' + date(p.joined_at) : '') + '</p>'
    + (p.bio ? '<p>' + esc(p.bio) + '</p>' : '')
    + '<div class="stats"><div ' + ST + '><b ' + SB + '>' + num(r.competitions_entered) + '</b><i>bounties entered</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + num(r.competitions_placed) + '</b><i>ranked</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + num(r.competitions_won) + '</b><i>wins</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + (r.best_placement ? '#' + num(r.best_placement) : '—') + '</b><i>best place</i></div>'
    + '<div ' + ST + '><b ' + SB + '>' + usd(r.prize_usd) + '</b><i>total prizes</i></div></div>'
    + '<h2>Entries — placed first</h2><ul style="list-style:none;padding:0">' + sols.map((s) => '<li style="padding:8px 0;border-bottom:1px solid #eee"><b>' + (s.placement ? '#' + num(s.placement) : '—') + '</b> '
      + '<a href="#/bounty/' + encodeURIComponent(s.competition.slug) + '">' + esc(s.title) + '</a><i>' + esc(s.competition.title) + ' · ' + (s.score ? pct(s.score.value) : '—') + (s.prize_usd ? ' · ' + usd(s.prize_usd) : '') + '</i></li>').join('') + '</ul></div>';
}
