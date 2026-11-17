// The four surfaces, loaded on demand by app.js: a dense board table with
// sort and category filters beside one bounty in full and the live Top 10,
// a single bounty's page with a save star and a timeline, its windowed
// leaderboard, and a public profile. Everything comes from the public API,
// read-only, GET only.
import { API_ROOT, panel, esc, fetchJson, remembered } from './app.js';

export const PAGE = 50;

export function usd(n) {
  if (n === null || n === undefined || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function dateStr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function since(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function timeLeft(deadline) {
  if (!deadline) return 'No deadline';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m % 60}m left`;
  return `${m}m left`;
}

export function closesIn(deadline) {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'closed';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${Math.floor(ms / 60000) % 60}m`;
  return `in ${Math.floor(ms / 60000)}m`;
}

// A bounty past its deadline is closed even when status still reads open.
export function isOpen(c) {
  if (!c) return false;
  return c.deadline ? new Date(c.deadline).getTime() > Date.now() : c.status === 'open';
}

export function livePot(c) {
  return c.potUsd ?? c.rewardAmount ?? null;
}

export function feeLabel(c) {
  const f = c.entryFeeUsd;
  if (f === null || f === undefined) return 'Free entry';
  return `Entry fee ${usd(f)}`;
}

// Short form for the dense board row: "Free" or "$0.50".
export function feeShort(c) {
  const f = c.entryFeeUsd;
  if (f === null || f === undefined) return 'Free';
  return usd(f);
}

// "$500 reward + $221.50 fees = $721.50 live pot" — reward and fees apart.
export function potLine(c) {
  const reward = c.rewardAmount;
  if (reward === null || reward === undefined) return `${usd(livePot(c))} live pot`;
  const fees = Number(c.entryFeesUsd || 0);
  return `${usd(reward)} reward${fees > 0 ? ` + ${usd(fees)} fees` : ''} = ${usd(livePot(c))} live pot`;
}

export function passedLine(c) {
  if (c.submissionsPassed === null || c.submissionsPassed === undefined) return `${c.submissionCount ?? 0} entries`;
  return `${c.submissionsPassed}/${c.submissionCount ?? 0} passed the checks`;
}

export function countdownHtml(c) {
  if (!c.deadline) return '';
  const opened = c.opensAt || '';
  const now = Date.now();
  const span = opened ? new Date(c.deadline).getTime() - new Date(opened).getTime() : 0;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((now - new Date(opened).getTime()) / span) * 100)) : 0;
  return `<p class="count"><span data-deadline="${esc(c.deadline)}" data-opened="${esc(opened)}">${esc(timeLeft(c.deadline))}</span><span class="meter"><i style="width:${pct.toFixed(1)}%"></i></span></p>`;
}

// "Results by" comes from the phases: the final phase ends when results
// are due, not from a resolvedAt that is still null.
export function finalEnds(c) {
  const phases = c.phases || [];
  const fin = phases.find((p) => p.key === 'final') || phases[phases.length - 1];
  return fin?.endsAt || c.resolvedAt || null;
}

export function datesHtml(c) {
  const chain = (c.phases || []).map((p) => esc(p.title)).join(' → ');
  return `<p class="small">Opened ${esc(dateStr(c.opensAt))} · Deadline ${esc(dateStr(c.deadline))} · Results by ${esc(dateStr(finalEnds(c)))}</p>`
    + (chain ? `<p class="small">Phases: ${chain}</p>` : '');
}

