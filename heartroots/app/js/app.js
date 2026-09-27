import { db, uid, exportBundle, importBundle, blobToDataURL } from './db.js';
import { CONFIG } from './config.js';
import {
  CATEGORIES, DAILY_QUESTIONS, LEGACY_INTERVIEW, LETTER_OCCASIONS, PACKS,
  WOULD_YOU_RATHER, STORY_STARTERS, STORY_PROMPTS, MOODS, RELATIONS, AVATAR_EMOJI,
} from './content.js';

// ── State ─────────────────────────────────────────────────────
const S = {
  people: [], posts: [], moods: [], chats: [], messages: [], letters: [],
  meId: null, unlocked: new Set(), trialStart: null, tab: 'home',
};
const COLORS = ['#fbe3da', '#e1eee3', '#e3e7fb', '#fbf1d5', '#f3def5', '#d9f1f2', '#f1e0d0', '#e8e8e8'];
const SKUS = ['base', 'parent', 'kids', 'family', 'games'];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDate = (d = new Date()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const today = () => localDate();
const me = () => S.people.find((p) => p.id === S.meId);
const person = (id) => S.people.find((p) => p.id === id);
const nameOf = (id) => person(id)?.name || 'Someone';
const profiles = () => S.people.filter((p) => p.profile);

async function load() {
  for (const k of ['people', 'posts', 'moods', 'chats', 'messages', 'letters']) S[k] = await db.all(k);
  S.posts.sort((a, b) => b.createdAt - a.createdAt);
  S.meId = await db.getKV('meId', null);
  S.unlocked = new Set(await db.getKV('unlocked', []));
  S.trialStart = await db.getKV('trialStart', null);
}

async function save(store, row) {
  await db.put(store, row);
  const list = S[store];
  const i = list.findIndex((r) => r.id === row.id);
  if (i >= 0) list[i] = row; else list.unshift(row);
}

async function remove(store, id) {
  await db.del(store, id);
  S[store] = S[store].filter((r) => r.id !== id);
}

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function avatar(p, size = '') {
  if (!p) return `<span class="avatar ${size}">🙂</span>`;
  return `<span class="avatar ${size}" style="--c:${esc(p.color || COLORS[0])}">${esc(p.emoji || '🙂')}${p.passed ? '<span class="candle">🕯️</span>' : ''}</span>`;
}

function years(p) {
  if (!p.birthYear && !p.deathYear) return '';
  return `${p.birthYear || '?'}${p.passed || p.deathYear ? ` – ${p.deathYear || ''}` : ''}`;
}

function toast(msg) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Media blobs are loaded lazily into object URLs after each render.
const mediaCache = new Map();
async function hydrateMedia(root = document) {
  for (const el of $$('[data-media]', root)) {
    const id = el.dataset.media;
    if (!mediaCache.has(id)) {
      const row = await db.get('media', id);
      if (!row) continue;
      mediaCache.set(id, URL.createObjectURL(row.blob));
    }
    if (el.src !== mediaCache.get(id)) el.src = mediaCache.get(id);
  }
}

function mediaTag(post) {
  if (!post.mediaId) return '';
  if (post.mediaType === 'video') return `<video controls playsinline preload="metadata" data-media="${post.mediaId}"></video>`;
  if (post.mediaType === 'audio') return `<audio controls preload="metadata" data-media="${post.mediaId}"></audio>`;
  if (post.mediaType === 'image') return `<img alt="" data-media="${post.mediaId}">`;
  return '';
}

// ── Access / purchases ───────────────────────────────────────
function trialDaysLeft() {
  if (!S.trialStart) return CONFIG.trialDays;
  const used = (Date.now() - S.trialStart) / 86400000;
  return Math.max(0, Math.ceil(CONFIG.trialDays - used));
}
const hasAccess = (sku) => S.unlocked.has(sku) || (sku === 'base' && trialDaysLeft() > 0);

async function unlock(skus) {
  skus.forEach((s) => S.unlocked.add(s));
  await db.setKV('unlocked', [...S.unlocked]);
}

async function redeemCode(raw) {
  const code = raw.trim().toUpperCase();
  if (!code) return false;
  const skus = CONFIG.unlockCodes[await sha256(code)];
  if (!skus) return false;
  await unlock(skus);
  return skus;
}

// Call before any "create" action. Viewing and exporting memories are never locked.
function guard() {
  if (hasAccess('base')) return true;
  openStore('Your free week is over. Unlock Heartroots for life to keep adding memories — everything you already saved stays yours to view and export.');
  return false;
}

// ── Daily questions ──────────────────────────────────────────
function answeredIds(pid) {
  return new Set(S.posts.filter((p) => p.personId === pid && p.questionId).map((p) => p.questionId));
}

function questionPool(p) {
  const asks = (p.askQueue || []).map((a) => ({ id: a.id, text: a.text, category: 'family', fromId: a.fromId }));
  return [...asks, ...DAILY_QUESTIONS];
}

function findQuestion(p, id) {
  return questionPool(p).find((q) => q.id === id) || LEGACY_INTERVIEW.find((q) => q.id === id);
}

async function todaysQuestions(p) {
  const key = `today:${p.id}`;
  const saved = await db.getKV(key, null);
  if (saved && saved.date === today()) {
    const qs = saved.ids.map((id) => findQuestion(p, id)).filter(Boolean);
    if (qs.length) return qs;
  }
  const done = answeredIds(p.id);
  const asks = questionPool(p).filter((q) => q.fromId && !done.has(q.id));
  const rest = DAILY_QUESTIONS.filter((q) => !done.has(q.id)).sort(() => Math.random() - 0.5);
  const count = asks.length ? 2 : (Math.random() < 0.5 ? 1 : 2);
  const picked = [...asks, ...rest].slice(0, count);
  await db.setKV(key, { date: today(), ids: picked.map((q) => q.id) });
  return picked;
}

async function swapQuestion(p, oldId) {
  const key = `today:${p.id}`;
  const saved = await db.getKV(key, { date: today(), ids: [] });
  const done = answeredIds(p.id);
  const next = DAILY_QUESTIONS.filter((q) => !done.has(q.id) && !saved.ids.includes(q.id))
    .sort(() => Math.random() - 0.5)[0];
  const i = saved.ids.indexOf(oldId);
  if (i < 0) return;
  if (next) saved.ids[i] = next.id; else saved.ids.splice(i, 1);
  await db.setKV(key, saved);
}

// ── Sheets (stackable modals) ────────────────────────────────
function openSheet(html, { full = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  back._onClose = onClose;
  back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  hydrateMedia(back);
  return back.firstElementChild;
}

function closeSheet() {
  const all = $$('.sheet-backdrop');
  const top = all[all.length - 1];
  if (!top) return;
  top._onClose?.();
  $$('video, audio', top).forEach((m) => m.pause?.());
  top.remove();
  if (all.length === 1) document.body.style.overflow = '';
}

function closeAllSheets() { while ($('.sheet-backdrop')) closeSheet(); }

const head = (title, extra = '') =>
  `<div class="sheet-head"><h2>${title}</h2><div class="row">${extra}<button class="iconbtn" data-action="close" aria-label="Close">✕</button></div></div>`;

// ── Actions (event delegation) ───────────────────────────────
const actions = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

actions.close = () => closeSheet();
actions.tab = ({ tab }) => { S.tab = tab; render(); window.scrollTo(0, 0); };

// ── Display & reading preferences ────────────────────────────
// Saved per person (Dad can have huge text while the kids keep normal),
// with a device-wide copy used on the welcome screen and for new profiles.
const TEXT_SIZES = [
  { scale: 1, label: 'Normal' }, { scale: 1.15, label: 'Large' },
  { scale: 1.3, label: 'Larger' }, { scale: 1.5, label: 'Largest' },
];
const DEFAULT_PREFS = { scale: 1, font: 'standard', bold: false, contrast: 'normal', motion: 'auto', readAloud: true };
let devicePrefs = { ...DEFAULT_PREFS };
const prefs = () => ({ ...DEFAULT_PREFS, ...devicePrefs, ...(me()?.prefs || {}) });

function applyPrefs(p = prefs()) {
  const root = document.documentElement;
  root.style.setProperty('--scale', p.scale);
  root.dataset.font = p.font;
  root.dataset.contrast = p.contrast;
  root.dataset.motion = p.motion;
  root.toggleAttribute('data-bold', !!p.bold);
  root.toggleAttribute('data-big', p.scale >= 1.3);
}

async function savePrefs(patch) {
  const next = { ...prefs(), ...patch };
  devicePrefs = next;
  await db.setKV('prefs', next);
  const m = me();
  if (m) { m.prefs = next; await save('people', m); }
  applyPrefs(next);
}

// Read text out loud — helps young kids and anyone who finds reading tiring.
const canSpeak = 'speechSynthesis' in window;
function speak(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  speechSynthesis.speak(u);
}
const speakBtn = (text) => (canSpeak && prefs().readAloud
  ? `<button class="speak" data-action="speak" data-text="${esc(text)}" aria-label="Read out loud">🔊</button>` : '');
actions.speak = ({ text }) => speak(text);

actions.display = () => {
  const p = prefs();
  const sheet = openSheet(`${head('Aa  Text & display')}
    <p class="muted">Make ${CONFIG.appName} comfortable to read${me() ? ` for <b>${esc(me().name)}</b>` : ''}. Changes show right away.</p>
    <div class="field"><span>Quick setup</span>
      <button class="preset" data-preset="older"><span class="ico">👓</span><span><b>Easy on the eyes</b><br><span class="small muted">Largest text, easy-read letters, bold and extra contrast</span></span></button>
      <button class="preset" data-preset="kids"><span class="ico">🧒</span><span><b>Kid friendly</b><br><span class="small muted">Bigger text, easy-read letters and read-aloud buttons</span></span></button>
      <button class="preset" data-preset="standard"><span class="ico">↩️</span><span><b>Standard</b><br><span class="small muted">Back to the normal look</span></span></button>
    </div>
    <div class="field"><span>Text size</span>
      <div class="seg" id="sizes">${TEXT_SIZES.map((t, i) => `<button data-scale="${t.scale}" class="${p.scale === t.scale ? 'on' : ''}"><span class="a" style="font-size:${1 + i * 0.3}rem">A</span>${t.label}</button>`).join('')}</div>
    </div>
    <div class="preview"><b>What were you like at my age?</b><br><span class="muted">This is how questions and stories will look.</span></div>
    <div class="field"><span>Letters</span>
      <div class="seg" style="grid-template-columns:1fr 1fr" id="fonts">
        <button data-font="standard" class="${p.font === 'standard' ? 'on' : ''}" style="font-family:Inter,system-ui">Standard</button>
        <button data-font="easy" class="${p.font === 'easy' ? 'on' : ''}" style="font-family:'Atkinson Hyperlegible',system-ui">Easy-read</button>
      </div>
      <span class="small muted" style="font-weight:400">Easy-read letters were designed for people with low vision — each letter is easy to tell apart.</span>
    </div>
    <div class="card" style="padding:4px 16px">
      <label class="switch"><input type="checkbox" data-pref="bold" ${p.bold ? 'checked' : ''}><span class="grow"><b>Bold text</b><br><span class="small muted">Thicker, darker letters</span></span></label>
      <label class="switch"><input type="checkbox" data-pref="contrast" ${p.contrast === 'high' ? 'checked' : ''}><span class="grow"><b>Extra contrast</b><br><span class="small muted">Stronger colors and borders</span></span></label>
      ${canSpeak ? `<label class="switch"><input type="checkbox" data-pref="readAloud" ${p.readAloud ? 'checked' : ''}><span class="grow"><b>Read-aloud buttons 🔊</b><br><span class="small muted">Tap to hear questions spoken out loud</span></span></label>` : ''}
      <label class="switch"><input type="checkbox" data-pref="motion" ${p.motion === 'reduce' ? 'checked' : ''}><span class="grow"><b>Less motion</b><br><span class="small muted">Turn off sliding animations</span></span></label>
    </div>
    <button class="btn primary block" data-action="close" style="margin-top:8px">Done</button>`, { onClose: () => render() });
  const sync = () => {
    const q = prefs();
    $$('#sizes button', sheet).forEach((b) => b.classList.toggle('on', +b.dataset.scale === q.scale));
    $$('#fonts button', sheet).forEach((b) => b.classList.toggle('on', b.dataset.font === q.font));
    $('[data-pref=bold]', sheet).checked = q.bold;
    $('[data-pref=contrast]', sheet).checked = q.contrast === 'high';
    $('[data-pref=motion]', sheet).checked = q.motion === 'reduce';
    const ra = $('[data-pref=readAloud]', sheet); if (ra) ra.checked = q.readAloud;
  };
  $$('#sizes button', sheet).forEach((b) => b.onclick = async () => { await savePrefs({ scale: +b.dataset.scale }); sync(); });
  $$('#fonts button', sheet).forEach((b) => b.onclick = async () => { await savePrefs({ font: b.dataset.font }); sync(); });
  $$('[data-pref]', sheet).forEach((inp) => inp.onchange = async () => {
    const k = inp.dataset.pref;
    const v = k === 'contrast' ? (inp.checked ? 'high' : 'normal') : k === 'motion' ? (inp.checked ? 'reduce' : 'auto') : inp.checked;
    await savePrefs({ [k]: v });
  });
  const PRESETS = {
    older: { scale: 1.5, font: 'easy', bold: true, contrast: 'high', readAloud: true },
    kids: { scale: 1.3, font: 'easy', bold: false, contrast: 'normal', readAloud: true },
    standard: { ...DEFAULT_PREFS },
  };
  $$('[data-preset]', sheet).forEach((b) => b.onclick = async () => { await savePrefs(PRESETS[b.dataset.preset]); sync(); toast('Display updated ✓'); });
};

// ── Rendering ────────────────────────────────────────────────
async function render() {
  const app = $('#app');
  applyPrefs();
  if (!me()) { renderWelcome(app); return; }
  const views = { home: viewHome, circle: viewCircle, tree: viewTree, me: viewMe };
  // Build the view off-screen first so the page never flashes blank while data loads.
  const view = document.createElement('main');
  view.id = 'view';
  const tab = S.tab;
  await views[tab](view, true);
  if (tab !== S.tab) return; // a newer render already took over
  app.innerHTML = `
    <div class="topbar">
      <div class="brand">🌳 <span class="word">${esc(CONFIG.appName)}</span></div>
      <div class="row">
        <button class="iconbtn" data-action="display" aria-label="Text size and display" style="font-weight:800;font-size:1.1rem">Aa</button>
        <button class="iconbtn" data-action="share" aria-label="Share">📤</button>
        <button class="iconbtn" data-action="switch-profile" aria-label="Switch profile">${avatar(me(), 'sm')}</button>
      </div>
    </div>`;
  app.appendChild(view);
  if (tab === 'tree') requestAnimationFrame(drawTreeLines);
  renderTabbar();
  hydrateMedia(app);
}

function renderTabbar() {
  let bar = $('.tabbar');
  if (!bar) { bar = document.createElement('nav'); bar.className = 'tabbar'; document.body.appendChild(bar); }
  const t = (id, ico, label) => `<button class="tab ${S.tab === id ? 'active' : ''}" data-action="tab" data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`;
  bar.innerHTML = `<div class="tabbar-inner">
    ${t('home', '🏠', 'Home')}${t('circle', '💬', 'Circle')}
    <button class="tab plus" data-action="create" aria-label="Create"><span class="ico">＋</span>Create</button>
    ${t('tree', '🌳', 'Tree')}${t('me', '🙂', 'Me')}</div>`;
}

// ── Welcome / onboarding ─────────────────────────────────────
function renderWelcome(app) {
  $('.tabbar')?.remove();
  app.innerHTML = `
    <div class="welcome stack">
      <div style="text-align:right"><button class="btn sm" data-action="display">Aa  Make text bigger</button></div>
      <div class="hero">🌳</div>
      <h1>${esc(CONFIG.appName)}</h1>
      <p class="center muted">The place your family tells its story — so no one ever wonders<br>“I wish I had known them better.”</p>
      <div class="card stack">
        <div class="row"><span style="font-size:1.4rem">💬</span><div><b>1–2 questions a day</b><br><span class="muted small">Little by little, your family learns who you really are.</span></div></div>
        <div class="row"><span style="font-size:1.4rem">🎥</span><div><b>Videos, voice & stories</b><br><span class="muted small">Leave your laugh, your advice, your recipes.</span></div></div>
        <div class="row"><span style="font-size:1.4rem">🌳</span><div><b>Family tree & circle chat</b><br><span class="muted small">Bring distant family back together.</span></div></div>
        <div class="row"><span style="font-size:1.4rem">🕯️</span><div><b>A memory book forever</b><br><span class="muted small">Somewhere to go back to, always.</span></div></div>
      </div>
      <button class="btn primary block" data-action="new-profile" data-first="1">Create my profile</button>
      <button class="btn ghost block" data-action="import">I have a family file to import</button>
    </div>`;
}

function profileForm(p = {}) {
  const emoji = p.emoji || AVATAR_EMOJI[0];
  const color = p.color || COLORS[0];
  return `
    <label class="field"><span>Name</span><input class="input" name="name" value="${esc(p.name)}" placeholder="e.g. Dad, Grandma Rose, Kirby" required></label>
    <div class="field"><span>Pick an avatar</span><div class="emoji-pick">${AVATAR_EMOJI.map((e) => `<button type="button" class="${e === emoji ? 'on' : ''}" data-pick="emoji" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="field"><span>Color</span><div class="color-pick">${COLORS.map((c) => `<button type="button" class="${c === color ? 'on' : ''}" style="background:${c}" data-pick="color" data-v="${c}" aria-label="color"></button>`).join('')}</div></div>
    <input type="hidden" name="emoji" value="${esc(emoji)}"><input type="hidden" name="color" value="${esc(color)}">
    <div class="row"><label class="field grow"><span>Born (year)</span><input class="input" name="birthYear" inputmode="numeric" value="${esc(p.birthYear || '')}" placeholder="1958"></label>
    <label class="field grow"><span>Hometown</span><input class="input" name="hometown" value="${esc(p.hometown || '')}" placeholder="Where you grew up"></label></div>`;
}

function wirePickers(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    $$(`[data-pick="${b.dataset.pick}"]`, root).forEach((x) => x.classList.toggle('on', x === b));
    $(`[name="${b.dataset.pick}"]`, root).value = b.dataset.v;
  });
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());

actions['new-profile'] = ({ first }) => {
  const sheet = openSheet(`${head(first ? 'Welcome! Who are you?' : 'Add a profile to this device')}
    <form class="stack">
      ${profileForm()}
      ${first ? '' : '<p class="small muted">Profiles let several family members (like Dad or Grandma) use this same phone or tablet. Each person answers their own questions.</p>'}
      <button class="btn primary block">Continue</button>
    </form>`);
  wirePickers(sheet);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.name.trim()) return;
    const p = {
      id: uid(), name: d.name.trim(), emoji: d.emoji, color: d.color, birthYear: d.birthYear, hometown: d.hometown,
      relation: first ? 'Me' : '', profile: true, prefs: { ...devicePrefs }, likes: [], dislikes: [], parentIds: [], askQueue: [], createdAt: Date.now(),
    };
    await save('people', p);
    if (first || !S.meId) {
      if (!S.trialStart) { S.trialStart = Date.now(); await db.setKV('trialStart', S.trialStart); }
    }
    S.meId = p.id; await db.setKV('meId', p.id);
    closeAllSheets();
    S.tab = 'home';
    await render();
    window.scrollTo(0, 0);
    toast(`Welcome, ${p.name} 💛`);
  };
};

actions['switch-profile'] = () => {
  openSheet(`${head('Who is using the app?')}
    ${profiles().map((p) => `<button class="card row block" style="width:100%;text-align:left;cursor:pointer" data-action="use-profile" data-id="${p.id}">
      ${avatar(p)}<div class="grow"><b>${esc(p.name)}</b>${p.id === S.meId ? '<br><span class="chip accent">Using now</span>' : ''}</div></button>`).join('')}
    <button class="btn block" data-action="new-profile">＋ Add someone to this device</button>
    <p class="small muted center" style="margin-top:12px">Tip: set up a profile for a parent or grandparent on your phone so you can sit together and record their story.</p>`);
};

actions['use-profile'] = async ({ id }) => {
  S.meId = id; await db.setKV('meId', id);
  closeAllSheets(); S.tab = 'home'; await render();
  window.scrollTo(0, 0);
  toast(`Hi ${nameOf(id)} 👋`);
};

// ── Home ─────────────────────────────────────────────────────
async function viewHome(root) {
  const m = me();
  const qs = await todaysQuestions(m);
  const done = answeredIds(m.id);
  const lastMood = S.moods.filter((x) => x.personId === m.id).sort((a, b) => b.createdAt - a.createdAt)[0];
  const moodToday = lastMood && localDate(new Date(lastMood.createdAt)) === today();
  const helpAlerts = S.moods.filter((x) => x.needHelp && !x.resolved && x.personId !== m.id && !x.private);
  const myHelp = S.moods.find((x) => x.needHelp && !x.resolved && x.personId === m.id);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const trial = !S.unlocked.has('base') ? trialDaysLeft() : null;
  const letters = S.letters.filter((l) => l.toId === m.id);

  root.innerHTML = `
    <h1>${hello}, ${esc(m.name)}</h1>
    <p class="muted">What will your family learn about you today?</p>

    ${helpAlerts.map((a) => `<div class="card alert">
      <div class="row">${avatar(person(a.personId))}<div class="grow"><b>${esc(nameOf(a.personId))} asked for help</b><br><span class="small">${esc(a.troubling || a.note || 'They could use someone right now.')}</span></div></div>
      <div class="row" style="margin-top:10px"><button class="btn sm primary" data-action="resolve-help" data-id="${a.id}">I'm on it 💛</button><button class="btn sm" data-action="open-chat-with" data-id="${a.personId}">Message</button></div></div>`).join('')}

    ${myHelp ? `<div class="card alert"><b>You asked for help.</b> Your family can see it. <a href="#" data-action="help-resources">See support lines</a></div>` : ''}

    ${trial !== null && trial <= 3 ? `<div class="card accent row"><div class="grow"><b>${trial > 0 ? `${trial} day${trial === 1 ? '' : 's'} left in your free week` : 'Your free week has ended'}</b><br><span class="small">Unlock for life — just $${CONFIG.basePrice}, one time.</span></div><button class="btn primary sm" data-action="store">Unlock</button></div>` : ''}

    ${qs.map((q) => {
      const isDone = done.has(q.id);
      const cat = CATEGORIES[q.category] || CATEGORIES.family;
      return `<div class="card qcard ${isDone ? 'done' : ''}">
        <div class="row spread"><span class="chip accent">${cat.emoji} ${q.fromId ? `${esc(nameOf(q.fromId))} asked you` : 'Question of the day'}</span>${isDone ? '<span class="chip leaf">✓ Answered</span>' : ''}</div>
        <div class="row" style="align-items:flex-start"><div class="qtext grow">${esc(q.text)}</div>${speakBtn(q.text)}</div>
        ${isDone ? '' : `<div class="row"><button class="btn primary grow" data-action="answer" data-qid="${q.id}">Answer</button>
          <button class="btn" data-action="answer" data-qid="${q.id}" data-rec="video" aria-label="Answer with video">🎥</button>
          <button class="btn" data-action="answer" data-qid="${q.id}" data-rec="audio" aria-label="Answer with voice">🎙️</button>
          ${q.fromId ? '' : `<button class="btn ghost sm" data-action="skip-q" data-qid="${q.id}">Skip</button>`}</div>`}
      </div>`;
    }).join('')}
    ${qs.every((q) => done.has(q.id)) ? '<button class="btn block" data-action="more-question" style="margin-bottom:14px">I\'m on a roll — one more question</button>' : ''}

    <div class="card">
      <div class="row spread" style="margin-bottom:8px"><b>How are you feeling${moodToday ? ' now' : ' today'}?</b>${lastMood ? `<span class="small muted">Last: ${MOODS.find((x) => x.key === lastMood.mood)?.emoji || ''} ${timeAgo(lastMood.createdAt)}</span>` : ''}</div>
      <div class="moods">${MOODS.map((x) => `<button class="mood" data-action="mood" data-mood="${x.key}">${x.emoji}<small>${x.short}</small></button>`).join('')}</div>
    </div>

    ${letters.length ? `<div class="card leaf row" data-action="letters-to-me" style="cursor:pointer"><span style="font-size:1.8rem">💌</span><div class="grow"><b>You have ${letters.length} letter${letters.length > 1 ? 's' : ''}</b><br><span class="small">Written just for you.</span></div><span>›</span></div>` : ''}

    <div class="grid2">
      ${tile('tell-story', '🎬', 'Tell a story', 'Like FaceTime — we recap it for you')}
      ${tile('legacy', '🕯️', 'Legacy Interview', 'Tell your life story, a few questions at a time')}
      ${tile('write-letter', '💌', 'Letters for later', 'Sealed until a birthday, wedding, or hard day')}
      ${tile('ask-family', '❓', 'Ask family a question', 'Send a question you have always wondered about')}
      ${tile('games', '🎲', 'Family games', 'How well do you know each other?')}
      ${tile('packs', '🧰', 'Help packs', 'Parent, kids & family support')}
      ${tile('books', '📖', 'Memory books', 'Everything someone shared, in one place')}
    </div>

    <div class="section-title"><h2>Family feed</h2><span class="small muted">${S.posts.length} memories</span></div>
    ${feedHTML(S.posts.slice(0, 40))}`;
}

const tile = (action, ico, title, sub, locked = false) =>
  `<button class="tile ${locked ? 'locked' : ''}" data-action="${action}"><span class="row"><span class="ico">${ico}</span>${locked ? '<span class="lock">🔒</span>' : ''}</span><b>${title}</b><small>${sub}</small></button>`;

actions['skip-q'] = async ({ qid }) => { await swapQuestion(me(), qid); render(); };
actions['more-question'] = async () => {
  const saved = await db.getKV(`today:${S.meId}`, { date: today(), ids: [] });
  const done = answeredIds(S.meId);
  const next = DAILY_QUESTIONS.filter((q) => !done.has(q.id) && !saved.ids.includes(q.id)).sort(() => Math.random() - 0.5)[0];
  if (!next) { toast('You have answered every question. Amazing! 🎉'); return; }
  saved.ids.push(next.id);
  await db.setKV(`today:${S.meId}`, saved);
  render();
};

// ── Feed ─────────────────────────────────────────────────────
const TYPE_LABEL = { answer: '💬 Answered', story: '📝 Story', video: '🎥 Video', voice: '🎙️ Voice memory', photo: '📷 Photo memory' };

function feedHTML(posts) {
  if (!posts.length) return `<div class="empty"><span class="ico">🌱</span>Nothing here yet. Answer a question or share a memory to plant the first seed.</div>`;
  return posts.map(postHTML).join('');
}

function postHTML(post) {
  const p = person(post.personId);
  const addedBy = post.authorId && post.authorId !== post.personId ? ` · added by ${esc(nameOf(post.authorId))}` : '';
  const liked = (post.likes || []).includes(S.meId);
  const comments = post.comments || [];
  return `<article class="card post" id="post-${post.id}">
    <header>${avatar(p)}<div class="grow"><div class="who">${esc(p?.name || 'Someone')}</div><div class="small muted">${TYPE_LABEL[post.type] || ''} · ${timeAgo(post.createdAt)}${addedBy}</div></div>
      ${post.personId === S.meId || post.authorId === S.meId ? `<button class="iconbtn" data-action="post-menu" data-id="${post.id}" aria-label="More">⋯</button>` : ''}</header>
    ${post.questionText ? `<div class="q">“${esc(post.questionText)}”</div>` : ''}
    ${post.title ? `<h3>${esc(post.title)}</h3>` : ''}
    ${post.text ? `<div class="body">${esc(post.text)}</div>` : ''}
    ${mediaTag(post)}
    ${recapHTML(post)}
    <footer>
      <button class="like ${liked ? 'on' : ''}" data-action="like" data-id="${post.id}">${liked ? '❤️' : '🤍'} ${(post.likes || []).length || ''}</button>
      <button class="like" data-action="focus-comment" data-id="${post.id}">💬 ${comments.length || ''}</button>
      <span class="grow"></span>
      <button class="like" data-action="open-book" data-id="${post.personId}">📖</button>
    </footer>
    <div class="comments">
      ${comments.map((c) => `<div class="comment"><b>${esc(nameOf(c.personId))}</b>${esc(c.text)}</div>`).join('')}
      <form class="row" data-comment="${post.id}"><input class="input" name="c" placeholder="Say something kind…" style="padding:8px 12px"><button class="btn sm">Send</button></form>
    </div>
  </article>`;
}

actions.like = async ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  const likes = new Set(post.likes || []);
  likes.has(S.meId) ? likes.delete(S.meId) : likes.add(S.meId);
  post.likes = [...likes];
  await save('posts', post);
  refreshPost(post);
};

actions['focus-comment'] = ({ id }) => $(`[data-comment="${id}"] input`)?.focus();

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-comment]');
  if (!form) return;
  e.preventDefault();
  const text = form.c.value.trim();
  if (!text) return;
  const post = S.posts.find((x) => x.id === form.dataset.comment);
  post.comments = [...(post.comments || []), { id: uid(), personId: S.meId, text, at: Date.now() }];
  await save('posts', post);
  refreshPost(post);
});

function refreshPost(post) {
  for (const el of $$(`#post-${post.id}`)) {
    const tmp = document.createElement('div');
    tmp.innerHTML = postHTML(post);
    // Keep the existing media element so playback is not interrupted.
    const oldMedia = $('video,audio,img', el);
    const newMedia = $('video,audio,img', tmp.firstElementChild);
    if (oldMedia && newMedia) newMedia.replaceWith(oldMedia);
    el.replaceWith(tmp.firstElementChild);
  }
}

actions['post-menu'] = ({ id }) => {
  openSheet(`${head('Memory options')}
    <button class="btn block" data-action="edit-post" data-id="${id}">✏️ Edit text</button><br><br>
    ${['video', 'audio'].includes(S.posts.find((x) => x.id === id)?.mediaType) ? `<button class="btn block" data-action="edit-recap" data-id="${id}">✨ ${S.posts.find((x) => x.id === id).recap ? 'Edit' : 'Add'} story recap</button><br><br>` : ''}
    <button class="btn block danger" data-action="delete-post" data-id="${id}">🗑️ Delete this memory</button>`);
};

actions['edit-post'] = ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  closeSheet();
  const sheet = openSheet(`${head('Edit')}<form class="stack">
    ${post.questionText ? `<p class="q"><i>${esc(post.questionText)}</i></p>` : `<input class="input" name="title" value="${esc(post.title || '')}" placeholder="Title">`}
    <textarea class="input" name="text">${esc(post.text || '')}</textarea><button class="btn primary block">Save</button></form>`);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    post.text = d.text; if ('title' in d) post.title = d.title;
    await save('posts', post); closeSheet(); render();
  };
};

