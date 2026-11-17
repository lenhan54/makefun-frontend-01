// make.fun frontend shell, V6: hash router, a ticking clock, and a GET-only
// client for the public make.fun API with a minute-bound ETag cache.
// The four surfaces live in views.js and load only when a route needs them.
export const API = 'https://make.fun/api';
export const view = document.getElementById('view');

// Live request accounting, shown in the header on every surface.
export const traffic = { requests: 0, memory: 0, notModified: 0 };

export const cssDone = new Promise((done) => {
  const tag = document.createElement('link');
  tag.rel = 'stylesheet';
  tag.href = './style.css';
  tag.addEventListener('load', done);
  tag.addEventListener('error', done);
  document.head.appendChild(tag);
});

export function escText(raw) {
  const table = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(raw ?? '').replace(/[&<>"']/g, (ch) => table[ch]);
}

export function showTraffic() {
  const line = document.getElementById('netline');
  if (!line) return;
  line.textContent = traffic.requests + ' API requests · ' + traffic.memory
    + ' from memory · ' + traffic.notModified
    + ' × 304 Not Modified · ETag cache on';
}
showTraffic();

export function countMemoryHit() {
  traffic.memory += 1;
  showTraffic();
}

// Bodies already downloaded, keyed by URL, with the tag that fetched them.
const held = new Map();

// GET with If-None-Match. Inside one minute the API answers 304 and the
// body already held is reused instead of downloaded again. One transport
// quirk, verified live: a revalidation whose tag still matches is answered
// 304 with an empty body that some proxies drop instead of delivering, so
// the fetch fails exactly when the server would have said "not modified"
// (the same URL with a bogus tag answers 200). A retry covers a real
// dropped connection; a second failure with a body held is counted as the
// 304 it stands for, and the held body is reused instead of breaking the
// view.
export async function getJson(url) {
  const prior = held.get(url);
  const headers = {};
  if (prior && prior.tag) headers['If-None-Match'] = prior.tag;
  traffic.requests += 1;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (firstErr) {
    await new Promise((wake) => setTimeout(wake, 500));
    traffic.requests += 1;
    try {
      res = await fetch(url, { headers });
    } catch (secondErr) {
      if (prior && prior.tag) {
        traffic.notModified += 1;
        showTraffic();
        return prior.body;
      }
      throw secondErr;
    }
  }
  if (res.status === 304 && prior) {
    traffic.notModified += 1;
    showTraffic();
    return prior.body;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const body = await res.json();
  const tag = res.headers.get('ETag');
  if (tag) held.set(url, { tag, body });
  showTraffic();
  return body;
}

// Short clock text for a deadline: "3d 4h left", "2h 5m left", "12m left".
function leftText(closeMs, nowMs, verbose) {
  const left = closeMs - nowMs;
  if (left <= 0) return 'Closed';
  const totalSec = Math.floor(left / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor(totalSec / 3600) % 24;
  const mins = Math.floor(totalSec / 60) % 60;
  if (!verbose) {
    if (days > 0) return days + 'd ' + hours + 'h left';
    if (hours > 0) return hours + 'h ' + mins + 'm left';
    return mins + 'm left';
  }
  return days + 'd ' + hours + 'h ' + mins + 'm ' + (totalSec % 60) + 's left';
}

// Every [data-deadline] ticks each second; its .bar fills from the
// opening time to the deadline.
export function refreshClocks() {
  const now = Date.now();
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    const close = new Date(el.dataset.deadline).getTime();
    if (Number.isNaN(close)) return;
    el.textContent = leftText(close, now, el.dataset.full === '1');
    const fill = el.closest('.countdown')?.querySelector('.bar > i');
    const opened = el.dataset.opened;
    if (fill && opened) {
      const openedMs = new Date(opened).getTime();
      if (Number.isNaN(openedMs)) return;
      const span = close - openedMs;
      fill.style.width = span > 0
        ? Math.min(100, Math.max(0, ((now - openedMs) / span) * 100)) + '%'
        : '0%';
    }
  });
}
setInterval(refreshClocks, 1000);

export async function go(hash) {
  window.__shotReady = false;
  await cssDone;
  const clean = (hash ?? location.hash ?? '').replace(/^#/, '');
  const [pathBit, queryBit] = clean.split('?');
  const parts = pathBit.split('/').filter(Boolean);
  const query = new URLSearchParams(queryBit || '');
  try {
    const pages = await import('./views.js');
    if (parts.length === 0) await pages.renderBoard(query);
    else if (parts[0] === 'bounty' && parts[1]) await pages.renderBounty(parts[1]);
    else if (parts[0] === 'leaderboard' && parts[1]) await pages.renderLeaderboard(parts[1], query.get('view'));
    else if (parts[0] === 'profile' && parts[1]) await pages.renderProfile(decodeURIComponent(parts[1]));
    else view.innerHTML = '<h1>Page not found</h1><p><a href="#/">Back to the board</a></p>';
  } catch (err) {
    view.innerHTML = '<div class="fault" role="alert"><h1>This view could not load</h1><p>'
      + escText(err.message) + '</p><p><a href="#' + clean + '">Try again</a> · <a href="#/">Back to the board</a></p></div>';
  }
  refreshClocks();
  window.__shotReady = true;
  const titles = { '': 'Board', bounty: 'Bounty', leaderboard: 'Leaderboard', profile: 'Profile' };
  document.title = 'make.fun — ' + (titles[parts[0]] || 'Board');
  view.focus({ preventScroll: true });
}

export function boot() {
  document.getElementById('lookup').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const handle = document.getElementById('handle').value.trim().replace(/^@/, '');
    if (handle) location.hash = '#/profile/' + encodeURIComponent(handle);
  });
  // Pressing / anywhere jumps to the profile search box.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      ev.preventDefault();
      document.getElementById('handle').focus();
    }
  });
  window.addEventListener('hashchange', () => go());
  go();
}
