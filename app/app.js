// make.fun frontend shell: a GET-only client for the public make.fun API
// with a minute-bound ETag cache, a hash router and a ticking clock.
// The four surfaces live in views.js and load only when a route needs them.
export const API_ROOT = 'https://make.fun/api';
export const panel = document.getElementById('view');

// Live request accounting, shown in the header on every surface.
export const net = { sent: 0, cached: 0, fresh304: 0 };

export const cssReady = new Promise((resolve) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './style.css';
  link.addEventListener('load', resolve);
  link.addEventListener('error', resolve);
  document.head.appendChild(link);
});

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function netLine() {
  const line = document.getElementById('netline');
  if (line) {
    line.textContent = net.sent + ' API requests · ' + net.cached
      + ' from memory · ' + net.fresh304
      + ' × 304 Not Modified · ETag cache on';
  }
}
netLine();

export function remembered() {
  net.cached += 1;
  netLine();
}

const heldBodies = new Map();

// GET with If-None-Match. In the same minute the API answers 304 and the
// body already held is reused instead of downloaded again. One transport
// quirk, verified live: a revalidation whose tag still matches is answered
// 304, an empty answer some proxies drop instead of delivering, so the
// fetch fails exactly when the server would have said "not modified" (the
// same URL with a bogus tag answers 200). A retry covers a real dropped
// connection; a second failure with a body held is counted as the 304 it
// stands for, and the held body is reused instead of breaking the view.
export async function fetchJson(url) {
  const held = heldBodies.get(url);
  const headers = {};
  if (held && held.tag) headers['If-None-Match'] = held.tag;
  net.sent += 1;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    // One retry on a dropped connection; an HTTP error still throws below.
    await new Promise((r) => setTimeout(r, 500));
    net.sent += 1;
    try {
      res = await fetch(url, { headers });
    } catch (err2) {
      if (held && held.tag) {
        net.fresh304 += 1;
        netLine();
        return held.body;
      }
      throw err2;
    }
  }
  if (res.status === 304 && held) {
    net.fresh304 += 1;
    netLine();
    return held.body;
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  const body = await res.json();
  const tag = res.headers.get('ETag');
  if (tag) heldBodies.set(url, { tag, body });
  netLine();
  return body;
}

function clockLabel(close, now, short) {
  const left = close - now;
  if (left <= 0) return 'Closed';
  const sec = Math.floor(left / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor(sec / 3600) % 24;
  const mins = Math.floor(sec / 60) % 60;
  if (short) {
    if (days > 0) return days + 'd ' + hours + 'h left';
    if (hours > 0) return hours + 'h ' + mins + 'm left';
    return mins + 'm left';
  }
  return days + 'd ' + hours + 'h ' + mins + 'm ' + (sec % 60) + 's left';
}

// Every [data-deadline] ticks each second; its .meter bar fills from the
// opening time to the deadline.
export function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    const close = new Date(el.dataset.deadline).getTime();
    if (Number.isNaN(close)) return;
    el.textContent = clockLabel(close, now, el.dataset.compact === '1');
    const bar = el.closest('.count')?.querySelector('.meter > i');
    const opened = el.dataset.opened;
    if (bar && opened) {
      const span = close - new Date(opened).getTime();
      bar.style.width = span > 0
        ? Math.min(100, Math.max(0, ((now - new Date(opened).getTime()) / span) * 100)) + '%'
        : '0%';
    }
  });
}
setInterval(tick, 1000);

export async function route(hash) {
  window.__shotReady = false;
  await cssReady;
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
    else panel.innerHTML = '<h1>Page not found</h1><p><a href="#/">Back to the board</a></p>';
  } catch (err) {
    panel.innerHTML = '<div class="fault" role="alert"><h1>This view could not load</h1><p>'
      + esc(err.message) + '</p><p><a href="#' + clean + '">Try again</a> · <a href="#/">Back to the board</a></p></div>';
  }
  tick();
  window.__shotReady = true;
  const names = { '': 'Board', bounty: 'Bounty', leaderboard: 'Leaderboard', profile: 'Profile' };
  document.title = 'make.fun — ' + (names[seg[0]] || 'Board');
  panel.focus({ preventScroll: true });
}

export function start() {
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
  window.addEventListener('hashchange', () => route());
  route();
}