// Turn raw markdown into clean paragraphs: headings become plain text,
// links keep their words, bold/italic markers and images drop out.
export function stripMd(text) {
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

export function paras(text, cap) {
  const parts = stripMd(text).split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  const shown = cap ? parts.slice(0, cap) : parts;
  return shown.map((p) => `<p class="blurb">${esc(p)}</p>`).join('');
}

// Judge win rates arrive per-million (950587 means 95.06%).
export function rateCell(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (key && key.indexOf('judge') === 0 && !Number.isNaN(Number(v))) return (Number(v) / 10000).toFixed(2) + '%';
  return String(v);
}

// A broken avatar degrades to no avatar, never a broken-image icon.
export function guardImgs(root) {
  (root || document).querySelectorAll('img').forEach((img) => {
    if (img.dataset.armed) return;
    img.dataset.armed = '1';
    img.addEventListener('error', () => img.remove());
  });
}

export function prizeByPlace(c) {
  const map = new Map();
  const now = c.rewardsNow || [];
  if (now.length) {
    now.forEach((r) => map.set(String(r.place), r.amountUsd));
    return map;
  }
  Object.keys(c.rewards || {}).forEach((p) => map.set(p, c.rewards[p]));
  return map;
}

function prizeTableRows(c, cap) {
  const now = c.rewardsNow || [];
  let rows;
  if (now.length) {
    rows = now.map((r) => `<tr><td class="n">${esc(r.place)}</td><td class="n">${esc(usd(r.baseUsd))}</td><td class="n">${esc(usd(r.feeShareUsd))}</td><td class="n"><b>${esc(usd(r.amountUsd))}</b></td></tr>`);
  } else {
    const table = c.rewards || {};
    rows = Object.keys(table).sort((a, b) => a - b).map((p) => `<tr><td class="n">${esc(p)}</td><td class="n">${esc(usd(table[p]))}</td><td class="n">—</td><td class="n"><b>${esc(usd(table[p]))}</b></td></tr>`);
  }
  if (cap && rows.length > cap) {
    return rows.slice(0, cap).join('') + `<tr><td class="small" colspan="4">… and ${rows.length - cap} more places pay — full table on the bounty page</td></tr>`;
  }
  return rows.join('');
}

const prizeHead = '<table><thead><tr><th class="n">Place</th><th class="n">Base</th><th class="n">Fee share</th><th class="n">Pays now</th></tr></thead><tbody>';
const prizeFoot = '</tbody></table>';

// Patch a list in place: rows that did not change keep their DOM node and
// their place; only new, removed or changed rows are touched. Nothing here
// rebuilds the whole list. Returns how many rows changed.
export function patchList(el, items, keyOf, rowHtml, tag) {
  const byKey = new Map();
  [...el.children].forEach((ch) => { if (ch.dataset.k) byKey.set(ch.dataset.k, ch); });
  const frag = document.createDocumentFragment();
  let changed = 0;
  for (const it of items) {
    const key = String(keyOf(it));
    const markup = rowHtml(it);
    let node = byKey.get(key);
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

let lbHeld = { key: '', data: null };

async function loadBoardLb(slug, viewName) {
  const key = slug + '|' + (viewName || '');
  if (lbHeld.key === key && lbHeld.data) {
    remembered();
    return lbHeld.data;
  }
  const url = API_ROOT + '/competitions/' + encodeURIComponent(slug) + '/leaderboard' + (viewName ? '?view=' + encodeURIComponent(viewName) : '');
  const data = await fetchJson(url);
  lbHeld = { key, data };
  return data;
}

function bountyCard(c) {
  const open = isOpen(c);
  const short = c.summary ? `<p class="intro">${esc(c.summary)}</p>` : '';
  return `<h2><a href="#/bounty/${esc(c.slug)}">${esc(c.title)}</a></h2>
<p class="line"><span class="prize">${esc(potLine(c))}</span><span class="pill${open ? '' : ' off'}">${open ? 'Open' : 'Closed'}</span><span class="charge">${esc(feeLabel(c))}</span></p>
${countdownHtml(c)}
<p class="small">${esc(passedLine(c))} · ${esc(c.category || '')}${c.skills && c.skills.length ? ' · ' + esc(c.skills.join(', ')) : ''}${c.entryFeePayers ? ' · ' + esc(String(c.entryFeePayers)) + ' paid the entry fee' : ''}</p>
${datesHtml(c)}
<h2>Rewards</h2>${prizeHead}${prizeTableRows(c, 5)}${prizeFoot}
${short}
${paras(c.description, 2)}
<p class="line"><a href="#/bounty/${esc(c.slug)}">Full bounty →</a><a href="#/leaderboard/${esc(c.slug)}">Leaderboard →</a></p>`;
}

function topTen(d, slug, prizes) {
  const rows = (d.entries || []).slice(0, 10);
  const key = d.rank_key || 'judge';
  const items = rows.map((e) => {
    const rate = rateCell(key, e.display?.[key] ?? e.values?.[key] ?? e[key]);
    const prize = prizes.get(String(e.prize_rank ?? e.rank));
    const pic = e.image ? `<img class="mini" crossorigin="anonymous" src="${esc(absImg(e.image))}" alt="" loading="lazy">` : '';
    return `<li>${pic}<span class="pos">${esc(e.rank ?? '—')}</span><a href="#/profile/${esc(e.handle)}">${esc(e.handle)}</a><span class="pct">${esc(rate)}</span>${prize !== undefined ? `<span class="win">${esc(usd(prize))}</span>` : ''}</li>`;
  }).join('');
  return `<h2>Top 10 now</h2><p class="small">Ranked by ${esc(d.rank_key || '—')} · ${esc(String((d.entries || []).length))} entries</p><ol class="ranks">${items}</ol><p class="small"><a href="#/leaderboard/${esc(slug)}">Full leaderboard →</a></p>`;
}

function feedList(a) {
  const items = (a.entries || []).slice(0, 6).map((e) => `<li><a href="#/profile/${esc(e.handle)}">${esc(e.handle)}</a> entered <a href="#/bounty/${esc(e.competition.slug)}">${esc(e.entry_title || e.competition.title)}</a> · ${esc(since(e.created_at))}</li>`).join('');
  return `<h2>Latest entries</h2><ul class="feed" id="feed">${items}</ul>`;
}

let feedTimer = null;

const SORTS = {
  closing: { label: 'Closing soon', fn: (a, b) => new Date(a.deadline) - new Date(b.deadline) },
  pot: { label: 'Biggest pot', fn: (a, b) => (Number(livePot(b)) || 0) - (Number(livePot(a)) || 0) },
  entries: { label: 'Most entries', fn: (a, b) => (b.submissionCount || 0) - (a.submissionCount || 0) },
};

function boardRow(c, chosen, keep) {
  const open = isOpen(c);
  return `<tr${c.slug === chosen ? ' class="sel"' : ''}><td><div class="bname"><a href="#/?b=${esc(c.slug)}&${keep}">${esc(c.title)}</a><span class="cat${open ? '' : ' shut'}">${esc(c.category || '')}</span></div></td><td class="n"><b>${esc(usd(livePot(c)))}</b></td><td class="n">${esc(feeShort(c))}</td><td class="n"><span data-deadline="${esc(c.deadline || '')}" data-compact="1">${esc(timeLeft(c.deadline))}</span></td><td class="n">${esc(String(c.submissionCount ?? 0))}</td></tr>`;
}

export async function showBoard(params) {
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'closing';
  const cat = params.get('cat') || '';
  const [data, act] = await Promise.all([
    fetchJson(API_ROOT + '/competitions?status=open&activity=times'),
    fetchJson(API_ROOT + '/activity/entries/latest'),
  ]);
  const all = data.items || [];
  const cats = [...new Set(all.map((c) => c.category).filter(Boolean))].sort();
  const live = all.filter(isOpen);
  const potSum = live.reduce((s, c) => s + (Number(livePot(c)) || 0), 0);
  const entrySum = live.reduce((s, c) => s + (c.submissionCount || 0), 0);
  const next = live.map((c) => c.deadline).filter(Boolean).sort()[0];
  const list = all.filter((c) => !cat || c.category === cat).slice().sort((a, b) => {
    const ao = isOpen(a) ? 0 : 1;
    const bo = isOpen(b) ? 0 : 1;
    return ao - bo || SORTS[sort].fn(a, b);
  });
  const chosen = params.get('b') || (list.some((c) => c.slug === 'makefun-frontend-01') ? 'makefun-frontend-01' : (list[0] || {}).slug);
  const keep = `sort=${sort}${cat ? '&cat=' + encodeURIComponent(cat) : ''}`;
  const sortBtns = Object.keys(SORTS).map((k) => `<a class="chip${k === sort ? ' on' : ''}" href="#/?sort=${k}${cat ? '&cat=' + encodeURIComponent(cat) : ''}">${SORTS[k].label}</a>`).join(' ');
  const catChips = [`<a class="chip${!cat ? ' on' : ''}" href="#/?sort=${sort}">All</a>`].concat(cats.map((c) => `<a class="chip${c === cat ? ' on' : ''}" href="#/?sort=${sort}&cat=${encodeURIComponent(c)}">${esc(c)}</a>`)).join(' ');
  panel.innerHTML = `<h1>Live bounties</h1>
<ul class="stats"><li><b>${live.length}</b><span>taking entries</span></li><li><b>${esc(usd(potSum))}</b><span>in live pots</span></li><li><b>${entrySum.toLocaleString()}</b><span>entries</span></li><li><b>${esc(closesIn(next))}</b><span>next deadline</span></li></ul>
<div class="grid3"><section class="pane" aria-label="Bounties"><h2>Board</h2>
<p class="tools">Sort: ${sortBtns}</p><p class="tools">Category: ${catChips}</p>
<table class="board"><thead><tr><th>Bounty</th><th class="n">Live pot</th><th class="n">Fee</th><th class="n">Time left</th><th class="n">Entries</th></tr></thead><tbody id="boardrows"></tbody></table></section>
<section class="pane" id="detail" aria-label="Bounty detail"><p class="wait">Loading bounty…</p></section>
<section class="pane side" aria-label="Top entries and activity"><div id="side"><p class="wait">Loading top 10…</p></div></section></div>`;
  patchList(document.getElementById('boardrows'), list, (c) => c.slug, (c) => boardRow(c, chosen, keep).replace(/^<tr[^>]*>|<\/tr>$/g, ''), 'TR');
  if (chosen) {
    const picked = document.querySelector('#boardrows [data-k="' + CSS.escape(chosen) + '"]');
    if (picked) picked.classList.add('sel');
  }
  if (!chosen) return;
  const [c, lb] = await Promise.all([
    fetchJson(API_ROOT + '/competitions/' + encodeURIComponent(chosen) + '?submissions=summary'),
    loadBoardLb(chosen, ''),
  ]);
  const detail = document.getElementById('detail');
  if (detail) detail.innerHTML = bountyCard(c);
  const side = document.getElementById('side');
  if (side) {
    side.innerHTML = topTen(lb, chosen, prizeByPlace(c)) + feedList(act);
    guardImgs(side);
  }
  if (feedTimer) clearInterval(feedTimer);
  feedTimer = setInterval(async () => {
    const box = document.getElementById('feed');
    if (!box) {
      clearInterval(feedTimer);
      return;
    }
    try {
      const fresh = await fetchJson(API_ROOT + '/activity/entries/latest');
      const items = (fresh.entries || []).slice(0, 6);
      patchList(box, items, (e) => e.handle + '|' + e.competition.slug, (e) => `<a href="#/profile/${esc(e.handle)}">${esc(e.handle)}</a> entered <a href="#/bounty/${esc(e.competition.slug)}">${esc(e.entry_title || e.competition.title)}</a> · ${esc(since(e.created_at))}`, 'LI');
    } catch (e) { /* keep showing the last good feed */ }
  }, 60000);
}

// Saved bounties live in localStorage only — no account, no write to make.fun.
export function savedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem('mf-saved') || '[]'));
  } catch (e) {
    return new Set();
  }
}

