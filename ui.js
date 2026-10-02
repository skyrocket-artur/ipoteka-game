'use strict';
/* =========================================================================
   ИПОТЕКА БЕЗ ИЛЛЮЗИЙ · каркас: настройки, форматирование, состояние, навигация
   ========================================================================= */

const CONFIG = {
  author: 'Артур Юнусов',
  authorBio: 'Финансовый аналитик, трейдер и предприниматель. Восемь лет на фондовом рынке, квалифицированный инвестор.',
  channelUrl: 'https://t.me/YunusovArtur',
  channelName: '@YunusovArtur',
  // Финал: кнопка бота (ChatPlace: /start ipoteka) и «Посоветовать другу» (/start ipoteka_share)
  botUrl: 'https://t.me/YunusovArtur_bot?start=ipoteka',
  shareBotUrl: 'https://t.me/YunusovArtur_bot?start=ipoteka_share',
  shareText: 'Прошёл игру «Ипотека без иллюзий»: узнал реальную переплату и как закрыть ипотеку быстрее. Проверь свою — 15 минут 👇',
  storageKey: 'ipoteka_bez_illuziy_v1',
};

const tg = (window.Telegram && window.Telegram.WebApp) || null;
const app = document.getElementById('app');

/* ---------- форматирование ---------- */
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const R = v => nf0.format(Math.round(v)) + ' ₽';
const Rs = v => (v > 0 ? '+' : v < 0 ? '−' : '') + nf0.format(Math.abs(Math.round(v))) + ' ₽';
const M = (v, d) => {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(d ?? 1).replace('.', ',').replace(/,0$/, '') + ' млрд ₽';
  if (a >= 1e6) return s + (a / 1e6).toFixed(d ?? (a >= 1e8 ? 0 : 1)).replace('.', ',').replace(/,0$/, '') + ' млн ₽';
  if (a >= 1e3) return s + nf0.format(Math.round(a / 1e3)) + ' тыс ₽';
  return s + Math.round(a) + ' ₽';
};
const P = (r, d) => {
  const v = r * 100;
  const dd = d ?? (Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
  return v.toFixed(dd).replace('.', ',') + '%';
};
const X = v => (v >= 10 ? Math.round(v) : v.toFixed(1).replace('.', ',').replace(/,0$/, '')); // «во сколько раз»
const plural = (n, f) => {
  n = Math.abs(Math.round(n)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return f[2];
  if (n1 > 1 && n1 < 5) return f[1];
  if (n1 === 1) return f[0];
  return f[2];
};
const yrs = n => {
  const r = Math.round(n * 10) / 10;
  if (Number.isInteger(r)) return r + ' ' + plural(r, ['год', 'года', 'лет']);
  return String(r).replace('.', ',') + ' года';
};
const ym = months => {
  if (!isFinite(months)) return 'никогда';
  const y = Math.floor(months / 12), m = months % 12;
  if (!y) return m + ' мес.';
  return y + ' ' + plural(y, ['год', 'года', 'лет']) + (m ? ' ' + m + ' мес.' : '');
};
const dot = s => (/\.$/.test(s) ? s : s + '.');   // конец предложения после «мес.»
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, step) => Math.round(v / step) * step;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- иконки ---------- */
const IC = {
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/><path d="M10 20v-5.5h4V20"/></svg>',
  tg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 4.6 2.9 11.7c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.5zM9.6 14.4l-.4 4.1-1.4-4.5 10.1-6.4-8.3 6.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

/* ---------- состояние ---------- */
const S0 = () => ({
  v: 1, scr: 'intro', stage: null,
  kids: null, young: null, special: [],
  region: null, home: null,
  income: 160000, savings: 2000000, age: 33,
  size: '2', price: null, down: null, term: 30,
  prog: null,
  loan: { bal: 5000000, rate: 0.06, years: 25, prog: 'family', value: 8000000 },
  quiz: {}, life: { i: 0, ch: {}, shown: false }, plan: { extra: 10000, mode: 'term', inv: 'dep' },
  real: false, visited: [],
});
let S = S0();
const save = () => { try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(S)); } catch (e) { /* приватный режим */ } };
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.storageKey) || 'null');
    if (s && s.v === 1) S = Object.assign(S0(), s);
  } catch (e) { /* пусто */ }
};

