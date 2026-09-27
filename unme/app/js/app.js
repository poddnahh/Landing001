import { db, uid, exportBundle, importBundle, blobToDataURL } from './db.js';
import { CONFIG } from './config.js';
import {
  CATEGORIES, DAILY_QUESTIONS, LEGACY_INTERVIEW, LETTER_OCCASIONS, PACKS,
  WOULD_YOU_RATHER, STORY_STARTERS, STORY_PROMPTS, MOODS, RELATIONS, AVATAR_EMOJI,
} from './content.js';
import { PRODUCTS, SHOP_CATEGORIES, BUNDLE, product } from './catalog.js';

// ── State ─────────────────────────────────────────────────────
const S = {
  people: [], posts: [], moods: [], chats: [], messages: [], letters: [],
  meId: null, unlocked: new Set(), trialStart: null, tab: 'home',
};
const COLORS = ['#fbe3da', '#e1eee3', '#e3e7fb', '#fbf1d5', '#f3def5', '#d9f1f2', '#f1e0d0', '#e8e8e8'];
const SKUS = ['base', ...PRODUCTS.map((p) => p.id)];

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
  const face = p.photoId ? `<img alt="" data-media="${p.photoId}">` : esc(p.emoji || '🙂');
  return `<span class="avatar ${size} ${p.photoId ? 'photo' : ''}" style="--c:${esc(p.color || COLORS[0])}">${face}${p.passed ? '<span class="candle">🕯️</span>' : ''}</span>`;
}

// Pick a photo from the phone (or take one) and shrink it so it doesn't fill up storage.
function pickPhoto(maxSize = 1000) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input); // some phones only open the picker for inputs that are on the page
    input.onchange = () => {
      const f = input.files[0];
      input.remove();
      if (!f) { resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob((b) => resolve(b || f), 'image/jpeg', 0.86);
      };
      img.onerror = () => resolve(f);
      img.src = URL.createObjectURL(f);
    };
    input.click();
  });
}

async function storePhoto(blob) {
  const id = uid();
  await db.put('media', { id, blob, type: blob.type || 'image/jpeg' });
  return id;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const bdayText = (p) => { if (!p.birthday) return ''; const [, m, d] = p.birthday.split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };
// Days until the next birthday (0 = today), or null.
function daysToBirthday(p) {
  if (!p.birthday || p.passed) return null;
  const [, m, d] = p.birthday.split('-').map(Number);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - now) / 86400000);
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
    // Grid thumbnails show a frame from half a second in.
    const url = mediaCache.get(id) + ('thumb' in el.dataset ? '#t=0.5' : '');
    if (el.src !== url) el.src = url;
  }
}