export function toggleSaved(slug) {
  const set = savedSet();
  if (set.has(slug)) set.delete(slug);
  else set.add(slug);
  try {
    localStorage.setItem('mf-saved', JSON.stringify([...set]));
  } catch (e) { /* storage off: the star just does not stick */ }
  return set.has(slug);
}

// Four milestones on one line: Opened — Now — Deadline — Results by.
export function timelineHtml(c) {
  const start = c.opensAt ? new Date(c.opensAt).getTime() : null;
  const end = finalEnds(c) ? new Date(finalEnds(c)).getTime() : (c.deadline ? new Date(c.deadline).getTime() : null);
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
  const dots = marks.map((m) => `<i class="${m.cls}" style="left:${at(m.t).toFixed(1)}%"></i><b class="${m.cls === 'now' ? 'hot' : ''}" style="left:${at(m.t).toFixed(1)}%">${m.label}</b>`).join('');
  return `<div class="tl" aria-label="Bounty timeline">${dots}</div>`;
}

export async function showBounty(slug) {
  // submissions=summary keeps this answer near 100 KB instead of ~2.9 MB.
  const c = await fetchJson(API_ROOT + '/competitions/' + encodeURIComponent(slug) + '?submissions=summary');
  const open = isOpen(c);
  const kept = savedSet().has(slug);
  panel.innerHTML = `<p><a href="#/">← All bounties</a></p>
<h1>${esc(c.title)}</h1>
<p class="line"><span class="prize">${esc(potLine(c))}</span>
<span class="pill${open ? '' : ' off'}">${open ? 'Accepting entries' : 'Entries closed'}</span>
<span class="charge">${esc(feeLabel(c))}</span>
<button type="button" class="savebtn${kept ? ' kept' : ''}" id="savebtn" aria-pressed="${kept}">${kept ? '★ Saved' : '☆ Save'}</button></p>
${countdownHtml(c)}
${timelineHtml(c)}
<p class="small">Status: ${esc(c.status || '—')} · ${esc(passedLine(c))} · ${esc(c.category || '')}</p>
${datesHtml(c)}
<p class="line"><a href="#/leaderboard/${esc(c.slug)}">View leaderboard →</a><a href="#/?b=${esc(c.slug)}">Open in split board →</a></p>
<h2>Rewards</h2>${prizeHead}${prizeTableRows(c)}${prizeFoot}
${c.summary ? `<p class="intro">${esc(c.summary)}</p>` : ''}
<h2>About</h2>${paras(c.description)}
${c.rules ? `<h2>Rules</h2><details><summary>Read the full rules</summary><pre class="rules">${esc(c.rules)}</pre></details>` : ''}`;
  const btn = document.getElementById('savebtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const nowKept = toggleSaved(slug);
      btn.classList.toggle('kept', nowKept);
      btn.setAttribute('aria-pressed', String(nowKept));
      btn.textContent = nowKept ? '★ Saved' : '☆ Save';
    });
  }
}