/* ---------- навигация ---------- */
const SCREENS = {};
const FLOWS = {
  plan: ['intro', 'q-stage', 'q-family', 'q-region', 'q-home', 'q-money', 'flat', 'quiz-over', 'rates', 'hidden', 'invest', 'why', 'life', 'plan', 'final'],
  pay: ['intro', 'q-stage', 'q-family', 'q-region', 'q-loan', 'quiz-over', 'rates', 'hidden', 'invest', 'why', 'life', 'plan', 'final'],
};
const flow = () => FLOWS[S.stage === 'pay' ? 'pay' : 'plan'];
const go = (id, opts = {}) => {
  S.scr = id;
  if (!S.visited.includes(id)) S.visited.push(id);
  save();
  render(opts);
};
const next = () => { const f = flow(); const k = f.indexOf(S.scr); go(f[Math.min(f.length - 1, k + 1)]); };
const prev = () => {
  if (S.scr === 'life' && S.life.i > 0) { S.life.i--; S.life.shown = false; save(); return render(); }
  const f = flow(); const k = f.indexOf(S.scr); go(f[Math.max(0, k - 1)], { back: true });
};

function render(opts = {}) {
  const fn = SCREENS[S.scr] || SCREENS.intro;
  CH.tip.hide();
  const f = flow();
  const k = Math.max(0, f.indexOf(S.scr));
  $('#prog').style.width = (k / (f.length - 1) * 100) + '%';
  app.innerHTML = '';
  const el = document.createElement('section');
  el.className = 'screen';
  app.appendChild(el);
  fn(el);
  if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (tg && tg.BackButton) { try { k > 0 ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) { /* старый клиент */ } }
}