actions['delete-post'] = async ({ id }) => {
  if (!confirm('Delete this memory forever? This cannot be undone.')) return;
  const post = S.posts.find((x) => x.id === id);
  if (post?.mediaId) await db.del('media', post.mediaId);
  await remove('posts', id);
  closeAllSheets(); render(); toast('Deleted');
};

// ── Composer: answers & memories ─────────────────────────────
function peopleOptions(selectedId, filter = () => true) {
  return S.people.filter(filter).map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

actions.answer = ({ qid, rec, pid }) => {
  if (!guard()) return;
  const subject = person(pid) || me();
  const q = findQuestion(subject, qid) || findPackQuestion(qid);
  if (!q) return;
  openComposer({ type: 'answer', question: q, rec, personId: subject.id });
};

function findPackQuestion(qid) {
  const m = /^p:(\w+):(\d+)$/.exec(qid || '');
  if (!m) return null;
  return { id: qid, text: PACKS[m[1]].questions[+m[2]], category: 'family' };
}

// type: answer | story | video | voice | photo
function openComposer({ type, question, rec, personId = S.meId, prefill = '', title = '' }) {
  const titles = { answer: 'Your answer', story: 'Write a story', video: 'Short video', voice: 'Voice memory', photo: 'Photo memory' };
  let media = null; // { blob, kind }
  const sheet = openSheet(`${head(titles[type])}
    <form class="stack" id="composer">
      ${question ? `<div class="card accent row" style="align-items:flex-start"><div class="qtext grow" style="font-family:var(--serif);font-size:1.15rem">${esc(question.text)}</div>${speakBtn(question.text)}</div>` : ''}
      ${type === 'story' || type === 'photo' || type === 'video' || type === 'voice' ? `<input class="input" name="title" placeholder="${type === 'story' ? 'Story title (e.g. The summer of 1975)' : 'Give it a title (optional)'}" value="${esc(title)}">` : ''}
      <textarea class="input" name="text" placeholder="${type === 'answer' ? 'Take your time. Tell it like you would at the kitchen table…' : type === 'story' ? 'Once upon a time…' : 'Add a few words (optional)'}">${esc(prefill)}</textarea>
      <div id="media-slot"></div>
      <div class="row wrap" id="media-buttons">
        <button type="button" class="btn sm" data-rec="video">🎥 Record video</button>
        <button type="button" class="btn sm" data-rec="audio">🎙️ Record voice</button>
        <label class="btn sm">📎 Add photo / video<input type="file" accept="image/*,video/*,audio/*" hidden name="file"></label>
      </div>
      <label class="field"><span>Whose memory is this?</span><select class="input" name="personId">${peopleOptions(personId)}</select>
        <span class="small muted" style="font-weight:400">Recording for Dad or Grandma? Pick them here — it goes into their memory book.</span></label>
      <button class="btn primary block">Save memory</button>
    </form>`);

  const slot = $('#media-slot', sheet);
  const showMedia = () => {
    if (!media) { slot.innerHTML = ''; return; }
    const url = URL.createObjectURL(media.blob);
    const tag = media.kind === 'video' ? `<video controls playsinline src="${url}" style="width:100%;border-radius:14px;background:#000"></video>`
      : media.kind === 'audio' ? `<audio controls src="${url}" style="width:100%"></audio>`
      : `<img src="${url}" style="border-radius:14px">`;
    slot.innerHTML = `${tag}<button type="button" class="btn sm ghost danger" id="rm-media">Remove</button>`;
    $('#rm-media', slot).onclick = () => { media = null; showMedia(); };
  };
  $$('[data-rec]', sheet).forEach((b) => b.onclick = async () => {
    const segments = [];
    const blob = await recordMedia(b.dataset.rec, { transcribe: true, segments, prompt: question?.text });
    if (blob) { media = { blob, kind: b.dataset.rec }; showMedia(); }
    const box = $('[name=text]', sheet);
    if (blob && segments.length && !box.value.trim()) {
      box.value = segments.map((x) => x.text).join(' ');
      toast('We wrote down what you said — edit anything ✍️');
    }
  });
  $('[name=file]', sheet).onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    media = { blob: f, kind: f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'image' };
    showMedia();
  };
  if (rec) setTimeout(() => $(`[data-rec="${rec}"]`, sheet)?.click(), 50);

  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.text?.trim() && !media) { toast('Write something or add a recording first'); return; }
    const post = {
      id: uid(), type, personId: d.personId, authorId: S.meId, text: d.text?.trim() || '', title: d.title?.trim() || '',
      likes: [], comments: [], createdAt: Date.now(),
    };
    if (question) { post.questionId = question.id; post.questionText = question.text; post.category = question.category; }
    if (media) {
      const mid = uid();
      await db.put('media', { id: mid, blob: media.blob, type: media.blob.type });
      post.mediaId = mid;
      post.mediaType = media.kind;
      if (type === 'story' && media.kind === 'image') post.type = 'photo';
    }
    // Remove answered custom asks from the queue.
    if (question?.fromId) {
      const subj = person(d.personId);
      subj.askQueue = (subj.askQueue || []).filter((a) => a.id !== question.id);
      await save('people', subj);
    }
    await save('posts', post);
    closeAllSheets();
    await render();
    toast(d.personId === S.meId ? 'Saved to your memory book 💛' : `Saved to ${nameOf(d.personId)}'s memory book 💛`);
  };
}

