// Cloudflare Pages "advanced mode" worker.
// كل الصفحات محمية: بدون جلسة صحيحة يتحول الزائر لصفحة الدخول.
// اسم المستخدم وكلمة السر موجودان فقط في إعدادات Cloudflare (ADMIN_USER, ADMIN_PASS, SESSION_SECRET).
const COOKIE = 'session';
const PUBLIC = new Set(['/login', '/login.html', '/login.js', '/style.css', '/manifest.json']);
const enc = new TextEncoder();

const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function makeToken(env) {
  const exp = Date.now() + 7 * 864e5;
  return `${exp}.${await hmac(env.SESSION_SECRET, String(exp))}`;
}
async function validToken(env, t) {
  if (!t || !env.SESSION_SECRET) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}
function getCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? m[1] : '';
}
function withSec(res, extra = {}) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SEC, ...extra })) r.headers.set(k, v);
  return r;
}
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const cookieStr = (url, value, maxAge) =>
  `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;

async function login(req, env, url) {
  if (!env.ADMIN_USER || !env.ADMIN_PASS || !env.SESSION_SECRET) return json({ error: 'server' }, 500);
  const origin = req.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'origin' }, 403);
  let b = {};
  try { b = await req.json(); } catch {}
  const S = env.SESSION_SECRET;
  const okU = safeEqual(await hmac(S, String(b.user ?? '')), await hmac(S, env.ADMIN_USER));
  const okP = safeEqual(await hmac(S, String(b.pass ?? '')), await hmac(S, env.ADMIN_PASS));
  if (!(okU && okP)) {
    await new Promise((r) => setTimeout(r, 1000)); // يبطّئ التخمين
    return json({ error: 'bad' }, 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookieStr(url, await makeToken(env), 7 * 86400) });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/login' && req.method === 'POST') return withSec(await login(req, env, url));
    if (path === '/api/logout' && req.method === 'POST') {
      return withSec(json({ ok: true }, 200, { 'Set-Cookie': cookieStr(url, '', 0) }));
    }

    const isPublic = PUBLIC.has(path) || path.startsWith('/icons/');
    const ok = await validToken(env, getCookie(req, COOKIE));

    if (ok && (path === '/login' || path === '/login.html')) return withSec(Response.redirect(url.origin + '/', 302));
    if (!ok && !isPublic) {
      if (path.startsWith('/api/')) return withSec(json({ error: 'unauthorized' }, 401));
      return withSec(Response.redirect(url.origin + '/login', 302));
    }

    const res = await env.ASSETS.fetch(req);
    return withSec(res, isPublic ? {} : { 'Cache-Control': 'no-store' });
  },
};