function mediaTag(post) {
  if (!post.mediaId) return '';
  if (post.mediaType === 'video') return `<video controls playsinline preload="metadata" data-media="${post.mediaId}" data-thumb></video>`;
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
// '*' (from the family gift code) or the bundle unlock everything.
const owns = (sku) => S.unlocked.has(sku) || S.unlocked.has('*') || (sku !== 'base' && S.unlocked.has('bundle'));
const hasAccess = (sku) => owns(sku) || (sku === 'base' && trialDaysLeft() > 0);

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
  openStore('Your free week is over. Unlock UnMe for life to keep adding memories — everything you already saved stays yours to view and export.');
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
function openSheet(html, { full = false, onClose, cls = '' } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet ${full ? 'full' : ''} ${cls}" role="dialog" aria-modal="true">${full ? '' : '<div class="grab"></div>'}${html}</div>`;
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
actions.tab = async ({ tab }) => { closeAllSheets(); S.tab = tab; await render(); window.scrollTo(0, 0); };

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

// ── Icons (one consistent line-icon set) ─────────────────────
const ICONS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17.2" cy="8.8" r="2.8"/><path d="M16.8 14.6c2.6.2 4.4 1.9 4.9 5.4"/>',
  inbox: '<path d="M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H11l-5 4v-4H4.5A1.5 1.5 0 0 1 3 15.5V6a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8 10.5h8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
  heart: '<path d="M12 20.3s-8.3-5-8.3-11.1A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.3 2.6c0 6.1-8.3 11.1-8.3 11.1z"/>',
  comment: '<path d="M12 4c5 0 9 3.2 9 7.3s-4 7.2-9 7.2c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.6C4 15 3 13.3 3 11.3 3 7.2 7 4 12 4z"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
  share: '<path d="M13.5 5l7 7-7 7v-4.2c-5.2 0-8.4 1.6-10.5 5.2.8-5.4 3.8-10.2 10.5-11.2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  addUser: '<circle cx="10" cy="8" r="4"/><path d="M3 21c.8-4.2 3.5-6.5 7-6.5 1.6 0 3 .4 4.2 1.3M19 14v6M16 17h6"/>',
  pencil: '<path d="M4 20l1.2-4.2L16 5l3 3L8.2 18.8z"/><path d="M14 7l3 3"/>',
  bars: '<path d="M6 5v14M12 5v14M18 5v14"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  bag: '<path d="M5 8h14l-1.2 12.5a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  flip: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18.5 3v4h-4M5.5 21v-4h4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M9.5 2.5h5"/>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16.5-5-5-9.5 8.5"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  watch: '<rect x="3" y="5" width="18" height="15" rx="3.5"/><path d="M3 9.5h18M8 5l2.5 4.5M13.5 5 16 9.5"/><path d="M10.5 12.5v5l4-2.5z"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 9.5z"/><path d="M5 11.5V20h14v-8.5M10 20v-5h4v5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  messenger: '<path d="M12 3.5c4.9 0 8.5 3.5 8.5 7.9s-3.6 7.9-8.5 7.9c-.9 0-1.8-.1-2.6-.4L6 20.5v-3.1c-1.6-1.4-2.5-3.5-2.5-6 0-4.4 3.6-7.9 8.5-7.9z"/><path d="m7.5 13.5 3-3.2 2.2 2 3.8-2.8-3 3.3-2.2-2z"/>',
  cake: '<path d="M4 20.5h16M5 20.5v-6.5a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5v6.5"/><path d="M5 16c1.2 1 2.4 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0M12 12.5V9M12 6.5c-.8-.8-.8-1.8 0-3 .8 1.2.8 2.2 0 3z"/>',
  pin: '<path d="M12 21s-6.5-6.3-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.7 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  work: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18"/>',
  house: '<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const handle = (p) => `@${(p?.name || 'someone').toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

// ── Rendering ────────────────────────────────────────────────
let feedObserver = null;




async function render() {
  const app = $('#app');
  applyPrefs();
  if (!me()) { document.body.classList.remove('ui-dark'); renderWelcome(app); return; }
  const views = {
    home: viewHome, watch: viewWatch, family: viewFamily, shop: viewShop,
    alerts: viewAlerts, chats: viewChats, me: (root) => viewProfile(root, S.meId),
  };
  if (!views[S.tab]) S.tab = 'home';
  // Build the view off-screen first so the page never flashes blank while data loads.
  const view = document.createElement('main');
  view.id = 'view';
  const tab = S.tab;
  await views[tab](view);
  if (tab !== S.tab) return; // a newer render already took over
  feedObserver?.disconnect();
  const dark = tab === 'watch';
  document.body.classList.toggle('ui-dark', dark);
  app.classList.toggle('full-bleed', dark);
  app.innerHTML = '';
  app.appendChild(view);
  if (tab === 'family' && S.famTab === 'tree') requestAnimationFrame(drawTreeLines);
  renderTabbar();
  await hydrateMedia(app);
  if (dark) feedObserver = setupFeed(view);
}

// ── Badges ───────────────────────────────────────────────────
function alertsBadge() {
  const m = me();
  return m ? alertsFor(m.id).filter((a) => a.at > (S.alertsSeen || 0)).length : 0;
}
function chatsBadge() {
  const mine = new Set(S.chats.filter((c) => c.memberIds.includes(S.meId)).map((c) => c.id));
  return S.messages.filter((m) => mine.has(m.chatId) && m.personId !== S.meId && m.createdAt > (S.chatsSeen || 0)).length;
}
const badgeHTML = (n) => (n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : '');

// Floating bottom bar, Facebook style: icons with a highlighted pill for the active tab.
function renderTabbar() {
  let bar = $('.tabbar');
  if (!bar) { bar = document.createElement('nav'); bar.className = 'tabbar'; document.body.appendChild(bar); }
  const t = (id, ico, label, badge = 0) => `<button class="tab ${S.tab === id ? 'active' : ''}" data-action="tab" data-tab="${id}" aria-label="${label}">
    <span class="tab-ico">${id === 'me' ? avatar(me(), 'tabav') : icon(ico, S.tab === id ? 'fill-soft' : '')}${badgeHTML(badge)}</span><span class="tab-l">${label}</span></button>`;
  bar.innerHTML = `<div class="tabbar-inner">
    ${t('home', 'house', 'Home')}${t('watch', 'watch', 'Watch')}${t('family', 'users', 'Family')}
    <button class="tab plus" data-action="create" aria-label="Create"><span class="plus-btn">${icon('plus', 'bold')}</span></button>
    ${t('shop', 'store', 'Shop')}${t('alerts', 'bell', 'Alerts', alertsBadge())}${t('me', 'user', 'Me')}</div>`;
  hydrateMedia(bar);
}

// Page header: ☰-style title on the left, round buttons on the right.
function fbHead(title, buttons = '') {
  return `<header class="fbhead"><h1 class="fb-title">${title}</h1><div class="fb-btns">${buttons}</div></header>`;
}
const roundBtn = (action, ico, label, data = '', badge = 0) =>
  `<button class="roundbtn" data-action="${action}" ${data} aria-label="${label}">${icon(ico)}${badgeHTML(badge)}</button>`;
const chatBtn = () => roundBtn('tab', 'messenger', 'Chats', 'data-tab="chats"', chatsBadge());
const pills = (items, cur, action) => `<div class="pills">${items.map(([id, label]) =>
  `<button class="pill ${id === cur ? 'on' : ''}" data-action="${action}" data-v="${id}">${label}</button>`).join('')}</div>`;

// Old links (tiles, inbox rows) still say home-tab; map them onto the new tabs.
actions['home-tab'] = ({ t }) => { closeAllSheets(); S.tab = { shop: 'shop', today: 'home', foryou: 'watch' }[t] || 'home'; render(); window.scrollTo(0, 0); };
actions['go-shop'] = () => { closeAllSheets(); S.tab = 'shop'; render(); window.scrollTo(0, 0); };

// ── Story cards (tall, like Facebook) ────────────────────────
function storyCards() {
  const m = me();
  const withPosts = storyPeople();
  const bdays = S.people.filter((p) => p.id !== S.meId && daysToBirthday(p) != null && daysToBirthday(p) <= 1 && !withPosts.some((x) => x.p.id === p.id));
  const card = (p, post, unseen) => {
    const bg = !post ? `<div class="sc-bg" style="--tone:${BG[0]}"></div>`
      : post.mediaType === 'video' ? `<video class="sc-bg" muted playsinline preload="metadata" data-media="${post.mediaId}" data-thumb></video>`
        : post.mediaType === 'image' ? `<img class="sc-bg" alt="" data-media="${post.mediaId}">`
          : `<div class="sc-bg sc-text" style="--tone:${bgFor(post)}">${esc((post.text || post.title || post.questionText || '').slice(0, 70))}</div>`;
    const dtb = daysToBirthday(p);
    return `<button class="scard" data-action="${post ? 'view-stories' : 'person'}" data-id="${p.id}">${bg}
      <span class="sc-av ${unseen ? 'ring' : ''}">${avatar(p, 'sm')}</span>
      ${dtb === 0 ? '<span class="sc-badge">Birthday 🎂</span>' : dtb === 1 ? '<span class="sc-badge">Birthday tomorrow</span>' : ''}
      <b class="sc-name">${esc(p.name)}</b></button>`;
  };
  return `<div class="scards">
    <button class="scard create" data-action="create"><span class="sc-me">${avatar(m, 'xl')}</span><span class="sc-plus">${icon('plus', 'bold')}</span><b>Create story</b></button>
    ${withPosts.map(({ p, posts, unseen }) => card(p, posts[0], unseen)).join('')}
    ${bdays.map((p) => card(p, null, false)).join('')}
  </div>`;
}

// ── Home: Facebook-style feed ────────────────────────────────
async function viewHome(root) {
  const m = me();
  const qs = await todaysQuestions(m);
  const done = answeredIds(m.id);
  const lastMood = S.moods.filter((x) => x.personId === m.id).sort((a, b) => b.createdAt - a.createdAt)[0];
  const moodToday = lastMood && localDate(new Date(lastMood.createdAt)) === today();
  const helpAlerts = S.moods.filter((x) => x.needHelp && !x.resolved && x.personId !== m.id && !x.private);
  const myHelp = S.moods.find((x) => x.needHelp && !x.resolved && x.personId === m.id);
  const trial = !owns('base') ? trialDaysLeft() : null;
  const letters = S.letters.filter((l) => l.toId === m.id);
  const open = qs.filter((q) => !done.has(q.id));

  root.innerHTML = `${fbHead(`<span class="logo">UnMe</span>`, aaBtn() + roundBtn('create', 'plus', 'Create') + roundBtn('search', 'search', 'Search') + chatBtn())}
    <div class="fbcard composer-row">
      <button class="plain" data-action="tab" data-tab="me">${avatar(m)}</button>
      <button class="whats" data-action="create">Tell your family something…</button>
      <button class="iconbtn photo-ico" data-action="compose" data-kind="photo" aria-label="Photo">${icon('image')}</button>
    </div>
    ${storyCards()}

    ${helpAlerts.map((a) => `<div class="card alert">
      <div class="row">${avatar(person(a.personId))}<div class="grow"><b>${esc(nameOf(a.personId))} asked for help</b><br><span class="small">${esc(a.troubling || a.note || 'They could use someone right now.')}</span></div></div>
      <div class="row" style="margin-top:10px"><button class="btn sm primary" data-action="resolve-help" data-id="${a.id}">I'm on it 💛</button><button class="btn sm" data-action="open-chat-with" data-id="${a.personId}">Message</button></div></div>`).join('')}
    ${myHelp ? `<div class="card alert"><b>You asked for help.</b> Your family can see it. <a href="#" data-action="help-resources">See support lines</a></div>` : ''}
    ${trial !== null && trial <= 3 ? `<div class="card accent row"><div class="grow"><b>${trial > 0 ? `${trial} day${trial === 1 ? '' : 's'} left in your free week` : 'Your free week has ended'}</b><br><span class="small">Unlock for life — just $${CONFIG.basePrice}, one time.</span></div><button class="btn primary sm" data-action="store">Unlock</button></div>` : ''}

    ${open.map((q) => questionCard(q, false)).join('')}
    ${!open.length ? `<div class="card row"><span style="font-size:1.6rem">✅</span><div class="grow"><b>Today's questions are done!</b><div class="small muted">Your family will love reading them.</div></div><button class="btn sm" data-action="more-question">One more</button></div>` : ''}

    <div class="card">
      <div class="row spread" style="margin-bottom:8px"><b>How are you feeling${moodToday ? ' now' : ' today'}?</b>${lastMood ? `<span class="small muted">Last: ${MOODS.find((x) => x.key === lastMood.mood)?.emoji || ''} ${timeAgo(lastMood.createdAt)}</span>` : ''}</div>
      <div class="moods">${MOODS.map((x) => `<button class="mood" data-action="mood" data-mood="${x.key}">${x.emoji}<small>${x.short}</small></button>`).join('')}</div>
    </div>

    ${letters.length ? `<div class="card leaf row" data-action="letters-to-me" style="cursor:pointer"><span style="font-size:1.8rem">💌</span><div class="grow"><b>You have ${letters.length} letter${letters.length > 1 ? 's' : ''}</b><br><span class="small">Written just for you.</span></div><span>›</span></div>` : ''}

    <div class="shortcuts">
      ${[['tell-story', '🎬', 'Tell a story'], ['legacy', '🕯️', 'Legacy'], ['ask-family', '❓', 'Ask family'], ['write-letter', '💌', 'Letters'], ['games', '🎲', 'Games'], ['books', '📖', 'Memory books']]
        .map(([a, e, l]) => `<button data-action="${a}"><span>${e}</span>${l}</button>`).join('')}
    </div>

    <div class="section-title"><h2>From your family</h2><button class="btn sm" data-action="tab" data-tab="watch">▶ Watch all</button></div>
    ${S.posts.length ? S.posts.slice(0, 30).map(postCard).join('') : '<div class="empty"><span class="ico">🌱</span>Nothing yet. Tap “Tell your family something…” to share the first memory.</div>'}`;
}

// A Facebook-style post card.
function postCard(post) {
  const p = person(post.personId);
  const addedBy = post.authorId && post.authorId !== post.personId ? ` · added by ${esc(nameOf(post.authorId))}` : '';
  const mine = post.personId === S.meId || post.authorId === S.meId;
  const textOnly = !post.mediaType && post.bg;
  return `<article class="fbpost" id="fb-${post.id}">
    <header>${`<button class="plain" data-action="person" data-id="${post.personId}">${avatar(p)}</button>`}<div class="grow"><b data-action="person" data-id="${post.personId}" style="cursor:pointer">${esc(p?.name || 'Someone')}</b><div class="small muted">${timeAgo(post.createdAt)} · ${TYPE_LABEL[post.type] || ''}${addedBy}</div></div>
      ${mine ? `<button class="iconbtn" data-action="post-menu" data-id="${post.id}" aria-label="More">${icon('more')}</button>` : ''}</header>
    ${post.questionText ? `<div class="fb-q">“${esc(post.questionText)}”</div>` : ''}
    ${post.title && !textOnly ? `<h3 class="fb-title2">${esc(post.title)}</h3>` : ''}
    ${textOnly ? `<div class="fb-color" style="--tone:${post.bg}">${esc(post.text)}</div>` : post.text ? `<div class="fb-text">${esc(post.text)}</div>` : ''}
    ${post.mediaType ? `<div class="fb-media">${mediaTag(post)}</div>` : ''}
    ${recapHTML(post)}
    <div data-fbbar="${post.id}">${fbBar(post)}</div>
  </article>`;
}

function fbBar(post) {
  const liked = (post.likes || []).includes(S.meId);
  const nl = (post.likes || []).length, nc = (post.comments || []).length;
  return `<div class="fb-counts">${nl ? `<span>❤️ ${nl}</span>` : '<span></span>'}${nc ? `<button class="plain small muted" data-action="comments" data-id="${post.id}">${nc} comment${nc > 1 ? 's' : ''}</button>` : ''}</div>
    <div class="fb-actions">
      <button class="${liked ? 'liked' : ''}" data-action="like" data-id="${post.id}">${icon('heart', liked ? 'fill' : '')} Like</button>
      <button data-action="comments" data-id="${post.id}">${icon('comment')} Comment</button>
      <button data-action="share-post" data-id="${post.id}">${icon('share')} Share</button>
    </div>`;
}

// ── Watch: TikTok-style full-screen feed ─────────────────────
function viewWatch(root) {
  const posts = feedOrder();
  root.innerHTML = `<nav class="toptabs on-dark">${aaBtn()}<div class="tt-list"><button class="on">For You</button></div>${hbtn('search', 'search', 'Search')}</nav>
    <div class="feed" id="feed">${posts.length ? posts.map(slideHTML).join('') : `
      <section class="slide"><div class="slide-text" style="--tone:linear-gradient(160deg,#a8432d,#3b6446)"><div class="st-body">🌱<br>No memories yet.<br><small>Tap ＋ to record the first one.</small></div></div></section>`}</div>`;
}

// ── Alerts: Facebook-style notifications ─────────────────────
const ALERT_BADGE = {
  story: ['film', '#1877f2'], memory: ['image', '#1877f2'], comment: ['comment', '#2e9e52'], like: ['heart', '#e8264a'],
  answer: ['chat', '#a8432d'], ask: ['chat', '#e07b00'], help: ['bolt', '#b3261e'], birthday: ['cake', '#c2185b'], letter: ['inbox', '#3b6446'],
};

function alertsFor(pid) {
  const out = activityFor(pid).map((a) => ({ ...a, type: a.text.startsWith('liked') ? 'like' : a.text.startsWith('commented') ? 'comment' : 'answer', action: 'open-search-post', data: a.post }));
  const m = person(pid);
  for (const a of m?.askQueue || []) out.push({ at: a.at || Date.now(), who: a.fromId, text: `asked you: “${a.text}”`, type: 'ask', action: 'home-tab', data: 'today' });
  for (const post of S.posts) {
    if (post.personId === pid || Date.now() - post.createdAt > 3 * 86400000) continue;
    const text = post.mediaType === 'video' ? 'added a story with video you can watch.' : post.mediaType === 'audio' ? 'recorded a voice memory.' : post.questionText ? `answered “${post.questionText}”` : 'shared a new memory.';
    if (post.askedBy === pid) continue; // already listed as "answered your question"
    out.push({ at: post.createdAt, who: post.personId, text, type: post.mediaType === 'video' ? 'story' : 'memory', action: 'open-search-post', data: post.id });
  }
  for (const x of S.moods) if (x.needHelp && !x.resolved && x.personId !== pid && !x.private) out.push({ at: x.createdAt, who: x.personId, text: 'asked for help. Reach out now.', type: 'help', action: 'open-chat-with', data: x.personId });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  for (const p of S.people) {
    const d = daysToBirthday(p);
    if (p.id === pid || d == null || d > 7) continue;
    out.push({ at: midnight.getTime(), who: p.id, text: d === 0 ? 'has a birthday today! 🎂 Send a video.' : d === 1 ? 'has a birthday tomorrow.' : `has a birthday in ${d} days.`, type: 'birthday', action: 'video-to', data: p.id });
  }
  for (const l of S.letters) if (l.toId === pid && !isSealed(l)) out.push({ at: l.createdAt, who: l.fromId, text: 'wrote you a letter.', type: 'letter', action: 'letters-to-me', data: '' });
  return out.sort((a, b) => b.at - a.at);
}

function viewAlerts(root) {
  const all = alertsFor(S.meId);
  const seen = S.alertsSeen || 0;
  const row = (a) => {
    const [ic, color] = ALERT_BADGE[a.type] || ALERT_BADGE.memory;
    return `<button class="alert-row ${a.at > seen ? 'unread' : ''}" data-action="${a.action}" data-id="${a.data}" data-t="${a.data}">
      <span class="al-av">${avatar(person(a.who), 'lg')}<span class="al-badge" style="background:${color}">${icon(ic, 'fill-soft')}</span></span>
      <span class="grow"><b>${esc(nameOf(a.who))}</b> ${esc(a.text)} <span class="muted">${timeAgo(a.at)}</span></span></button>`;
  };
  const fresh = all.filter((a) => a.at > seen), earlier = all.filter((a) => a.at <= seen);
  root.innerHTML = `${fbHead('Alerts', roundBtn('search', 'search', 'Search') + chatBtn())}
    ${fresh.length ? `<h2 class="al-h">New</h2>${fresh.map(row).join('')}` : ''}
    ${earlier.length ? `<h2 class="al-h">Earlier</h2>${earlier.slice(0, 60).map(row).join('')}` : ''}
    ${all.length ? '' : '<div class="empty"><span class="ico">🔔</span>No alerts yet. When family posts, comments, asks you something or has a birthday, you\'ll see it here.</div>'}`;
  S.alertsSeen = Date.now();
  db.setKV(`alertsSeen:${S.meId}`, S.alertsSeen);
}

// Record a video message straight to someone (e.g. a birthday video).
actions['video-to'] = async ({ id }) => {
  const c = await chatWith(id);
  await actions['video-msg']({ id: c.id });
};

// ── Chats (Messenger) ────────────────────────────────────────
function viewChats(root) {
  const chats = S.chats.filter((c) => c.memberIds.includes(S.meId)).map((c) => {
    const msgs = S.messages.filter((x) => x.chatId === c.id).sort((a, b) => a.createdAt - b.createdAt);
    return { c, last: msgs[msgs.length - 1] };
  }).sort((a, b) => (b.last?.createdAt || b.c.createdAt) - (a.last?.createdAt || a.c.createdAt));
  const chatIds = new Set(chats.flatMap(({ c }) => c.memberIds));
  const noChat = S.people.filter((p) => !p.passed && p.id !== S.meId && !chatIds.has(p.id));
  const seen = S.chatsSeen || 0;
  root.innerHTML = `${fbHead('Chats', roundBtn('new-chat', 'pencil', 'New chat') + roundBtn('search', 'search', 'Search'))}
    ${storiesRow()}
    ${chats.map(({ c, last }) => {
      const others = c.memberIds.filter((id) => id !== S.meId);
      const title = c.name || others.map(nameOf).join(', ');
      const unread = last && last.personId !== S.meId && last.createdAt > seen;
      const sub = last ? `${last.personId === S.meId ? 'You' : esc(nameOf(last.personId))}${last.mediaId ? ' sent a video' : `: ${esc(last.text)}`} · ${timeAgo(last.createdAt)}` : 'Say hello 👋';
      return `<div class="listrow ${unread ? 'unread' : ''}">
        <button class="row grow plain" data-action="open-chat" data-id="${c.id}" style="min-width:0">${others.length > 1 ? '<span class="avatar">👨‍👩‍👧‍👦</span>' : avatar(person(others[0]))}<span class="grow" style="min-width:0"><b>${esc(title)}</b><span class="small muted clamp1" style="display:block">${sub}</span></span></button>
        <button class="iconbtn" data-action="video-msg" data-id="${c.id}" aria-label="Send a video message">${icon('camera')}</button></div>`;
    }).join('')}
    ${noChat.map((p) => `<button class="listrow" data-action="open-chat-with" data-id="${p.id}">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b><div class="small muted">Start a conversation</div></div><span class="btn sm">Say hi</span></button>`).join('')}
    ${S.people.length < 2 ? '<div class="empty">Add family in the Family tab to start chatting 💬</div>' : ''}`;
  S.chatsSeen = Date.now();
  db.setKV(`chatsSeen:${S.meId}`, S.chatsSeen);
}

// ── Family: Facebook "Friends" style ─────────────────────────
function viewFamily(root) {
  const tab = S.famTab || 'family';
  const others = S.people.filter((p) => p.id !== S.meId);
  let body = '';
  if (tab === 'family') {
    body = others.map((p) => `<div class="friend">
      <button class="plain" data-action="person" data-id="${p.id}">${avatar(p, 'xl')}</button>
      <div class="grow" style="min-width:0"><b class="clamp1" style="display:block;font-size:1.1rem">${esc(p.name)}</b>
        <div class="small muted clamp1">${esc([p.relation, p.livesIn || p.hometown, years(p)].filter(Boolean).join(' · '))}</div>
        <div class="row" style="margin-top:6px">${p.passed
          ? `<button class="btn sm primary grow" data-action="open-book" data-id="${p.id}">📖 Memory book</button><button class="btn sm grow" data-action="remember" data-id="${p.id}">🕯️ Remember</button>`
          : `<button class="btn sm primary grow" data-action="open-chat-with" data-id="${p.id}">Message</button><button class="btn sm grow" data-action="ask-family" data-to="${p.id}">Ask</button>`}</div></div></div>`).join('')
      || '<div class="empty">Add your family to get started 🌱<br><br><button class="btn primary" data-action="add-person">＋ Add family</button></div>';
  } else if (tab === 'birthdays') {
    const list = S.people.filter((p) => daysToBirthday(p) != null).sort((a, b) => daysToBirthday(a) - daysToBirthday(b));
    const noBday = S.people.filter((p) => !p.birthday && !p.passed);
    body = list.map((p) => {
      const d = daysToBirthday(p);
      const age = p.birthday ? new Date().getFullYear() + (d > 0 && new Date(new Date().getFullYear(), +p.birthday.slice(5, 7) - 1, +p.birthday.slice(8, 10)) < new Date() ? 1 : 0) - +p.birthday.slice(0, 4) : null;
      return `<div class="friend">${avatar(p, 'lg')}<div class="grow"><b>${esc(p.name)}</b>
        <div class="small ${d === 0 ? '' : 'muted'}">${d === 0 ? '🎂 <b>Birthday today!</b>' : d === 1 ? 'Tomorrow' : `In ${d} days`} · ${bdayText(p)}${age && age > 0 && age < 120 ? ` · turns ${age}` : ''}</div>
        ${p.id === S.meId ? '' : `<div class="row" style="margin-top:6px"><button class="btn sm primary grow" data-action="video-to" data-id="${p.id}">🎥 Birthday video</button><button class="btn sm grow" data-action="write-letter">💌 Letter</button></div>`}</div></div>`;
    }).join('') || '<div class="empty"><span class="ico">🎂</span>No birthdays yet.</div>';
    if (noBday.length) body += `<p class="small muted" style="margin-top:14px">Missing birthdays: ${noBday.map((p) => `<a href="#" data-action="edit-person" data-id="${p.id}">${esc(p.name)}</a>`).join(', ')}</p>`;
  } else if (tab === 'tree') {
    body = `<div class="row spread" style="margin:6px 0"><span class="small muted">Tap anyone to see their profile.</span><button class="btn sm primary" data-action="add-person">＋ Add</button></div>${treeHTML()}`;
  } else {
    body = S.people.map((p) => { const n = S.posts.filter((x) => x.personId === p.id).length; return `<button class="listrow" data-action="open-book" data-id="${p.id}">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b><div class="small muted">${n} memor${n === 1 ? 'y' : 'ies'}</div></div><span>›</span></button>`; }).join('');
  }
  root.innerHTML = `${fbHead('Family', roundBtn('add-person', 'plus', 'Add family') + roundBtn('search', 'search', 'Search') + chatBtn())}
    ${pills([['family', 'Your family'], ['birthdays', 'Birthdays'], ['tree', 'Family tree'], ['books', 'Memory books']], tab, 'fam-tab')}
    ${storyCards()}
    ${body}`;
}
actions['fam-tab'] = ({ v }) => { S.famTab = v; render(); };

// ── Shop: Facebook Marketplace style ─────────────────────────
const NEW_PRODUCTS = new Set(['budget', 'learn', 'teens', 'faith', 'organizer', 'together']);

function viewShop(root) {
  const cat = S.shopCat || 'all';
  const list = PRODUCTS.filter((p) => cat === 'all' || p.cat === cat);
  root.innerHTML = `${fbHead('Shop', roundBtn('orders', 'bag', 'Your orders') + roundBtn('search', 'search', 'Search'))}
    ${pills([['all', 'For you'], ...SHOP_CATEGORIES.filter((c) => c.id !== 'all').map((c) => [c.id, c.label])], cat, 'shop-cat')}
    ${owns('base') ? '' : `<button class="newrow" data-action="store"><span class="avatar lg" style="--c:#fbe3da">🌳</span><span class="grow"><b>UnMe Lifetime</b> — save your family's story forever. <span class="muted">$${CONFIG.basePrice} one time</span></span>${icon('more')}</button>`}
    ${cat === 'all' && !(owns('bundle') || owns('*')) ? `<button class="newrow" data-action="product" data-id="bundle"><span class="avatar lg" style="--c:#fde8c8">${BUNDLE.emoji}</span><span class="grow">The <b class="link">${BUNDLE.name}</b> — every pack for <b>$${BUNDLE.price}</b>.</span>${icon('more')}</button>` : ''}
    <div class="row spread" style="margin:14px 0 8px"><h2 style="margin:0">Today's picks</h2><span class="link small">One-time · keep forever</span></div>
    <div class="mgrid">${list.map((p) => `<button class="mtile" data-action="product" data-id="${p.id}">
      <span class="mimg" style="--pc:${p.color}"><span>${p.emoji}</span>${owns(p.id) ? '<em>✓ Owned</em>' : NEW_PRODUCTS.has(p.id) ? '<em>Just listed</em>' : ''}</span>
      <span class="mcap"><b>$${p.price}</b> · ${esc(p.name)}</span></button>`).join('')}</div>
    <p class="small muted center" style="margin:18px 0">Crisis and support lines are always free: <a href="#" data-action="help-resources">see them here</a>.</p>`;
}
actions['shop-cat'] = ({ v, c }) => { S.shopCat = v || c; render(); };

// ── Profile: Facebook header + TikTok grid ───────────────────
function viewProfile(root, pid) {
  const p = person(pid);
  const isMe = pid === S.meId;
  const tab = profileTab[pid] || 'all';
  const posts = tab === 'photos' ? profilePosts(pid, 'all').filter((x) => x.mediaType === 'image') : profilePosts(pid, tab);
  const key = `${pid}:${tab}`;
  gridLists[key] = posts;
  const likes = S.posts.filter((x) => x.personId === pid).reduce((n, x) => n + (x.likes || []).length, 0);
  const memories = S.posts.filter((x) => x.personId === pid).length;
  const fam = S.people.filter((x) => x.id !== pid);
  const letters = S.letters.filter((l) => l.fromId === pid || l.toId === pid);
  const info = [p.work && `${icon('work')}${esc(p.work)}`, p.livesIn && `${icon('pin')}${esc(p.livesIn)}`].filter(Boolean);
  const detail = (ic, label, val) => (val ? `<div class="pd-row">${icon(ic)}<span>${label ? `<span class="muted">${label}</span> ` : ''}${esc(val)}</span></div>` : '');
  const filters = [['all', 'All'], ['stories', 'Videos'], ['answers', 'Answers'], ['photos', 'Photos'], ...(isMe ? [['letters', 'Letters'], ['saved', 'Saved'], ['liked', 'Liked']] : [])];
  root.innerHTML = `<div class="profile fbprofile" data-profile="${pid}">
    <div class="cover" ${p.coverId ? '' : `style="--tone:${bgFor({ personId: pid })}"`}>
      ${p.coverId ? `<img alt="" data-media="${p.coverId}">` : ''}
      <div class="cover-top">
        ${isMe ? `<button class="roundbtn glass" data-action="profile-menu" aria-label="Menu">${icon('menu')}</button>` : `<button class="roundbtn glass" data-action="close" aria-label="Back">${icon('back')}</button>`}
        <span class="grow"></span>
        ${isMe ? `<button class="roundbtn glass aa" data-action="display" aria-label="Text size">Aa</button>` : ''}
        <button class="roundbtn glass" data-action="edit-person" data-id="${pid}" aria-label="Edit">${icon('pencil')}</button>
        <button class="roundbtn glass" data-action="search" aria-label="Search">${icon('search')}</button>
      </div>
      <button class="cover-cam" data-action="set-photo" data-id="${pid}" data-kind="cover" aria-label="Change cover photo">${icon('camera')}</button>
    </div>
    <div class="pf-avwrap"><button class="plain" data-action="set-photo" data-id="${pid}" data-kind="photo" aria-label="Change profile picture">${avatar(p, 'huge')}<span class="pf-cam">${icon('camera')}</span></button></div>
    <h1 class="pf-name">${esc(p.name)}${p.passed ? ' 🕯️' : ''}</h1>
    <div class="pf-stats"><b>${fmtCount(fam.length)}</b> family · <b>${fmtCount(memories)}</b> memories · <b>${fmtCount(likes)}</b> likes</div>
    ${info.length ? `<div class="pf-info">${info.join('<span class="dot">·</span>')}</div>` : ''}
    ${fam.length ? `<button class="pf-fam plain" data-action="tab" data-tab="family"><span class="stack-av">${fam.slice(0, 3).map((x) => avatar(x, 'sm')).join('')}</span>${fam.length} family member${fam.length > 1 ? 's' : ''}${p.relation && !isMe ? ` · ${esc(p.relation)}` : ''}</button>` : ''}
    <div class="pf-btns">${isMe
      ? `<button class="btn primary grow" data-action="open-book" data-id="${pid}">📖 Memory book</button><button class="btn gray grow" data-action="create">＋ Create</button>`
      : p.passed
        ? `<button class="btn primary grow" data-action="open-book" data-id="${pid}">📖 Memory book</button><button class="btn gray grow" data-action="remember" data-id="${pid}">🕯️ Share a memory</button>`
        : `<button class="btn primary grow" data-action="open-chat-with" data-id="${pid}">💬 Message</button><button class="btn gray grow" data-action="ask-family" data-to="${pid}">❓ Ask</button><button class="btn gray" data-action="profile-more" data-id="${pid}" aria-label="More">${icon('more')}</button>`}</div>
    ${pills(filters, tab, 'profile-filter').replace(/data-v="/g, `data-pid="${pid}" data-v="`)}
    ${tab === 'all' ? `
      <section class="pd">
        <div class="row spread"><h2>Personal details</h2><button class="iconbtn" data-action="edit-person" data-id="${pid}" aria-label="Edit details">${icon('pencil')}</button></div>
        ${detail('pin', 'Lives in', p.livesIn)}${detail('house', 'From', p.hometown)}${detail('cake', '', bdayText(p))}${detail('work', '', p.work)}
        ${p.passed ? detail('heart', 'In loving memory', years(p)) : ''}
        ${!p.livesIn && !p.hometown && !p.birthday && !p.work ? `<button class="link plain" data-action="edit-person" data-id="${pid}">＋ Add where ${isMe ? 'you live' : 'they live'}, hometown, birthday and work</button>` : ''}
      </section>
      <section class="pd">
        <div class="row spread"><h2>About</h2><button class="iconbtn" data-action="edit-about" data-id="${pid}" aria-label="Edit about">${icon('pencil')}</button></div>
        ${p.bio ? `<p style="white-space:pre-wrap;margin:0 0 8px">${esc(p.bio)}</p>` : `<button class="link plain" data-action="edit-about" data-id="${pid}">＋ ${isMe ? 'Tell your family about you' : `Add what you know about ${esc(p.name)}`}</button>`}
        ${(p.likes || []).length ? `<div class="chips" style="margin-top:6px">${p.likes.map((x) => `<span class="chip">💚 ${esc(x)}</span>`).join('')}</div>` : ''}
        ${(p.dislikes || []).length ? `<div class="chips" style="margin-top:6px">${p.dislikes.map((x) => `<span class="chip">🙅 ${esc(x)}</span>`).join('')}</div>` : ''}
      </section>
      <div class="row spread" style="margin:14px 0 6px"><h2 style="margin:0">Memories</h2><span class="small muted">${memories}</span></div>` : ''}
    ${tab === 'letters'
      ? (letters.map(letterHTML).join('') || '<div class="empty"><span class="ico">🔒</span>Letters you write or receive are kept here, private.</div>') + (isMe ? '<button class="btn block" data-action="write-letter">💌 Write a letter for later</button>' : '')
      : posts.length ? `<div class="pgrid">${posts.map((x) => thumbHTML(x, key)).join('')}</div>`
        : `<div class="empty"><span class="ico">🌱</span>${isMe ? 'Nothing here yet. Tap ＋ to share your first memory.' : `No memories yet. Ask ${esc(p.name)} a question to get started.`}</div>`}
  </div>`;
}

actions['profile-filter'] = ({ pid, v }) => {
  profileTab[pid] = v;
  const root = $(`[data-profile="${pid}"]`);
  if (root) { const parent = root.parentElement; viewProfile(parent, pid); hydrateMedia(parent); }
};

actions['profile-more'] = ({ id }) => {
  const p = person(id);
  openSheet(`${head(esc(p.name))}<div class="menu-list">
    <button data-action="tell-story" data-pid="${id}"><span>🎬</span>Record their story (Story time)</button>
    <button data-action="legacy" data-pid="${id}"><span>🕯️</span>Legacy interview</button>
    <button data-action="open-book" data-id="${id}"><span>📖</span>Memory book</button>
    <button data-action="video-to" data-id="${id}"><span>🎥</span>Send a video message</button>
    <button data-action="edit-person" data-id="${id}"><span>✏️</span>Edit details</button>
  </div>`);
};

// Change a profile picture or cover photo.
actions['set-photo'] = async ({ id, kind }) => {
  const blob = await pickPhoto(kind === 'cover' ? 1400 : 800);
  if (!blob) return;
  const p = person(id);
  const mid = await storePhoto(blob);
  if (kind === 'cover') p.coverId = mid; else p.photoId = mid;
  await save('people', p);
  toast(kind === 'cover' ? 'Cover photo updated 📷' : 'Profile picture updated 📷');
  const root = $(`[data-profile="${id}"]`);
  if (root && root.closest('.sheet')) { const parent = root.parentElement; viewProfile(parent, id); hydrateMedia(parent); }
  else render();
};

// Shared page header: [left] Title [right]
const pageHead = (left, title, right) =>
  `<header class="pagehead"><div class="ph-side">${left || ''}</div><h1 class="ph-title">${title}</h1><div class="ph-side right">${right || ''}</div></header>`;
const hbtn = (action, ico, label, data = '') => `<button class="iconbtn" data-action="${action}" ${data} aria-label="${label}">${icon(ico)}</button>`;
const aaBtn = () => '<button class="iconbtn aa" data-action="display" aria-label="Text size and display">Aa</button>';

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
    <div class="field"><span>Profile picture</span><div class="row"><span id="photo-prev">${p.photoId ? avatar(p, 'lg') : '<span class="avatar lg">📷</span>'}</span><button type="button" class="btn" data-photo-pick>📷 ${p.photoId ? 'Change photo' : 'Add a photo'}</button></div></div>
    <div class="field"><span>…or pick a fun avatar</span><div class="emoji-pick">${AVATAR_EMOJI.map((e) => `<button type="button" class="${e === emoji ? 'on' : ''}" data-pick="emoji" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="field"><span>Color</span><div class="color-pick">${COLORS.map((c) => `<button type="button" class="${c === color ? 'on' : ''}" style="background:${c}" data-pick="color" data-v="${c}" aria-label="color"></button>`).join('')}</div></div>
    <input type="hidden" name="emoji" value="${esc(emoji)}"><input type="hidden" name="color" value="${esc(color)}">
    <div class="row"><label class="field grow"><span>Born (year)</span><input class="input" name="birthYear" inputmode="numeric" value="${esc(p.birthYear || '')}" placeholder="1958"></label>
    <label class="field grow"><span>Birthday</span><input class="input" type="date" name="birthday" value="${esc(p.birthday || '')}"></label></div>
    <div class="row"><label class="field grow"><span>Lives in</span><input class="input" name="livesIn" value="${esc(p.livesIn || '')}" placeholder="Lafayette, Louisiana"></label>
    <label class="field grow"><span>From (hometown)</span><input class="input" name="hometown" value="${esc(p.hometown || '')}" placeholder="Franklin, Louisiana"></label></div>
    <label class="field"><span>Work / what you do</span><input class="input" name="work" value="${esc(p.work || '')}" placeholder="Retired welder, teacher, grandpa…"></label>`;
}

function wirePickers(root) {
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-photo-pick]')) {
      const blob = await pickPhoto(800);
      if (!blob) return;
      root._photo = blob;
      $('#photo-prev', root).innerHTML = `<span class="avatar lg photo"><img alt="" src="${URL.createObjectURL(blob)}"></span>`;
      return;
    }
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
      id: uid(), name: d.name.trim(), emoji: d.emoji, color: d.color, birthYear: d.birthYear || (d.birthday || '').slice(0, 4), hometown: d.hometown,
      livesIn: d.livesIn, work: d.work, birthday: d.birthday, photoId: sheet._photo ? await storePhoto(sheet._photo) : null,
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
    setTimeout(maybeDailyQuestion, 900);
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
  S.alertsSeen = await db.getKV(`alertsSeen:${id}`, 0);
  S.chatsSeen = await db.getKV(`chatsSeen:${id}`, 0);
  closeAllSheets(); S.tab = 'home'; S.homeTab = null; await render();
  setTimeout(maybeDailyQuestion, 400);
  window.scrollTo(0, 0);
  toast(`Hi ${nameOf(id)} 👋`);
};

// ── Home: Shop · Today · For You ─────────────────────────────



function questionCard(q, isDone) {
  const cat = CATEGORIES[q.category] || CATEGORIES.family;
  return `<div class="card qcard ${isDone ? 'done' : ''}">
    <div class="row spread"><span class="chip accent">${cat.emoji} ${q.fromId ? `${esc(nameOf(q.fromId))} asked you` : 'Question of the day'}</span>${isDone ? '<span class="chip leaf">✓ Answered</span>' : ''}</div>
    <div class="row" style="align-items:flex-start"><div class="qtext grow">${esc(q.text)}</div>${speakBtn(q.text)}</div>
    ${isDone ? '' : `<div class="row"><button class="btn primary grow" data-action="answer" data-qid="${q.id}">Answer</button>
      <button class="btn" data-action="answer" data-qid="${q.id}" data-rec="video" aria-label="Answer with video">🎥</button>
      <button class="btn" data-action="answer" data-qid="${q.id}" data-rec="audio" aria-label="Answer with voice">🎙️</button>
      ${q.fromId ? '' : `<button class="btn ghost sm" data-action="skip-q" data-qid="${q.id}">Skip</button>`}</div>`}
  </div>`;
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

// Every time the app opens: a question card pops up (once a day per person) until answered.
let dailyBusy = false;
async function maybeDailyQuestion() {
  const m = me();
  if (!m || !hasAccess('base') || $('.sheet-backdrop') || dailyBusy) return;
  dailyBusy = true;
  try { await showDailyQuestion(m); } finally { dailyBusy = false; }
}
async function showDailyQuestion(m) {
  const key = `qpop:${m.id}`;
  if ((await db.getKV(key, '')) === today()) return;
  const done = answeredIds(m.id);
  const q = (await todaysQuestions(m)).find((x) => !done.has(x.id));
  if (!q) return;
  await db.setKV(key, today());
  const cat = CATEGORIES[q.category] || CATEGORIES.family;
  openSheet(`${head('')}
    <div class="daily-pop">
      <span class="chip accent">${cat.emoji} ${q.fromId ? `${esc(nameOf(q.fromId))} asked you` : 'Your question for today'}</span>
      <div class="row" style="align-items:flex-start;margin:14px 0 18px"><div class="qtext grow" style="font-size:1.6rem">${esc(q.text)}</div>${speakBtn(q.text)}</div>
      <button class="btn primary block" data-action="answer" data-qid="${q.id}">✍️ Write my answer</button>
      <div class="row" style="margin-top:10px"><button class="btn grow" data-action="answer" data-qid="${q.id}" data-rec="video">🎥 Video</button><button class="btn grow" data-action="answer" data-qid="${q.id}" data-rec="audio">🎙️ Voice</button></div>
      <button class="btn ghost block" data-action="close" style="margin-top:6px">Maybe later</button>
    </div>`);
}

// ── For You: full-screen vertical video feed ─────────────────
function feedOrder() {
  const seen = (p) => (p.seenBy || []).includes(S.meId);
  return [...S.posts].sort((a, b) => (seen(a) - seen(b)) || (b.createdAt - a.createdAt));
}


const BG = ['linear-gradient(160deg,#a8432d,#6b2a1c)', 'linear-gradient(160deg,#3b6446,#1f3a28)', 'linear-gradient(160deg,#3d4db3,#1e2766)', 'linear-gradient(160deg,#8a5a1f,#4d3210)', 'linear-gradient(160deg,#7a4bb3,#3f2366)', 'linear-gradient(160deg,#1f7a6d,#0f413a)'];
const bgFor = (post) => post.bg || BG[[...(post.personId || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % BG.length];

function slideHTML(post) {
  const p = person(post.personId);
  let media;
  if (post.mediaType === 'video') media = `<video class="slide-video" playsinline loop muted preload="metadata" data-media="${post.mediaId}"></video><div class="tap-hint hidden">${icon('play')}</div>`;
  else if (post.mediaType === 'image') media = `<img class="slide-img" alt="" data-media="${post.mediaId}">`;
  else if (post.mediaType === 'audio') media = `<div class="slide-audio" style="--tone:${bgFor(post)}">${avatar(p, 'xl')}<div class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="small">🎙️ Voice memory · tap to play</div><audio preload="metadata" data-media="${post.mediaId}"></audio></div>`;
  else media = `<div class="slide-text" style="--tone:${bgFor(post)}">${post.questionText ? `<div class="st-q">${esc(post.questionText)}</div>` : ''}<div class="st-body">${esc(post.title && !post.text ? post.title : post.text || post.title || '')}</div></div>`;
  const isText = !post.mediaType;
  const addedBy = post.authorId && post.authorId !== post.personId ? ` · added by ${esc(nameOf(post.authorId))}` : '';
  return `<section class="slide" data-post="${post.id}">
    ${media}
    <div class="slide-cap">
      <button class="cap-name" data-action="person" data-id="${post.personId}">${esc(p?.name || 'Someone')}</button><span class="cap-meta"> · ${timeAgo(post.createdAt)}${addedBy}</span>
      ${!isText && (post.questionText || post.title) ? `<div class="cap-q">${esc(post.questionText || post.title)}</div>` : ''}
      ${!isText && post.text ? `<div class="cap-text">${esc(post.text)}</div>` : ''}
      ${post.recap || post.segments?.length ? `<button class="cap-chip" data-action="recap-sheet" data-id="${post.id}">✨ Story recap</button>` : ''}
    </div>
    <div class="rail" data-rail="${post.id}">${railHTML(post)}</div>
  </section>`;
}

const fmtCount = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n || 0));

function railHTML(post) {
  const p = person(post.personId);
  const liked = (post.likes || []).includes(S.meId);
  const saved = (post.saves || []).includes(S.meId);
  const mine = post.personId === S.meId || post.authorId === S.meId;
  return `<button class="rail-av" data-action="person" data-id="${post.personId}" aria-label="${esc(p?.name || '')}">${avatar(p)}</button>
    <button class="rail-btn ${liked ? 'liked' : ''}" data-action="like" data-id="${post.id}" aria-label="Like">${icon('heart', liked ? 'fill' : '')}<span>${fmtCount((post.likes || []).length)}</span></button>
    <button class="rail-btn" data-action="comments" data-id="${post.id}" aria-label="Comments">${icon('comment', 'fill')}<span>${fmtCount((post.comments || []).length)}</span></button>
    <button class="rail-btn ${saved ? 'saved' : ''}" data-action="bookmark" data-id="${post.id}" aria-label="Save">${icon('bookmark', 'fill')}<span>${fmtCount((post.saves || []).length)}</span></button>
    <button class="rail-btn" data-action="share-post" data-id="${post.id}" aria-label="Share">${icon('share', 'fill')}<span>Share</span></button>
    ${mine ? `<button class="rail-btn" data-action="post-menu" data-id="${post.id}" aria-label="More">${icon('more')}</button>` : ''}`;
}

function refreshRail(post) {
  $$(`[data-rail="${post.id}"]`).forEach((el) => { el.innerHTML = railHTML(post); hydrateMedia(el); });
  $$(`[data-fbbar="${post.id}"]`).forEach((el) => { el.innerHTML = fbBar(post); });
}

// Autoplay the slide in view, pause the rest, count views.
function setupFeed(root) {
  const feed = $('.feed', root);
  if (!feed) return null;
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const slide = e.target;
      const m = $('video, audio', slide);
      if (e.isIntersecting && e.intersectionRatio > 0.6) {
        if (m) { m.muted = m.tagName === 'VIDEO' ? !S.sound : false; if (m.tagName === 'VIDEO' || S.sound) m.play?.().catch(() => {}); }
        countView(slide.dataset.post);
      } else if (m) m.pause?.();
    }
  }, { root: feed, threshold: [0, 0.6, 1] });
  $$('.slide', feed).forEach((s) => obs.observe(s));
  feed.onclick = (e) => {
    if (e.target.closest('button, a, .rail')) return;
    const slide = e.target.closest('.slide');
    const m = slide && $('video, audio', slide);
    if (!m) return;
    if (!S.sound) { S.sound = true; m.muted = false; m.play?.(); toast('🔊 Sound on'); return; }
    if (m.paused) m.play?.(); else m.pause?.();
    $('.tap-hint', slide)?.classList.toggle('hidden', !m.paused);
  };
  return obs;
}

const viewed = new Set();
async function countView(id) {
  if (!id || viewed.has(id)) return;
  viewed.add(id);
  const post = S.posts.find((x) => x.id === id);
  if (!post) return;
  post.views = (post.views || 0) + 1;
  post.seenBy = [...new Set([...(post.seenBy || []), S.meId])];
  await save('posts', post);
}

// A feed you can open from anywhere (profile grid, search) starting at one post.
function openFeedViewer(posts, startId) {
  const sheet = openSheet(`<div class="feed-top">${hbtn('close', 'back', 'Back')}</div><div class="feed" id="vfeed">${posts.map(slideHTML).join('')}</div>`,
    { full: true, cls: 'feed-sheet', onClose: () => { obs?.disconnect(); S.tab === 'me' && render(); } });
  const start = $(`[data-post="${startId}"]`, sheet);
  if (start) $('#vfeed', sheet).scrollTop = start.offsetTop;
  const obs = setupFeed(sheet);
}

actions.like = async ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  const likes = new Set(post.likes || []);
  likes.has(S.meId) ? likes.delete(S.meId) : likes.add(S.meId);
  post.likes = [...likes];
  await save('posts', post);
  refreshRail(post);
};

