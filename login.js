'use strict';
const f = document.getElementById('lf'), err = document.getElementById('err');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = f.querySelector('button'); b.disabled = true; err.textContent = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: f.u.value, pass: f.p.value }),
    });
    if (r.ok) { location.href = '/'; return; }
    err.textContent = r.status === 401 ? 'اسم المستخدم أو كلمة السر غير صحيحة' : 'خطأ في الإعدادات، راجع إعدادات Cloudflare';
  } catch { err.textContent = 'تعذر الاتصال بالإنترنت'; }
  b.disabled = false;
});
