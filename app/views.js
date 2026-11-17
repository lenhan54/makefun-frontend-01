// The four surfaces, loaded on demand by app.js: a dense board table with
// sort and category filters beside one bounty in full and the live Top 10,
// a single bounty's page with a save star and a timeline, its windowed
// leaderboard, and a public profile. Everything comes from the public API,
// read-only, GET only.
import { API, view, escText, getJson, countMemoryHit } from './app.js';

export const WINDOW = 50;

export function money(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ago(iso) {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

export function leftShort(deadline) {
  if (!deadline) return 'No deadline';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return days + 'd ' + hours + 'h left';
  if (hours > 0) return hours + 'h ' + (mins % 60) + 'm left';
  return mins + 'm left';
}

export function nextIn(deadline) {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'closed';
  const hours = Math.floor(ms / 3600000);
  if (hours >= 24) return 'in ' + Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
  if (hours > 0) return 'in ' + hours + 'h ' + (Math.floor(ms / 60000) % 60) + 'm';
  return 'in ' + Math.floor(ms / 60000) + 'm';
}

// A bounty past its deadline is closed even when status still reads open.
export function stillOpen(c) {
  if (!c) return false;
  return c.deadline ? new Date(c.deadline).getTime() > Date.now() : c.status === 'open';
}

export function potOf(c) {
  return c.potUsd ?? c.rewardAmount ?? null;
}

export function feeText(c) {
  const fee = c.entryFeeUsd;
  if (fee === null || fee === undefined) return 'Free entry';
  return 'Entry fee ' + money(fee);
}

// Short form for the dense board row: "Free" or "$0.50".
export function feeShort(c) {
  const fee = c.entryFeeUsd;
  if (fee === null || fee === undefined) return 'Free';
  return money(fee);
}

// "$500 reward + $221.50 fees = $721.50 live pot" — reward and fees apart.
export function potBreakdown(c) {
  const reward = c.rewardAmount;
  if (reward === null || reward === undefined) return money(potOf(c)) + ' live pot';
  const fees = Number(c.entryFeesUsd || 0);
  return money(reward) + ' reward' + (fees > 0 ? ' + ' + money(fees) + ' fees' : '')
    + ' = ' + money(potOf(c)) + ' live pot';
}

export function entriesText(c) {
  if (c.submissionsPassed === null || c.submissionsPassed === undefined) {
    return (c.submissionCount ?? 0) + ' entries';
  }
  return c.submissionsPassed + '/' + (c.submissionCount ?? 0) + ' passed the checks';
}

export function countdown(c) {
  if (!c.deadline) return '';
  const opened = c.opensAt || '';
  const now = Date.now();
  const span = opened ? new Date(c.deadline).getTime() - new Date(opened).getTime() : 0;
  const pct = span > 0
    ? Math.min(100, Math.max(0, ((now - new Date(opened).getTime()) / span) * 100))
    : 0;
  return '<p class="countdown"><span data-deadline="' + escText(c.deadline)
    + '" data-opened="' + escText(opened) + '" data-full="1">' + escText(leftShort(c.deadline))
    + '</span><span class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></span></p>';
}

// "Results by" comes from the phases: the final phase ends when results
// are due, not from a resolvedAt that is still null.
export function resultsBy(c) {
  const phases = c.phases || [];
  const fin = phases.find((p) => p.key === 'final') || phases[phases.length - 1];
  return fin?.endsAt || c.resolvedAt || null;
}

export function datesLine(c) {
  const chain = (c.phases || []).map((p) => escText(p.title)).join(' → ');
  return '<p class="dim">Opened ' + escText(when(c.opensAt)) + ' · Deadline '
    + escText(when(c.deadline)) + ' · Results by ' + escText(when(resultsBy(c))) + '</p>'
    + (chain ? '<p class="dim">Phases: ' + chain + '</p>' : '');
}

// Turn raw markdown into clean paragraphs: headings become plain text,
// links keep their words, bold/italic markers and images drop out.
export function cleanMd(text) {
  return String(text || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function paragraphs(text, cap) {
  const bits = cleanMd(text).split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  const shown = cap ? bits.slice(0, cap) : bits;
  return shown.map((p) => '<p class="blurb">' + escText(p) + '</p>').join('');
}

// Judge win rates arrive per-million (950587 means 95.06%).
export function pctCell(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (key && key.indexOf('judge') === 0 && !Number.isNaN(Number(v))) {
    return (Number(v) / 10000).toFixed(2) + '%';
  }
  return String(v);
}

// A broken avatar degrades to no avatar, never a broken-image icon.
export function watchImages(root) {
  (root || document).querySelectorAll('img').forEach((img) => {
    if (img.dataset.armed) return;
    img.dataset.armed = '1';
    img.addEventListener('error', () => img.remove());
  });
}

export function prizesByRank(c) {
  const map = new Map();
  const now = c.rewardsNow || [];
  if (now.length) {
    now.forEach((r) => map.set(String(r.place), r.amountUsd));
    return map;
  }
  Object.keys(c.rewards || {}).forEach((place) => map.set(place, c.rewards[place]));
  return map;
}

function prizeRows(c, cap) {
  const now = c.rewardsNow || [];
  let rows;
  if (now.length) {
    rows = now.map((r) => '<tr><td class="n">' + escText(r.place) + '</td><td class="n">'
      + escText(money(r.baseUsd)) + '</td><td class="n">' + escText(money(r.feeShareUsd))
      + '</td><td class="n"><b>' + escText(money(r.amountUsd)) + '</b></td></tr>');
  } else {
    const table = c.rewards || {};
    rows = Object.keys(table).sort((a, b) => a - b).map((p) => '<tr><td class="n">'
      + escText(p) + '</td><td class="n">' + escText(money(table[p])) + '</td><td class="n">—</td>'
      + '<td class="n"><b>' + escText(money(table[p])) + '</b></td></tr>');
  }
  if (cap && rows.length > cap) {
    return rows.slice(0, cap).join('') + '<tr><td class="dim" colspan="4">… and '
      + (rows.length - cap) + ' more places pay — full table on the bounty page</td></tr>';
  }
  return rows.join('');
}

const PRIZE_HEAD = '<table><thead><tr><th class="n">Place</th><th class="n">Base</th><th class="n">Fee share</th><th class="n">Pays now</th></tr></thead><tbody>';
const PRIZE_FOOT = '</tbody></table>';

// Patch a list in place: rows that did not change keep their DOM node and
// their place; only new, removed or changed rows are touched. Nothing here
// rebuilds the whole list. Returns how many rows changed.
export function patchRows(el, items, keyOf, cellHtml, tag) {
  const kept = new Map();
  [...el.children].forEach((child) => { if (child.dataset.k) kept.set(child.dataset.k, child); });
  const frag = document.createDocumentFragment();
  let changed = 0;
  for (const item of items) {
    const key = String(keyOf(item));
    const markup = cellHtml(item);
    let node = kept.get(key);
    if (node) {
      if (node.innerHTML !== markup) { node.innerHTML = markup; changed += 1; }
    } else {
      node = document.createElement(tag);
      node.dataset.k = key;
      node.innerHTML = markup;
      changed += 1;
    }
    frag.appendChild(node);
  }
  el.replaceChildren(frag);
  return changed;
}

let boardLb = { key: '', data: null };

async function boardLeaderboard(slug, viewName) {
  const key = slug + '|' + (viewName || '');
  if (boardLb.key === key && boardLb.data) {
    countMemoryHit();
    return boardLb.data;
  }
  const url = API + '/competitions/' + encodeURIComponent(slug) + '/leaderboard'
    + (viewName ? '?view=' + encodeURIComponent(viewName) : '');
  const data = await getJson(url);
  boardLb = { key, data };
  return data;
}

function detailCard(c) {
  const open = stillOpen(c);
  const short = c.summary ? '<p class="intro">' + escText(c.summary) + '</p>' : '';
  return '<h2><a href="#/bounty/' + escText(c.slug) + '">' + escText(c.title) + '</a></h2>'
    + '<p class="line"><span class="prize">' + escText(potBreakdown(c)) + '</span>'
    + '<span class="pill' + (open ? '' : ' off') + '">' + (open ? 'Open' : 'Closed') + '</span>'
    + '<span class="charge">' + escText(feeText(c)) + '</span></p>'
    + countdown(c)
    + '<p class="dim">' + escText(entriesText(c)) + ' · ' + escText(c.category || '')
    + (c.skills && c.skills.length ? ' · ' + escText(c.skills.join(', ')) : '')
    + (c.entryFeePayers ? ' · ' + escText(String(c.entryFeePayers)) + ' paid the entry fee' : '') + '</p>'
    + datesLine(c)
    + '<h2>Rewards</h2>' + PRIZE_HEAD + prizeRows(c, 5) + PRIZE_FOOT
    + short + paragraphs(c.description, 2)
    + '<p class="line"><a href="#/bounty/' + escText(c.slug) + '">Full bounty →</a>'
    + '<a href="#/leaderboard/' + escText(c.slug) + '">Leaderboard →</a></p>';
}

function topTen(d, slug, prizes) {
  const rows = (d.entries || []).slice(0, 10);
  const key = d.rank_key || 'judge';
  const items = rows.map((e) => {
    const rate = pctCell(key, e.display?.[key] ?? e.values?.[key] ?? e[key]);
    const prize = prizes.get(String(e.prize_rank ?? e.rank));
    const pic = e.image ? '<img class="mini" crossorigin="anonymous" src="' + escText(fullImg(e.image)) + '" alt="" loading="lazy">' : '';
    return '<li>' + pic + '<span class="pos">' + escText(e.rank ?? '—') + '</span>'
      + '<a href="#/profile/' + escText(e.handle) + '">' + escText(e.handle) + '</a>'
      + '<span class="pct">' + escText(rate) + '</span>'
      + (prize !== undefined ? '<span class="win">' + escText(money(prize)) + '</span>' : '') + '</li>';
  }).join('');
  return '<h2>Top 10 now</h2><p class="dim">Ranked by ' + escText(d.rank_key || '—') + ' · '
    + escText(String((d.entries || []).length)) + ' entries</p><ol class="ranks">' + items
    + '</ol><p class="dim"><a href="#/leaderboard/' + escText(slug) + '">Full leaderboard →</a></p>';
}

function feedHtml(a) {
  const items = (a.entries || []).slice(0, 6).map((e) => '<li><a href="#/profile/'
    + escText(e.handle) + '">' + escText(e.handle) + '</a> entered <a href="#/bounty/'
    + escText(e.competition.slug) + '">' + escText(e.entry_title || e.competition.title)
    + '</a> · ' + escText(ago(e.created_at)) + '</li>').join('');
  return '<h2>Latest entries</h2><ul class="feed" id="feed">' + items + '</ul>';
}

let feedTimer = null;

const SORTS = {
  closing: { label: 'Closing soon', fn: (a, b) => new Date(a.deadline) - new Date(b.deadline) },
  pot: { label: 'Biggest pot', fn: (a, b) => (Number(potOf(b)) || 0) - (Number(potOf(a)) || 0) },
  entries: { label: 'Most entries', fn: (a, b) => (b.submissionCount || 0) - (a.submissionCount || 0) },
};

// Query string the board row links keep (sort + category), set per render.
let keepQuery = '';

function boardCells(c) {
  const open = stillOpen(c);
  return '<td><div class="bname"><a href="#/?b=' + escText(c.slug) + '&' + keepQuery
    + '">' + escText(c.title) + '</a><span class="cat' + (open ? '' : ' shut') + '">'
    + escText(c.category || '') + '</span></div></td>'
    + '<td class="n"><b>' + escText(money(potOf(c))) + '</b></td>'
    + '<td class="n">' + escText(feeShort(c)) + '</td>'
    + '<td class="n"><span data-deadline="' + escText(c.deadline || '') + '">'
    + escText(leftShort(c.deadline)) + '</span></td>'
    + '<td class="n">' + escText(String(c.submissionCount ?? 0)) + '</td>';
}

export async function renderBoard(params) {
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'closing';
  const cat = params.get('cat') || '';
  const [data, act] = await Promise.all([
    getJson(API + '/competitions?status=open&activity=times'),
    getJson(API + '/activity/entries/latest'),
  ]);
  const all = data.items || [];
  const cats = [...new Set(all.map((c) => c.category).filter(Boolean))].sort();
  const live = all.filter(stillOpen);
  const potSum = live.reduce((s, c) => s + (Number(potOf(c)) || 0), 0);
  const entrySum = live.reduce((s, c) => s + (c.submissionCount || 0), 0);
  const next = live.map((c) => c.deadline).filter(Boolean).sort()[0];
  const list = all.filter((c) => !cat || c.category === cat).slice().sort((a, b) => {
    const ao = stillOpen(a) ? 0 : 1;
    const bo = stillOpen(b) ? 0 : 1;
    return ao - bo || SORTS[sort].fn(a, b);
  });
  const chosen = params.get('b')
    || (list.some((c) => c.slug === 'makefun-frontend-01') ? 'makefun-frontend-01' : (list[0] || {}).slug);
  keepQuery = 'sort=' + sort + (cat ? '&cat=' + encodeURIComponent(cat) : '');
  const sortBtns = Object.keys(SORTS).map((k) => '<a class="chip' + (k === sort ? ' on' : '')
    + '" href="#/?sort=' + k + (cat ? '&cat=' + encodeURIComponent(cat) : '') + '">' + SORTS[k].label + '</a>').join(' ');
  const catChips = ['<a class="chip' + (!cat ? ' on' : '') + '" href="#/?sort=' + sort + '">All</a>']
    .concat(cats.map((c) => '<a class="chip' + (c === cat ? ' on' : '') + '" href="#/?sort=' + sort
      + '&cat=' + encodeURIComponent(c) + '">' + escText(c) + '</a>')).join(' ');
  view.innerHTML = '<h1>Live bounties</h1>'
    + '<ul class="stats"><li><b>' + live.length + '</b><span>taking entries</span></li>'
    + '<li><b>' + escText(money(potSum)) + '</b><span>in live pots</span></li>'
    + '<li><b>' + entrySum.toLocaleString() + '</b><span>entries</span></li>'
    + '<li><b>' + escText(nextIn(next)) + '</b><span>next deadline</span></li></ul>'
    + '<div class="grid3"><section class="pane" aria-label="Bounties"><h2>Board</h2>'
    + '<p class="tools">Sort: ' + sortBtns + '</p><p class="tools">Category: ' + catChips + '</p>'
    + '<table class="board"><thead><tr><th>Bounty</th><th class="n">Live pot</th><th class="n">Fee</th>'
    + '<th class="n">Time left</th><th class="n">Entries</th></tr></thead><tbody id="boardrows"></tbody></table></section>'
    + '<section class="pane" id="detail" aria-label="Bounty detail"><p class="pending">Loading bounty…</p></section>'
    + '<section class="pane side" aria-label="Top entries and activity"><div id="side"><p class="pending">Loading top 10…</p></div></section></div>';
  patchRows(document.getElementById('boardrows'), list, (c) => c.slug, boardCells, 'TR');
  if (chosen) {
    const picked = document.querySelector('#boardrows [data-k="' + CSS.escape(chosen) + '"]');
    if (picked) picked.classList.add('sel');
  }
  if (!chosen) return;
  const [c, lb] = await Promise.all([
    getJson(API + '/competitions/' + encodeURIComponent(chosen) + '?submissions=summary'),
    boardLeaderboard(chosen, ''),
  ]);
  const detail = document.getElementById('detail');
  if (detail) detail.innerHTML = detailCard(c);
  const side = document.getElementById('side');
  if (side) {
    side.innerHTML = topTen(lb, chosen, prizesByRank(c)) + feedHtml(act);
    watchImages(side);
  }
  if (feedTimer) clearInterval(feedTimer);
  feedTimer = setInterval(async () => {
    const box = document.getElementById('feed');
    if (!box) {
      clearInterval(feedTimer);
      return;
    }
    try {
      const fresh = await getJson(API + '/activity/entries/latest');
      const items = (fresh.entries || []).slice(0, 6);
      patchRows(box, items, (e) => e.handle + '|' + e.competition.slug, (e) => '<a href="#/profile/'
        + escText(e.handle) + '">' + escText(e.handle) + '</a> entered <a href="#/bounty/'
        + escText(e.competition.slug) + '">' + escText(e.entry_title || e.competition.title)
        + '</a> · ' + escText(ago(e.created_at)), 'LI');
    } catch (e) { /* keep showing the last good feed */ }
  }, 60000);
}

// Saved bounties live in localStorage only — no account, no write to make.fun.
export function savedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('mf-saved') || '[]'));
  } catch (e) {
    return new Set();
  }
}