/* ---------- кусочки интерфейса ---------- */
const kicker = (t) => `<div class="kicker"><i></i>${t}</div>`;
const step = () => { const f = flow(); const k = f.indexOf(S.scr); return `Шаг ${k} из ${f.length - 1}`; };
const conclusion = (html, ttl = 'Промежуточный вывод') => `<div class="conclusion"><div class="ttl">${ttl}</div>${html}</div>`;
const authorNote = (html) => `<div class="author-note">${html}<cite>— ${CONFIG.author}</cite></div>`;
const navHtml = (label = 'Дальше', opts = {}) => `<div class="nav">${opts.noBack ? '' : `<button class="btn ghost back" data-act="back" aria-label="Назад">${IC.back}</button>`}<button class="btn" data-act="next" ${opts.disabled ? 'disabled' : ''}>${label} ${IC.arrow}</button></div>`;
const bindNav = (el, onNext) => {
  const b = $('[data-act=back]', el); if (b) b.onclick = prev;
  const n = $('[data-act=next]', el); if (n) n.onclick = onNext || next;
};
const stat = (l, v, d, cls = '') => `<div class="stat ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const src = (keys) => {
  const list = keys.map(k => D.src[k]).filter(Boolean);
  if (!list.length) return '';
  return `<div class="src">Источники: ${list.map(s => `<a href="${s.u}" target="_blank" rel="noopener">${s.t}</a>`).join(' · ')}</div>`;
};

/* Ползунок: возвращает html; привязка через bindRange */
const range = (id, label, min, max, stepV, val, fmt, hint) => `
  <div class="field"><div class="field-h"><label for="${id}">${label}</label><output id="${id}-o">${fmt(val)}</output></div>
  <input type="range" id="${id}" min="${min}" max="${max}" step="${stepV}" value="${val}">
  ${hint ? `<div class="hint" id="${id}-h">${hint}</div>` : ''}</div>`;
const bindRange = (el, id, fmt, onInput) => {
  const inp = $('#' + id, el), out = $('#' + id + '-o', el);
  const paint = () => { const p = (inp.value - inp.min) / (inp.max - inp.min) * 100; inp.style.setProperty('--p', p + '%'); };
  paint();
  inp.addEventListener('input', () => { paint(); const v = +inp.value; out.textContent = fmt(v); onInput(v); });
  return inp;
};

/* Варианты выбора (одиночный) */
const optsHtml = (list, sel, cls = '') => `<div class="opts ${cls}">${list.map(o => `
  <button class="opt ${sel === o.id ? 'sel' : ''}" data-id="${o.id}" ${o.disabled ? 'disabled' : ''}>
    ${o.ic ? `<span class="ic">${o.ic}</span>` : ''}<span><span class="t">${o.t}</span>${o.s ? `<span class="s">${o.s}</span>` : ''}</span>${o.badge ? `<span class="badge">${o.badge}</span>` : ''}
  </button>`).join('')}</div>`;
const bindOpts = (el, onPick, root) => {
  $$('.opt', root || el).forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    $$('.opt', b.parentNode).forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    onPick(b.dataset.id, b);
  }));
};

/* Квиз: варианты, проверка, объяснение */
const quiz = (el, host, q) => {
  const done = S.quiz[q.id];
  host.innerHTML = `<div class="quiz-badge">Тест ${q.n} · ${q.tag || 'проверьте себя'}</div>
    <div class="quiz-q">${q.q}</div>${q.sub ? `<p class="soft small">${q.sub}</p>` : ''}
    <div class="opts">${q.opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="ic">${'АБВГ'[k]}</span><span><span class="t">${o.t}</span>${o.s ? `<span class="s">${o.s}</span>` : ''}</span></button>`).join('')}</div>
    <div class="q-reveal"></div>`;
  const show = (k) => {
    $$('.opt', host).forEach((b, j) => {
      b.disabled = true;
      if (j === q.right) b.classList.add('right');
      else if (j === k) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    const ok = k === q.right;
    $('.q-reveal', host).innerHTML = `<div class="card ${ok ? 'ok' : 'warn'} reveal"><h3>${ok ? 'Верно!' : 'Не совсем.'} ${q.head || ''}</h3>${q.explain}</div>`;
    if (q.after) q.after($('.q-reveal', host));
    if (q.onDone) q.onDone(ok);
  };
  $$('.opt', host).forEach(b => b.addEventListener('click', () => {
    const k = +b.dataset.k;
    S.quiz[q.id] = { k, ok: k === q.right };
    save();
    show(k);
  }));
  if (done) show(done.k);
};

/* Варианты для «угадайки»: правильный ответ + 3 правдоподобных, по возрастанию */
const guessOpts = (truth, mults, fmt) => {
  const vals = mults.map(m => m * truth);
  vals.sort((a, b) => a - b);
  const right = vals.findIndex(v => v === truth);
  return { opts: vals.map(v => ({ t: fmt(v) })), right };
};

/* ---------- шапка и подвал (авторство и канал — на каждом экране) ---------- */
function chrome() {
  $('#logo').innerHTML = `${IC.house}<span class="logo-t"><b>ИПОТЕКА БЕЗ ИЛЛЮЗИЙ</b><span>игра-калькулятор · ${CONFIG.author}</span></span>`;
  $('#logo').onclick = (e) => { e.preventDefault(); if (S.scr !== 'intro') go('intro'); };
  $('#tgTop').innerHTML = `${IC.tg}<span>Канал</span>`;
  $('#tgTop').href = CONFIG.channelUrl;
  $('#tgTop').onclick = (e) => { e.preventDefault(); openUrl(CONFIG.channelUrl); };
  $('#foot').innerHTML = `<div class="fl"><span>Автор игры — <b>${CONFIG.author}</b></span><a href="${CONFIG.channelUrl}" target="_blank" rel="noopener" data-tg>Telegram-канал ${CONFIG.channelName} →</a></div>
    <div class="disc">Данные на ${D.asOf}: ЦБ РФ, Росстат, ДОМ.РФ, банки. Расчёты образовательные и не являются индивидуальной рекомендацией или рекламой банков. Условия программ меняются — перед сделкой проверяйте их в своём банке.</div>`;
  $('[data-tg]', $('#foot')).onclick = (e) => { e.preventDefault(); openUrl(CONFIG.channelUrl); };
}

function openUrl(url) {
  try {
    if (tg && tg.initData && /^https:\/\/t\.me\//.test(url)) { tg.openTelegramLink(url); return; }
    if (tg && tg.initData) { tg.openLink(url); return; }
  } catch (err) { /* не в Telegram */ }
  window.open(url, '_blank', 'noopener');
}

function share() {
  const url = location.href.split('#')[0];
  const text = CONFIG.shareText + '\n' + url;
  openUrl(`https://t.me/share/url?url=${encodeURIComponent(CONFIG.shareBotUrl)}&text=${encodeURIComponent(text)}`);
}

/* ---------- старт ---------- */
function boot() {
  load();
  chrome();
  if (tg) {
    try {
      tg.ready(); tg.expand();
      tg.setHeaderColor && tg.setHeaderColor('#161311');
      tg.setBackgroundColor && tg.setBackgroundColor('#161311');
      tg.BackButton && tg.BackButton.onClick(prev);
    } catch (e) { /* не в Telegram */ }
  }
  render();
}
