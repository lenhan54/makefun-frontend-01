// make.fun frontend core: a GET-only client for https://make.fun/api with a
// minute-bound ETag cache, a hash router and a live countdown clock.
// The four views live in views.js and load only when a route needs them.
export const API = 'https://make.fun/api';
export const view = document.getElementById('view');

const cache = new Map();
export const traffic = { requests: 0, memory: 0, notModified: 0 };

export const stylesReady = new Promise((done) => {
  const tag = document.createElement('link');
  tag.rel = 'stylesheet';
  tag.href = './style.css';
  tag.addEventListener('load', done);
  tag.addEventListener('error', done);
  document.head.appendChild(tag);
});

export function html(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// The header line shows the real request counts on every surface.
export function showTraffic() {
  const line = document.getElementById('netline');
  if (line) {
    line.textContent = traffic.requests + ' API requests · ' + traffic.memory
      + ' from memory · ' + traffic.notModified
      + ' × 304 Not Modified · ETag cache on';
  }
}
showTraffic();

export function memoryHit() {
  traffic.memory += 1;
  showTraffic();
}

// GET with If-None-Match. Inside the same minute the API answers 304 and
// the body we already hold is reused instead of downloaded again.
export async function getJson(url) {
  const held = cache.get(url);
  const headers = {};
  if (held && held.tag) headers['If-None-Match'] = held.tag;
  traffic.requests += 1;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    // One retry on a dropped connection; HTTP errors still throw below.
    await new Promise((r) => setTimeout(r, 500));
    traffic.requests += 1;
    res = await fetch(url, { headers });
  }
  if (res.status === 304 && held) {
    traffic.notModified += 1;
    showTraffic();
    return held.body;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const body = await res.json();
  const tag = res.headers.get('ETag');
  if (tag) cache.set(url, { tag, body });
  showTraffic();
  return body;
}

function clockText(close, now, compact) {
  const left = close - now;
  if (left <= 0) return 'Closed';
  const sec = Math.floor(left / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor(sec / 3600) % 24;
  const mins = Math.floor(sec / 60) % 60;
  if (compact) {
    if (days > 0) return days + 'd ' + hours + 'h left';
    if (hours > 0) return hours + 'h ' + mins + 'm left';
    return mins + 'm left';
  }
  return days + 'd ' + hours + 'h ' + mins + 'm ' + (sec % 60) + 's left';
}

// Every [data-deadline] element ticks each second; its .meter bar fills
// from the opening time to the deadline.
export function refreshClocks() {
  const now = Date.now();
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    const close = new Date(el.dataset.deadline).getTime();
    if (Number.isNaN(close)) return;
    el.textContent = clockText(close, now, el.dataset.compact === '1');
    const bar = el.closest('.count')?.querySelector('.meter > i');
    const open = el.dataset.opened;
    if (bar && open) {
      const span = close - new Date(open).getTime();
      bar.style.width = span > 0
        ? Math.min(100, Math.max(0, ((now - new Date(open).getTime()) / span) * 100)) + '%'
        : '0%';
    }
  });
}
setInterval(refreshClocks, 1000);

export async function go(hash) {
  window.__shotReady = false;
  await stylesReady;
  const clean = (hash ?? location.hash ?? '').replace(/^#/, '');
  const [pathPart, queryPart] = clean.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  try {
    const pages = await import('./views.js');
    if (seg.length === 0) await pages.showBoard(query);
    else if (seg[0] === 'bounty' && seg[1]) await pages.showBounty(seg[1]);
    else if (seg[0] === 'leaderboard' && seg[1]) await pages.showLeaderboard(seg[1], query.get('view'));
    else if (seg[0] === 'profile' && seg[1]) await pages.showProfile(decodeURIComponent(seg[1]));
    else view.innerHTML = '<h1>Page not found</h1><p><a href="#/">Back to the board</a></p>';
  } catch (err) {
    view.innerHTML = '<div class="fault" role="alert"><h1>This view could not load</h1><p>'
      + html(err.message) + '</p><p><a href="#' + clean + '">Try again</a> · <a href="#/">Back to the board</a></p></div>';
  }
  refreshClocks();
  window.__shotReady = true;
  const names = { '': 'Board', bounty: 'Bounty', leaderboard: 'Leaderboard', profile: 'Profile' };
  document.title = 'make.fun — ' + (names[seg[0]] || 'Board');
  view.focus({ preventScroll: true });
}

document.getElementById('find').addEventListener('submit', (e) => {
  e.preventDefault();
  const handle = document.getElementById('who').value.trim().replace(/^@/, '');
  if (handle) location.hash = '#/profile/' + encodeURIComponent(handle);
});
// Pressing / anywhere jumps to the profile search box.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('who').focus();
  }
});
window.addEventListener('hashchange', () => go());
go();
