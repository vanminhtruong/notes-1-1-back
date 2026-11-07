
import { spawn } from 'child_process';
import { readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const envTxt = readFileSync('.env', 'utf8');
const secret = envTxt.match(/^JWT_SECRET=(.*)$/m)[1].trim();
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const now = Math.floor(Date.now()/1000);
const payload = b64url(JSON.stringify({ id: 1, email: 'vanminhtruong95@gmail.com', iat: now, exp: now + 7*86400 }));
const sig = b64url(crypto.createHmac('sha256', secret).update(header + '.' + payload).digest());
const token = header + '.' + payload + '.' + sig;
const user = JSON.stringify({ id: 1, name: 'Trương Minh', email: 'vanminhtruong95@gmail.com', avatar: null, role: 'user' });

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const dir = mkdtempSync(path.join(tmpdir(), 'dsh-chrome-'));
const child = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9222','--user-data-dir=' + dir,'--window-size=1915,1037','about:blank'], { stdio: 'ignore' });

const getJson = (url) => new Promise((res, rej) => { http.get(url, (r) => { let d=''; r.on('data', c=>d+=c); r.on('end', ()=>{ try { res(JSON.parse(d)); } catch(e){ rej(e); } }); }).on('error', rej); });
async function waitFor(fn, timeout=20000){ const t0=Date.now(); while(Date.now()-t0<timeout){ try { const v = await fn(); if(v) return v; } catch {} await sleep(250);} throw new Error('waitFor timeout'); }

let ws;
try {
  const version = await waitFor(async () => { const v = await getJson('http://127.0.0.1:9222/json/version'); return v && v.webSocketDebuggerUrl ? v : null; });
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  const send = (method, params = {}, sessionId) => { const id = ++mid; return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); };

  const t = await send('Target.createTarget', { url: 'about:blank' });
  const at = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = at.sessionId;
  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0,300)); return r.result.value; };

  await send('Page.navigate', { url: 'http://localhost:5173/login' }, sid);
  await sleep(3500);
  let href1 = '';
  try { href1 = await evalJs('location.href'); } catch (e) { href1 = 'EVAL_ERR:' + e.message.slice(0,120); }
  console.log('STEP1 href =', href1);
  try {
    const r = await evalJs('localStorage.setItem("token", ' + JSON.stringify(token) + '); localStorage.setItem("user", ' + JSON.stringify(user) + '); "ok"');
    console.log('STEP2 set localStorage =', r);
  } catch (e) { console.log('STEP2 ERR', e.message.slice(0,160)); }
  await send('Page.navigate', { url: 'http://localhost:5173/dashboard' }, sid); await sleep(4500);
  try { console.log('STEP3 href =', await evalJs('location.href')); } catch (e) { console.log('STEP3 ERR', e.message.slice(0,120)); }

  const info = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button')].map((b,i) => ({ i, text: (b.innerText||'').trim().slice(0,30), aria: b.getAttribute('aria-label')||'', exp: b.getAttribute('aria-expanded'), title: b.getAttribute('title')||'' }));
    return { url: location.href, bodyText: (document.body.innerText||'').slice(0,300), btnCount: btns.length, btns: btns.slice(0,40) };
  })()`);
  console.log('PROBE1', JSON.stringify(info, null, 1));
} catch (e) {
  console.log('PROBE ERROR', e.message);
} finally {
  try { child.kill(); } catch {}
  await sleep(500);
  try { const { rmSync } = await import('fs'); rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
}