export function flipSaved(slug) {
  const set = savedIds();
  if (set.has(slug)) set.delete(slug);
  else set.add(slug);
  try {
    localStorage.setItem('mf-saved', JSON.stringify([...set]));
  } catch (e) { /* storage off: the star just does not stick */ }
  return set.has(slug);
}

// Four milestones on one line: Opened — Now — Deadline — Results by.
export function timeline(c) {
  const start = c.opensAt ? new Date(c.opensAt).getTime() : null;
  const end = resultsBy(c) ? new Date(resultsBy(c)).getTime()
    : (c.deadline ? new Date(c.deadline).getTime() : null);
  const dl = c.deadline ? new Date(c.deadline).getTime() : null;
  if (!start || !end || end <= start) return '';
  const now = Date.now();
  const at = (t) => Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100));
  const marks = [
    { t: start, label: 'Opened', cls: 'done' },
    { t: now, label: 'Now', cls: 'now' },
    { t: dl, label: 'Deadline', cls: dl && dl <= now ? 'done' : '' },
    { t: end, label: 'Results by', cls: '' },
  ].filter((m) => m.t);
  const dots = marks.map((m) => '<i class="' + m.cls + '" style="left:' + at(m.t).toFixed(1) + '%"></i>'
    + '<b class="' + (m.cls === 'now' ? 'hot' : '') + '" style="left:' + at(m.t).toFixed(1) + '%">' + m.label + '</b>').join('');
  return '<div class="tl" aria-label="Bounty timeline">' + dots + '</div>';
}