actions.create = () => {
  openSheet(`${head('Leave a memory')}
    <button class="tile" data-action="tell-story" style="width:100%;margin-bottom:10px;min-height:0"><span class="row"><span class="ico">🎬</span><b>Tell a story</b></span><small>Selfie video or voice, up to 10 min — we write down the highlights, the moral and the punchlines</small></button>
    <div class="grid2">
      ${tile('compose', '🎥', 'Short video', 'Up to 60 seconds')}
      ${tile('compose', '🎙️', 'Voice memory', 'Your voice is a gift')}
      ${tile('compose', '📝', 'Write a story', 'A moment worth keeping')}
      ${tile('compose', '📷', 'Photo memory', 'The story behind a picture')}
      ${tile('browse-questions', '💬', 'Pick a question', 'Browse every question')}
      ${tile('write-letter', '💌', 'Letter for later', 'Sealed for a future day')}
    </div>`);
  const kinds = ['video', 'voice', 'story', 'photo'];
  $$('.sheet [data-action="compose"]').forEach((b, i) => { b.dataset.kind = kinds[i]; });
};

actions.compose = ({ kind }) => {
  if (!guard()) return;
  closeSheet();
  const rec = kind === 'video' ? 'video' : kind === 'voice' ? 'audio' : null;
  openComposer({ type: kind, rec });
  if (kind === 'photo') setTimeout(() => $('.sheet [name=file]')?.click(), 60);
};

actions['browse-questions'] = () => {
  closeSheet();
  const done = answeredIds(S.meId);
  const groups = Object.entries(CATEGORIES).map(([key, c]) => {
    const qs = DAILY_QUESTIONS.filter((q) => q.category === key);
    if (!qs.length) return '';
    return `<h3 style="margin-top:18px">${c.emoji} ${c.label}</h3>${qs.map((q) => `
      <button class="option" data-action="answer" data-qid="${q.id}">${done.has(q.id) ? '✅ ' : ''}${esc(q.text)}</button>`).join('')}`;
  }).join('');
  openSheet(`${head('All questions')}<p class="muted small">${done.size} of ${DAILY_QUESTIONS.length} answered</p>${groups}`);
};

// ── Recorder ─────────────────────────────────────────────────
// Records video or audio. With opts.transcribe, live captions are written into
// opts.segments as [{ t: secondsFromStart, text }] using the browser's speech recognition.
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function recordMedia(kind, opts = {}) {
  const segments = opts.segments || [];
  return new Promise((resolve) => {
    const maxSec = opts.maxSec || (kind === 'video' ? 60 : 300);
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    let stream, recorder, chunks = [], timer, blob = null, facing = 'user', sr = null, recording = false, t0 = 0;
    const title = opts.title || (kind === 'video' ? 'Record a video' : 'Record your voice');
    const sheet = openSheet(`${head(esc(title))}
      <div class="recorder stack ${opts.full ? 'story-rec' : ''}">
        <div class="rec-stage">
          ${kind === 'video' ? '<video id="live" playsinline muted autoplay class="mirror"></video>' : '<div class="audio-viz" id="live">🎙️</div>'}
          ${opts.prompt ? `<div class="rec-prompt">${esc(opts.prompt)}</div>` : ''}
          ${opts.transcribe ? '<div class="rec-caption hidden" id="caption"></div>' : ''}
        </div>
        <div class="center"><span id="rstatus" class="muted">Getting ready…</span></div>
        <div class="row" style="justify-content:center;gap:24px">
          ${kind === 'video' ? '<button class="iconbtn" id="flip" aria-label="Flip camera">🔄</button>' : ''}
          <button class="recbtn" id="recbtn" aria-label="Record" disabled></button>
          ${kind === 'video' ? '<span style="width:40px"></span>' : ''}
        </div>
        <div class="row hidden" id="done-row"><button class="btn grow" id="retake">Retake</button><button class="btn primary grow" id="use">Use this</button></div>
        <label class="btn ghost block small">Or upload a file<input type="file" accept="${kind}/*" ${kind === 'video' ? 'capture="user"' : ''} hidden id="upl"></label>
      </div>`, { full: opts.full, onClose: () => { stop(); stream?.getTracks().forEach((t) => t.stop()); resolve(blob); } });

    const status = $('#rstatus', sheet);
    const btn = $('#recbtn', sheet);
    const live = $('#live', sheet);
    const caption = $('#caption', sheet);

    async function startStream() {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia(kind === 'video'
          ? { video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true }
          : { audio: true });
        if (kind === 'video') { live.srcObject = stream; live.muted = true; live.classList.toggle('mirror', facing === 'user'); live.play?.(); }
        status.textContent = `Tap the red button to start (up to ${maxSec >= 60 ? `${Math.round(maxSec / 60)} min` : `${maxSec}s`})`;
        btn.disabled = false;
      } catch (err) {
        status.textContent = 'Camera/microphone not available. You can upload a file instead.';
      }
    }

    // Live captions. Browsers stop listening after a pause, so restart while still recording.
    function startCaptions() {
      if (!opts.transcribe || !SpeechRec) return;
      let pendingStart = null;
      sr = new SpeechRec();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = navigator.language || 'en-US';
      sr.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const now = (Date.now() - t0) / 1000;
          if (r.isFinal) {
            const text = r[0].transcript.trim();
            // No interim results? Estimate when they started talking from how many words were said.
            const prevT = segments[segments.length - 1]?.t ?? 0;
            const start = pendingStart ?? Math.max(prevT, now - text.split(/\s+/).length * 0.4);
            if (text) segments.push({ t: Math.max(0, Math.round(start * 10) / 10), text });
            pendingStart = null;
          } else {
            if (pendingStart == null) pendingStart = now;
            interim += r[0].transcript;
          }
        }
        caption.textContent = interim || segments[segments.length - 1]?.text || '';
        caption.classList.toggle('hidden', !caption.textContent);
      };
      sr.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') sr = null;
      };
      sr.onend = () => { if (recording && sr) { try { sr.start(); } catch { /* already running */ } } };
      try { sr.start(); } catch { sr = null; }
    }

    function stop() {
      clearInterval(timer);
      recording = false;
      try { sr?.stop(); } catch { /* ignore */ }
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    btn.onclick = () => {
      if (recorder && recorder.state === 'recording') { stop(); return; }
      chunks = [];
      segments.length = 0;
      const types = kind === 'video' ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = types.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
      try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); } catch { status.textContent = 'Recording is not supported here — try uploading.'; return; }
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        blob = new Blob(chunks, { type: recorder.mimeType || mimeType || `${kind}/webm` });
        btn.classList.remove('stop');
        stream.getTracks().forEach((t) => t.stop());
        caption?.classList.add('hidden');
        const url = URL.createObjectURL(blob);
        if (kind === 'video') { live.srcObject = null; live.src = url; live.muted = false; live.controls = true; live.classList.remove('mirror'); }
        else live.innerHTML = `<audio controls src="${url}" style="width:90%"></audio>`;
        status.textContent = opts.transcribe && segments.length
          ? `Got it — ${segments.length} lines captured. Keep it or retake.`
          : 'Watch it back, then keep it or retake.';
        btn.parentElement.classList.add('hidden');
        $('#done-row', sheet).classList.remove('hidden');
      };
      recorder.start(1000);
      recording = true;
      btn.classList.add('stop');
      t0 = Date.now();
      startCaptions();
      timer = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000);
        status.innerHTML = `<span class="rec-dot"></span>${fmt(s)} / ${fmt(maxSec)}`;
        if (s >= maxSec) stop();
      }, 250);
    };

    $('#flip', sheet)?.addEventListener('click', () => { facing = facing === 'user' ? 'environment' : 'user'; startStream(); });
    $('#retake', sheet).onclick = () => {
      blob = null;
      segments.length = 0;
      if (kind === 'video') { live.removeAttribute('src'); live.controls = false; } else live.innerHTML = '🎙️';
      btn.parentElement.classList.remove('hidden');
      $('#done-row', sheet).classList.add('hidden');
      startStream();
    };
    $('#use', sheet).onclick = () => closeSheet();
    $('#upl', sheet).onchange = (e) => { if (e.target.files[0]) { blob = e.target.files[0]; segments.length = 0; closeSheet(); } };
    startStream();
  });
}

