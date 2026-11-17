// Tiny display helpers: escape, money, percents, dates.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
export const usd = (v) => { const n = +v || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
export const num = (v) => (+v || 0).toLocaleString('en-US');
export const pct = (v) => v == null ? '—' : (v / 1e4).toFixed(1) + '%';
export const left = (iso) => { const m = new Date(iso) - Date.now(); if (m <= 0) return 'ended'; const d = Math.floor(m / 864e5), h = Math.floor(m % 864e5 / 36e5), n = Math.floor(m % 36e5 / 6e4); return d ? d + 'd ' + h + 'h left' : h ? h + 'h ' + n + 'm left' : n + 'm left'; };
export const date = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
export const sdate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
export const abs = (u) => !u ? '' : u[0] === '/' ? 'https://make.fun' + u : u.startsWith('//') ? 'https:' + u : u;