actions.bookmark = async ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  const saves = new Set(post.saves || []);
  const on = !saves.has(S.meId);
  on ? saves.add(S.meId) : saves.delete(S.meId);
  post.saves = [...saves];
  await save('posts', post);
  refreshRail(post);
  toast(on ? 'Saved to your favorites 🔖' : 'Removed from favorites');
};

actions['share-post'] = async ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  const who = nameOf(post.personId);
  const words = post.recap?.summary || post.text || post.title || post.questionText || '';
  await shareLink(`${who} on ${CONFIG.appName}`, `${who} shared a memory on ${CONFIG.appName}: “${words.slice(0, 140)}”`, appURL({ gift: CONFIG.familyGiftCode, ref: me()?.name }));
};

actions.comments = ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  const sheet = openSheet(`${head(`${(post.comments || []).length} comments`)}<div id="clist"></div>
    <form class="composer-bar" id="cform">${avatar(me(), 'sm')}<input class="input" name="c" placeholder="Add a kind comment…" autocomplete="off"><button class="btn primary sm">Send</button></form>`);
  const paint = () => {
    $('.sheet-head h2', sheet).textContent = `${(post.comments || []).length} comments`;
    $('#clist', sheet).innerHTML = (post.comments || []).map((c) => `<div class="cmt">${avatar(person(c.personId), 'sm')}<div><div class="small muted"><b>${esc(nameOf(c.personId))}</b> · ${timeAgo(c.at)}</div>${esc(c.text)}</div></div>`).join('')
      || '<div class="empty">Be the first to say something kind 💛</div>';
    hydrateMedia(sheet);
  };
  paint();
  $('#cform', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const text = e.target.c.value.trim();
    if (!text) return;
    post.comments = [...(post.comments || []), { id: uid(), personId: S.meId, text, at: Date.now() }];
    await save('posts', post);
    e.target.c.value = '';
    paint();
    refreshRail(post);
  };
};

