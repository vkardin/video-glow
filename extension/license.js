// Лицензионные ключи Video Glow Pro. Проверка полностью офлайн (никаких запросов в сеть):
// ключ = "VG1." + base64url(JSON-данные) + "." + base64url(подпись ECDSA P-256 / SHA-256).
// Приватный ключ хранится только у автора (см. набор продавца), здесь — только публичная часть.
(() => {
  const PUBLIC_KEY = {
    kty: 'EC', crv: 'P-256',
    x: 'fzuCdQdMcce-JP6kA-9Ub9N7GVu8RStq0wZD0NiUYGk',
    y: 'QXRhsRAOtA4cjk7IFmcEfqyOpQwcGoLsTc6X4q5nMLM'
  };

  const b64u = (s) => {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // → { ok: true, id, plan } или { ok: false, reason: 'format' | 'signature' | 'crypto' }
  async function verify(key) {
    try {
      const clean = String(key || '').replace(/\s+/g, '');
      const m = /^VG1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(clean);
      if (!m) return { ok: false, reason: 'format' };
      const payload = b64u(m[1]);
      const sig = b64u(m[2]);
      if (sig.length !== 64) return { ok: false, reason: 'format' };
      const pub = await crypto.subtle.importKey('jwk', PUBLIC_KEY,
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, payload);
      if (!good) return { ok: false, reason: 'signature' };
      let data = {};
      try { data = JSON.parse(new TextDecoder().decode(payload)); } catch (e) { /* ignore */ }
      if (data.p !== 'pro') return { ok: false, reason: 'format' };
      return { ok: true, id: String(data.id || '').slice(0, 80), plan: 'pro' };
    } catch (e) {
      return { ok: false, reason: 'crypto' };
    }
  }

  self.VG_License = { verify };
})();