export async function renderBounty(slug) {
  // submissions=summary keeps this answer near 100 KB instead of ~2.9 MB.
  const c = await getJson(API + '/competitions/' + encodeURIComponent(slug) + '?submissions=summary');
  const open = stillOpen(c);
  const kept = savedIds().has(slug);
  view.innerHTML = '<p><a href="#/">← All bounties</a></p>'
    + '<h1>' + escText(c.title) + '</h1>'
    + '<p class="line"><span class="prize">' + escText(potBreakdown(c)) + '</span>'
    + '<span class="pill' + (open ? '' : ' off') + '">' + (open ? 'Accepting entries' : 'Entries closed') + '</span>'
    + '<span class="charge">' + escText(feeText(c)) + '</span>'
    + '<button type="button" class="savebtn' + (kept ? ' kept' : '') + '" id="savebtn" aria-pressed="' + kept + '">'
    + (kept ? '★ Saved' : '☆ Save') + '</button></p>'
    + countdown(c) + timeline(c)
    + '<p class="dim">Status: ' + escText(c.status || '—') + ' · ' + escText(entriesText(c)) + ' · ' + escText(c.category || '') + '</p>'
    + datesLine(c)
    + '<p class="line"><a href="#/leaderboard/' + escText(c.slug) + '">View leaderboard →</a>'
    + '<a href="#/?b=' + escText(c.slug) + '">Open in split board →</a></p>'
    + '<h2>Rewards</h2>' + PRIZE_HEAD + prizeRows(c) + PRIZE_FOOT
    + (c.summary ? '<p class="intro">' + escText(c.summary) + '</p>' : '')
    + '<h2>About</h2>' + paragraphs(c.description)
    + (c.rules ? '<h2>Rules</h2><details><summary>Read the full rules</summary><pre class="rules">' + escText(c.rules) + '</pre></details>' : '');
  const btn = document.getElementById('savebtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const nowKept = flipSaved(slug);
      btn.classList.toggle('kept', nowKept);
      btn.setAttribute('aria-pressed', String(nowKept));
      btn.textContent = nowKept ? '★ Saved' : '☆ Save';
    });
  }
}