actions['recap-sheet'] = ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  openSheet(`${head(`✨ ${esc(post.title || 'Story recap')}`)}<article>${mediaTag(post)}${recapHTML(post)}</article>`);
};

actions['post-menu'] = ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  openSheet(`${head('Options')}
    <div class="stack">
      <button class="btn block" data-action="pin-post" data-id="${id}">📌 ${post.pinned ? 'Unpin from' : 'Pin to'} profile</button>
      <button class="btn block" data-action="edit-post" data-id="${id}">✏️ Edit text</button>
      ${['video', 'audio'].includes(post.mediaType) ? `<button class="btn block" data-action="edit-recap" data-id="${id}">✨ ${post.recap ? 'Edit' : 'Add'} story recap</button>` : ''}
      <button class="btn block danger" data-action="delete-post" data-id="${id}">🗑️ Delete this memory</button>
    </div>`);
};

actions['pin-post'] = async ({ id }) => {
  const post = S.posts.find((x) => x.id === id);
  post.pinned = !post.pinned;
  await save('posts', post);
  closeSheet();
  toast(post.pinned ? 'Pinned to profile 📌' : 'Unpinned');
  if (S.tab === 'me') render();
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
    await save('posts', post); closeAllSheets(); render();
  };
};

actions['delete-post'] = async ({ id }) => {
  if (!confirm('Delete this memory forever? This cannot be undone.')) return;
  const post = S.posts.find((x) => x.id === id);
  if (post?.mediaId) await db.del('media', post.mediaId);
  await remove('posts', id);
  closeAllSheets(); render(); toast('Deleted');
};

// ── Search ───────────────────────────────────────────────────
actions.search = () => {
  const sheet = openSheet(`${head('Search')}
    <div class="searchbar">${icon('search')}<input class="input" id="q" placeholder="Search memories, family, shop…" autocomplete="off"></div>
    <div id="results" style="margin-top:12px"></div>`, { full: true });
  const input = $('#q', sheet);
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { $('#results', sheet).innerHTML = '<p class="muted small">Try "Colorado", "recipe", "budget" or a name.</p>'; return; }
    const has = (...xs) => xs.some((x) => (x || '').toLowerCase().includes(q));
    const people = S.people.filter((p) => has(p.name, p.hometown, p.relation));
    const posts = S.posts.filter((p) => has(p.text, p.title, p.questionText, p.transcript, p.recap?.summary, p.recap?.moral));
    const prods = PRODUCTS.filter((p) => has(p.name, p.tagline, p.subtitle));
    $('#results', sheet).innerHTML = `
      ${people.length ? `<h3>Family</h3>${people.map((p) => `<button class="listrow" data-action="person" data-id="${p.id}">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(handle(p))}</div></div></button>`).join('')}` : ''}
      ${posts.length ? `<h3>Memories</h3>${posts.slice(0, 30).map((p) => `<button class="listrow" data-action="open-search-post" data-id="${p.id}">${avatar(person(p.personId))}<div class="grow"><b>${esc(p.questionText || p.title || TYPE_LABEL[p.type] || 'Memory')}</b><div class="small muted clamp2">${esc(p.text || p.recap?.summary || '')}</div></div></button>`).join('')}` : ''}
      ${prods.length ? `<h3>Shop</h3>${prods.map((p) => `<button class="listrow" data-action="product" data-id="${p.id}"><span class="avatar" style="--c:${p.color}22">${p.emoji}</span><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.tagline)}</div></div></button>`).join('')}` : ''}
      ${!people.length && !posts.length && !prods.length ? '<div class="empty">Nothing found.</div>' : ''}`;
  };
  input.oninput = paint;
  paint();
  setTimeout(() => input.focus(), 50);
};
actions['open-search-post'] = ({ id }) => openFeedViewer(S.posts, id);