// ── Story Time: record a story, then recap it ────────────────
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// On-device recap draft. Rough on purpose — the storyteller edits it, or the
// optional AI helper (CONFIG.aiSummaryUrl) writes a better one.
function localRecap(segments, prompt) {
  const segs = segments.filter((s) => s.text && s.text.trim());
  if (!segs.length) return { title: prompt || '', summary: '', highlights: [], moral: '', punchlines: [] };
  const words = (s) => s.text.split(/\s+/).length;
  const MORAL = /\b(lesson|learn(ed|t)?|moral|taught me|the point (is|was)|never forget|always remember|remember (that|this)|you (should|have to|gotta)|don'?t ever|that'?s why|if there'?s one thing)\b/i;
  const FUNNY = /\b(ha(ha)+|laugh(ed|ing)?|funny|hilarious|joke|kidding|couldn'?t stop|cracked up|to this day|believe it or not)\b/i;
  const VIVID = /\b(love|never|first|last|remember|best|worst|scared|proud|cried|finally|suddenly|surprise|happiest|married|born|died|won|lost)\b/i;
  const score = (s) => words(s) / 6 + (VIVID.test(s.text) ? 3 : 0) + (/\b(19|20)\d\d\b/.test(s.text) ? 2 : 0) + (/\s[A-Z][a-z]+/.test(s.text) ? 1 : 0);
  const highlights = [...segs].filter((s) => words(s) >= 5).sort((a, b) => score(b) - score(a)).slice(0, 4)
    .sort((a, b) => a.t - b.t).map((s) => ({ text: s.text, t: s.t }));
  const moral = segs.filter((s) => MORAL.test(s.text)).sort((a, b) => b.t - a.t)[0]?.text || '';
  const funny = segs.filter((s) => FUNNY.test(s.text)).map((s) => s.text);
  const last = segs[segs.length - 1];
  const punchlines = funny.length ? funny.slice(0, 3) : [];
  const summaryParts = [segs[0].text];
  if (segs.length > 2) summaryParts.push(segs[Math.floor(segs.length / 2)].text);
  if (segs.length > 1) summaryParts.push(last.text);
  let summary = summaryParts.join(' … ');
  if (summary.length > 360) summary = `${summary.slice(0, 357)}…`;
  return { title: prompt || '', summary, highlights, moral, punchlines, draft: true };
}

async function makeRecap(segments, prompt, transcriptOverride) {
  const segs = transcriptOverride != null && transcriptOverride.trim() !== segments.map((s) => s.text).join(' ')
    ? transcriptOverride.split(/(?<=[.!?])\s+|\n+/).filter(Boolean).map((text, i) => ({ t: null, text, i }))
    : segments;
  if (CONFIG.aiSummaryUrl && segs.length) {
    try {
      const res = await fetch(CONFIG.aiSummaryUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, segments: segs.map((s) => s.text) }),
      });
      if (!res.ok) throw new Error(`AI helper returned ${res.status}`);
      const r = await res.json();
      return {
        title: r.title || prompt || '', summary: r.summary || '', moral: r.moral || '',
        punchlines: r.punchlines || [],
        highlights: (r.highlights || []).map((h) => ({ text: h.text, t: segs[h.segment]?.t ?? null })),
        ai: true,
      };
    } catch (err) {
      console.warn('AI recap failed, using on-device draft', err);
    }
  }
  return localRecap(segs, prompt);
}

actions['tell-story'] = ({ pid }) => {
  if (!guard()) return;
  closeAllSheets();
  const subject = person(pid) || me();
  const sheet = openSheet(`${head('🎬 Story time')}
    <p>Tell a story like you're on FaceTime with your family. We'll write down what you say and make a recap — the highlights, the moral, and the punchlines.</p>
    <label class="field"><span>Whose story is it?</span><select class="input" id="st-who">${peopleOptions(subject.id)}</select></label>
    <label class="field"><span>What's the story? Pick one or write your own</span><input class="input" id="st-prompt" placeholder="The day I…"></label>
    <div class="chips" style="margin-bottom:16px">${STORY_PROMPTS.map((p) => `<button type="button" class="chip" data-sp>${esc(p)}</button>`).join('')}</div>
    <div class="grid2">
      <button class="tile" id="st-video"><span class="ico">🤳</span><b>Selfie video</b><small>Like FaceTime — they'll see your face</small></button>
      <button class="tile" id="st-audio"><span class="ico">🎙️</span><b>Voice only</b><small>Just talk — no camera</small></button>
    </div>
    <p class="small muted" style="margin-top:12px">Up to 10 minutes. Tip: prop the phone up, get comfortable, and tell it the way you'd tell it at dinner.</p>`);
  $$('[data-sp]', sheet).forEach((b) => b.onclick = () => {
    $$('[data-sp]', sheet).forEach((x) => x.classList.toggle('on', x === b));
    $('#st-prompt', sheet).value = b.textContent;
  });
  const go = async (kind) => {
    const prompt = $('#st-prompt', sheet).value.trim();
    const personId = $('#st-who', sheet).value;
    const segments = [];
    const blob = await recordMedia(kind, { transcribe: true, segments, prompt: prompt || 'Tell us a story…', maxSec: 600, full: true, title: 'Story time' });
    if (!blob) return;
    closeAllSheets();
    const post = {
      id: uid(), type: 'story', personId, authorId: S.meId, title: prompt, text: '',
      mediaType: kind, segments: [...segments], likes: [], comments: [], createdAt: Date.now(),
    };
    openRecapEditor(post, blob);
  };
  $('#st-video', sheet).onclick = () => go('video');
  $('#st-audio', sheet).onclick = () => go('audio');
};

// Edit (or create) the recap for a story post. `blob` is set only for a new recording.
function openRecapEditor(post, blob = null) {
  const isNew = !!blob;
  const transcript = (post.segments || []).map((s) => s.text).join(' ') || post.transcript || '';
  const src = blob ? URL.createObjectURL(blob) : null;
  const player = post.mediaType === 'video'
    ? `<video controls playsinline ${src ? `src="${src}"` : `data-media="${post.mediaId}"`} style="width:100%;border-radius:14px;background:#000;max-height:40vh"></video>`
    : post.mediaType === 'audio' ? `<audio controls ${src ? `src="${src}"` : `data-media="${post.mediaId}"`} style="width:100%"></audio>` : '';
  const sheet = openSheet(`${head(isNew ? '✨ Your story recap' : '✨ Story recap')}
    ${player}
    <div id="recap-status" class="card accent small" style="margin-top:12px">✨ Making the recap…</div>
    <form class="stack" id="recap-form">
      <label class="field"><span>Title</span><input class="input" name="title" value="${esc(post.title || '')}" placeholder="The summer of '75"></label>
      <label class="field"><span>📝 The story in a nutshell</span><textarea class="input" name="summary" style="min-height:90px"></textarea></label>
      <div class="field"><span>✨ Highlights <small class="muted">(tap ▶ to jump to that moment)</small></span><div id="hl-list"></div>
        <button type="button" class="btn sm ghost" id="hl-add">＋ Add a highlight</button></div>
      <label class="field"><span>💡 The moral of the story</span><input class="input" name="moral" placeholder="What should we learn from this?"></label>
      <label class="field"><span>😂 Punchlines & best lines (one per line)</span><textarea class="input" name="punchlines" style="min-height:70px" placeholder="Leave empty if it wasn't a funny one"></textarea></label>
      <details><summary class="small"><b>📜 Full transcript</b> — fix any words we heard wrong</summary>
        <textarea class="input" name="transcript" style="min-height:140px;margin-top:8px" placeholder="Type or use your keyboard's 🎤 to dictate what was said">${esc(transcript)}</textarea>
        <button type="button" class="btn sm" id="regen" style="margin-top:8px">✨ Remake recap from this transcript</button>
      </details>
      <button class="btn primary block">${isNew ? 'Save story' : 'Save recap'}</button>
    </form>`, { full: true });

  const form = $('#recap-form', sheet);
  const statusEl = $('#recap-status', sheet);
  const media = $('video,audio', sheet);
  let highlights = [];

  const paintHighlights = () => {
    $('#hl-list', sheet).innerHTML = highlights.map((h, i) => `<div class="row" style="margin-bottom:6px">
      ${h.t != null && media ? `<button type="button" class="btn sm" data-seek="${h.t}">▶ ${clock(h.t)}</button>` : ''}
      <input class="input grow" data-hl="${i}" value="${esc(h.text)}"><button type="button" class="iconbtn" data-hl-rm="${i}" aria-label="Remove">✕</button></div>`).join('')
      || '<p class="small muted">No highlights yet.</p>';
    $$('[data-seek]', sheet).forEach((b) => b.onclick = () => { media.currentTime = +b.dataset.seek; media.play?.(); });
    $$('[data-hl]', sheet).forEach((inp) => inp.oninput = () => { highlights[+inp.dataset.hl].text = inp.value; });
    $$('[data-hl-rm]', sheet).forEach((b) => b.onclick = () => { highlights.splice(+b.dataset.hlRm, 1); paintHighlights(); });
  };
  $('#hl-add', sheet).onclick = () => { highlights.push({ text: '', t: media && media.currentTime ? Math.floor(media.currentTime) : null }); paintHighlights(); $$('[data-hl]', sheet).pop()?.focus(); };

  const fill = (r) => {
    if (r.title && (!form.title.value || r.ai)) form.title.value = r.title;
    form.summary.value = r.summary || '';
    form.moral.value = r.moral || '';
    form.punchlines.value = (r.punchlines || []).join('\n');
    highlights = (r.highlights || []).map((h) => ({ ...h }));
    paintHighlights();
  };

  const generate = async () => {
    const text = form.transcript.value.trim();
    if (!text) {
      statusEl.innerHTML = "We couldn't catch the words automatically on this device. Open <b>Full transcript</b> and type or dictate it with your keyboard's 🎤 — or just fill in the recap yourself.";
      fill({ title: post.title });
      return;
    }
    statusEl.textContent = '✨ Making the recap…';
    const r = await makeRecap(post.segments || [], post.title, text);
    fill(r);
    statusEl.innerHTML = r.ai
      ? '✨ Recap written by the AI helper — edit anything that doesn\'t sound right.'
      : '✨ Here\'s a first draft of the recap. Read it through and fix it up — the storyteller knows best!';
  };

  if (post.recap) {
    fill(post.recap);
    statusEl.textContent = 'Edit the recap below.';
  } else generate();

  $('#regen', sheet).onclick = generate;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(form);
    const newTranscript = d.transcript.trim();
    if (newTranscript !== (post.segments || []).map((s) => s.text).join(' ')) {
      post.transcript = newTranscript;
      // Keep timestamps only if the words weren't changed.
      if (post.segments?.length) post.segments = [];
    }
    post.title = d.title.trim();
    post.recap = {
      summary: d.summary.trim(), moral: d.moral.trim(),
      punchlines: d.punchlines.split('\n').map((x) => x.trim()).filter(Boolean),
      highlights: highlights.filter((h) => h.text.trim()),
    };
    if (blob) {
      const mid = uid();
      await db.put('media', { id: mid, blob, type: blob.type });
      post.mediaId = mid;
    }
    await save('posts', post);
    closeAllSheets();
    await render();
    toast(isNew ? `Story saved to ${post.personId === S.meId ? 'your' : `${nameOf(post.personId)}'s`} memory book 🎬` : 'Recap saved ✨');
  };
}

actions['edit-recap'] = ({ id }) => { closeAllSheets(); openRecapEditor(S.posts.find((x) => x.id === id)); };

function recapHTML(post) {
  const r = post.recap;
  const hasTranscript = (post.segments || []).length || post.transcript;
  if (!r && !hasTranscript) return '';
  const hl = (r?.highlights || []).map((h) => `<li>${h.t != null && post.mediaId ? `<button class="seek" data-action="seek" data-t="${h.t}">▶ ${clock(h.t)}</button> ` : ''}${esc(h.text)}</li>`).join('');
  return `<div class="recap">
    ${r?.summary ? `<p>${esc(r.summary)}</p>` : ''}
    ${hl ? `<div class="recap-label">✨ Highlights</div><ul>${hl}</ul>` : ''}
    ${r?.moral ? `<div class="recap-label">💡 Moral of the story</div><p class="moral">${esc(r.moral)}</p>` : ''}
    ${(r?.punchlines || []).length ? `<div class="recap-label">😂 Best lines</div>${r.punchlines.map((p) => `<blockquote>“${esc(p)}”</blockquote>`).join('')}` : ''}
    <div class="row wrap" style="margin-top:6px">
      ${(post.segments || []).length && post.mediaId ? `<button class="btn sm" data-action="watch-story" data-id="${post.id}">${post.mediaType === 'video' ? '▶️ Watch' : '🎧 Listen'} with captions</button>` : ''}
      ${hasTranscript ? `<details class="grow"><summary class="small muted">📜 Transcript</summary><p class="small" style="white-space:pre-wrap">${esc(post.transcript || post.segments.map((s) => s.text).join(' '))}</p></details>` : ''}
    </div>
  </div>`;
}