export async function renderLeaderboard(slug, viewName) {
  const [d, c] = await Promise.all([
    boardLeaderboard(slug, viewName),
    getJson(API + '/competitions/' + encodeURIComponent(slug) + '?submissions=summary'),
  ]);
  const prizes = prizesByRank(c);
  const rows = d.entries || [];
  const tabs = (d.views || []).map((v) => '<a href="#/leaderboard/' + escText(slug) + '?view=' + escText(v) + '"'
    + (v === (viewName || d.view) ? ' aria-current="page"' : '') + '>' + escText(v) + '</a>').join(' · ');
  view.innerHTML = '<p><a href="#/bounty/' + escText(slug) + '">← Bounty</a></p>'
    + '<h1>Leaderboard — ' + escText(d.competition?.title || slug) + '</h1>'
    + '<p class="intro">' + escText(d.title || '') + ' · phase ' + escText(d.phase?.title || d.phase?.key || '—')
    + ' · ranked by ' + escText(d.rank_key || '—') + ' · ' + escText(String(rows.length)) + ' entries</p>'
    + '<p class="line">Views: ' + tabs + '</p>'
    + '<p class="tools"><label for="findlb">Find handle</label> <input id="findlb" type="search" placeholder="type a handle…" autocomplete="off"></p>'
    + '<nav class="pages" aria-label="Leaderboard window"><button type="button" id="prev">← Prev 50</button><span class="where" id="where"></span><button type="button" id="next">Next 50 →</button></nav>'
    + '<div class="scrollbox" id="box" tabindex="0"><table><thead><tr><th class="n">#</th><th>Entrant</th><th class="n">Judge win rate</th><th class="n">90% interval</th><th class="n">Prize now</th></tr></thead><tbody id="rows"></tbody></table></div>'
    + '<p class="dim">Only 50 rows sit in the page at a time — rows patched in place · virtual leaderboard.</p>';
  const box = document.getElementById('box');
  const body = document.getElementById('rows');
  const where = document.getElementById('where');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  let shown = rows;
  let start = 0;
  function lbCells(e) {
    const rate = pctCell('judge', e.display?.judge ?? e.values?.judge);
    const low = pctCell('judge_low', e.display?.judge_low ?? e.values?.judge_low);
    const high = pctCell('judge_high', e.display?.judge_high ?? e.values?.judge_high);
    const prize = prizes.get(String(e.prize_rank ?? e.rank));
    const pic = e.image ? '<img class="mini" crossorigin="anonymous" src="' + escText(fullImg(e.image)) + '" alt="" loading="lazy">' : '';
    return '<td class="n">' + escText(e.rank ?? '—') + '</td><td>' + pic
      + '<a href="#/profile/' + escText(e.handle) + '">' + escText(e.handle) + '</a><br>'
      + '<span class="dim">' + escText(e.title || '') + '</span></td>'
      + '<td class="n"><b>' + escText(rate) + '</b></td>'
      + '<td class="n">' + escText(low) + '–' + escText(high) + '</td>'
      + '<td class="n"><b>' + escText(prize !== undefined ? money(prize) : '—') + '</b></td>';
  }
  function paint() {
    const end = Math.min(shown.length, start + WINDOW);
    patchRows(body, shown.slice(start, end), (e) => e.rank ?? e.handle, lbCells, 'TR');
    watchImages(body);
    where.textContent = 'Rows ' + (start + 1).toLocaleString() + '–' + end.toLocaleString()
      + ' of ' + shown.length.toLocaleString();
    prev.disabled = start <= 0;
    next.disabled = end >= shown.length;
  }
  function step(n) {
    start = Math.max(0, Math.min(Math.max(0, shown.length - WINDOW), start + n));
    paint();
    box.scrollTop = 0;
  }
  prev.addEventListener('click', () => step(-WINDOW));
  next.addEventListener('click', () => step(WINDOW));
  box.addEventListener('scroll', () => {
    if (box.scrollTop + box.clientHeight > box.scrollHeight - 80 && start + WINDOW < shown.length) {
      step(WINDOW);
      box.scrollTop = 8;
    } else if (box.scrollTop < 8 && start > 0) {
      step(-WINDOW);
      box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight - 8);
    }
  }, { passive: true });
  document.getElementById('findlb').addEventListener('input', (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    shown = q ? rows.filter((e) => (e.handle || '').toLowerCase().includes(q)) : rows;
    start = 0;
    paint();
  });
  paint();
}