const TYPE_LABEL = { answer: '💬 Answered', story: '📝 Story', video: '🎥 Video', voice: '🎙️ Voice memory', photo: '📷 Photo memory' };

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
  const text = product(m[1])?.questions?.[+m[2]];
  return text ? { id: qid, text, category: 'family' } : null;
}

// type: answer | story | video | voice | photo
function openComposer({ type, question, rec, personId = S.meId, prefill = '', title = '', media: initialMedia = null }) {
  const titles = { answer: 'Your answer', story: 'Write a story', video: 'New post', voice: 'New voice memory', photo: 'New photo memory' };
  let media = initialMedia; // { blob, kind }
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
    const ropts = { transcribe: true, segments, prompt: question?.text };
    const blob = await recordMedia(b.dataset.rec, ropts);
    if (blob) { media = { blob, kind: ropts.kindOut || b.dataset.rec }; showMedia(); }
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
    if (question) { post.questionId = question.id; post.questionText = question.text; post.category = question.category; if (question.fromId) post.askedBy = question.fromId; }
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

// ── Camera (TikTok-style) ────────────────────────────────────
// camera(opts) resolves to { blob, kind: 'video'|'audio'|'image', seconds, prompt } or
// { mode: 'text' | 'more' } or null. With opts.transcribe, live captions are written
// into opts.segments as [{ t: secondsFromStart, text }].
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function camera(opts = {}) {
  const segments = opts.segments || [];
  return new Promise((resolve) => {
    let kind = opts.kind || 'video';
    const allDurs = [{ s: 600, label: '10m' }, { s: 60, label: '60s' }, { s: 15, label: '15s' }];
    const durs = allDurs.filter((d) => !opts.maxSec || d.s <= opts.maxSec || opts.modes);
    let maxSec = opts.maxSec || 60;
    if (!durs.some((d) => d.s === maxSec)) durs.unshift({ s: maxSec, label: maxSec >= 60 ? `${Math.round(maxSec / 60)}m` : `${maxSec}s` });
    let photo = false, prompt = opts.prompt || '', useTimer = false, cc = opts.transcribe !== false && !!SpeechRec;
    let stream, recorder, chunks = [], timer, result = null, facing = 'user', sr = null, recording = false, t0 = 0, seconds = 0;

    const sheet = openSheet(`<div class="cam">
      <video class="cam-view mirror" id="live" playsinline muted autoplay></video>
      <div class="cam-voice hidden" id="voice">${avatar(me(), 'xl')}<div class="wave big"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="cam-review hidden" id="review"></div>
      <div class="cam-progress"><i id="prog"></i></div>
      <div class="cam-top">
        <button class="cam-btn" id="x" aria-label="Close">${icon('close')}</button>
        <button class="cam-pill" id="pp">${prompt ? '💬 Change question' : '💬 Add a question'}</button>
        <span class="cam-time" id="ctime"></span>
      </div>
      <div class="cam-rail" id="rail">
        <button class="cam-rb" id="flip">${icon('flip')}<span>Flip</span></button>
        <button class="cam-rb" id="tmr">${icon('timer')}<span>3s timer</span></button>
        ${SpeechRec && opts.transcribe !== false ? `<button class="cam-rb ${cc ? 'on' : ''}" id="ccb">${icon('cc')}<span>Captions</span></button>` : ''}
      </div>
      <div class="cam-prompt ${prompt ? '' : 'hidden'}" id="cprompt">${esc(prompt)}</div>
      <div class="cam-caption hidden" id="ccap"></div>
      <div class="cam-count hidden" id="cnt"></div>
      <div class="cam-status" id="cstatus"></div>
      <div class="cam-bottom" id="cbottom">
        <div class="cam-durs" id="durs">
          ${durs.map((d) => `<button data-dur="${d.s}" class="${d.s === maxSec ? 'on' : ''}">${d.label}</button>`).join('')}
          ${opts.modes ? '<button data-photo>PHOTO</button><button data-text>TEXT</button>' : ''}
        </div>
        <div class="cam-row">
          <label class="cam-upl" aria-label="Upload from phone">${icon('image')}<input type="file" hidden id="upl" accept="${opts.modes ? 'video/*,image/*,audio/*' : `${kind}/*`}"></label>
          <button class="cam-rec" id="rec" aria-label="Record" disabled></button>
          <span class="cam-upl" style="visibility:hidden"></span>
        </div>
        ${opts.modes ? `<div class="cam-modes" id="modes"><button data-mode="video" class="on">CAMERA</button><button data-mode="audio">VOICE</button><button data-mode="more">CREATE</button></div>` : ''}
      </div>
      <div class="cam-done hidden" id="done"><button class="btn" id="retake">↺ Retake</button><button class="btn primary" id="next">Next ›</button></div>
    </div>`, { full: true, cls: 'cam-sheet', onClose: () => { stopAll(); resolve(result); } });

    const $c = (s) => $(s, sheet);
    const live = $c('#live'), rec = $c('#rec'), status = $c('#cstatus'), caption = $c('#ccap');
    const setStatus = (t) => { status.textContent = t; status.classList.toggle('hidden', !t); };

    function stopStream() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }
    function stopAll() { stop(); stopStream(); }

    async function startStream() {
      stopStream();
      rec.disabled = true;
      $c('#voice').classList.toggle('hidden', kind !== 'audio');
      live.classList.toggle('hidden', kind === 'audio');
      $c('#flip').classList.toggle('hidden', kind === 'audio');
      try {
        stream = await navigator.mediaDevices.getUserMedia(kind === 'video'
          ? { video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true }
          : { audio: true });
        if (kind === 'video') { live.srcObject = stream; live.muted = true; live.classList.toggle('mirror', facing === 'user'); live.play?.(); }
        rec.disabled = false;
        setStatus('');
      } catch {
        setStatus('Camera or microphone is not available. You can upload a video instead ↙');
      }
    }

    function startCaptions() {
      if (!cc || !SpeechRec) return;
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
      sr.onerror = (e) => { if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) sr = null; };
      sr.onend = () => { if (recording && sr) { try { sr.start(); } catch { /* already running */ } } };
      try { sr.start(); } catch { sr = null; }
    }

    function stop() {
      clearInterval(timer);
      recording = false;
      try { sr?.stop(); } catch { /* ignore */ }
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    function showReview(blob, k) {
      result = { blob, kind: k, seconds, prompt };
      const url = URL.createObjectURL(blob);
      const rv = $c('#review');
      rv.innerHTML = k === 'video' ? `<video src="${url}" playsinline autoplay loop></video>`
        : k === 'image' ? `<img src="${url}" alt="">`
          : `<div class="cam-voice">${avatar(me(), 'xl')}<audio src="${url}" controls autoplay></audio></div>`;
      rv.classList.remove('hidden');
      const pv = $('video', rv);
      if (pv) pv.onclick = () => (pv.paused ? pv.play() : pv.pause()); // tap to pause/play
      live.classList.add('hidden');
      $c('#voice').classList.add('hidden');
      caption.classList.add('hidden');
      sheet.classList.add('reviewing');
      $c('#done').classList.remove('hidden');
      stopStream();
      setStatus(cc && segments.length ? `✓ ${segments.length} lines written down` : '');
    }

    function takePhoto() {
      const c = document.createElement('canvas');
      c.width = live.videoWidth || 720;
      c.height = live.videoHeight || 1280;
      const ctx = c.getContext('2d');
      if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(live, 0, 0, c.width, c.height);
      c.toBlob((b) => b && showReview(b, 'image'), 'image/jpeg', 0.9);
    }

    function startRecording() {
      chunks = [];
      segments.length = 0;
      const types = kind === 'video' ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = types.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
      try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); } catch { setStatus('Recording is not supported here — try uploading.'); return; }
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        rec.classList.remove('stop');
        sheet.classList.remove('recording');
        showReview(new Blob(chunks, { type: recorder.mimeType || mimeType || `${kind}/webm` }), kind);
      };
      recorder.start(1000);
      recording = true;
      rec.classList.add('stop');
      sheet.classList.add('recording');
      t0 = Date.now();
      startCaptions();
      timer = setInterval(() => {
        seconds = Math.floor((Date.now() - t0) / 1000);
        $c('#ctime').innerHTML = `<span class="rec-dot"></span>${fmtClock(seconds)}`;
        $c('#prog').style.width = `${Math.min(100, (seconds / maxSec) * 100)}%`;
        if (seconds >= maxSec) stop();
      }, 250);
    }

    rec.onclick = async () => {
      if (recording) { stop(); return; }
      if (useTimer) {
        const cnt = $c('#cnt');
        for (let n = 3; n > 0; n--) { cnt.textContent = n; cnt.classList.remove('hidden'); await new Promise((r) => setTimeout(r, 1000)); }
        cnt.classList.add('hidden');
      }
      if (photo) takePhoto(); else startRecording();
    };

    $$('[data-dur]', sheet).forEach((b) => b.onclick = () => {
      if (recording) return;
      photo = false; maxSec = +b.dataset.dur;
      $$('#durs button', sheet).forEach((x) => x.classList.toggle('on', x === b));
      rec.classList.remove('photo');
    });
    $('[data-photo]', sheet)?.addEventListener('click', (e) => {
      if (kind !== 'video') { kind = 'video'; syncModes(); startStream(); }
      photo = true;
      $$('#durs button', sheet).forEach((x) => x.classList.toggle('on', x === e.currentTarget));
      rec.classList.add('photo');
    });
    $('[data-text]', sheet)?.addEventListener('click', () => { result = { mode: 'text' }; closeSheet(); });
    const syncModes = () => $$('#modes button', sheet).forEach((x) => x.classList.toggle('on', x.dataset.mode === kind));
    $$('#modes button', sheet).forEach((b) => b.onclick = () => {
      if (recording) return;
      if (b.dataset.mode === 'more') { result = { mode: 'more' }; closeSheet(); return; }
      kind = b.dataset.mode; photo = false; rec.classList.remove('photo');
      if (kind === 'audio' && maxSec < 60) maxSec = 600;
      $$('#durs [data-dur]', sheet).forEach((x) => x.classList.toggle('on', +x.dataset.dur === maxSec));
      $$('[data-photo]', sheet).forEach((x) => x.classList.toggle('hidden', kind === 'audio'));
      syncModes(); startStream();
    });
    $c('#flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startStream(); };
    $c('#tmr').onclick = (e) => { useTimer = !useTimer; e.currentTarget.classList.toggle('on', useTimer); toast(useTimer ? '3-second timer on' : 'Timer off'); };
    $('#ccb', sheet)?.addEventListener('click', (e) => { cc = !cc; e.currentTarget.classList.toggle('on', cc); toast(cc ? 'Captions on — we\'ll write down what you say' : 'Captions off'); });
    $c('#pp').onclick = async () => {
      const picked = await pickPrompt();
      if (picked == null) return;
      prompt = picked;
      $c('#cprompt').textContent = prompt;
      $c('#cprompt').classList.toggle('hidden', !prompt);
      $c('#pp').textContent = prompt ? '💬 Change question' : '💬 Add a question';
    };
    $c('#x').onclick = () => {
      if (result?.blob && !confirm('Throw away this recording?')) return;
      result = null; closeSheet();
    };
    $c('#retake').onclick = () => {
      result = null; segments.length = 0; seconds = 0;
      $c('#review').classList.add('hidden'); $c('#review').innerHTML = '';
      $c('#done').classList.add('hidden');
      sheet.classList.remove('reviewing');
      $c('#prog').style.width = '0'; $c('#ctime').textContent = '';
      startStream();
    };
    $c('#next').onclick = () => closeSheet();
    $c('#upl').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      segments.length = 0;
      const k = f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'image';
      result = { blob: f, kind: k, seconds: 0, prompt };
      closeSheet();
    };
    startStream();
  });
}