export async function showLeaderboard(slug, viewName) {
  const [d, c] = await Promise.all([
    loadBoardLb(slug, viewName),
    fetchJson(API_ROOT + '/competitions/' + encodeURIComponent(slug) + '?submissions=summary'),
  ]);
  const prizes = prizeByPlace(c);
  const rows = d.entries || [];
  const tabs = (d.views || []).map((v) => `<a href="#/leaderboard/${esc(slug)}?view=${esc(v)}"${v === (viewName || d.view) ? ' aria-current="page"' : ''}>${esc(v)}</a>`).join(' · ');
  panel.innerHTML = `<p><a href="#/bounty/${esc(slug)}">← Bounty</a></p>
<h1>Leaderboard — ${esc(d.competition?.title || slug)}</h1>
<p class="intro">${esc(d.title || '')} · phase ${esc(d.phase?.title || d.phase?.key || '—')} · ranked by ${esc(d.rank_key || '—')} · ${esc(String(rows.length))} entries</p>
<p class="line">Views: ${tabs}</p>
<p class="tools"><label for="findlb">Find handle</label> <input id="findlb" type="search" placeholder="type a handle…" autocomplete="off"></p>
<nav class="pages" aria-label="Leaderboard window"><button type="button" id="prev">← Prev 50</button><span class="where" id="where"></span><button type="button" id="next">Next 50 →</button></nav>
<div class="scrollbox" id="box" tabindex="0"><table><thead><tr><th class="n">#</th><th>Entrant</th><th class="n">Judge win rate</th><th class="n">90% interval</th><th class="n">Prize now</th></tr></thead><tbody id="rows"></tbody></table></div>
<p class="small">Only 50 rows sit in the page at a time — rows patched in place · virtual leaderboard.</p>`;
  const box = document.getElementById('box');
  const body = document.getElementById('rows');
  const where = document.getElementById('where');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  let shown = rows;
  let start = 0;
  function lbRow(e) {
    const rate = rateCell('judge', e.display?.judge ?? e.values?.judge);
    const low = rateCell('judge_low', e.display?.judge_low ?? e.values?.judge_low);
    const high = rateCell('judge_high', e.display?.judge_high ?? e.values?.judge_high);
    const prize = prizes.get(String(e.prize_rank ?? e.rank));
    const pic = e.image ? `<img class="mini" crossorigin="anonymous" src="${esc(absImg(e.image))}" alt="" loading="lazy">` : '';
    return `<td class="n">${esc(e.rank ?? '—')}</td><td>${pic}<a href="#/profile/${esc(e.handle)}">${esc(e.handle)}</a><br><span class="small">${esc(e.title || '')}</span></td><td class="n"><b>${esc(rate)}</b></td><td class="n">${esc(low)}–${esc(high)}</td><td class="n"><b>${esc(prize !== undefined ? usd(prize) : '—')}</b></td>`;
  }
  function paint() {
    const end = Math.min(shown.length, start + PAGE);
    patchList(body, shown.slice(start, end), (e) => e.rank ?? e.handle, lbRow, 'TR');
    guardImgs(body);
    where.textContent = `Rows ${(start + 1).toLocaleString()}–${end.toLocaleString()} of ${shown.length.toLocaleString()}`;
    prev.disabled = start <= 0;
    next.disabled = end >= shown.length;
  }
  function step(n) {
    start = Math.max(0, Math.min(Math.max(0, shown.length - PAGE), start + n));
    paint();
    box.scrollTop = 0;
  }
  prev.addEventListener('click', () => step(-PAGE));
  next.addEventListener('click', () => step(PAGE));
  box.addEventListener('scroll', () => {
    if (box.scrollTop + box.clientHeight > box.scrollHeight - 80 && start + PAGE < shown.length) {
      step(PAGE);
      box.scrollTop = 8;
    } else if (box.scrollTop < 8 && start > 0) {
      step(-PAGE);
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
export function absImg(u) {
  if (!u) return '';
  return u.startsWith('http') ? u : 'https://make.fun' + u;
}

export function avatarOf(p) {
  const raw = typeof p.image === 'string' ? p.image : (p.avatar && p.avatar.url) || (typeof p.avatar === 'string' ? p.avatar : '');
  return absImg(raw);
}

function entrySort(a, b) {
  const pa = Number(a.prize_usd || 0);
  const pb = Number(b.prize_usd || 0);
  if (pb !== pa) return pb - pa;
  const ra = a.placement === null || a.placement === undefined ? Infinity : Number(a.placement);
  const rb = b.placement === null || b.placement === undefined ? Infinity : Number(b.placement);
  return ra - rb;
}

export async function showProfile(handle) {
  const p = await fetchJson(API_ROOT + '/profiles/' + encodeURIComponent(handle));
  const rec = p.record || {};
  const initials = (p.display_name || p.handle || '?').slice(0, 2).toUpperCase();
  const picUrl = avatarOf(p);
  const pic = picUrl
    ? `<img class="pic" crossorigin="anonymous" src="${esc(picUrl)}" alt="">`
    : `<span class="pic" aria-hidden="true">${esc(initials)}</span>`;
  const ordered = (p.solutions || []).slice().sort(entrySort);
  const entries = ordered.map((s) => `<tr><td><a href="#/bounty/${esc(s.competition.slug)}">${esc(s.competition.title)}</a><br><span class="small">${esc(s.title || '')}</span></td><td class="n">${esc(s.placement ?? '—')}</td><td class="n">${esc(s.prize_usd ? usd(s.prize_usd) : '—')}</td><td>${esc(dateStr(s.entered_at))}</td></tr>`).join('');
  const links = [
    p.github_login ? `<a href="https://github.com/${esc(p.github_login)}">GitHub</a>` : '',
    p.x ? `<a href="https://x.com/${esc(p.x)}">X</a>` : '',
    p.discord?.url ? `<a href="${esc(p.discord.url)}">Discord</a>` : '',
    p.wallet?.explorer_url ? `<a href="${esc(p.wallet.explorer_url)}">Wallet</a>` : '',
  ].filter(Boolean).join(' ');
  panel.innerHTML = `<div class="who">${pic}<div><h1>${esc(p.display_name || p.handle)}</h1><p class="small">@${esc(p.handle)} · joined ${esc(dateStr(p.joined_at))}</p></div></div>
${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
<p class="line">${links}</p>
<ul class="tally">
<li><b>${esc(rec.competitions_entered ?? 0)}</b><span>entered</span></li>
<li><b>${esc(rec.competitions_placed ?? 0)}</b><span>placed</span></li>
<li><b>${esc(rec.competitions_won ?? 0)}</b><span>won</span></li>
<li><b>${esc(rec.best_placement ?? '—')}</b><span>best place</span></li>
<li><b>${esc(rec.prize_usd ? usd(rec.prize_usd) : '$0')}</b><span>prizes</span></li></ul>
<h2>Entries — wins first</h2>${entries ? `<table><thead><tr><th>Competition</th><th class="n">Place</th><th class="n">Prize</th><th>Entered</th></tr></thead><tbody>${entries}</tbody></table>` : '<p class="intro">No entries yet.</p>'}`;
  guardImgs(panel);
}