// API answers sometimes give an avatar as a root-relative path
// (/api/avatars/…); those belong to make.fun, not to this app's host.
export function fullImg(u) {
  if (!u) return '';
  return u.startsWith('http') ? u : 'https://make.fun' + u;
}

export function avatarUrl(p) {
  const raw = typeof p.image === 'string' ? p.image
    : (p.avatar && p.avatar.url) || (typeof p.avatar === 'string' ? p.avatar : '');
  return fullImg(raw);
}

function entryOrder(a, b) {
  const pa = Number(a.prize_usd || 0);
  const pb = Number(b.prize_usd || 0);
  if (pb !== pa) return pb - pa;
  const ra = a.placement === null || a.placement === undefined ? Infinity : Number(a.placement);
  const rb = b.placement === null || b.placement === undefined ? Infinity : Number(b.placement);
  return ra - rb;
}

export async function renderProfile(handle) {
  const p = await getJson(API + '/profiles/' + encodeURIComponent(handle));
  const rec = p.record || {};
  const initials = (p.display_name || p.handle || '?').slice(0, 2).toUpperCase();
  const picUrl = avatarUrl(p);
  const pic = picUrl
    ? '<img class="pic" crossorigin="anonymous" src="' + escText(picUrl) + '" alt="">'
    : '<span class="pic" aria-hidden="true">' + escText(initials) + '</span>';
  const ordered = (p.solutions || []).slice().sort(entryOrder);
  const entries = ordered.map((s) => '<tr><td><a href="#/bounty/' + escText(s.competition.slug) + '">'
    + escText(s.competition.title) + '</a><br><span class="dim">' + escText(s.title || '') + '</span></td>'
    + '<td class="n">' + escText(s.placement ?? '—') + '</td>'
    + '<td class="n">' + escText(s.prize_usd ? money(s.prize_usd) : '—') + '</td>'
    + '<td>' + escText(when(s.entered_at)) + '</td></tr>').join('');
  const links = [
    p.github_login ? '<a href="https://github.com/' + escText(p.github_login) + '">GitHub</a>' : '',
    p.x ? '<a href="https://x.com/' + escText(p.x) + '">X</a>' : '',
    p.discord?.url ? '<a href="' + escText(p.discord.url) + '">Discord</a>' : '',
    p.wallet?.explorer_url ? '<a href="' + escText(p.wallet.explorer_url) + '">Wallet</a>' : '',
  ].filter(Boolean).join(' ');
  view.innerHTML = '<div class="who">' + pic + '<div><h1>' + escText(p.display_name || p.handle)
    + '</h1><p class="dim">@' + escText(p.handle) + ' · joined ' + escText(when(p.joined_at)) + '</p></div></div>'
    + (p.bio ? '<p>' + escText(p.bio) + '</p>' : '')
    + '<p class="line">' + links + '</p>'
    + '<ul class="tally">'
    + '<li><b>' + escText(rec.competitions_entered ?? 0) + '</b><span>entered</span></li>'
    + '<li><b>' + escText(rec.competitions_placed ?? 0) + '</b><span>placed</span></li>'
    + '<li><b>' + escText(rec.competitions_won ?? 0) + '</b><span>won</span></li>'
    + '<li><b>' + escText(rec.best_placement ?? '—') + '</b><span>best place</span></li>'
    + '<li><b>' + escText(rec.prize_usd ? money(rec.prize_usd) : '$0') + '</b><span>prizes</span></li></ul>'
    + '<h2>Entries — wins first</h2>' + (entries
      ? '<table><thead><tr><th>Competition</th><th class="n">Place</th><th class="n">Prize</th><th>Entered</th></tr></thead><tbody>' + entries + '</tbody></table>'
      : '<p class="intro">No entries yet.</p>');
  watchImages(view);
}