// Pick a question/story prompt to show on screen while recording.
function pickPrompt() {
  return new Promise((resolve) => {
    let picked = null;
    const done = answeredIds(S.meId);
    const qs = DAILY_QUESTIONS.filter((q) => !done.has(q.id)).sort(() => Math.random() - 0.5).slice(0, 6).map((q) => q.text);
    const sheet = openSheet(`${head('Add a question')}
      <input class="input" id="own" placeholder="Or type your own…">
      <h3 style="margin-top:14px">Stories to tell</h3><div class="chips">${STORY_PROMPTS.map((p) => `<button class="chip" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <h3 style="margin-top:14px">Questions</h3>${qs.map((q) => `<button class="option" data-p="${esc(q)}">${esc(q)}</button>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn grow" id="none">No question</button><button class="btn primary grow" id="use">Use mine</button></div>`, { onClose: () => resolve(picked) });
    $$('[data-p]', sheet).forEach((b) => b.onclick = () => { picked = b.dataset.p; closeSheet(); });
    $('#none', sheet).onclick = () => { picked = ''; closeSheet(); };
    $('#use', sheet).onclick = () => { picked = $('#own', sheet).value.trim(); closeSheet(); };
  });
}

// Older call sites record one kind of media; returns just the blob.
async function recordMedia(kind, opts = {}) {
  const r = await camera({ ...opts, kind });
  if (!r?.blob) return null;
  opts.kindOut = r.kind;
  return r.blob;
}

// The ＋ button: open the camera, then send the result to the right editor.
actions.create = async () => {
  if (!guard()) return;
  const segments = [];
  const r = await camera({ modes: true, kind: 'video', maxSec: 60, transcribe: true, segments });
  if (!r) return;
  if (r.mode === 'text') { openTextPost(); return; }
  if (r.mode === 'more') { actions['create-menu'](); return; }
  const said = segments.map((s) => s.text).join(' ');
  if (r.kind !== 'image' && (r.seconds > 60 || segments.length >= 6)) {
    openRecapEditor({ id: uid(), type: 'story', personId: S.meId, authorId: S.meId, title: r.prompt, text: '', mediaType: r.kind, segments: [...segments], likes: [], comments: [], createdAt: Date.now() }, r.blob);
    return;
  }
  const type = r.kind === 'video' ? 'video' : r.kind === 'audio' ? 'voice' : 'photo';
  openComposer({ type, media: { blob: r.blob, kind: r.kind }, prefill: said, title: r.prompt });
};

// TEXT mode: a colorful text card, like a TikTok text post.
function openTextPost() {
  let bg = BG[0];
  const sheet = openSheet(`${head('Text post')}
    <form class="stack">
      <div class="text-card" id="tc" style="--tone:${bg}"><textarea name="text" placeholder="Share a thought, a memory, a saying you love…" maxlength="500"></textarea></div>
      <div class="swatches">${BG.map((g, i) => `<button type="button" data-bg="${i}" style="background:${g}" class="${i === 0 ? 'on' : ''}" aria-label="Background ${i + 1}"></button>`).join('')}</div>
      <label class="field"><span>Whose memory is this?</span><select class="input" name="personId">${peopleOptions(S.meId)}</select></label>
      <button class="btn primary block">Post</button>
    </form>`);
  $$('[data-bg]', sheet).forEach((b) => b.onclick = () => {
    bg = BG[+b.dataset.bg];
    $('#tc', sheet).style.setProperty('--tone', bg);
    $$('[data-bg]', sheet).forEach((x) => x.classList.toggle('on', x === b));
  });
  $('form', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (!d.text.trim()) { toast('Write something first'); return; }
    await save('posts', { id: uid(), type: 'story', personId: d.personId, authorId: S.meId, text: d.text.trim(), bg, likes: [], comments: [], createdAt: Date.now() });
    closeAllSheets(); S.tab = 'watch'; await render(); toast('Posted 💛');
  };
}

actions['create-menu'] = () => {
  openSheet(`${head('Create')}
    <button class="tile" data-action="tell-story" style="width:100%;margin-bottom:10px;min-height:0"><span class="row"><span class="ico">🎬</span><b>Tell a story</b></span><small>Selfie video or voice, up to 10 min — we write down the highlights, the moral and the punchlines</small></button>
    <div class="grid2">
      ${tile('compose', '📝', 'Write a story', 'A moment worth keeping').replace('data-action="compose"', 'data-action="compose" data-kind="story"')}
      ${tile('compose', '📷', 'Photo memory', 'The story behind a picture').replace('data-action="compose"', 'data-action="compose" data-kind="photo"')}
      ${tile('browse-questions', '💬', 'Pick a question', 'Browse every question')}
      ${tile('write-letter', '💌', 'Letter for later', 'Sealed for a future day')}
      ${tile('legacy', '🕯️', 'Legacy interview', 'Your life story')}
      ${tile('ask-family', '❓', 'Ask family', 'Send a question')}
    </div>`);
};

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
    const ropts = { transcribe: true, segments, prompt: prompt || 'Tell us a story…', maxSec: 600 };
    const blob = await recordMedia(kind, ropts);
    if (!blob) return;
    closeAllSheets();
    if (ropts.kindOut === 'image') { openComposer({ type: 'photo', media: { blob, kind: 'image' }, personId, title: prompt }); return; }
    const post = {
      id: uid(), type: 'story', personId, authorId: S.meId, title: prompt, text: '',
      mediaType: ropts.kindOut || kind, segments: [...segments], likes: [], comments: [], createdAt: Date.now(),
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

// ── Stories row (Family & Inbox) ─────────────────────────────
const WEEK = 7 * 86400000;
function storyPeople() {
  const recent = (pid) => S.posts.filter((x) => x.personId === pid && Date.now() - x.createdAt < WEEK);
  return S.people
    .map((p) => ({ p, posts: recent(p.id), unseen: recent(p.id).some((x) => !(x.seenBy || []).includes(S.meId)) }))
    .filter((x) => x.posts.length && x.p.id !== S.meId)
    .sort((a, b) => (b.unseen - a.unseen) || (b.posts[0].createdAt - a.posts[0].createdAt));
}

function storiesRow() {
  const m = me();
  return `<div class="stories">
    <button class="story" data-action="create"><span class="story-ring none">${avatar(m, 'st')}<span class="story-plus">${icon('plus', 'bold')}</span></span><span class="story-name">Create</span></button>
    ${storyPeople().map(({ p, unseen }) => `<button class="story" data-action="view-stories" data-id="${p.id}"><span class="story-ring ${unseen ? '' : 'seen'}">${avatar(p, 'st')}</span><span class="story-name">${esc(p.name)}</span></button>`).join('')}
    ${storyPeople().length ? '' : '<div class="story-empty small muted">When family posts, their stories show up here.</div>'}
  </div>`;
}

// Full-screen stories: tap right for next, left for back.
actions['view-stories'] = ({ id }) => {
  const p = person(id);
  const posts = S.posts.filter((x) => x.personId === id && Date.now() - x.createdAt < WEEK).sort((a, b) => a.createdAt - b.createdAt);
  if (!posts.length) { actions.person({ id }); return; }
  let i = Math.max(0, posts.findIndex((x) => !(x.seenBy || []).includes(S.meId)));
  let timer = null;
  const sheet = openSheet(`<div class="sv">
    <div class="sv-bars">${posts.map(() => '<span><i></i></span>').join('')}</div>
    <div class="sv-head">${avatar(p, 'sm')}<b>${esc(p.name)}</b><span class="sv-time"></span><span class="grow"></span><button class="cam-btn" data-action="close" aria-label="Close">${icon('close')}</button></div>
    <div class="sv-body"></div>
    <div class="sv-tap left"></div><div class="sv-tap right"></div>
    <form class="sv-reply"><input class="input" name="t" placeholder="Send ${esc(p.name)} a message…" autocomplete="off"><button class="btn primary sm">Send</button></form>
  </div>`, { full: true, cls: 'cam-sheet', onClose: () => { clearTimeout(timer); if (['family', 'chats', 'home'].includes(S.tab)) render(); } });
  const show = () => {
    clearTimeout(timer);
    const post = posts[i];
    countView(post.id);
    $$('.sv-bars span', sheet).forEach((b, k) => { b.className = k < i ? 'done' : k === i ? 'now' : ''; });
    $('.sv-time', sheet).textContent = timeAgo(post.createdAt);
    const body = $('.sv-body', sheet);
    body.innerHTML = post.mediaType === 'video' ? `<video playsinline autoplay data-media="${post.mediaId}"></video>`
      : post.mediaType === 'image' ? `<img alt="" data-media="${post.mediaId}">`
        : post.mediaType === 'audio' ? `<div class="slide-audio" style="--tone:${bgFor(post)}">${avatar(p, 'xl')}<audio autoplay controls data-media="${post.mediaId}"></audio></div>`
          : `<div class="slide-text" style="--tone:${bgFor(post)}">${post.questionText ? `<div class="st-q">${esc(post.questionText)}</div>` : ''}<div class="st-body">${esc(post.text || post.title)}</div></div>`;
    if (post.mediaType && (post.questionText || post.title || post.text)) body.insertAdjacentHTML('beforeend', `<div class="sv-cap">${esc(post.questionText || post.title || '')}${post.text ? `<br><small>${esc(post.text.slice(0, 160))}</small>` : ''}</div>`);
    hydrateMedia(body);
    const m = $('video, audio', body);
    const bar = $('.sv-bars .now i', sheet);
    if (m) {
      m.onended = next;
      m.ontimeupdate = () => { if (m.duration) bar.style.width = `${(m.currentTime / m.duration) * 100}%`; };
    } else {
      bar.style.transition = 'width 6s linear';
      requestAnimationFrame(() => { bar.style.width = '100%'; });
      timer = setTimeout(next, 6000);
    }
  };
  const next = () => { if (i < posts.length - 1) { i++; show(); } else closeSheet(); };
  $('.sv-tap.right', sheet).onclick = next;
  $('.sv-tap.left', sheet).onclick = () => { if (i > 0) { i--; show(); } };
  $('.sv-reply', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (!t) return;
    const c = await chatWith(id);
    await save('messages', { id: uid(), chatId: c.id, personId: S.meId, text: `Replying to your story: ${t}`, createdAt: Date.now() });
    e.target.t.value = '';
    toast('Sent 💬');
  };
  show();
};

// ── Family tab ───────────────────────────────────────────────

// ── Inbox ────────────────────────────────────────────────────
// Things that happened to me: likes and comments on my memories, answers to my questions.
function activityFor(pid) {
  const out = [];
  for (const post of S.posts) {
    const mine = post.personId === pid || post.authorId === pid;
    if (mine) {
      for (const c of post.comments || []) if (c.personId !== pid) out.push({ at: c.at, who: c.personId, text: `commented: “${c.text}”`, post: post.id });
      for (const l of post.likes || []) if (l !== pid) out.push({ at: post.createdAt, who: l, text: 'liked your memory', post: post.id });
    }
    if (post.askedBy === pid && post.personId !== pid) out.push({ at: post.createdAt, who: post.personId, text: `answered your question: “${post.questionText}”`, post: post.id });
  }
  return out.sort((a, b) => b.at - a.at);
}


actions.activity = () => {
  const acts = activityFor(S.meId);
  openSheet(`${head('Activity')}
    ${acts.map((a) => `<button class="listrow" data-action="open-search-post" data-id="${a.post}">${avatar(person(a.who))}<div class="grow"><b>${esc(nameOf(a.who))}</b> <span>${esc(a.text)}</span><div class="small muted">${timeAgo(a.at)}</div></div></button>`).join('')
      || '<div class="empty"><span class="ico">⚡</span>Nothing yet. When family likes or comments on your memories, you\'ll see it here.</div>'}`);
};

async function chatWith(id) {
  let c = S.chats.find((x) => x.memberIds.length === 2 && x.memberIds.includes(id) && x.memberIds.includes(S.meId));
  if (!c) { c = { id: uid(), name: '', memberIds: [S.meId, id], createdAt: Date.now() }; await save('chats', c); }
  return c;
}

actions['video-msg'] = async ({ id }) => {
  if (!guard()) return;
  const blob = await recordMedia('video', { maxSec: 60, title: 'Video message' });
  if (!blob) return;
  const mid = uid();
  await db.put('media', { id: mid, blob, type: blob.type });
  await save('messages', { id: uid(), chatId: id, personId: S.meId, text: '', mediaId: mid, mediaType: 'video', createdAt: Date.now() });
  toast('Video message sent 🎥');
  if (S.tab === 'chats') render();
};

// ── Chat ─────────────────────────────────────────────────────

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
    <form class="composer-bar"><button type="button" class="iconbtn" id="vm" aria-label="Send a video message">${icon('camera')}</button><input class="input" name="t" placeholder="Message…" autocomplete="off"><button class="btn primary">Send</button></form>`, { full: true, onClose: () => S.tab === 'chats' && render() });
  const paint = () => {
    const msgs = S.messages.filter((m) => m.chatId === id).sort((a, b) => a.createdAt - b.createdAt);
    $('#msgs', sheet).innerHTML = msgs.map((m) => `<div class="msg ${m.personId === S.meId ? 'mine' : ''}">${m.personId === S.meId ? '' : `<span class="from">${esc(nameOf(m.personId))}</span>`}${m.mediaId ? `<video controls playsinline preload="metadata" data-media="${m.mediaId}" class="msg-video"></video>` : ''}${esc(m.text)}</div>`).join('')
      || '<div class="empty">Start the conversation 👋</div>';
    hydrateMedia(sheet);
    sheet.scrollTop = sheet.scrollHeight;
  };
  paint();
  $('#vm', sheet).onclick = async () => { await actions['video-msg']({ id }); paint(); };
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

function treeHTML() {
  const { rows, loose } = layoutTree();
  const node = (p) => `<div class="node ${p.id === S.meId ? 'me' : ''}" data-action="person" data-id="${p.id}" data-node="${p.id}">
    ${avatar(p)}<div class="nm">${esc(p.name)}</div><div class="yr">${esc(p.relation && p.relation !== 'Me' ? p.relation : years(p))}</div></div>`;
  return `<div class="tree-wrap"><div class="tree" id="tree">
      <svg id="tree-lines"></svg>
      ${rows.map((row) => `<div class="tree-row">${row.map(node).join('')}</div>`).join('')}
    </div></div>
    ${loose.length ? `<p class="small muted">Not connected yet — edit them to set parents or partner:</p><div class="row wrap">${loose.map(node).join('')}</div>` : ''}
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
window.addEventListener('resize', () => S.tab === 'family' && drawTreeLines());

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
      name: d.name.trim(), emoji: d.emoji, color: d.color, birthYear: d.birthYear || (d.birthday || '').slice(0, 4), hometown: d.hometown,
      livesIn: d.livesIn, work: d.work, birthday: d.birthday,
      relation: d.relation, parentIds: [d.parent1, d.parent2].filter(Boolean), spouseId: d.spouseId || null,
      passed: !!d.passed, deathYear: d.deathYear || '', profile: p.id === S.meId ? true : !!d.profile,
    });
    if (sheet._photo) p.photoId = await storePhoto(sheet._photo);
    const changed = isNew ? applyAutoLinks(p, d.relation) : [];
    if (oldSpouse && oldSpouse !== p.spouseId && person(oldSpouse)?.spouseId === p.id) { person(oldSpouse).spouseId = null; changed.push(person(oldSpouse)); }
    if (p.spouseId && person(p.spouseId) && person(p.spouseId).spouseId !== p.id) { person(p.spouseId).spouseId = p.id; changed.push(person(p.spouseId)); }
    await save('people', p);
    for (const c of changed) await save('people', c);
    closeAllSheets(); S.tab = 'family'; await render();
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

// ── Profile (me, or anyone in the family) ────────────────────
const gridLists = {};
const profileTab = {};

function profilePosts(pid, tab) {
  const byPerson = S.posts.filter((x) => x.personId === pid);
  const order = (list) => [...list].sort((a, b) => (!!b.pinned - !!a.pinned) || (b.createdAt - a.createdAt));
  if (tab === 'stories') return order(byPerson.filter((x) => x.mediaType === 'video' || x.mediaType === 'audio' || x.recap));
  if (tab === 'answers') return order(byPerson.filter((x) => x.type === 'answer'));
  if (tab === 'saved') return order(S.posts.filter((x) => (x.saves || []).includes(pid)));
  if (tab === 'liked') return order(S.posts.filter((x) => (x.likes || []).includes(pid)));
  return order(byPerson);
}

function thumbHTML(post, key) {
  const inner = post.mediaType === 'video' ? `<video muted playsinline preload="metadata" data-media="${post.mediaId}" data-thumb></video>`
    : post.mediaType === 'image' ? `<img alt="" data-media="${post.mediaId}">`
      : post.mediaType === 'audio' ? `<div class="gt-text" style="--tone:${bgFor(post)}"><span style="font-size:2rem">🎙️</span><span>${esc(post.title || post.questionText || 'Voice memory')}</span></div>`
        : `<div class="gt-text" style="--tone:${bgFor(post)}"><span>${esc((post.questionText ? `${post.questionText} — ` : '') + (post.text || post.title || '')).slice(0, 90)}</span></div>`;
  return `<button class="gtile" data-action="open-grid" data-key="${key}" data-id="${post.id}">${inner}
    ${post.pinned ? '<span class="pinned">Pinned</span>' : ''}
    ${post.questionText && post.mediaType ? `<span class="gt-title">${esc(post.questionText)}</span>` : ''}
    <span class="views">${icon('play')}${fmtCount(post.views || 0)}</span></button>`;
}

actions['open-grid'] = ({ key, id }) => openFeedViewer(gridLists[key] || S.posts, id);
actions['profile-tab'] = ({ pid, t }) => {
  profileTab[pid] = t;
  const root = $(`[data-profile="${pid}"]`);
  if (root) { viewProfile(root.parentElement, pid); hydrateMedia(root.parentElement); }
};


// Opening someone from anywhere shows their profile full-screen.
actions.person = ({ id }) => {
  if (id === S.meId) { closeAllSheets(); S.tab = 'me'; render(); return; }
  const sheet = openSheet('<div id="psheet"></div>', { full: true, cls: 'profile-sheet' });
  viewProfile($('#psheet', sheet), id);
  hydrateMedia(sheet);
};

actions['profile-menu'] = () => {
  const owned = SKUS.filter((s) => owns(s));
  openSheet(`${head('Settings')}
    <div class="card small" style="margin-bottom:12px"><b>${owns('base') ? 'Lifetime member 💛' : trialDaysLeft() > 0 ? `Free trial · ${trialDaysLeft()} days left` : 'Trial ended'}</b><br>
      <span class="muted">${owned.length ? `${owned.length} item${owned.length > 1 ? 's' : ''} unlocked` : 'Viewing & exporting memories is always free.'}</span></div>
    <div class="menu-list">
      <button data-action="display"><span>Aa</span>Text size & display</button>
      <button data-action="store"><span>🛍️</span>Store & unlock codes</button>
      <button data-action="orders"><span>📦</span>Your orders</button>
      <button data-action="share"><span>📤</span>Share with family & friends</button>
      <button data-action="backup"><span>💾</span>Backup & share family file</button>
      <button data-action="books"><span>📖</span>Memory books</button>
      <button data-action="switch-profile"><span>👥</span>Switch / add profile</button>
      <button data-action="install-help"><span>📲</span>Install on your phone</button>
      <button data-action="help-resources"><span>🆘</span>Support lines</button>
    </div>
    <p class="small muted center" style="margin-top:14px">Your memories are stored privately on this device. Nothing is uploaded.</p>`);
};



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
  const file = new File([JSON.stringify(bundle)], `unme-family-${today()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && confirm('Share the family file now (Messages, Email, Drive…)? Cancel to just download it.')) {
    try { await navigator.share({ files: [file], title: 'Our UnMe family file' }); return; } catch { /* fall through */ }
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
  openSheet(`${head('📤 Share UnMe')}
    ${CONFIG.familyGiftCode ? `<div class="card leaf"><b>🎁 Free for your family</b><p class="small">Send this link to family and close friends. It unlocks everything for free.</p>
      <button class="btn leaf block" data-action="share-family">Send free family link</button></div>` : ''}
    <div class="card"><b>💛 Tell your friends</b><p class="small">Know someone who'd want to keep their family's stories? Send them UnMe — it's just $${CONFIG.basePrice}, once.</p>
      <button class="btn primary block" data-action="share-friends">Recommend to a friend</button>
      <div class="row" style="margin-top:10px">
        <a class="btn sm grow" href="sms:?&body=${encodeURIComponent(`I've been using UnMe to save our family's stories. You'd love it: ${landingURL({ ref: name })}`)}">💬 Text</a>
        <a class="btn sm grow" href="mailto:?subject=${encodeURIComponent('Save your family\'s stories')}&body=${encodeURIComponent(`I've been using UnMe to save our family's stories — questions every day, videos, a family tree and memory books. ${landingURL({ ref: name })}`)}">✉️ Email</a>
        <a class="btn sm grow" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(landingURL({ ref: name }))}">📘 Facebook</a>
      </div></div>`);
};
actions['share-family'] = () => shareLink('Join our family on UnMe',
  `${me()?.name || 'I'} invited you to our family on UnMe — your access is free 💛`, appURL({ gift: CONFIG.familyGiftCode, ref: me()?.name }));
actions['share-friends'] = () => shareLink('UnMe', 'Save your family\'s stories before they\'re lost — I love this app:', landingURL({ ref: me()?.name }));

// ── Store & Marketplace ──────────────────────────────────────
function buyButton(sku, label, cls = 'sm') {
  if (owns(sku)) return '<span class="owned">✓ Owned</span>';
  const link = CONFIG.checkoutLinks[sku];
  return link ? `<a class="btn ${cls} primary" href="${esc(link)}" target="_blank" rel="noopener">${label}</a>` : `<button class="btn ${cls} primary" data-action="soon">${label}</button>`;
}

function openStore(message = '') {
  closeAllSheets();
  const sheet = openSheet(`${head('🛍️ UnMe')}
    ${message ? `<div class="card accent small">${esc(message)}</div>` : ''}
    <div class="card center">
      <div class="small muted">Lifetime access</div>
      <div class="price">$${CONFIG.basePrice}</div>
      <div class="small muted">One time. No subscription. Ever.</div>
      <ul class="small" style="text-align:left;margin:12px 0">
        <li>Daily questions, Story Time & the Legacy Interview</li><li>Unlimited videos, voice memories & stories</li>
        <li>Family tree, chat & letters for later</li><li>Memory books you can keep forever</li>
      </ul>
      ${buyButton('base', `Unlock for $${CONFIG.basePrice}`, '')}
    </div>
    <button class="btn block" data-action="go-shop">Browse the Marketplace →</button>
    <h3 style="margin-top:18px">Have a code?</h3>
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
actions.packs = actions['go-shop'];
actions.pack = ({ k }) => actions.product({ id: k });

function productCard(p) {
  return `<button class="pcard" data-action="product" data-id="${p.id}">
    <div class="pcover" style="--pc:${p.color}"><span class="pemoji">${p.emoji}</span><span class="pcat">${esc(SHOP_CATEGORIES.find((c) => c.id === p.cat)?.label || '')}</span></div>
    <div class="pbody"><b class="clamp2">${esc(p.name)}</b><span class="small muted clamp2">${esc(p.tagline)}</span>
      <span class="pprice">${owns(p.id) ? '<span class="owned">✓ Owned</span>' : `$${p.price}`}</span></div>
  </button>`;
}


const TOOL_LABEL = { budget: '💵 Open Budget Planner', flashcards: '🧮 Play Math Flashcards', agreement: '📝 Build a Phone Agreement', journal: '🙏 Open Family Journal', organizer: '🗓️ Open Family Board & Meals', games: '🎲 Play the games' };
const TOOL_NAME = { budget: 'Budget planner & kids\' jars', flashcards: 'Math flashcard game', agreement: 'Phone agreement builder', journal: 'Gratitude & prayer journal', organizer: 'Chore board, meal planner & grocery list', games: '3 extra family games' };

// Product page, shop-style: cover, price, what's inside, guides, sticky buy bar.
actions.product = ({ id }) => {
  if (id === 'bundle') {
    const all = owns('bundle') || owns('*');
    const total = PRODUCTS.reduce((n, p) => n + p.price, 0);
    openSheet(`${head('')}
      <div class="prod-cover" style="--pc:#a8432d"><span>${BUNDLE.emoji}</span></div>
      <h1 class="prod-name">${BUNDLE.name}</h1>
      <div class="prod-price">${all ? '<span class="owned">✓ You own everything</span>' : `$${BUNDLE.price} <s>$${total.toFixed(2)}</s> <span class="save-tag">Save ${Math.round((1 - BUNDLE.price / total) * 100)}%</span>`}</div>
      <p class="muted">${BUNDLE.tagline}</p>
      <h3>What's inside</h3>
      ${PRODUCTS.map((p) => `<button class="listrow" data-action="product" data-id="${p.id}"><span class="avatar" style="--c:${p.color}22">${p.emoji}</span><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.tagline)}</div></div></button>`).join('')}
      ${all ? '' : `<div class="buybar"><div><b class="prod-price" style="margin:0">$${BUNDLE.price}</b><div class="small muted">One time · yours forever</div></div>${buyButton('bundle', 'Buy now', 'buy')}</div>`}`, { full: true });
    return;
  }
  const p = product(id);
  if (!p) return;
  const own = owns(p.id);
  const cat = SHOP_CATEGORIES.find((c) => c.id === p.cat);
  const inside = [
    `📘 ${p.sections.length} easy guide${p.sections.length > 1 ? 's' : ''}`,
    p.tool && `🛠️ ${TOOL_NAME[p.tool]}`,
    p.questions?.length && `💬 ${p.questions.length} conversation starters`,
  ].filter(Boolean);
  openSheet(`${head('', own ? '<span class="owned">✓ Owned</span>' : '')}
    <div class="prod-cover" style="--pc:${p.color}"><span>${p.emoji}</span><em>${esc(cat?.label || '')}</em></div>
    <h1 class="prod-name">${esc(p.name)}</h1>
    <div class="prod-price">${own ? '<span class="owned">✓ In your orders</span>' : `$${p.price} <span class="small muted" style="font-weight:600">one time</span>`}</div>
    <p>${esc(p.tagline)}</p>
    <div class="prod-inside">${inside.map((x) => `<div>${x}</div>`).join('')}</div>
    ${own && p.tool ? `<button class="btn primary block" style="margin:6px 0 14px" data-action="tool" data-id="${p.tool}">${TOOL_LABEL[p.tool]}</button>` : ''}
    <h3>Guides</h3>
    ${p.sections.map((s, i) => (own || i < 2)
      ? `<details class="guide" ${i === 0 ? 'open' : ''}><summary>${esc(s.title)}</summary>${s.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${s.note ? `<p class="small muted">${esc(s.note)}</p>` : ''}</details>`
      : `<div class="guide locked">🔒 ${esc(s.title)}</div>`).join('')}
    ${p.questions?.length ? `<h3 style="margin-top:16px">Conversation starters</h3>${(own ? p.questions : p.questions.slice(0, 2)).map((q, i) => `
      <div class="card row"><div class="grow">${esc(q)}</div>${own ? `<button class="btn sm" data-action="answer" data-qid="p:${p.id}:${i}">Answer</button><button class="btn sm ghost" data-action="ask-with" data-q="${esc(q)}">Ask</button>` : ''}</div>`).join('')}
      ${own || p.questions.length <= 2 ? '' : `<div class="guide locked">🔒 ${p.questions.length - 2} more starters</div>`}` : ''}
    ${own ? '' : `<div class="buybar"><div><b class="prod-price" style="margin:0">$${p.price}</b><div class="small muted">One time · yours forever</div></div>${buyButton(p.id, 'Buy now', 'buy')}</div>`}`, { full: true });
};