actions.seek = (d, el) => {
  const m = el.closest('article, .book-entry')?.querySelector('video, audio');
  if (!m) return;
  m.currentTime = +d.t;
  m.play?.();
  m.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Full-screen "sit with them" player: video or voice with live captions.
actions['watch-story'] = ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  const p = person(post.personId);
  const sheet = openSheet(`${head(esc(post.title || `${p?.name || ''}'s story`))}
    <div class="rec-stage watch">
      ${post.mediaType === 'video'
        ? `<video controls playsinline autoplay data-media="${post.mediaId}"></video>`
        : `<div class="audio-viz" style="height:240px;flex-direction:column;gap:8px">${avatar(p, 'lg')}<b>${esc(p?.name || '')}</b></div><audio controls autoplay data-media="${post.mediaId}" style="width:100%;margin-top:8px"></audio>`}
      <div class="rec-caption" id="wcap"></div>
    </div>
    <p class="small muted center">Captions are from the live transcript.</p>`, { full: true });
  const m = $('video, audio', sheet);
  const cap = $('#wcap', sheet);
  const segs = post.segments;
  const paint = () => {
    const t = m.currentTime;
    let cur = null;
    for (const s of segs) { if (s.t <= t + 0.3) cur = s; else break; }
    cap.textContent = cur && t - cur.t < 12 ? cur.text : '';
    cap.classList.toggle('hidden', !cap.textContent);
  };
  m.addEventListener('timeupdate', paint);
  paint();
};

// ── Mood / feelings / help ───────────────────────────────────
actions.mood = ({ mood }) => {
  const m = MOODS.find((x) => x.key === mood);
  const low = ['low', 'hard'].includes(mood);
  const sheet = openSheet(`${head(`${m.emoji} Feeling ${m.label.toLowerCase()}`)}
    <form class="stack">
      <label class="field"><span>Anything you want to share?</span><textarea class="input" name="note" style="min-height:80px" placeholder="What's going on today…"></textarea></label>
      <label class="field"><span>Is anything troubling you?</span><textarea class="input" name="troubling" style="min-height:80px" placeholder="It's okay to say it here."></textarea></label>
      <label class="check"><input type="checkbox" name="needHelp" ${mood === 'hard' ? 'checked' : ''}><span><b>I could use some help</b><br><span class="small muted">Your family will see a gentle alert on their home screen.</span></span></label>
      <label class="check"><input type="checkbox" name="private"><span>Keep this private (only I can see it)</span></label>
      <button class="btn primary block">Save check-in</button>
      ${low ? '<p class="small center"><a href="#" data-action="help-resources">Need to talk to someone now? See support lines →</a></p>' : ''}
    </form>`);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    await save('moods', { id: uid(), personId: S.meId, mood, note: d.note, troubling: d.troubling, needHelp: !!d.needHelp && !d.private, private: !!d.private, createdAt: Date.now() });
    closeSheet(); render();
    toast(d.needHelp ? 'Your family has been told. You are not alone 💛' : 'Thanks for checking in 💛');
  };
};

actions['resolve-help'] = async ({ id }) => {
  const m = S.moods.find((x) => x.id === id);
  m.resolved = true; m.resolvedBy = S.meId;
  await save('moods', m); render(); toast('Thank you for showing up 💛');
};

actions['help-resources'] = () => {
  openSheet(`${head('You are not alone')}
    <div class="card alert"><b>In immediate danger?</b> Call <a href="tel:911">911</a> (US) or your local emergency number.</div>
    <div class="card"><b>988 Suicide & Crisis Lifeline (US)</b><br>Call or text <a href="tel:988">988</a>, 24/7, free and confidential.</div>
    <div class="card"><b>American Cancer Society (US)</b><br>Support for patients & caregivers: <a href="tel:18002272345">1-800-227-2345</a>, 24/7.</div>
    <div class="card"><b>Crisis Text Line (US)</b><br>Text HOME to <a href="sms:741741&body=HOME">741741</a>.</div>
    <p class="small muted">Outside the US, visit findahelpline.com for a free local line.</p>`);
};

// ── Ask family a question ────────────────────────────────────
actions['ask-family'] = ({ to }) => {
  if (!guard()) return;
  const others = S.people.filter((p) => p.id !== S.meId && !p.passed);
  if (!others.length) { toast('Add family to your tree first 🌳'); actions['add-person']({}); return; }
  const sheet = openSheet(`${head('Ask a question')}
    <form class="stack">
      <label class="field"><span>Who do you want to ask?</span><select class="input" name="to">${peopleOptions(to || others[0].id, (p) => p.id !== S.meId && !p.passed)}</select></label>
      <label class="field"><span>Your question</span><textarea class="input" name="text" style="min-height:90px" placeholder="What were you like at my age? What do you want me to know about you?"></textarea></label>
      <div class="chips">${['What were you like at my age?', 'What do you wish you had done differently?', 'What was the happiest day of your life?', 'What do you want me to always remember?', 'Tell me about the day I was born.'].map((s) => `<button type="button" class="chip" data-sugg>${esc(s)}</button>`).join('')}</div>
      <p class="small muted">It will show up first on their home screen the next time they open the app.</p>
      <button class="btn primary block">Send question</button>
    </form>`);
  $$('[data-sugg]', sheet).forEach((b) => b.onclick = () => { $('[name=text]', sheet).value = b.textContent; });
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.text.trim()) return;
    const p = person(d.to);
    p.askQueue = [...(p.askQueue || []), { id: `ask:${uid()}`, text: d.text.trim(), fromId: S.meId, at: Date.now() }];
    await save('people', p);
    // Refresh today's list for them so the ask appears right away.
    await db.del('kv', `today:${p.id}`);
    closeSheet(); toast(`Sent to ${p.name} 💌`);
  };
};

// ── Legacy interview ─────────────────────────────────────────
actions.legacy = ({ pid }) => {
  const subject = person(pid) || me();
  const done = answeredIds(subject.id);
  const n = LEGACY_INTERVIEW.filter((q) => done.has(q.id)).length;
  openSheet(`${head('🕯️ Legacy Interview')}
    <p>Twelve gentle questions to capture the story of a life. Answer a few at a time — there's no rush. Speaking is often easier than typing, so try the 🎙️ button.</p>
    <label class="field"><span>Whose story are we recording?</span><select class="input" id="legacy-who">${peopleOptions(subject.id, (p) => !p.passed)}</select></label>
    <div class="progress"><i style="width:${(n / LEGACY_INTERVIEW.length) * 100}%"></i></div>
    <p class="small muted">${n} of ${LEGACY_INTERVIEW.length} answered</p>
    ${LEGACY_INTERVIEW.map((q, i) => `<div class="card ${done.has(q.id) ? 'soft' : ''}">
      <div class="row spread"><span class="small muted">Question ${i + 1}</span>${speakBtn(q.text)}</div><p style="font-family:var(--serif);font-size:1.05rem">${esc(q.text)}</p>
      ${done.has(q.id) ? '<span class="chip leaf">✓ Recorded</span>' : `<div class="row"><button class="btn sm primary" data-action="answer" data-qid="${q.id}" data-pid="${subject.id}">Write</button><button class="btn sm" data-action="answer" data-qid="${q.id}" data-pid="${subject.id}" data-rec="audio">🎙️ Voice</button><button class="btn sm" data-action="answer" data-qid="${q.id}" data-pid="${subject.id}" data-rec="video">🎥 Video</button></div>`}
    </div>`).join('')}`);
  $('#legacy-who').onchange = (e) => { closeSheet(); actions.legacy({ pid: e.target.value }); };
};

// ── Letters for later ────────────────────────────────────────
actions['write-letter'] = () => {
  if (!guard()) return;
  closeAllSheets();
  const others = S.people.filter((p) => p.id !== S.meId && !p.passed);
  const sheet = openSheet(`${head('💌 A letter for later')}
    <form class="stack">
      <label class="field"><span>To</span>${others.length ? `<select class="input" name="toId">${peopleOptions(others[0].id, (p) => p.id !== S.meId && !p.passed)}</select>` : '<input class="input" name="toName" placeholder="Name">'}</label>
      <label class="field"><span>Open on…</span><select class="input" name="occasion">${LETTER_OCCASIONS.map((o) => `<option>${o}</option>`).join('')}</select></label>
      <label class="field"><span>Keep sealed until (optional)</span><input class="input" type="date" name="openOn"></label>
      <textarea class="input" name="text" style="min-height:200px" placeholder="My dear…"></textarea>
      <button class="btn primary block">Seal letter</button>
    </form>`);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.text.trim()) return;
    await save('letters', { id: uid(), fromId: S.meId, toId: d.toId || null, toName: d.toName || '', occasion: d.occasion, openOn: d.openOn || '', text: d.text.trim(), createdAt: Date.now() });
    closeSheet(); toast('Letter sealed 💌');
  };
};

const isSealed = (l) => l.openOn && l.openOn > today() && !l.openedEarly;

function letterHTML(l) {
  const to = l.toId ? nameOf(l.toId) : l.toName || 'my family';
  if (isSealed(l)) {
    return `<div class="letter sealed"><div style="font-size:2rem">✉️</div><b>From ${esc(nameOf(l.fromId))} to ${esc(to)}</b><br>
      <span class="small muted">${esc(l.occasion)} · sealed until ${new Date(l.openOn + 'T00:00').toLocaleDateString()}</span><br>
      <button class="btn sm ghost" data-action="open-letter" data-id="${l.id}">Open early</button></div>`;
  }
  return `<div class="letter"><div class="small muted">${esc(l.occasion)} · from ${esc(nameOf(l.fromId))} to ${esc(to)}</div>
    <div style="white-space:pre-wrap;font-family:var(--serif);font-size:1.05rem;margin-top:8px">${esc(l.text)}</div></div>`;
}

actions['open-letter'] = async ({ id }) => {
  if (!confirm('This letter was meant to wait. Open it now?')) return;
  const l = S.letters.find((x) => x.id === id);
  l.openedEarly = true; await save('letters', l);
  closeSheet(); actions['letters-to-me']();
};

actions['letters-to-me'] = () => {
  const mine = S.letters.filter((l) => l.toId === S.meId);
  openSheet(`${head('💌 Letters for you')}${mine.map(letterHTML).join('') || '<div class="empty">No letters yet.</div>'}`);
};

// ── Circle (chat) ────────────────────────────────────────────
function viewCircle(root) {
  const mine = S.chats.filter((c) => c.memberIds.includes(S.meId));
  root.innerHTML = `
    <div class="row spread"><h1>Family circle</h1><button class="btn sm primary" data-action="new-chat">＋ New</button></div>
    <p class="muted small">Group chats and one-on-one conversations with the people in your tree.</p>
    ${mine.length ? mine.map((c) => {
      const msgs = S.messages.filter((m) => m.chatId === c.id).sort((a, b) => a.createdAt - b.createdAt);
      const last = msgs[msgs.length - 1];
      const others = c.memberIds.filter((id) => id !== S.meId);
      return `<div class="card chatlist-item" data-action="open-chat" data-id="${c.id}">
        ${c.memberIds.length > 2 ? '<span class="avatar">👨‍👩‍👧‍👦</span>' : avatar(person(others[0]))}
        <div class="grow"><b>${esc(c.name || others.map(nameOf).join(', '))}</b><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last ? `${esc(nameOf(last.personId))}: ${esc(last.text)}` : 'Say hello 👋'}</div></div>
        ${last ? `<span class="small muted">${timeAgo(last.createdAt)}</span>` : ''}</div>`;
    }).join('') : `<div class="empty"><span class="ico">💬</span>No conversations yet.<br><br><button class="btn primary" data-action="new-chat">Start a family chat</button></div>`}
    <div class="card soft small"><b>Keeping everyone in the loop</b><br>Conversations live on this device and travel with your family file (Me → Backup & share). Real-time sync across phones is on the roadmap.</div>`;
}

actions['new-chat'] = () => {
  if (!guard()) return;
  const others = S.people.filter((p) => p.id !== S.meId && !p.passed);
  if (!others.length) { toast('Add family to your tree first 🌳'); return; }
  const sheet = openSheet(`${head('New conversation')}
    <form class="stack">
      <div class="field"><span>Who's in it?</span>${others.map((p) => `<label class="check"><input type="checkbox" name="m" value="${p.id}">${avatar(p, 'sm')} ${esc(p.name)}</label>`).join('')}</div>
      <label class="field"><span>Group name (optional)</span><input class="input" name="name" placeholder="The Cousins, Sunday Dinner Crew…"></label>
      <button class="btn primary block">Create</button>
    </form>`);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const ids = new FormData(e.target).getAll('m');
    if (!ids.length) { toast('Pick at least one person'); return; }
    const c = { id: uid(), name: e.target.name.value.trim(), memberIds: [S.meId, ...ids], createdAt: Date.now() };
    await save('chats', c);
    closeSheet(); render(); actions['open-chat']({ id: c.id });
  };
};

actions['open-chat-with'] = async ({ id }) => {
  let c = S.chats.find((x) => x.memberIds.length === 2 && x.memberIds.includes(id) && x.memberIds.includes(S.meId));
  if (!c) { c = { id: uid(), name: '', memberIds: [S.meId, id], createdAt: Date.now() }; await save('chats', c); }
  closeAllSheets();
  actions['open-chat']({ id: c.id });
};

actions['open-chat'] = ({ id }) => {
  const c = S.chats.find((x) => x.id === id);
  const title = c.name || c.memberIds.filter((x) => x !== S.meId).map(nameOf).join(', ');
  const sheet = openSheet(`${head(esc(title))}<div class="msgs" id="msgs"></div>
    <form class="composer-bar"><input class="input" name="t" placeholder="Message…" autocomplete="off"><button class="btn primary">Send</button></form>`, { full: true, onClose: () => S.tab === 'circle' && render() });
  const paint = () => {
    const msgs = S.messages.filter((m) => m.chatId === id).sort((a, b) => a.createdAt - b.createdAt);
    $('#msgs', sheet).innerHTML = msgs.map((m) => `<div class="msg ${m.personId === S.meId ? 'mine' : ''}">${m.personId === S.meId ? '' : `<span class="from">${esc(nameOf(m.personId))}</span>`}${esc(m.text)}</div>`).join('')
      || '<div class="empty">Start the conversation 👋</div>';
    sheet.scrollTop = sheet.scrollHeight;
  };
  paint();
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (!t) return;
    if (!guard()) return;
    await save('messages', { id: uid(), chatId: id, personId: S.meId, text: t, createdAt: Date.now() });
    e.target.t.value = '';
    paint();
  };
};

// ── Family tree ──────────────────────────────────────────────
function layoutTree() {
  const byId = Object.fromEntries(S.people.map((p) => [p.id, p]));
  const gen = {};
  const parentsOf = (p) => (p.parentIds || []).map((id) => byId[id]).filter(Boolean);
  const calc = (p, seen = new Set()) => {
    if (gen[p.id] != null) return gen[p.id];
    if (seen.has(p.id)) return 0;
    seen.add(p.id);
    const ps = parentsOf(p);
    gen[p.id] = ps.length ? Math.max(...ps.map((x) => calc(x, seen))) + 1 : 0;
    return gen[p.id];
  };
  S.people.forEach((p) => calc(p));
  for (let k = 0; k < 6; k++) {
    for (const p of S.people) {
      const s = byId[p.spouseId];
      if (s) { const m = Math.max(gen[p.id], gen[s.id]); gen[p.id] = gen[s.id] = m; }
      const ps = parentsOf(p);
      if (ps.length) gen[p.id] = Math.max(gen[p.id], Math.max(...ps.map((x) => gen[x.id])) + 1);
    }
  }
  const connected = (p) => parentsOf(p).length || p.spouseId || S.people.some((c) => (c.parentIds || []).includes(p.id));
  const rows = [];
  const loose = [];
  for (const p of S.people) {
    if (!connected(p) && p.id !== S.meId) { loose.push(p); continue; }
    (rows[gen[p.id]] ||= []).push(p);
  }
  // Order each row by parents' positions, keeping couples side by side.
  const pos = {};
  rows.forEach((row, gi) => {
    if (!row) return;
    const score = (p) => {
      const ps = parentsOf(p).filter((x) => pos[x.id] != null);
      if (ps.length) return ps.reduce((a, x) => a + pos[x.id], 0) / ps.length;
      const s = byId[p.spouseId];
      const sps = s ? parentsOf(s).filter((x) => pos[x.id] != null) : [];
      return sps.length ? sps.reduce((a, x) => a + pos[x.id], 0) / sps.length + 0.1 : 999;
    };
    row.sort((a, b) => score(a) - score(b) || (a.birthYear || 9999) - (b.birthYear || 9999));
    const ordered = [];
    for (const p of row) {
      if (ordered.includes(p)) continue;
      ordered.push(p);
      const s = byId[p.spouseId];
      if (s && row.includes(s) && !ordered.includes(s)) ordered.push(s);
    }
    rows[gi] = ordered;
    ordered.forEach((p, i) => { pos[p.id] = i - ordered.length / 2; });
  });
  return { rows: rows.filter(Boolean), loose, parentsOf };
}

function viewTree(root) {
  const { rows, loose } = layoutTree();
  const node = (p) => `<div class="node ${p.id === S.meId ? 'me' : ''}" data-action="person" data-id="${p.id}" data-node="${p.id}">
    ${avatar(p)}<div class="nm">${esc(p.name)}</div><div class="yr">${esc(p.relation && p.relation !== 'Me' ? p.relation : years(p))}</div></div>`;
  root.innerHTML = `
    <div class="row spread"><h1>Family tree</h1><button class="btn sm primary" data-action="add-person">＋ Add</button></div>
    <p class="muted small">Tap anyone to see their story, ask them a question, or open their memory book.</p>
    <div class="tree-wrap"><div class="tree" id="tree">
      <svg id="tree-lines"></svg>
      ${rows.map((row) => `<div class="tree-row">${row.map(node).join('')}</div>`).join('')}
    </div></div>
    ${loose.length ? `<div class="section-title"><h3>Not connected yet</h3></div><p class="small muted">Edit these people to set their parents or partner.</p><div class="row wrap">${loose.map(node).join('')}</div>` : ''}
    ${S.people.length < 3 ? `<div class="card accent"><b>Grow your tree 🌱</b><br><span class="small">Add parents, grandparents, kids and cousins. Everyone you add can have their own memory book — even loved ones who have passed.</span></div>` : ''}`;
}

function drawTreeLines() {
  const tree = $('#tree');
  const svg = $('#tree-lines');
  if (!tree || !svg) return;
  const box = tree.getBoundingClientRect();
  const r = (id) => { const el = $(`#tree [data-node="${id}"]`); return el && el.getBoundingClientRect(); };
  svg.setAttribute('width', tree.scrollWidth);
  svg.setAttribute('height', tree.scrollHeight);
  const stroke = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#ccc';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  let paths = '';
  const drawn = new Set();
  for (const p of S.people) {
    const a = r(p.id);
    if (!a) continue;
    const s = p.spouseId && r(p.spouseId);
    const key = [p.id, p.spouseId].sort().join();
    if (s && !drawn.has(key)) {
      drawn.add(key);
      const [L, R] = a.left < s.left ? [a, s] : [s, a];
      const y = L.top + L.height / 2 - box.top;
      paths += `<path d="M${L.right - box.left},${y} H${R.left - box.left}" stroke="${accent}" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`;
    }
    const pr = (p.parentIds || []).map(r).filter(Boolean);
    if (pr.length) {
      const px = pr.reduce((acc, x) => acc + x.left + x.width / 2, 0) / pr.length - box.left;
      const py = Math.max(...pr.map((x) => x.bottom)) - box.top;
      const cx = a.left + a.width / 2 - box.left;
      const cy = a.top - box.top;
      const mid = py + (cy - py) / 2;
      paths += `<path d="M${px},${py} V${mid} H${cx} V${cy}" stroke="${stroke}" stroke-width="2" fill="none"/>`;
    }
  }
  svg.innerHTML = paths;
}
window.addEventListener('resize', () => S.tab === 'tree' && drawTreeLines());

function personForm(p = {}) {
  const others = S.people.filter((x) => x.id !== p.id);
  const opt = (sel) => `<option value="">—</option>${others.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  return `${profileForm(p)}
    <label class="field"><span>Relationship to ${p.id === S.meId ? 'you' : esc(me().name)}</span><select class="input" name="relation">${RELATIONS.map((r) => `<option ${r === (p.relation || '') ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <div class="row"><label class="field grow"><span>Parent 1</span><select class="input" name="parent1">${opt(p.parentIds?.[0])}</select></label>
    <label class="field grow"><span>Parent 2</span><select class="input" name="parent2">${opt(p.parentIds?.[1])}</select></label></div>
    <label class="field"><span>Partner / spouse</span><select class="input" name="spouseId">${opt(p.spouseId)}</select></label>
    <label class="check"><input type="checkbox" name="passed" ${p.passed ? 'checked' : ''}><span>🕯️ In loving memory (has passed away)</span></label>
    <label class="field ${p.passed ? '' : 'hidden'}" id="death"><span>Passed (year)</span><input class="input" name="deathYear" inputmode="numeric" value="${esc(p.deathYear || '')}"></label>
    ${p.id === S.meId ? '' : `<label class="check"><input type="checkbox" name="profile" ${p.profile ? 'checked' : ''}><span>They'll use this device too (give them a profile)</span></label>`}`;
}

function applyAutoLinks(p, relation) {
  const m = me();
  if (!m || p.id === m.id) return [];
  const changed = [];
  const rel = relation.toLowerCase();
  if (['mom', 'dad', 'step-parent'].includes(rel) && !(m.parentIds || []).includes(p.id) && (m.parentIds || []).length < 2) {
    m.parentIds = [...(m.parentIds || []), p.id]; changed.push(m);
    const other = person(m.parentIds.find((id) => id !== p.id));
    if (other && !p.spouseId && !other.spouseId) { p.spouseId = other.id; other.spouseId = p.id; changed.push(other); }
  }
  if (['son', 'daughter'].includes(rel) && !(p.parentIds || []).length) {
    p.parentIds = [m.id, m.spouseId].filter(Boolean);
  }
  if (['wife', 'husband', 'partner'].includes(rel) && !m.spouseId && !p.spouseId) {
    m.spouseId = p.id; p.spouseId = m.id; changed.push(m);
  }
  if (['sister', 'brother'].includes(rel) && !(p.parentIds || []).length) p.parentIds = [...(m.parentIds || [])];
  if (['grandson', 'granddaughter'].includes(rel)) { /* linked through their parent */ }
  return changed;
}

function wirePersonForm(sheet, p, isNew) {
  wirePickers(sheet);
  $('[name=passed]', sheet).onchange = (e) => $('#death', sheet).classList.toggle('hidden', !e.target.checked);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.name.trim()) return;
    const oldSpouse = p.spouseId;
    Object.assign(p, {
      name: d.name.trim(), emoji: d.emoji, color: d.color, birthYear: d.birthYear, hometown: d.hometown,
      relation: d.relation, parentIds: [d.parent1, d.parent2].filter(Boolean), spouseId: d.spouseId || null,
      passed: !!d.passed, deathYear: d.deathYear || '', profile: p.id === S.meId ? true : !!d.profile,
    });
    const changed = isNew ? applyAutoLinks(p, d.relation) : [];
    if (oldSpouse && oldSpouse !== p.spouseId && person(oldSpouse)?.spouseId === p.id) { person(oldSpouse).spouseId = null; changed.push(person(oldSpouse)); }
    if (p.spouseId && person(p.spouseId) && person(p.spouseId).spouseId !== p.id) { person(p.spouseId).spouseId = p.id; changed.push(person(p.spouseId)); }
    await save('people', p);
    for (const c of changed) await save('people', c);
    closeAllSheets(); S.tab = 'tree'; await render();
    toast(isNew ? `${p.name} added to your tree 🌳` : 'Saved');
  };
}

actions['add-person'] = () => {
  const p = { id: uid(), likes: [], dislikes: [], parentIds: [], askQueue: [], createdAt: Date.now() };
  const sheet = openSheet(`${head('Add to your family')}<form class="stack">${personForm(p)}<button class="btn primary block">Add to tree</button></form>`);
  $('[name=relation]', sheet).value = 'Dad';
  wirePersonForm(sheet, p, true);
};

actions['edit-person'] = ({ id }) => {
  const p = person(id);
  closeAllSheets();
  const sheet = openSheet(`${head(`Edit ${esc(p.name)}`)}<form class="stack">${personForm(p)}<button class="btn primary block">Save</button>
    ${p.id !== S.meId ? `<button type="button" class="btn block ghost danger" data-action="delete-person" data-id="${p.id}">Remove from tree</button>` : ''}</form>`);
  wirePersonForm(sheet, p, false);
};

actions['delete-person'] = async ({ id }) => {
  const p = person(id);
  const count = S.posts.filter((x) => x.personId === id).length;
  if (!confirm(`Remove ${p.name} from the tree?${count ? ` Their ${count} memories will also be deleted.` : ''}`)) return;
  for (const post of S.posts.filter((x) => x.personId === id)) { if (post.mediaId) await db.del('media', post.mediaId); await remove('posts', post.id); }
  for (const other of S.people) {
    let dirty = false;
    if ((other.parentIds || []).includes(id)) { other.parentIds = other.parentIds.filter((x) => x !== id); dirty = true; }
    if (other.spouseId === id) { other.spouseId = null; dirty = true; }
    if (dirty) await save('people', other);
  }
  await remove('people', id);
  closeAllSheets(); render();
};

actions.person = ({ id }) => {
  const p = person(id);
  const posts = S.posts.filter((x) => x.personId === id);
  const mood = S.moods.filter((x) => x.personId === id && (!x.private || id === S.meId)).sort((a, b) => b.createdAt - a.createdAt)[0];
  const moodInfo = mood && MOODS.find((x) => x.key === mood.mood);
  const isMe = id === S.meId;
  openSheet(`${head('')}
    <div class="center stack">
      <div style="display:flex;justify-content:center">${avatar(p, 'lg')}</div>
      <h1 style="margin:0">${esc(p.name)}</h1>
      <div class="muted">${[p.relation !== 'Me' && p.relation, years(p), p.hometown].filter(Boolean).map(esc).join(' · ')}</div>
      ${p.passed ? '<span class="chip">🕯️ In loving memory</span>' : ''}
      ${moodInfo && !p.passed ? `<div class="small">Feeling ${moodInfo.emoji} ${moodInfo.label.toLowerCase()} · ${timeAgo(mood.createdAt)}${mood.note ? `<br><i>“${esc(mood.note)}”</i>` : ''}</div>` : ''}
    </div>
    ${aboutHTML(p)}
    <div class="grid2" style="margin-top:14px">
      ${tile('open-book', '📖', 'Memory book', `${posts.length} memories`).replace('data-action="open-book"', `data-action="open-book" data-id="${id}"`)}
      ${isMe || p.passed ? tile('edit-about', '✍️', isMe ? 'Edit about me' : 'Add what you remember', isMe ? 'Likes, dislikes, bio' : 'Share your memories of them').replace('data-action="edit-about"', `data-action="edit-about" data-id="${id}"`)
        : tile('ask-family', '❓', 'Ask a question', 'It shows up on their home screen').replace('data-action="ask-family"', `data-action="ask-family" data-to="${id}"`)}
      ${!isMe && !p.passed ? tile('open-chat-with', '💬', 'Message', 'One-on-one chat').replace('data-action="open-chat-with"', `data-action="open-chat-with" data-id="${id}"`) : ''}
      ${!p.passed ? tile('legacy', '🕯️', 'Legacy interview', 'Record their life story').replace('data-action="legacy"', `data-action="legacy" data-pid="${id}"`) : ''}
      ${!p.passed ? tile('tell-story', '🎬', 'Story time', 'Record them telling a story').replace('data-action="tell-story"', `data-action="tell-story" data-pid="${id}"`) : ''}
      ${tile('edit-person', '⚙️', 'Edit details', 'Name, family links').replace('data-action="edit-person"', `data-action="edit-person" data-id="${id}"`)}
    </div>
    ${p.passed ? `<button class="btn block" style="margin-top:12px" data-action="remember" data-id="${id}">🕯️ Share a memory of ${esc(p.name)}</button>` : ''}`);
};

function aboutHTML(p) {
  const list = (arr) => (arr || []).length ? `<div class="chips">${arr.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '<span class="small muted">Nothing yet</span>';
  if (!p.bio && !(p.likes || []).length && !(p.dislikes || []).length) return '';
  return `<div class="card" style="margin-top:14px">
    ${p.bio ? `<p style="white-space:pre-wrap">${esc(p.bio)}</p>` : ''}
    <div class="small muted" style="margin:6px 0 4px"><b>💚 Loves</b></div>${list(p.likes)}
    <div class="small muted" style="margin:10px 0 4px"><b>🙅 Can't stand</b></div>${list(p.dislikes)}
  </div>`;
}

actions['edit-about'] = ({ id }) => {
  const p = person(id);
  if (id !== S.meId) { actions.remember({ id }); return; }
  closeAllSheets();
  const sheet = openSheet(`${head('All about me')}
    <form class="stack">
      <label class="field"><span>In a few sentences, who are you?</span><textarea class="input" name="bio" placeholder="I'm the kind of person who…">${esc(p.bio || '')}</textarea></label>
      <label class="field"><span>Things I love (comma separated)</span><input class="input" name="likes" value="${esc((p.likes || []).join(', '))}" placeholder="Fishing, Elvis, Mom's meatloaf, sunrises"></label>
      <label class="field"><span>Things I can't stand</span><input class="input" name="dislikes" value="${esc((p.dislikes || []).join(', '))}" placeholder="Cold coffee, being late, olives"></label>
      <button class="btn primary block">Save</button>
    </form>`);
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const split = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    Object.assign(p, { bio: d.bio.trim(), likes: split(d.likes), dislikes: split(d.dislikes) });
    await save('people', p); closeSheet(); render(); toast('Saved 💛');
  };
};

// Family members can add their own memories to a loved one's book.
actions.remember = ({ id }) => {
  if (!guard()) return;
  const p = person(id);
  closeAllSheets();
  openComposer({ type: 'story', personId: id, title: `A memory of ${p.name}` });
};

// ── Memory books ─────────────────────────────────────────────
actions.books = () => {
  openSheet(`${head('📖 Memory books')}
    <p class="muted small">Every answer, story, video and voice note someone shared — together in one place, forever.</p>
    ${S.people.map((p) => {
      const n = S.posts.filter((x) => x.personId === p.id).length;
      return `<div class="card row" style="cursor:pointer" data-action="open-book" data-id="${p.id}">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b><br><span class="small muted">${n} memor${n === 1 ? 'y' : 'ies'}</span></div><span>›</span></div>`;
    }).join('')}`);
};

function bookSections(p) {
  const posts = S.posts.filter((x) => x.personId === p.id).sort((a, b) => a.createdAt - b.createdAt);
  const letters = S.letters.filter((l) => l.fromId === p.id);
  const sections = [];
  const answers = posts.filter((x) => x.type === 'answer');
  const legacy = answers.filter((x) => x.questionId?.startsWith('L'));
  if (legacy.length) sections.push(['🕯️ In their own words', legacy]);
  for (const [key, c] of Object.entries(CATEGORIES)) {
    const list = answers.filter((x) => !x.questionId?.startsWith('L') && (x.category || 'family') === key);
    if (list.length) sections.push([`${c.emoji} ${c.label}`, list]);
  }
  const told = posts.filter((x) => x.type !== 'answer' && (x.recap || x.segments?.length));
  if (told.length) sections.push(['🎬 Stories they told', told]);
  const videos = posts.filter((x) => x.type !== 'answer' && !told.includes(x) && x.mediaType === 'video');
  const voices = posts.filter((x) => x.type !== 'answer' && !told.includes(x) && x.mediaType === 'audio');
  const stories = posts.filter((x) => x.type !== 'answer' && !told.includes(x) && !['video', 'audio'].includes(x.mediaType));
  if (videos.length) sections.push(['🎥 Videos', videos]);
  if (voices.length) sections.push(['🎙️ Their voice', voices]);
  if (stories.length) sections.push(['📝 Stories & photos', stories]);
  return { posts, sections, letters };
}

actions['open-book'] = ({ id }) => {
  const p = person(id);
  const { posts, sections, letters } = bookSections(p);
  const entry = (x) => `<div class="book-entry">
    ${x.questionText ? `<div class="q">${esc(x.questionText)}</div>` : x.title ? `<div class="q">${esc(x.title)}</div>` : ''}
    ${x.text ? `<div class="body">${esc(x.text)}</div>` : ''}${mediaTag(x)}${recapHTML(x)}
    <div class="small muted">${new Date(x.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}${x.authorId && x.authorId !== x.personId ? ` · added by ${esc(nameOf(x.authorId))}` : ''}</div></div>`;
  openSheet(`${head('', `<button class="btn sm" data-action="export-book" data-id="${id}">⬇️ Save</button>`)}
    <div class="book-cover">
      <div style="display:flex;justify-content:center">${avatar(p, 'lg')}</div>
      <h1 style="margin-top:10px">${esc(p.name)}</h1>
      <div class="muted">${[years(p), p.hometown].filter(Boolean).map(esc).join(' · ')}</div>
      ${p.passed ? '<p style="margin-top:8px;font-family:var(--serif);font-style:italic">Forever in our hearts</p>' : ''}
    </div>
    ${aboutHTML(p)}
    ${!posts.length && !letters.length ? `<div class="empty"><span class="ico">📖</span>No memories yet.${p.id === S.meId ? ' Answer today\'s question to write your first page.' : ''}</div>` : ''}
    ${sections.map(([title, list]) => `<h2 style="margin-top:22px">${title}</h2>${list.map(entry).join('')}`).join('')}
    ${letters.length ? `<h2 style="margin-top:22px">💌 Letters</h2>${letters.map(letterHTML).join('')}` : ''}`, { full: true });
};

actions['export-book'] = async ({ id }) => {
  const p = person(id);
  toast('Preparing memory book…');
  const { sections, letters } = bookSections(p);
  const mediaHTML = async (x) => {
    if (!x.mediaId) return '';
    const row = await db.get('media', x.mediaId);
    if (!row) return '';
    const src = await blobToDataURL(row.blob);
    if (x.mediaType === 'video') return `<video controls playsinline src="${src}"></video>`;
    if (x.mediaType === 'audio') return `<audio controls src="${src}"></audio>`;
    return `<img alt="" src="${src}">`;
  };
  let body = '';
  for (const [title, list] of sections) {
    body += `<h2>${title}</h2>`;
    for (const x of list) {
      const r = x.recap;
      const recap = r ? `<div class="r">${r.summary ? `<p>${esc(r.summary)}</p>` : ''}${(r.highlights || []).length ? `<b>✨ Highlights</b><ul>${r.highlights.map((h) => `<li>${h.t != null ? `[${clock(h.t)}] ` : ''}${esc(h.text)}</li>`).join('')}</ul>` : ''}${r.moral ? `<b>💡 Moral of the story</b><p><i>${esc(r.moral)}</i></p>` : ''}${(r.punchlines || []).length ? `<b>😂 Best lines</b>${r.punchlines.map((q) => `<p>“${esc(q)}”</p>`).join('')}` : ''}</div>` : '';
      const tx = x.transcript || (x.segments || []).map((g) => g.text).join(' ');
      body += `<div class="e">${x.questionText || x.title ? `<h3>${esc(x.questionText || x.title)}</h3>` : ''}${x.text ? `<p>${esc(x.text)}</p>` : ''}${await mediaHTML(x)}${recap}${tx ? `<details><summary><small>Transcript</small></summary><p>${esc(tx)}</p></details>` : ''}<small>${new Date(x.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</small></div>`;
    }
  }
  const openLetters = letters.filter((l) => !isSealed(l));
  if (openLetters.length) body += `<h2>💌 Letters</h2>${openLetters.map((l) => `<div class="e"><small>${esc(l.occasion)} · to ${esc(l.toId ? nameOf(l.toId) : l.toName || 'my family')}</small><p>${esc(l.text)}</p></div>`).join('')}`;
  const about = [p.bio && `<p>${esc(p.bio)}</p>`, (p.likes || []).length && `<p><b>Loves:</b> ${esc(p.likes.join(', '))}</p>`, (p.dislikes || []).length && `<p><b>Can't stand:</b> ${esc(p.dislikes.join(', '))}</p>`].filter(Boolean).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.name)} — Memory Book</title>
<style>body{font-family:Georgia,serif;background:#fbf6f0;color:#2b2220;max-width:680px;margin:0 auto;padding:24px 16px;line-height:1.6}
header{text-align:center;padding:40px 16px;border-radius:22px;background:linear-gradient(160deg,#fbe3da,#e1eee3);margin-bottom:24px}
header .a{font-size:64px}h1{margin:.2em 0}h2{margin-top:36px;border-bottom:1px solid #eadfd3;padding-bottom:6px}h3{margin:0 0 4px;font-style:italic;color:#6f615b;font-weight:600}
.r{background:rgba(127,127,127,.08);border-radius:12px;padding:8px 12px;margin:8px 0}.r ul{margin:4px 0 8px}.e{border-left:3px solid #fbe3da;padding:4px 0 4px 14px;margin:18px 0}.e p{white-space:pre-wrap;margin:6px 0}small{color:#6f615b}
video,img{width:100%;border-radius:14px;margin:8px 0;background:#000}audio{width:100%}footer{text-align:center;color:#6f615b;margin:48px 0 16px;font-size:14px}
@media(prefers-color-scheme:dark){body{background:#181312;color:#f3e9e2}header{background:linear-gradient(160deg,#432720,#22342a)}h3,small,footer{color:#b5a59c}.e{border-color:#432720}h2{border-color:#3a2f2b}}</style></head>
<body><header><div class="a">${esc(p.emoji || '🙂')}</div><h1>${esc(p.name)}</h1><div>${esc([years(p), p.hometown].filter(Boolean).join(' · '))}</div>${p.passed ? '<p><i>Forever in our hearts</i></p>' : ''}</header>
${about}${body || '<p>No memories yet.</p>'}<footer>Made with love in ${esc(CONFIG.appName)} · ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })}</footer></body></html>`;
  download(`${p.name.replace(/[^\w-]+/g, '_')}_Memory_Book.html`, html, 'text/html');
};

// ── Me tab ───────────────────────────────────────────────────
function viewMe(root) {
  const m = me();
  const n = S.posts.filter((x) => x.personId === m.id).length;
  const answered = answeredIds(m.id).size;
  const moods = S.moods.filter((x) => x.personId === m.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 14);
  const owned = SKUS.filter((s) => S.unlocked.has(s));
  root.innerHTML = `
    <div class="center stack">
      <div style="display:flex;justify-content:center">${avatar(m, 'lg')}</div>
      <h1 style="margin:0">${esc(m.name)}</h1>
      <div class="muted small">${n} memories · ${answered} questions answered</div>
    </div>
    ${aboutHTML(m) || `<div class="card accent" style="margin-top:14px"><b>Tell your family about you</b><br><span class="small">What you love, what drives you crazy, who you are.</span><br><button class="btn sm primary" style="margin-top:8px" data-action="edit-about" data-id="${m.id}">Fill in “All about me”</button></div>`}
    <div class="grid2" style="margin-top:14px">
      ${tile('edit-about', '✍️', 'All about me', 'Loves, pet peeves, bio').replace('data-action="edit-about"', `data-action="edit-about" data-id="${m.id}"`)}
      ${tile('open-book', '📖', 'My memory book', 'Everything I have shared').replace('data-action="open-book"', `data-action="open-book" data-id="${m.id}"`)}
      ${tile('legacy', '🕯️', 'Legacy interview', 'My life story')}
      ${tile('write-letter', '💌', 'Letters for later', 'For future days')}
    </div>
    ${moods.length ? `<div class="card"><b>My feelings lately</b><div style="font-size:1.5rem;letter-spacing:4px;margin-top:6px">${moods.reverse().map((x) => MOODS.find((y) => y.key === x.mood)?.emoji).join('')}</div></div>` : ''}
    <div class="section-title"><h2>Account</h2></div>
    <div class="card stack">
      <div class="row spread"><div><b>${S.unlocked.has('base') ? 'Lifetime member 💛' : trialDaysLeft() > 0 ? `Free trial · ${trialDaysLeft()} days left` : 'Trial ended'}</b><br><span class="small muted">${owned.length ? `Unlocked: ${owned.map((s) => s === 'base' ? 'Heartroots' : PACKS[s].name).join(', ')}` : 'Viewing & exporting memories is always free.'}</span></div></div>
      <button class="btn block primary" data-action="store">🛍️ Store & unlock codes</button>
      <button class="btn block" data-action="share">📤 Share with family & friends</button>
      <button class="btn block" data-action="backup">💾 Backup & share family file</button>
      <button class="btn block" data-action="display">Aa  Text size & display</button>
      <button class="btn block" data-action="switch-profile">👥 Switch / add profile</button>
      <button class="btn block" data-action="help-resources">🆘 Support lines</button>
      <button class="btn block ghost" data-action="install-help">📲 Install on your phone</button>
    </div>
    <p class="small muted center">Your memories are stored privately on this device. Nothing is uploaded.</p>`;
}

actions['install-help'] = () => {
  openSheet(`${head('Install the app')}
    <div class="card"><b>iPhone / iPad (Safari)</b><br>Tap the Share button <b>⎋</b>, then <b>Add to Home Screen</b>.</div>
    <div class="card"><b>Android (Chrome)</b><br>Tap the <b>⋮</b> menu, then <b>Install app</b> or <b>Add to Home screen</b>.</div>
    ${deferredInstall ? '<button class="btn primary block" data-action="do-install">Install now</button>' : ''}`);
};
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
actions['do-install'] = async () => { deferredInstall?.prompt(); deferredInstall = null; closeSheet(); };

// ── Backup / sync ────────────────────────────────────────────
actions.backup = () => {
  openSheet(`${head('💾 Backup & family file')}
    <p>Your family file holds every profile, memory, video, letter and chat. Use it to:</p>
    <ul class="small"><li>Back up everything (do this often!)</li><li>Send memories to family — they import it on their phone</li><li>Move to a new phone</li></ul>
    <button class="btn primary block" data-action="export-all">⬇️ Save family file</button><br><br>
    <button class="btn block" data-action="import">⬆️ Import a family file</button>
    <p class="small muted" style="margin-top:12px">Importing merges with what's already here — nothing gets duplicated or lost.</p>`);
};

actions['export-all'] = async () => {
  toast('Packing up your memories…');
  const bundle = await exportBundle();
  const file = new File([JSON.stringify(bundle)], `heartroots-family-${today()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && confirm('Share the family file now (Messages, Email, Drive…)? Cancel to just download it.')) {
    try { await navigator.share({ files: [file], title: 'Our Heartroots family file' }); return; } catch { /* fall through */ }
  }
  download(file.name, file);
};

actions.import = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const n = await importBundle(JSON.parse(await f.text()));
      await load();
      if (!S.meId && profiles().length) { S.meId = profiles()[0].id; await db.setKV('meId', S.meId); }
      if (!S.trialStart) { S.trialStart = Date.now(); await db.setKV('trialStart', S.trialStart); }
      closeAllSheets(); await render();
      toast(`Imported ${n} items 💛`);
      if (!me()) actions['new-profile']({ first: '1' });
    } catch (err) { alert(`Could not import: ${err.message}`); }
  };
  input.click();
};

// ── Sharing & referrals ──────────────────────────────────────
function appURL(params = {}) {
  const u = new URL('./', location.href);
  Object.entries(params).forEach(([k, v]) => v && u.searchParams.set(k, v));
  return u.toString();
}
const landingURL = (params = {}) => {
  const u = new URL('../', location.href);
  Object.entries(params).forEach(([k, v]) => v && u.searchParams.set(k, v));
  return u.toString();
};

async function shareLink(title, text, url) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch { return; } }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied — paste it anywhere 📋'); } catch { prompt('Copy this link:', url); }
}

actions.share = () => {
  const name = me()?.name || '';
  openSheet(`${head('📤 Share Heartroots')}
    ${CONFIG.familyGiftCode ? `<div class="card leaf"><b>🎁 Free for your family</b><p class="small">Send this link to family and close friends. It unlocks everything for free.</p>
      <button class="btn leaf block" data-action="share-family">Send free family link</button></div>` : ''}
    <div class="card"><b>💛 Tell your friends</b><p class="small">Know someone who'd want to keep their family's stories? Send them Heartroots — it's just $${CONFIG.basePrice}, once.</p>
      <button class="btn primary block" data-action="share-friends">Recommend to a friend</button>
      <div class="row" style="margin-top:10px">
        <a class="btn sm grow" href="sms:?&body=${encodeURIComponent(`I've been using Heartroots to save our family's stories. You'd love it: ${landingURL({ ref: name })}`)}">💬 Text</a>
        <a class="btn sm grow" href="mailto:?subject=${encodeURIComponent('Save your family\'s stories')}&body=${encodeURIComponent(`I've been using Heartroots to save our family's stories — questions every day, videos, a family tree and memory books. ${landingURL({ ref: name })}`)}">✉️ Email</a>
        <a class="btn sm grow" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(landingURL({ ref: name }))}">📘 Facebook</a>
      </div></div>`);
};
actions['share-family'] = () => shareLink('Join our family on Heartroots',
  `${me()?.name || 'I'} invited you to our family on Heartroots — your access is free 💛`, appURL({ gift: CONFIG.familyGiftCode, ref: me()?.name }));
actions['share-friends'] = () => shareLink('Heartroots', 'Save your family\'s stories before they\'re lost — I love this app:', landingURL({ ref: me()?.name }));

// ── Store ────────────────────────────────────────────────────
function buyButton(sku, label) {
  if (S.unlocked.has(sku)) return '<span class="owned">✓ Owned</span>';
  const link = CONFIG.checkoutLinks[sku];
  return link ? `<a class="btn sm primary" href="${esc(link)}" target="_blank" rel="noopener">${label}</a>` : `<button class="btn sm" data-action="soon">${label}</button>`;
}

function openStore(message = '') {
  closeAllSheets();
  const sheet = openSheet(`${head('🛍️ Heartroots Store')}
    ${message ? `<div class="card accent small">${esc(message)}</div>` : ''}
    <div class="card center">
      <div class="small muted">Lifetime access</div>
      <div class="price">$${CONFIG.basePrice}</div>
      <div class="small muted">One time. No subscription. Ever.</div>
      <ul class="small" style="text-align:left;margin:12px 0">
        <li>Daily questions & the Legacy Interview</li><li>Unlimited videos, voice memories & stories</li>
        <li>Family tree, circle chat & letters for later</li><li>Memory books you can keep forever</li>
      </ul>
      ${buyButton('base', `Unlock for $${CONFIG.basePrice}`)}
    </div>
    <h3>Add-ons</h3>
    ${['parent', 'kids', 'family', 'games'].map((k) => `<div class="card plan"><span class="ico">${PACKS[k].emoji}</span><div class="grow"><b>${PACKS[k].name}</b><br><span class="small muted">${PACKS[k].tagline}</span></div>
      <div class="center">${S.unlocked.has(k) ? '' : `<div class="small"><b>$${PACKS[k].price}</b></div>`}${buyButton(k, 'Buy')}</div></div>`).join('')}
    ${CONFIG.checkoutLinks.bundle ? `<div class="card leaf row"><div class="grow"><b>Everything bundle</b><br><span class="small">Heartroots + all 4 add-ons</span></div>${buyButton('bundle', 'Get it all')}</div>` : ''}
    <h3>Have a code?</h3>
    <form class="row" id="code-form"><input class="input" name="code" placeholder="Enter unlock or gift code" autocapitalize="characters"><button class="btn primary">Redeem</button></form>
    <p class="small muted" style="margin-top:14px">Your saved memories are always yours — you can view and export them even without buying.</p>`);
  $('#code-form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const skus = await redeemCode(e.target.code.value);
    if (!skus) { toast('That code didn\'t work'); return; }
    closeSheet(); render(); toast('Unlocked! Thank you 💛');
  };
}
actions.store = () => openStore();
actions.soon = () => toast('Checkout is coming soon — use a gift code for now 💛');

// ── Help packs ───────────────────────────────────────────────
actions.packs = () => {
  openSheet(`${head('🧰 Help packs')}
    ${['parent', 'kids', 'family'].map((k) => tile('pack', PACKS[k].emoji, PACKS[k].name, PACKS[k].tagline, !S.unlocked.has(k)).replace('data-action="pack"', `data-action="pack" data-k="${k}"`)).join('<div style="height:10px"></div>')}
    <br><button class="btn block" data-action="help-resources">🆘 Crisis & support lines (always free)</button>`);
};

actions.pack = ({ k }) => {
  const pack = PACKS[k];
  const owned = S.unlocked.has(k);
  openSheet(`${head(`${pack.emoji} ${pack.name}`)}
    <p class="muted">${pack.tagline}</p>
    ${owned ? '' : `<div class="card accent row"><div class="grow"><b>Unlock ${pack.name}</b><br><span class="small">One-time $${pack.price}</span></div>${buyButton(k, 'Buy')}</div><p class="small muted">Preview:</p>`}
    ${(owned ? pack.guides : pack.guides.slice(0, 1)).map((g) => `<div class="card"><h3>${esc(g.title)}</h3><p class="small">${esc(g.body)}</p></div>`).join('')}
    ${pack.questions.length ? `<h3>Conversation starters</h3>${(owned ? pack.questions : pack.questions.slice(0, 2)).map((q, i) => `
      <div class="card row"><div class="grow">${esc(q)}</div>${owned ? `<button class="btn sm" data-action="answer" data-qid="p:${k}:${i}">Answer</button>` : ''}</div>`).join('')}` : ''}
    ${owned ? '' : `<div class="empty small">🔒 ${pack.guides.length - 1} more guides and ${Math.max(0, pack.questions.length - 2)} more starters inside</div>`}`);
};

// ── Games ────────────────────────────────────────────────────
actions.games = () => {
  const g = S.unlocked.has('games');
  openSheet(`${head('🎲 Family games')}
    <p class="muted small">Pass the phone around the table, or play over a video call.</p>
    <div class="grid2">
      ${tile('game-knowme', '🧠', 'How well do you know…?', 'Quiz on real answers')}
      ${tile('game-wyr', '🤔', 'Would you rather', 'Family edition')}
      ${tile('game-trivia', '🌳', 'Family trivia', 'Built from your tree', !g)}
      ${tile('game-truths', '🤥', 'Two truths & a lie', 'Pass the phone', !g)}
      ${tile('game-chain', '🔗', 'Story chain', 'Write a story together', !g)}
    </div>
    ${g ? '' : `<div class="card accent row" style="margin-top:14px"><div class="grow"><b>Family Game Night</b><br><span class="small">Unlock 3 more games · $${PACKS.games.price}</span></div>${buyButton('games', 'Buy')}</div>`}`);
};

const needGames = () => { if (S.unlocked.has('games')) return true; closeSheet(); actions.pack({ k: 'games' }); return false; };

actions['game-knowme'] = () => {
  const eligible = S.people.filter((p) => S.posts.filter((x) => x.personId === p.id && x.type === 'answer' && x.text).length >= 2);
  if (!eligible.length) { toast('Answer a few more questions first — the quiz is built from real answers'); return; }
  const sheet = openSheet(`${head('🧠 How well do you know…')}
    <p>Pick someone. We'll show you their real questions — can you guess what they answered?</p>
    ${eligible.map((p) => `<button class="option row" data-p="${p.id}">${avatar(p, 'sm')} ${esc(p.name)}</button>`).join('')}`);
  $$('[data-p]', sheet).forEach((b) => b.onclick = () => { closeSheet(); playKnowMe(b.dataset.p); });
};

function playKnowMe(pid) {
  const answers = S.posts.filter((x) => x.personId === pid && x.type === 'answer' && x.text).sort(() => Math.random() - 0.5).slice(0, 5);
  const pool = S.posts.filter((x) => x.type === 'answer' && x.text);
  const fillers = ['Pizza, obviously 🍕', 'Something involving the dog', 'I plead the fifth 😅', 'Dancing in the kitchen', 'A road trip gone wrong', 'Ice cream for breakfast'];
  const short = (t) => (t.length > 110 ? `${t.slice(0, 107)}…` : t);
  let i = 0, score = 0;
  const sheet = openSheet(`${head(`🧠 ${esc(nameOf(pid))} quiz`)}<div id="g"></div>`);
  const step = () => {
    const g = $('#g', sheet);
    if (i >= answers.length) {
      g.innerHTML = `<div class="center stack"><div style="font-size:3rem">${score === answers.length ? '🏆' : score ? '🎉' : '😅'}</div><h2>${score} / ${answers.length}</h2>
        <p>${score === answers.length ? `You really know ${esc(nameOf(pid))}!` : 'Now you know a little more. Go ask them about it!'}</p>
        <button class="btn primary block" data-action="close">Done</button></div>`;
      return;
    }
    const a = answers[i];
    const wrong = pool.filter((x) => x.id !== a.id && x.text !== a.text).map((x) => short(x.text));
    const opts = [...new Set([...wrong.sort(() => Math.random() - 0.5), ...fillers])].slice(0, 3);
    const all = [...opts, short(a.text)].sort(() => Math.random() - 0.5);
    g.innerHTML = `<p class="small muted">Question ${i + 1} of ${answers.length} · Score ${score}</p>
      <div class="card accent"><b style="font-family:var(--serif);font-size:1.1rem">${esc(a.questionText)}</b></div>
      ${all.map((o) => `<button class="option" data-o="${esc(o)}">${esc(o)}</button>`).join('')}`;
    $$('[data-o]', g).forEach((b) => b.onclick = () => {
      const right = b.dataset.o === short(a.text);
      if (right) score++;
      $$('[data-o]', g).forEach((x) => { x.disabled = true; if (x.dataset.o === short(a.text)) x.classList.add('right'); });
      if (!right) b.classList.add('wrong');
      setTimeout(() => { i++; step(); }, 1300);
    });
  };
  step();
}

actions['game-wyr'] = () => {
  const deck = [...WOULD_YOU_RATHER].sort(() => Math.random() - 0.5);
  let i = 0;
  const votes = [0, 0];
  const sheet = openSheet(`${head('🤔 Would you rather…')}<div id="g"></div>`);
  const step = () => {
    const [a, b] = deck[i % deck.length];
    const total = votes[0] + votes[1];
    $('#g', sheet).innerHTML = `<p class="muted small center">Everyone taps their pick, then hit Next.</p>
      <div class="wyr"><button data-v="0">${esc(a)}</button><div class="or">— or —</div><button data-v="1">${esc(b)}</button></div>
      ${total ? `<div style="margin-top:14px"><div class="row spread small"><span>${votes[0]} votes</span><span>${votes[1]} votes</span></div><div class="bar"><i style="width:${(votes[0] / total) * 100}%"></i></div></div>` : ''}
      <button class="btn block" style="margin-top:14px" id="next">Next question →</button>`;
    $$('[data-v]', sheet).forEach((x) => x.onclick = () => { votes[+x.dataset.v]++; step(); });
    $('#next', sheet).onclick = () => { i++; votes[0] = votes[1] = 0; step(); };
  };
  step();
};

actions['game-trivia'] = () => {
  if (!needGames()) return;
  const withYear = S.people.filter((p) => p.birthYear);
  const qs = [];
  for (let k = 0; k < 20 && qs.length < 6; k++) {
    const [a, b] = [...withYear].sort(() => Math.random() - 0.5);
    if (a && b && a.birthYear !== b.birthYear) {
      const q = `Who was born first: ${a.name} or ${b.name}?`;
      if (!qs.some((x) => x.q === q)) qs.push({ q, opts: [a.name, b.name], right: +a.birthYear < +b.birthYear ? a.name : b.name });
    }
  }
  for (const p of S.people) {
    const ps = (p.parentIds || []).map(person).filter(Boolean);
    if (ps.length && qs.length < 10) {
      const wrong = S.people.filter((x) => !ps.includes(x) && x !== p).sort(() => Math.random() - 0.5).slice(0, 2).map((x) => x.name);
      qs.push({ q: `Who is ${p.name}'s parent?`, opts: [ps[0].name, ...wrong].sort(() => Math.random() - 0.5), right: ps[0].name });
    }
    if (p.hometown && qs.length < 12) {
      const wrong = [...new Set(S.people.filter((x) => x.hometown && x.hometown !== p.hometown).map((x) => x.hometown))].slice(0, 2);
      if (wrong.length) qs.push({ q: `Where did ${p.name} grow up?`, opts: [p.hometown, ...wrong].sort(() => Math.random() - 0.5), right: p.hometown });
    }
  }
  if (qs.length < 2) { toast('Add more family (with birth years & hometowns) to your tree to play'); return; }
  qs.sort(() => Math.random() - 0.5);
  let i = 0, score = 0;
  const sheet = openSheet(`${head('🌳 Family trivia')}<div id="g"></div>`);
  const step = () => {
    const g = $('#g', sheet);
    if (i >= qs.length) { g.innerHTML = `<div class="center"><div style="font-size:3rem">🏆</div><h2>${score} / ${qs.length}</h2><button class="btn primary" data-action="close">Done</button></div>`; return; }
    const q = qs[i];
    g.innerHTML = `<p class="small muted">${i + 1} / ${qs.length}</p><div class="card accent"><b>${esc(q.q)}</b></div>${q.opts.map((o) => `<button class="option" data-o="${esc(o)}">${esc(o)}</button>`).join('')}`;
    $$('[data-o]', g).forEach((b) => b.onclick = () => {
      if (b.dataset.o === q.right) score++; else b.classList.add('wrong');
      $$('[data-o]', g).forEach((x) => { x.disabled = true; if (x.dataset.o === q.right) x.classList.add('right'); });
      setTimeout(() => { i++; step(); }, 1100);
    });
  };
  step();
};

actions['game-truths'] = () => {
  if (!needGames()) return;
  const sheet = openSheet(`${head('🤥 Two truths & a lie')}
    <form id="tt" class="stack"><p>Write two true things about yourself and one lie. Then pass the phone!</p>
      ${[1, 2, 3].map((n) => `<div class="row"><input class="input" name="s${n}" placeholder="Statement ${n}" required><label class="chip"><input type="radio" name="lie" value="${n}" ${n === 3 ? 'checked' : ''}> lie</label></div>`).join('')}
      <button class="btn primary block">Ready — pass the phone</button></form><div id="g"></div>`);
  $('#tt', sheet).onsubmit = (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const items = [1, 2, 3].map((n) => ({ t: d[`s${n}`], lie: d.lie === String(n) })).sort(() => Math.random() - 0.5);
    e.target.remove();
    $('#g', sheet).innerHTML = `<p class="center"><b>Which one is the lie?</b></p>${items.map((x, i) => `<button class="option" data-i="${i}">${esc(x.t)}</button>`).join('')}`;
    $$('[data-i]', sheet).forEach((b) => b.onclick = () => {
      $$('[data-i]', sheet).forEach((x) => { x.disabled = true; x.classList.add(items[+x.dataset.i].lie ? 'wrong' : 'right'); });
      $('#g', sheet).insertAdjacentHTML('beforeend', `<p class="center"><b>${items[+b.dataset.i].lie ? 'You caught them! 🎉' : 'Fooled you! 😄'}</b></p><button class="btn block" data-action="game-truths-again">Next player</button>`);
    });
  };
};
actions['game-truths-again'] = () => { closeSheet(); actions['game-truths'](); };

actions['game-chain'] = () => {
  if (!needGames()) return;
  const lines = [STORY_STARTERS[Math.floor(Math.random() * STORY_STARTERS.length)]];
  const sheet = openSheet(`${head('🔗 Story chain')}<div id="g"></div>`);
  const step = () => {
    $('#g', sheet).innerHTML = `<p class="small muted">Each person adds a line, then passes the phone. Only the last line is shown — no peeking!</p>
      <div class="card accent"><i>…${esc(lines[lines.length - 1])}</i></div>
      <form class="stack"><textarea class="input" name="t" style="min-height:80px" placeholder="What happens next?" required></textarea>
      <div class="row"><button class="btn primary grow">Add & pass →</button><button type="button" class="btn" id="end">The end</button></div></form>
      <p class="small muted center">${lines.length} lines so far</p>`;
    $('form', sheet).onsubmit = (e) => { e.preventDefault(); lines.push(e.target.t.value.trim()); step(); };
    $('#end', sheet).onclick = async () => {
      const text = lines.join(' ');
      $('#g', sheet).innerHTML = `<div class="card"><h3>Our story</h3><p style="white-space:pre-wrap">${esc(text)}</p></div><button class="btn primary block" id="keep">Save to the family feed</button>`;
      $('#keep', sheet).onclick = async () => {
        await save('posts', { id: uid(), type: 'story', personId: S.meId, authorId: S.meId, title: 'Our family story chain', text, likes: [], comments: [], createdAt: Date.now() });
        closeAllSheets(); render(); toast('Saved 📝');
      };
    };
  };
  step();
};

// ── Startup ──────────────────────────────────────────────────
async function handleURL() {
  const params = new URLSearchParams(location.search);
  let changed = false;
  const gift = params.get('gift');
  if (gift) {
    const skus = await redeemCode(gift);
    if (skus) setTimeout(() => toast('🎁 Your family gave you Heartroots for free!'), 600);
    changed = true;
  }
  const paid = params.get('paid');
  if (paid) {
    const skus = paid === 'bundle' ? SKUS : SKUS.includes(paid) ? [paid] : [];
    if (skus.length) { await unlock(skus); setTimeout(() => toast('Thank you for your purchase 💛'), 600); }
    changed = true;
  }
  const ref = params.get('ref');
  if (ref) { await db.setKV('referredBy', ref); changed = true; }
  if (changed) history.replaceState(null, '', location.pathname);
}

(async function start() {
  await load();
  devicePrefs = { ...DEFAULT_PREFS, ...(await db.getKV('prefs', {})) };
  applyPrefs();
  await handleURL();
  await render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