// Pre-fill the "ask family" sheet with a question from a pack.
actions['ask-with'] = ({ q }) => {
  actions['ask-family']({});
  const box = $$('.sheet [name=text]').pop();
  if (box) box.value = q;
};

actions.orders = () => {
  const mine = PRODUCTS.filter((p) => owns(p.id));
  openSheet(`${head('📦 Your orders')}
    ${owns('base') ? '<div class="listrow"><span class="avatar">🌳</span><div class="grow"><b>UnMe Lifetime</b><div class="small muted">Owned</div></div></div>' : ''}
    ${mine.map((p) => `<button class="listrow" data-action="product" data-id="${p.id}"><span class="avatar" style="--c:${p.color}22">${p.emoji}</span><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${p.tool ? 'Tap to open' : 'Guides & questions'}</div></div>${p.tool ? `<span class="btn sm">Open</span>` : ''}</button>`).join('')}
    ${!mine.length && !owns('base') ? '<div class="empty"><span class="ico">🛍️</span>Nothing yet.</div>' : ''}
    <button class="btn block" data-action="go-shop" style="margin-top:12px">Browse the Marketplace</button>`);
};

// ── Marketplace tools ────────────────────────────────────────
async function toolData(id, fallback) { return (await db.get('tools', id))?.data ?? fallback; }
const saveTool = (id, data) => db.put('tools', { id, data, updatedAt: Date.now() });
const money = (n) => `$${(Math.round((+n || 0) * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

actions.tool = ({ id }) => {
  const fn = { budget: toolBudget, flashcards: toolFlashcards, agreement: toolAgreement, journal: toolJournal, organizer: toolOrganizer, games: () => actions.games() }[id];
  fn?.();
};

// Family budget: single-series bar list (share of income per category) + a hero number.
async function toolBudget() {
  const data = await toolData('budget', {
    income: 0,
    cats: ['Housing', 'Food & groceries', 'Transportation', 'Utilities & phone', 'Kids & school', 'Health', 'Fun', 'Savings', 'Giving'].map((name) => ({ name, amt: 0 })),
    jars: {},
  });
  const sheet = openSheet(`${head('💵 Family Budget')}
    <div class="card"><label class="field" style="margin:0"><span>Monthly take-home income</span><input class="input" id="inc" inputmode="decimal" value="${data.income || ''}" placeholder="0"></label></div>
    <div id="hero"></div>
    <h3>Monthly spending</h3>
    <div id="cats"></div>
    <button class="btn sm ghost" id="addcat">＋ Add a category</button>
    <div id="bars" style="margin-top:14px"></div>
    <h3 style="margin-top:18px">Kids' jars 🫙</h3>
    <p class="small muted" style="margin-top:0">Split allowance into Save · Spend · Give.</p>
    <div id="jars"></div>`, { full: true });
  const persist = () => saveTool('budget', data);
  const paintCats = () => {
    $('#cats', sheet).innerHTML = data.cats.map((c, i) => `<div class="row" style="margin-bottom:6px"><input class="input grow" data-cn="${i}" value="${esc(c.name)}"><input class="input" style="width:7.5rem" data-ca="${i}" inputmode="decimal" value="${c.amt || ''}" placeholder="$0" aria-label="${esc(c.name)} amount"></div>`).join('');
    $$('[data-cn]', sheet).forEach((el) => el.oninput = () => { data.cats[+el.dataset.cn].name = el.value; paintSummary(); persist(); });
    $$('[data-ca]', sheet).forEach((el) => el.oninput = () => { data.cats[+el.dataset.ca].amt = parseFloat(el.value) || 0; paintSummary(); persist(); });
  };
  const paintSummary = () => {
    const spent = data.cats.reduce((n, c) => n + (c.amt || 0), 0);
    const left = (data.income || 0) - spent;
    $('#hero', sheet).innerHTML = `<div class="stat-tiles">
      <div class="stat"><span>Income</span><b>${money(data.income)}</b></div>
      <div class="stat"><span>Planned spending</span><b>${money(spent)}</b></div>
      <div class="stat ${left < 0 ? 'bad' : ''}"><span>${left < 0 ? '⚠ Over budget by' : 'Left over'}</span><b>${money(Math.abs(left))}</b></div></div>`;
    const base = Math.max(data.income || 0, spent) || 1;
    const rows = data.cats.filter((c) => c.amt > 0).sort((a, b) => b.amt - a.amt);
    $('#bars', sheet).innerHTML = rows.length ? `<div class="chart-title">Where the money goes <span class="small muted">(share of ${data.income ? 'income' : 'spending'})</span></div>
      ${rows.map((c) => { const pct = Math.round((c.amt / base) * 100); return `<div class="hbar" title="${esc(c.name)}: ${money(c.amt)} (${pct}%)"><span class="hb-label">${esc(c.name)}</span><span class="hb-track"><i style="width:${Math.max(1, pct)}%"></i></span><span class="hb-val">${money(c.amt)} · ${pct}%</span></div>`; }).join('')}` : '';
  };
  const kids = S.people.filter((p) => !p.passed && p.birthYear && new Date().getFullYear() - +p.birthYear < 18);
  const jarPeople = kids.length ? kids : S.people.filter((p) => !p.passed && p.id !== S.meId).slice(0, 3);
  const paintJars = () => {
    $('#jars', sheet).innerHTML = jarPeople.map((p) => {
      const j = data.jars[p.id] ||= { save: 0, spend: 0, give: 0 };
      return `<div class="card"><div class="row">${avatar(p, 'sm')}<b>${esc(p.name)}</b></div><div class="jars">${['save', 'spend', 'give'].map((k) => `<div class="jar"><span class="small muted">${k === 'save' ? '🐷 Save' : k === 'spend' ? '🛒 Spend' : '💝 Give'}</span><b>${money(j[k])}</b>
        <span class="row" style="justify-content:center;gap:4px"><button class="btn sm" data-j="${p.id}:${k}:-1">−$1</button><button class="btn sm" data-j="${p.id}:${k}:1">+$1</button></span></div>`).join('')}</div></div>`;
    }).join('') || '<p class="small muted">Add kids (with birth years) to your tree to give them jars.</p>';
    $$('[data-j]', sheet).forEach((b) => b.onclick = () => {
      const [pid, k, d] = b.dataset.j.split(':');
      data.jars[pid][k] = Math.max(0, (data.jars[pid][k] || 0) + +d);
      persist(); paintJars();
    });
  };
  $('#inc', sheet).oninput = (e) => { data.income = parseFloat(e.target.value) || 0; paintSummary(); persist(); };
  $('#addcat', sheet).onclick = () => { data.cats.push({ name: 'New category', amt: 0 }); paintCats(); persist(); };
  paintCats(); paintSummary(); paintJars();
}

function toolFlashcards() {
  let op = '+', level = 1, score = 0, streak = 0, q;
  const sheet = openSheet(`${head('🧮 Math Flashcards')}
    <div class="seg" style="grid-template-columns:repeat(3,1fr)" id="ops">${['+', '−', '×'].map((o) => `<button data-op="${o}" class="${o === op ? 'on' : ''}"><span class="a" style="font-size:1.6rem">${o}</span></button>`).join('')}</div>
    <div class="seg" style="grid-template-columns:repeat(3,1fr);margin-top:8px" id="lv">${['Easy', 'Medium', 'Hard'].map((l, i) => `<button data-lv="${i + 1}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="flash" id="card"></div>
    <div id="opts" class="grid2"></div>
    <p class="center" id="sc"></p>`);
  const max = () => (op === '×' ? [5, 10, 12][level - 1] : [10, 20, 100][level - 1]);
  const next = () => {
    const r = (n) => Math.floor(Math.random() * (n + 1));
    let a = r(max()), b = r(max());
    if (op === '−' && b > a) [a, b] = [b, a];
    const ans = op === '+' ? a + b : op === '−' ? a - b : a * b;
    const opts = new Set([ans]);
    while (opts.size < 4) opts.add(Math.max(0, ans + Math.floor(Math.random() * 11) - 5));
    q = { a, b, ans };
    $('#card', sheet).innerHTML = `<b>${a} ${op} ${b} = ?</b>`;
    $('#opts', sheet).innerHTML = [...opts].sort(() => Math.random() - 0.5).map((o) => `<button class="option center" style="font-size:1.6rem;font-weight:800" data-o="${o}">${o}</button>`).join('');
    $$('[data-o]', sheet).forEach((b2) => b2.onclick = () => {
      const right = +b2.dataset.o === q.ans;
      b2.classList.add(right ? 'right' : 'wrong');
      if (right) { score++; streak++; } else { streak = 0; $(`[data-o="${q.ans}"]`, sheet).classList.add('right'); }
      $('#sc', sheet).innerHTML = `Score <b>${score}</b> · Streak <b>${streak}</b> ${streak >= 5 ? '🔥' : ''}${right ? ' ✅' : ' — nice try!'}`;
      if (canSpeak && prefs().readAloud && right && streak % 5 === 0) speak('Awesome streak!');
      setTimeout(next, right ? 700 : 1400);
    });
  };
  $$('[data-op]', sheet).forEach((b) => b.onclick = () => { op = b.dataset.op; $$('[data-op]', sheet).forEach((x) => x.classList.toggle('on', x === b)); next(); });
  $$('[data-lv]', sheet).forEach((b) => b.onclick = () => { level = +b.dataset.lv; $$('[data-lv]', sheet).forEach((x) => x.classList.toggle('on', x === b)); next(); });
  next();
}

const AGREEMENT_ITEMS = [
  'Phones stay out of bedrooms overnight and charge in the kitchen.',
  'No phones at the dinner table — for anyone, parents included.',
  'I will tell a parent if anything online makes me uncomfortable or scared. I won\'t be in trouble for telling.',
  'I won\'t share my location, address or school with people I don\'t know in real life.',
  'I will ask before downloading new apps.',
  'Parents know my passcode.',
  'No phone while driving — ever. Not even at red lights.',
  'I will be kind online. If I wouldn\'t say it face to face, I won\'t post it.',
  'Screen time ends at an agreed time on school nights.',
  'If rules are broken, the phone takes a short break — we talk, then try again.',
];

async function toolAgreement() {
  const data = await toolData('agreement', { checked: AGREEMENT_ITEMS.map(() => true), custom: [], teen: '', parent: '' });
  const sheet = openSheet(`${head('📝 Family Phone Agreement')}
    <p class="small muted">Build it together. Tick what you agree on, add your own, then both sign.</p>
    <div class="card" id="items"></div>
    <div class="row"><input class="input grow" id="own" placeholder="Add your own rule…"><button class="btn" id="add">Add</button></div>
    <div class="row" style="margin-top:12px"><label class="field grow"><span>Teen signs</span><input class="input" id="teen" value="${esc(data.teen)}" placeholder="Name"></label><label class="field grow"><span>Parent signs</span><input class="input" id="parent" value="${esc(data.parent)}" placeholder="Name"></label></div>
    <button class="btn primary block" id="sharebtn">📤 Share / print the agreement</button>`);
  const all = () => [...AGREEMENT_ITEMS.map((t, i) => ({ t, on: data.checked[i], i, base: true })), ...data.custom.map((t, i) => ({ t, on: true, i, base: false }))];
  const persist = () => saveTool('agreement', data);
  const paint = () => {
    $('#items', sheet).innerHTML = all().map((x) => `<label class="check"><input type="checkbox" ${x.on ? 'checked' : ''} ${x.base ? `data-b="${x.i}"` : 'disabled'}><span>${esc(x.t)}</span></label>`).join('');
    $$('[data-b]', sheet).forEach((c) => c.onchange = () => { data.checked[+c.dataset.b] = c.checked; persist(); });
  };
  $('#add', sheet).onclick = () => { const v = $('#own', sheet).value.trim(); if (!v) return; data.custom.push(v); $('#own', sheet).value = ''; persist(); paint(); };
  $('#teen', sheet).oninput = (e) => { data.teen = e.target.value; persist(); };
  $('#parent', sheet).oninput = (e) => { data.parent = e.target.value; persist(); };
  $('#sharebtn', sheet).onclick = () => {
    const text = `OUR FAMILY PHONE AGREEMENT\n\n${all().filter((x) => x.on).map((x, n) => `${n + 1}. ${x.t}`).join('\n')}\n\nSigned: ${data.teen || '________'} (teen)   ${data.parent || '________'} (parent)\nDate: ${new Date().toLocaleDateString()}`;
    if (navigator.share) navigator.share({ title: 'Family Phone Agreement', text }).catch(() => {});
    else download('Family_Phone_Agreement.txt', text, 'text/plain');
  };
  paint();
}

async function toolJournal() {
  const data = await toolData('journal', { entries: [] });
  const sheet = openSheet(`${head('🙏 Family Journal')}
    <div class="seg" style="grid-template-columns:repeat(3,1fr)" id="kinds">${['🙏 Gratitude', '🕊️ Prayer', '✨ Answered'].map((k, i) => `<button data-k="${i}" class="${i === 0 ? 'on' : ''}">${k}</button>`).join('')}</div>
    <form class="stack" id="jf" style="margin-top:10px"><textarea class="input" name="t" style="min-height:90px" placeholder="Today I'm thankful for…"></textarea><button class="btn primary block">Add to journal</button></form>
    <div id="list" style="margin-top:14px"></div>`);
  let kind = 0;
  const KINDS = ['🙏 Gratitude', '🕊️ Prayer', '✨ Answered'];
  const PH = ['Today I\'m thankful for…', 'We\'re praying for…', 'A prayer that was answered…'];
  const paint = () => {
    $('#list', sheet).innerHTML = data.entries.slice().reverse().map((e) => `<div class="card"><div class="small muted">${KINDS[e.k]} · ${esc(nameOf(e.p))} · ${new Date(e.at).toLocaleDateString()}</div><div style="white-space:pre-wrap">${esc(e.t)}</div></div>`).join('')
      || '<div class="empty">Your family\'s journal starts here.</div>';
  };
  $$('[data-k]', sheet).forEach((b) => b.onclick = () => { kind = +b.dataset.k; $$('[data-k]', sheet).forEach((x) => x.classList.toggle('on', x === b)); $('[name=t]', sheet).placeholder = PH[kind]; });
  $('#jf', sheet).onsubmit = async (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (!t) return;
    data.entries.push({ k: kind, t, p: S.meId, at: Date.now() });
    await saveTool('journal', data);
    e.target.t.value = '';
    paint();
  };
  paint();
}

async function toolOrganizer() {
  const data = await toolData('organizer', { cards: [], meals: {}, groceries: [] });
  const COLS = ['To do', 'Doing', 'Done'];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sheet = openSheet(`${head('🗓️ Family Organizer')}
    <div class="seg" style="grid-template-columns:1fr 1fr" id="otabs"><button data-o="board" class="on">📋 Family board</button><button data-o="meals">🍽️ Meals & groceries</button></div>
    <div id="obody" style="margin-top:12px"></div>`, { full: true });
  const persist = () => saveTool('organizer', data);
  const board = () => {
    $('#obody', sheet).innerHTML = `<form class="row" id="nc"><input class="input grow" name="t" placeholder="New chore or task…"><select class="input" name="who" style="width:auto">${S.people.filter((p) => !p.passed).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="btn primary">Add</button></form>
      <div class="kanban">${COLS.map((c, ci) => `<div class="kcol"><div class="kc-head">${c} <span class="muted">${data.cards.filter((x) => x.col === ci).length}</span></div>
        ${data.cards.filter((x) => x.col === ci).map((x) => `<div class="kcard ${ci === 2 ? 'done' : ''}"><div>${esc(x.t)}</div><div class="row small muted">${avatar(person(x.who), 'sm')}${esc(nameOf(x.who))}<span class="grow"></span>
          ${ci > 0 ? `<button class="iconbtn" data-mv="${x.id}:-1" aria-label="Move back">←</button>` : ''}${ci < 2 ? `<button class="iconbtn" data-mv="${x.id}:1" aria-label="Move forward">→</button>` : `<button class="iconbtn" data-rm="${x.id}" aria-label="Remove">✕</button>`}</div></div>`).join('')}</div>`).join('')}</div>`;
    $('#nc', sheet).onsubmit = (e) => { e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return; data.cards.push({ id: uid(), t, who: e.target.who.value, col: 0 }); persist(); board(); };
    $$('[data-mv]', sheet).forEach((b) => b.onclick = () => { const [id, d] = b.dataset.mv.split(':'); const c = data.cards.find((x) => x.id === id); c.col = Math.min(2, Math.max(0, c.col + +d)); persist(); board(); if (c.col === 2) toast('Nice work! ✅'); });
    $$('[data-rm]', sheet).forEach((b) => b.onclick = () => { data.cards = data.cards.filter((x) => x.id !== b.dataset.rm); persist(); board(); });
  };
  const meals = () => {
    $('#obody', sheet).innerHTML = `<h3>This week's dinners</h3>${DAYS.map((d) => `<div class="row" style="margin-bottom:6px"><b style="width:3rem">${d}</b><input class="input grow" data-day="${d}" value="${esc(data.meals[d] || '')}" placeholder="What's for dinner?"></div>`).join('')}
      <h3 style="margin-top:16px">Grocery list</h3><form class="row" id="ng"><input class="input grow" name="t" placeholder="Add an item…"><button class="btn primary">Add</button></form>
      <div class="card" style="margin-top:8px">${data.groceries.map((g, i) => `<label class="check"><input type="checkbox" data-g="${i}" ${g.got ? 'checked' : ''}><span style="${g.got ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(g.t)}</span></label>`).join('') || '<span class="small muted">Nothing on the list.</span>'}</div>
      ${data.groceries.some((g) => g.got) ? '<button class="btn sm ghost" id="clr">Clear checked items</button>' : ''}`;
    $$('[data-day]', sheet).forEach((el) => el.oninput = () => { data.meals[el.dataset.day] = el.value; persist(); });
    $('#ng', sheet).onsubmit = (e) => { e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return; data.groceries.push({ t, got: false }); persist(); meals(); };
    $$('[data-g]', sheet).forEach((c) => c.onchange = () => { data.groceries[+c.dataset.g].got = c.checked; persist(); meals(); });
    $('#clr', sheet)?.addEventListener('click', () => { data.groceries = data.groceries.filter((g) => !g.got); persist(); meals(); });
  };
  $$('[data-o]', sheet).forEach((b) => b.onclick = () => { $$('[data-o]', sheet).forEach((x) => x.classList.toggle('on', x === b)); (b.dataset.o === 'board' ? board : meals)(); });
  board();
}

// ── Games ────────────────────────────────────────────────────
actions.games = () => {
  const g = owns('games');
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

const needGames = () => { if (owns('games')) return true; closeSheet(); actions.pack({ k: 'games' }); return false; };

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
    if (skus) setTimeout(() => toast('🎁 Your family gave you UnMe for free!'), 600);
    changed = true;
  }
  const paid = params.get('paid');
  if (paid) {
    const skus = paid === 'bundle' ? ['bundle', 'base'] : SKUS.includes(paid) ? [paid] : [];
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
  S.alertsSeen = S.meId ? await db.getKV(`alertsSeen:${S.meId}`, 0) : 0;
  S.chatsSeen = S.meId ? await db.getKV(`chatsSeen:${S.meId}`, 0) : 0;
  await render();
  setTimeout(maybeDailyQuestion, 600);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
