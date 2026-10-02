'use strict';
/* =========================================================================
   ИПОТЕКА БЕЗ ИЛЛЮЗИЙ · экраны: обложка, опрос, квартира, тесты, ставки,
   скрытые платежи, «если бы инвестировали», «почему ипотека»
   ========================================================================= */

/* ---------- иллюстрация обложки ---------- */
const HOUSE_SVG = (() => {
  const win = (x, y, w, h, lit) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${lit ? '#E3A94B' : '#362F29'}"${lit ? ' opacity=".92"' : ''}/>`;
  let s = '<svg class="house" viewBox="0 0 360 210" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
  s += '<path d="M14 150 C70 140 96 118 140 112 S220 74 262 58 S320 30 346 22" fill="none" stroke="#E3A94B" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 6" opacity=".55"/>';
  s += '<circle cx="346" cy="22" r="5" fill="#E3A94B"/>';
  const blds = [[30, 96, 70, 104], [112, 56, 82, 144], [206, 84, 64, 116], [282, 112, 54, 88]];
  blds.forEach(([x, y, w, h], b) => {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2A2420" stroke="rgba(235,216,184,.16)"/>`;
    const cols = Math.floor((w - 10) / 14), rows = Math.floor((h - 14) / 16);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = ((r * 7 + c * 3 + b * 5) % 9) < 3;
      s += win(x + 8 + c * 14, y + 10 + r * 16, 8, 9, lit);
    }
  });
  s += '<path d="M0 200 H360" stroke="rgba(235,216,184,.25)"/>';
  s += '</svg>';
  return s;
})();

/* =========================================================================
   ОБЛОЖКА
   ========================================================================= */
SCREENS.intro = (el) => {
  const started = S.stage && S.visited.length > 2;
  el.innerHTML = `<div class="cover">
    ${kicker('Игра-калькулятор · ~15 минут')}
    <h1>Ипотека без&nbsp;иллюзий</h1>
    <p class="lead">Проживите 30 лет ипотеки за 15 минут. На ваших цифрах посчитаем, сколько вы на самом деле отдадите банку, где прячутся лишние платежи и когда ипотека — разумный шаг, а когда — ловушка.</p>
    <div class="meta"><span>Ставки на ${D.asOf}</span><span>8 тестов</span><span>7 жизненных решений</span><span>План погашения</span></div>
    ${HOUSE_SVG}
    <div class="card">
      <h3>Что вы узнаете</h3>
      <ul class="check static">
        ${['Реальную переплату — до копейки, а не «от 6%» из рекламы', 'Какие льготы вам положены после реформы семейной ипотеки 1 октября 2026', 'Сколько добавляют страховки, сборы и «ставка от застройщика»', 'Что выгоднее: ипотека, аренда с инвестициями или копить самому', 'Как закрыть ипотеку на годы раньше и вернуть до 650 000 ₽ вычетом']
          .map(t => `<li class="on"><span class="bx">${IC.check}</span><span class="ct">${t}</span></li>`).join('')}
      </ul>
    </div>
    <div class="btns">
      ${started ? `<button class="btn" data-act="resume">Продолжить с места остановки ${IC.arrow}</button><button class="btn ghost" data-act="restart">Начать заново</button>` : `<button class="btn" data-act="start">Начать ${IC.arrow}</button>`}
    </div>
    <p class="tiny" style="margin-top:12px">Данные: ЦБ РФ, Росстат, ДОМ.РФ, Мосбиржа, предложения банков на ${D.asOf}. Без рекламы банков и застройщиков.</p>
  </div>`;
  const st = $('[data-act=start]', el); if (st) st.onclick = () => go('q-stage');
  const rs = $('[data-act=resume]', el);
  if (rs) rs.onclick = () => { const last = S.visited[S.visited.length - 1]; go(last && last !== 'intro' ? last : 'q-stage'); };
  const rr = $('[data-act=restart]', el); if (rr) rr.onclick = () => { S = S0(); save(); go('q-stage'); };
};

/* =========================================================================
   ОПРОС
   ========================================================================= */
SCREENS['q-stage'] = (el) => {
  el.innerHTML = `${kicker(step() + ' · знакомство')}
    <h2>Где вы сейчас?</h2>
    <p class="soft">Игра подстроится под ваш этап: кому-то важнее выбрать программу, кому-то — быстрее закрыть уже взятый кредит.</p>
    ${optsHtml([
      { id: 'plan', ic: '🤔', t: 'Думаю взять ипотеку', s: 'Хочу понять, потяну ли и что выбрать' },
      { id: 'choose', ic: '🔑', t: 'Уже выбираю квартиру или банк', s: 'Сделка в ближайшие месяцы' },
      { id: 'pay', ic: '💳', t: 'Уже плачу ипотеку', s: 'Хочу платить меньше и закрыть быстрее' },
      { id: 'rent', ic: '🧳', t: 'Снимаю жильё и сомневаюсь', s: 'Что выгоднее: аренда или своя квартира' },
    ], S.stage)}
    ${navHtml('Дальше', { disabled: !S.stage })}`;
  bindOpts(el, (id) => { S.stage = id; save(); $('[data-act=next]', el).disabled = false; setTimeout(next, 180); });
  bindNav(el);
};

SCREENS['q-family'] = (el) => {
  const kidsOpts = [0, 1, 2, 3, 4, 5];
  el.innerHTML = `${kicker(step() + ' · семья')}
    <h2>Сколько у вас детей?</h2>
    <p class="soft">С 1 октября 2026 ставка по семейной ипотеке зависит от числа детей: в регионах — от 10% с одним ребёнком до 2% с пятью и больше.</p>
    <div class="chips" id="kids">${kidsOpts.map(k => `<button class="chip ${S.kids === k ? 'sel' : ''}" data-k="${k}">${k === 0 ? 'Нет' : k === 5 ? '5 и больше' : k}</button>`).join('')}</div>
    <div id="young"></div>
    <div id="spec"></div>
    ${navHtml('Дальше', { disabled: S.kids == null })}`;
  const drawYoung = () => {
    const y = $('#young', el);
    if (!S.kids) { y.innerHTML = ''; S.young = null; return; }
    y.innerHTML = `<h3 style="margin-top:18px">Сколько лет младшему ребёнку?</h3>
      ${optsHtml([
        { id: 'u6', t: 'Меньше 7 лет', s: 'Или ребёнок родится в ближайшее время' },
        { id: 'u18', t: 'От 7 до 18 лет' },
        { id: 'adult', t: 'Все дети взрослые' },
      ], S.young, 'tight')}`;
    bindOpts(el, (id) => { S.young = id; save(); }, y);
  };
  const drawSpec = () => {
    const sp = $('#spec', el);
    const list = D.specials;
    sp.innerHTML = `<h3 style="margin-top:18px">Что-то из этого про вас?</h3><p class="soft small">Для отдельных льготных программ. Можно пропустить.</p>
      <ul class="check">${list.map(x => `<li class="${S.special.includes(x.id) ? 'on' : ''}" data-id="${x.id}"><span class="bx">${IC.check}</span><span class="ct"><b>${x.t}</b><span>${x.s}</span></span></li>`).join('')}</ul>`;
    $$('li', sp).forEach(li => li.onclick = () => {
      const id = li.dataset.id;
      S.special = S.special.includes(id) ? S.special.filter(x => x !== id) : S.special.concat(id);
      li.classList.toggle('on'); save();
    });
  };
  $$('.chip', $('#kids', el)).forEach(c => c.onclick = () => {
    $$('.chip', $('#kids', el)).forEach(x => x.classList.remove('sel'));
    c.classList.add('sel');
    S.kids = +c.dataset.k; save();
    $('[data-act=next]', el).disabled = false;
    drawYoung();
  });
  drawYoung(); drawSpec();
  bindNav(el);
};

SCREENS['q-region'] = (el) => {
  const isNew = S.home !== 'old';
  el.innerHTML = `${kicker(step() + ' · регион')}
    <h2>Где покупаете жильё?</h2>
    <p class="soft">От региона зависят цены, лимиты льготных программ и ставка семейной ипотеки.</p>
    ${optsHtml(D.regionOrder.map(id => {
      const r = D.regions[id];
      return { id, ic: r.ic, t: r.name, s: `${r.sub} · м² в новостройке ≈${nf0.format(Math.round(r.ppmNew / 1000))} тыс ₽, на вторичке ≈${nf0.format(Math.round(r.ppmOld / 1000))} тыс ₽` };
    }), S.region)}
    <p class="src">Цены — средние по Росстату за II кв. 2026; для «миллионников» и малых городов — оценка по регионам. ${src(['rosstatPrice']).replace('<div class="src">', '').replace('</div>', '')}</p>
    ${navHtml('Дальше', { disabled: !S.region })}`;
  bindOpts(el, (id) => { S.region = id; S.price = null; save(); $('[data-act=next]', el).disabled = false; setTimeout(next, 180); });
  bindNav(el);
};

SCREENS['q-home'] = (el) => {
  const r = Mdl.reg();
  const gap = r.ppmNew / r.ppmOld - 1;
  el.innerHTML = `${kicker(step() + ' · жильё')}
    <h2>Новостройка или вторичка?</h2>
    ${optsHtml([
      { id: 'new', ic: '🏗️', t: 'Новостройка', s: `Почти все льготные программы — здесь. Но м² дороже вторички на ${P(gap, 0)} (${r.name}), квартиру ждать, часто без отделки.` },
      { id: 'old', ic: '🏠', t: 'Вторичка', s: 'Въезжаете сразу, торг возможен. Но льгот почти нет — обычно рыночная ставка.' },
    ], S.home)}
    <div class="card"><p class="small" style="margin:0"><b>Знали ли вы?</b> В 2000 году новостройки и вторичка стоили почти одинаково. Сейчас по России разрыв — около ${P(D.gapNow, 0)}. Во многом его «надули» льготные ставки: застройщики поднимают цены, когда покупателям доступны дешёвые кредиты.</p></div>
    ${navHtml('Дальше', { disabled: !S.home })}`;
  bindOpts(el, (id) => { S.home = id; S.price = null; save(); $('[data-act=next]', el).disabled = false; setTimeout(next, 180); });
  bindNav(el);
};

SCREENS['q-money'] = (el) => {
  el.innerHTML = `${kicker(step() + ' · деньги')}
    <h2>Доход и накопления</h2>
    <p class="soft">Нужны, чтобы проверить, потянете ли платёж. Данные остаются только в вашем браузере.</p>
    ${range('inc', 'Доход семьи в месяц, на руки', 30000, 800000, 5000, S.income, R, `Средняя зарплата в России — ${R(D.wage.now)} до вычета налога (${D.wage.label})`)}
    ${range('sav', 'Есть на первый взнос', 0, 15000000, 50000, S.savings, M)}
    ${range('age', 'Возраст основного заёмщика', 20, 60, 1, S.age, v => v + ' ' + plural(v, ['год', 'года', 'лет']), 'Влияет на цену страховки жизни')}
    ${navHtml()}`;
  bindRange(el, 'inc', R, v => { S.income = v; save(); });
  bindRange(el, 'sav', M, v => { S.savings = v; S.down = null; save(); });
  bindRange(el, 'age', v => v + ' ' + plural(v, ['год', 'года', 'лет']), v => { S.age = v; save(); });
  bindNav(el);
};

/* Уже плачу */
SCREENS['q-loan'] = (el) => {
  const L = S.loan;
  el.innerHTML = `${kicker(step() + ' · ваша ипотека')}
    <h2>Ваша ипотека сейчас</h2>
    <p class="soft">Посмотрите в приложении банка остаток долга и ставку — так расчёт будет точным.</p>
    <h3>Программа</h3>
    <div class="chips" id="lp">${D.loanProgs.map(p => `<button class="chip ${L.prog === p.id ? 'sel' : ''}" data-id="${p.id}" data-r="${p.rate}">${p.t} <small>${P(p.rate, 1)}</small></button>`).join('')}</div>
    ${range('lb', 'Остаток долга', 300000, 30000000, 50000, L.bal, M)}
    ${range('lr', 'Ставка', 0.001, 0.30, 0.001, L.rate, v => P(v, 1))}
    ${range('ly', 'Осталось платить', 1, 30, 1, L.years, yrs)}
    ${range('lv', 'Сколько сейчас стоит квартира', 1000000, 60000000, 100000, L.value, M)}
    ${range('inc', 'Доход семьи в месяц, на руки', 30000, 800000, 5000, S.income, R)}
    ${range('age', 'Ваш возраст', 20, 65, 1, S.age, v => v + ' ' + plural(v, ['год', 'года', 'лет']))}
    <div class="card gold" id="lpay"></div>
    ${navHtml()}`;
  const upd = () => {
    const pay = E.pmt(L.bal, L.rate, L.years * 12);
    $('#lpay', el).innerHTML = `<div class="kv"><span>Ваш платёж по расчёту</span><span>${R(pay)}</span><span>Из него проценты сейчас</span><span>${R(L.bal * L.rate / 12)}</span></div><p class="tiny" style="margin:0">Если в банке платёж другой — подвиньте срок или ставку, чтобы совпало.</p>`;
  };
  const rr = bindRange(el, 'lr', v => P(v, 1), v => { L.rate = v; save(); upd(); });
  $$('#lp .chip', el).forEach(c => c.onclick = () => {
    $$('#lp .chip', el).forEach(x => x.classList.remove('sel')); c.classList.add('sel');
    L.prog = c.dataset.id; L.rate = +c.dataset.r; rr.value = L.rate; rr.dispatchEvent(new Event('input')); save();
  });
  bindRange(el, 'lb', M, v => { L.bal = v; save(); upd(); });
  bindRange(el, 'ly', yrs, v => { L.years = v; save(); upd(); });
  bindRange(el, 'lv', M, v => { L.value = v; save(); });
  bindRange(el, 'inc', R, v => { S.income = v; save(); });
  bindRange(el, 'age', v => v + ' ' + plural(v, ['год', 'года', 'лет']), v => { S.age = v; save(); });
  upd();
  bindNav(el, () => { S.prog = L.prog; save(); next(); });
};

/* =========================================================================
   КВАРТИРА
   ========================================================================= */
SCREENS.flat = (el) => {
  const r = Mdl.reg();
  if (!S.size) S.size = '2';
  el.innerHTML = `${kicker(step() + ' · квартира')}
    <h2>Выберите квартиру</h2>
    <p class="soft">${r.name}, ${Mdl.isNew() ? 'новостройка' : 'вторичка'} — средняя цена ${nf0.format(Math.round(Mdl.ppm2() / 1000))} тыс ₽ за м². Цену можно подвинуть под свой вариант.</p>
    <div class="chips" id="sz">${['studio', '1', '2', '3'].map(k => `<button class="chip ${S.size === k ? 'sel' : ''}" data-k="${k}">${SIZES[k].t} <small>${SIZES[k].a} м²</small></button>`).join('')}</div>
    <div id="sl"></div>
    <div class="card gold" id="sum"></div>
    ${navHtml('Посчитать ипотеку')}`;
  const drawSliders = () => {
    const base = Mdl.basePrice();
    const price = Mdl.price();
    const minDown = Math.ceil(price * D.minDown / 50000) * 50000;
    const maxDown = Math.floor(price * 0.9 / 50000) * 50000;
    if (S.down == null) S.down = clamp(round(Math.min(S.savings, price * 0.3), 50000), minDown, maxDown);
    S.down = clamp(S.down, minDown, maxDown);
    $('#sl', el).innerHTML = range('pr', 'Цена квартиры', round(base * 0.5, 50000), round(base * 1.8, 50000), 50000, price, M) +
      range('dn', 'Первый взнос', minDown, maxDown, 50000, S.down, M, `Минимум ${P(D.minDown, 0)} — ${M(minDown)}`) +
      `<div class="field"><div class="field-h"><label>Срок кредита</label></div><div class="chips" id="tm">${[10, 15, 20, 25, 30].map(t => `<button class="chip ${S.term === t ? 'sel' : ''}" data-t="${t}">${t} лет</button>`).join('')}</div></div>`;
    bindRange(el, 'pr', M, v => { S.price = v; save(); drawSliders(); });
    bindRange(el, 'dn', M, v => { S.down = v; save(); drawSum(); });
    $$('#tm .chip', el).forEach(c => c.onclick = () => { S.term = +c.dataset.t; save(); $$('#tm .chip', el).forEach(x => x.classList.toggle('sel', x === c)); drawSum(); });
    drawSum();
  };
  const drawSum = () => {
    const price = Mdl.price();
    const principal = price - S.down;
    const lack = S.down - S.savings;
    const pay = E.pmt(principal, Mdl.market(), S.term * 12);
    $('#sum', el).innerHTML = `<div class="kv">
      <span>Квартира</span><span>${SIZES[S.size].t}, ${Mdl.area()} м²</span>
      <span>Цена</span><span>${M(price)}</span>
      <span>Первый взнос</span><span>${M(S.down)} (${P(S.down / price, 0)})</span>
      <span>Нужно занять</span><span class="gold">${M(principal)}</span>
      <span>Аренда такой же квартиры</span><span>≈${R(Mdl.rentNow(price))}/мес</span></div>
      ${lack > 0 ? `<p class="small bad" style="margin:6px 0 0">На взнос не хватает ${M(lack)}. Это частая ловушка: «займу у родителей / возьму потребкредит» — банк учтёт этот долг, и ставка по нему ещё выше.</p>` : ''}
      <p class="tiny" style="margin:8px 0 0">Для сравнения: по рыночной ставке ${P(Mdl.market(), 1)} платёж был бы ≈${R(pay)} в месяц.</p>`;
  };
  $$('#sz .chip', el).forEach(c => c.onclick = () => {
    $$('#sz .chip', el).forEach(x => x.classList.remove('sel')); c.classList.add('sel');
    S.size = c.dataset.k; S.price = null; S.down = null; save(); drawSliders();
  });
  drawSliders();
  bindNav(el);
};

/* =========================================================================
   ТЕСТЫ 1–2: УГАДАЙТЕ ПЕРЕПЛАТУ
   ========================================================================= */
SCREENS['quiz-over'] = (el) => {
  const pay = S.stage === 'pay';
  const d = pay ? Mdl.deal() : Mdl.deal('market');
  const q = E.quick(d.principal, d.rate, d.months);
  el.innerHTML = `${kicker(step() + ' · проверка интуиции')}
    <h2>${pay ? 'Сколько вы ещё отдадите банку?' : 'Прежде чем считать — угадайте'}</h2>
    <p class="soft">${pay ? `Остаток ${M(d.principal)}, ставка ${P(d.rate, 1)}, ещё ${yrs(d.months / 12)}.` : `Кредит ${M(d.principal)} на ${yrs(d.months / 12)} по рыночной ставке ${P(d.rate, 1)} — такую сейчас в среднем дают банки без льгот.`}</p>
    <div id="q1"></div><div id="q2"></div><div id="after"></div>`;
  const g = guessOpts(q.over, [0.35, 0.6, 1, 1.7], v => M(v));
  quiz(el, $('#q1', el), {
    id: 'over', n: 1, tag: 'переплата',
    q: pay ? 'Сколько процентов вы заплатите банку до конца срока, если платить по графику?' : 'Сколько вы переплатите банку только процентами за весь срок?',
    opts: g.opts, right: g.right,
    head: `Переплата — ${M(q.over)}.`,
    explain: `<p>Платёж ${R(q.pay)} × ${d.months} мес. = ${M(q.pay * d.months)}. Из них ${M(d.principal)} — ваш долг, остальное — проценты: <b>в ${X(q.over / d.principal)} раза больше самого кредита</b>.</p><p class="small soft" style="margin:0">Интуиция обычно занижает переплату в 2–3 раза: мозг умножает ставку на сумму, а не учитывает, что проценты капают каждый месяц годами.</p>`,
    onDone: () => { if (!$('#q2', el).innerHTML) q2(); },
  });
  function q2() {
    const share = 1 - q.firstInterestShare;
    /* «человеческие» догадки: половина, четверть, десятая — и правильный ответ */
    const cands = [0.5, 0.25, 0.1, 0.03].filter(c => Math.abs(c - share) > Math.max(0.03, share * 0.5)).slice(0, 3);
    const vals = cands.concat(share).sort((a, b) => a - b);
    const g2 = { opts: vals.map(v => ({ t: P(v, v < 0.1 && v !== 0.03 ? 1 : 0) })), right: vals.indexOf(share) };
    quiz(el, $('#q2', el), {
      id: 'share', n: 2, tag: 'первый платёж',
      q: `Ваш первый платёж — ${R(q.pay)}. Какая его часть уменьшит сам долг?`,
      sub: 'Остальное — проценты банку.',
      opts: g2.opts, right: g2.right,
      head: `Только ${P(share, share < 0.1 ? 1 : 0)} — ${R(q.pay * share)}.`,
      explain: `<p>Остальные ${R(q.pay * (1 - share))} — проценты. В аннуитете долг в первые годы почти не уменьшается: проценты считаются от остатка, а остаток пока огромный.</p>`,
      after: (host) => { drawStack(host); },
    });
  }
  function drawStack(host) {
    const yy = E.yearly(E.simulate({ principal: d.principal, months: d.months, rate: d.rate }));
    const box = document.createElement('div');
    host.appendChild(box);
    CH.stack(box, yy.map(y => (y.y + 1) + ''), [
      { name: 'В погашение долга', c: '--c-invest', values: yy.map(y => y.principal) },
      { name: 'Проценты банку', c: '--c-cost', values: yy.map(y => y.interest) },
    ], { title: 'Куда уходят ваши платежи по годам', sub: 'Каждый столбик — платежи за год', tipCat: c => `${c}-й год`, catHead: 'Год' });
    const half = (() => { let acc = 0; for (const y of yy) { acc += y.principal; if (acc >= d.principal / 2) return y.y + 1; } return yy.length; })();
    const after = $('#after', el);
    after.innerHTML = conclusion(`<p>Половину долга вы вернёте только к <b>${half}-му году</b> из ${Math.round(d.months / 12)}. Поэтому досрочные платежи в первые годы дают максимальный эффект, а рефинансирование в последние годы почти бесполезно — проценты к тому времени уже уплачены.</p>`) + navHtml();
    bindNav(after);
  }
  bindNav(el);
};

/* =========================================================================
   СТАВКИ: ПРОГРАММЫ И ЛЕСТНИЦА 3 → 30%
   ========================================================================= */
SCREENS.rates = (el) => {
  const pay = S.stage === 'pay';
  const progs = Mdl.programs();
  if (!pay && (!S.prog || !progs.find(p => p.id === S.prog && p.ok))) {
    const best = progs.filter(p => p.ok).map(p => ({ p, d: Mdl.deal(p.id) })).sort((a, b) => a.d.sim.totalPaid - b.d.sim.totalPaid)[0];
    S.prog = best ? best.p.id : 'market';
  }
  el.innerHTML = `${kicker(step() + ' · ставка')}
    <h2>${pay ? 'Ваша ставка против рынка' : 'Ставка решает всё'}</h2>
    <p class="soft">${pay ? 'Сравним вашу ставку с тем, что сейчас дают банки, и посмотрим, как сильно ставка меняет всю игру.' : 'Мы проверили, какие программы вам доступны на ' + D.asOf + '. Выберите, по какой будете брать — дальше игра пойдёт с ней.'}</p>
    <div id="progs"></div>
    <div id="res"></div>
    <div id="ladder"></div>
    <div id="q3"></div>
    <div id="concl"></div>`;

  /* --- программы --- */
  const drawProgs = () => {
    if (pay) {
      const d = Mdl.deal();
      const mk = Mdl.market();
      const refi = d.rate - mk;
      $('#progs', el).innerHTML = `<div class="stats">
        ${stat('Ваша ставка', P(d.rate, 1), D.programs[S.loan.prog] ? D.programs[S.loan.prog].short : '', 'hl')}
        ${stat('Рыночная сейчас', P(mk, 1), `ключевая ${P(D.key.now, 0)}`)}
      </div>
      ${refi > 0.02 ? `<div class="card ok"><h3>Есть смысл следить за рефинансированием</h3><p class="small">Ваша ставка выше рыночной на ${P(refi, 1).replace('%', '')} п.п. Рефинансирование окупается, когда разница больше 1,5–2 п.п., а до конца срока ещё много лет.</p></div>`
        : refi < -0.03 ? `<div class="card ok"><h3>Ваша ставка — подарок</h3><p class="small">Она ниже рыночной на ${P(-refi, 1).replace('%', '')} п.п. Держитесь за неё: не гасите досрочно в ущерб подушке и не теряйте условия льготы (страховка, состав заёмщиков).</p></div>` : ''}`;
      return;
    }
    $('#progs', el).innerHTML = `<div class="opts">${progs.map(p => {
      const d = p.ok ? Mdl.deal(p.id) : null;
      return `<button class="opt ${S.prog === p.id ? 'sel' : ''} ${p.ok ? '' : 'dim'}" data-id="${p.id}" ${p.ok ? '' : 'disabled'}>
        <span class="ic">${p.ic}</span>
        <span><span class="t">${p.name} · ${p.rateLabel ? p.rateLabel(S) : P(d ? d.rate : p.rate || Mdl.market(), 1)}</span>
        <span class="s">${p.ok ? p.desc(S) : '✗ ' + p.why}</span></span>
        ${p.ok ? `<span class="badge">${R(d.sim.firstPay)}</span>` : ''}
      </button>`;
    }).join('')}</div>${src(['domrfRates', 'familyRef'])}`;
    bindOpts(el, (id) => { S.prog = id; save(); drawRes(); drawLadder(); }, $('#progs', el));
  };

  /* --- результат по выбранной программе --- */
  const drawRes = () => {
    const d = Mdl.deal();
    const s = d.simNoIns;
    const pdn = Mdl.pdn(s.firstPay);
    const maxPay = d.steps.length ? Math.max(...s.rows.map(r => r.pay)) : s.firstPay;
    $('#res', el).innerHTML = `<div class="card gold">
      <h3>${pay ? 'Ваш кредит' : d.prog.name}: ${P(d.rate, 1)}${d.steps.length ? ` → ${P(d.steps[0].rate, 1)}` : ''}</h3>
      ${d.note ? `<p class="small soft">${d.note}</p>` : ''}
      <div class="stats" style="margin:10px 0 4px">
        ${stat('Платёж в месяц', R(s.firstPay), maxPay > s.firstPay * 1.05 ? `потом ${R(maxPay)}` : '', 'hl')}
        ${stat('Переплата процентами', M(s.totalInterest), `${X(s.totalInterest / d.principal)}× от кредита`, 'bad')}
        ${stat('Всего отдадите банку', M(s.totalPaid), `за ${ym(s.months)}`)}
        ${stat('Платёж от дохода (ПДН)', P(pdn, 0), pdn > 0.5 ? 'опасно' : pdn > 0.4 ? 'на грани' : 'комфортно', pdn > 0.5 ? 'bad' : pdn > 0.4 ? '' : 'good')}
      </div>
      ${pdn > 0.5 ? `<p class="small bad" style="margin:8px 0 0">Платёж больше половины дохода. Банк может отказать: ЦБ ограничивает выдачи заёмщикам с ПДН выше 50%. Даже если одобрят — любой форс-мажор станет кризисом.</p>` : ''}
    </div>`;
  };

  /* --- лестница ставок --- */
  const drawLadder = () => {
    const d = Mdl.deal();
    const L = Mdl.ladder(d.principal, d.months);
    let hl = 0;
    L.forEach((x, k) => { if (Math.abs(x.r - d.rate) < Math.abs(L[hl].r - d.rate)) hl = k; });
    const box = $('#ladder', el);
    box.innerHTML = `<h3 style="margin-top:22px">Лестница ставок: 3 → 30%</h3>
      <p class="soft small">Тот же кредит ${M(d.principal)} на ${yrs(d.months / 12)}. Ставки по льготам постоянно меняются, а рыночная идёт за ключевой ставкой ЦБ: в декабре 2024 года в среднем было почти 29%, сейчас — около ${P(Mdl.market(), 0)}.</p>
      <div id="lch"></div>
      <div class="tbl-wrap"><table><thead><tr><th>Ставка</th><th>Платёж</th><th>Переплата</th><th>К долгу</th></tr></thead><tbody>
      ${L.map((x, k) => `<tr class="${k === hl ? 'hl' : ''}"><td>${P(x.r, 0)}</td><td>${R(x.pay)}</td><td>${M(x.over)}</td><td>${X(x.over / d.principal)}×</td></tr>`).join('')}
      </tbody></table></div>`;
    CH.columns($('#lch', box), L.map(x => P(x.r, 0)), [
      { name: 'Переплата процентами', c: '--c-cost', values: L.map(x => x.over) },
    ], { title: 'Переплата при разных ставках', sub: 'Ближайшая к вашей ставке подсвечена', hl, labelTop: true, catHead: 'Ставка' });
  };

  drawProgs(); drawRes(); drawLadder();

  /* --- тест 3: срок --- */
  const d = Mdl.deal();
  const t30 = E.quick(d.principal, d.rate, 360), t20 = E.quick(d.principal, d.rate, 240);
  const ratio = t30.over / t20.over;
  const g = guessOpts(t30.over - t20.over, [0.25, 0.5, 1, 2], v => '+' + M(v));
  quiz(el, $('#q3', el), {
    id: 'term', n: 3, tag: 'срок',
    q: `Ставка ${P(d.rate, 1)}, долг ${M(d.principal)}. Растягиваем кредит с 20 до 30 лет — платёж падает на ${R(t20.pay - t30.pay)}. Насколько вырастет переплата?`,
    opts: g.opts, right: g.right,
    head: `На ${M(t30.over - t20.over)} — в ${X(ratio)} раза больше.`,
    explain: `<p>Экономия ${R(t20.pay - t30.pay)} в месяц обходится в лишние ${M(t30.over - t20.over)}. Длинный срок — это страховка на случай падения дохода, а не способ сэкономить.</p><p class="small soft" style="margin:0"><b>Как делают умные заёмщики:</b> берут максимальный срок (ниже обязательный платёж), а платят как за короткий — досрочно. Так переплата как при 20 годах, но в трудный месяц можно заплатить меньше.</p>`,
    onDone: () => {
      const dd = Mdl.deal();
      const mk = E.quick(dd.principal, Mdl.market(), dd.months);
      const gift = mk.over - dd.simNoIns.totalInterest;
      $('#concl', el).innerHTML = conclusion(pay
        ? `<p>При вашей ставке ${P(dd.rate, 1)} ${dd.rate < D.deposit.now ? `деньги на вкладе приносят больше (${P(D.deposit.now, 1)}), чем стоит ваш долг. Это редкий случай, когда <b>досрочно гасить не обязательно</b> — сначала подушка безопасности.` : `каждый досрочный рубль приносит гарантированные ${P(dd.rate, 1)} годовых без налога и риска. Такой доходности сейчас нет ни у вклада (${P(D.deposit.now, 1)}), ни у облигаций.`}</p>`
        : `<p>${dd.id !== 'market' && gift > 0 ? `Льгота экономит вам <b>${M(gift)}</b> по сравнению с рыночной ставкой. ` : ''}Разница между 6% и 20% — не «в три раза», а пропасть: при 20% вы отдаёте банку ${X(E.quick(dd.principal, 0.2, dd.months).over / dd.principal)} суммы кредита сверху, при 6% — ${X(E.quick(dd.principal, 0.06, dd.months).over / dd.principal)}.</p><p>Платёж больше 40–50% дохода — красная зона. Комфортно — до 30–35%: остаётся место для подушки и досрочных платежей.</p>`) + navHtml();
      bindNav($('#concl', el));
    },
  });
  bindNav(el);
};

/* =========================================================================
   СКРЫТЫЕ ПЛАТЕЖИ
   ========================================================================= */
SCREENS.hidden = (el) => {
  const d = Mdl.deal();
  const items = Mdl.hidden(d);
  const state = {};
  items.forEach(i => state[i.id] = i.on);
  el.innerHTML = `${kicker(step() + ' · мелкий шрифт')}
    <h2>Что не пишут в рекламе</h2>
    <p class="soft">«Ставка ${P(d.rate, 1)}» — это не всё. Отметьте, что будет в вашей сделке. Суммы посчитаны для вашего кредита ${M(d.principal)}.</p>
    <ul class="check" id="hl">${items.map(i => `<li class="${i.on ? 'on' : ''}" data-id="${i.id}"><span class="bx">${IC.check}</span><span class="ct"><b>${i.t}</b><span>${i.s}</span></span><span class="cv">${M(i.v)}</span></li>`).join('')}</ul>
    <div id="htot"></div>
    <div id="dev"></div>
    <div id="q4"></div>
    <div id="traps"></div>`;
  const drawTot = () => {
    const sum = items.filter(i => state[i.id]).reduce((s, i) => s + i.v, 0);
    const insOn = (state.life ? d.ins.life : 0) + (state.prop ? D.ins.prop : 0);
    const simI = E.simulate({ principal: d.principal, months: d.months, rate: d.rate + (state.life ? 0 : D.ins.refusePlus), rateSteps: d.steps, ins: { life: state.life ? d.ins.life : 0, prop: state.prop ? D.ins.prop : 0, title: state.title ? D.ins.title : 0, titleYears: 3, base: D.ins.base } });
    const once = items.filter(i => state[i.id] && i.when === 'разово').reduce((s, i) => s + i.v, 0);
    const psk = E.effRate(d.principal, simI, once);
    $('#htot', el).innerHTML = `<div class="stats">
      ${stat('Ставка в рекламе', P(d.rate, 1), d.steps.length ? 'на старте' : '')}
      ${stat('Полная стоимость (ПСК)', P(psk, 1), 'с вашими галочками', 'bad')}
      ${stat('Сверху к переплате', M(sum), 'страховки, сборы, ремонт', 'hl')}
      ${stat('Итого за квартиру', M(d.down + simI.totalPaid + once + (state.repair ? D.repairPerM2 * Mdl.area() : 0) + (state.rent ? Mdl.rentNow(d.cashPrice) * D.buildMonths : 0)), 'взнос + все платежи')}
    </div>
    <p class="tiny">ПСК — полная стоимость кредита: банк обязан писать её в правом верхнем углу договора в рамке. Сравнивайте банки по ПСК, а не по ставке из рекламы.</p>`;
  };
  $$('#hl li', el).forEach(li => li.onclick = () => { const id = li.dataset.id; state[id] = !state[id]; li.classList.toggle('on', state[id]); drawTot(); });
  drawTot();

  /* --- ловушка застройщика --- */
  const dv = D.dev;
  const cash = S.stage === 'pay' ? (S.loan.value) : d.cashPrice;
  const dn = S.stage === 'pay' ? cash * 0.2 : d.down;
  const term = S.stage === 'pay' ? 360 : d.months;
  const A = (() => { const price = cash * (1 + dv.markup); const P0 = price - dn; return { price, P0, sim: E.simulate({ principal: P0, months: term, rate: dv.rate, rateSteps: [{ from: dv.months, rate: Mdl.market() }] }) }; })();
  const B = (() => { const price = cash * (1 - dv.cashDiscount); const P0 = price - dn; return { price, P0, sim: E.simulate({ principal: P0, months: term, rate: Mdl.market() }) }; })();
  const paid5 = (sim) => sim.rows.slice(0, 60).reduce((s, r) => s + r.pay, 0);
  const debt5 = (sim) => sim.rows[59] ? sim.rows[59].bal : 0;
  const cost5 = (x) => paid5(x.sim) + debt5(x.sim);
  $('#dev', el).innerHTML = `<h3 style="margin-top:24px">Ставка ${P(dv.rate)} от застройщика: в чём подвох?</h3>
    <p class="soft small">Банк не работает себе в убыток. Если ставка ниже рыночной, разницу банку платит застройщик — обычно ${dv.commissionLabel} от суммы кредита. И закладывает её в цену квартиры.</p>
    <div class="stats">
      ${stat('А. «Ставка ' + P(dv.rate) + '» на ' + ym(dv.months), M(A.price), `+${P(dv.markup, 0)} к цене · платёж ${R(A.sim.rows[0].pay)} → ${R(A.sim.rows[dv.months].pay)}`)}
      ${stat('Б. Без субсидии, рыночная ставка ' + P(Mdl.market(), 1), M(B.price), `цена без наценки · платёж ${R(B.sim.rows[0].pay)}`)}
    </div>`;
  const aBetter = cost5(A) < cost5(B);
  quiz(el, $('#q4', el), {
    id: 'dev', n: 4, tag: 'ловушка застройщика',
    q: 'Вы собираетесь продать квартиру или рефинансироваться через 5 лет. Какой вариант обойдётся дешевле?',
    sub: 'Считаем всё, что заплатите за 5 лет, плюс остаток долга, который придётся погасить.',
    opts: [{ t: 'А — низкая ставка от застройщика' }, { t: 'Б — скидка и рыночная ставка' }, { t: 'Одинаково' }],
    right: aBetter ? 0 : 1,
    head: `${aBetter ? 'А' : 'Б'} дешевле на ${M(Math.abs(cost5(A) - cost5(B)))}.`,
    explain: `<div class="kv"><span>А: платежи за 5 лет + остаток долга</span><span>${M(cost5(A))}</span><span>Б: платежи за 5 лет + остаток долга</span><span>${M(cost5(B))}</span><span>А: всего за ${yrs(term / 12)}, если не рефинансировать</span><span>${M(A.sim.totalPaid)}</span><span>Б: всего за ${yrs(term / 12)}</span><span>${M(B.sim.totalPaid)}</span></div>
      <p>Через ${ym(dv.months)} платёж по варианту А вырастет в ${X(A.sim.rows[dv.months].pay / A.sim.rows[0].pay)} раза — до ${R(A.sim.rows[dv.months].pay)}. А долг больше на ${M(A.P0 - B.P0)}, потому что больше цена. ${aBetter ? 'Пока рыночные ставки высокие, короткая скидка по ставке успевает отбить наценку — но только если через пару лет вы рефинансируетесь или продадите квартиру.' : 'Низкая ставка на пару лет не отбивает наценку.'} ${A.sim.totalPaid > B.sim.totalPaid ? `А если остаться с кредитом на весь срок, наценка обойдётся в лишние <b>${M(A.sim.totalPaid - B.sim.totalPaid)}</b>: долг больше на всё время.` : ''}</p>
      <p class="small soft" style="margin:0">Всегда спрашивайте у застройщика цену «при 100% оплате» и «при рыночной ипотеке». Разница между ценами — и есть настоящая стоимость «подарка».</p>`,
    onDone: () => drawTraps(),
  });
  function drawTraps() {
    $('#traps', el).innerHTML = `<div class="card warn"><h3>Когда ставка внезапно вырастает</h3>
      <ul class="check static">${D.traps.map(t => `<li><span class="bx warn-mark">!</span><span class="ct"><b>${t.t}</b><span>${t.s}</span></span></li>`).join('')}</ul></div>
      ${conclusion(`<p>Реальная цена ипотеки — это ПСК плюс сопутствующие траты. В вашем случае сверху набегает <b>${M(items.filter(i => state[i.id]).reduce((s, i) => s + i.v, 0))}</b>. Страховку можно купить не в банке, а у аккредитованной им страховой — обычно на 20–40% дешевле. Делайте это каждый год.</p>`)}
      ${src(['insTariffs', 'devSubsidy'])}
      ${navHtml()}`;
    bindNav($('#traps', el));
  }
  bindNav(el);
};

/* =========================================================================
   «А ЕСЛИ БЫ ИНВЕСТИРОВАЛИ?»
   ========================================================================= */
SCREENS.invest = (el) => {
  const d = Mdl.deal();
  const s = d.simNoIns;
  const over = s.totalInterest + d.sim.totalIns;
  const infl = D.infl.longRun;
  el.innerHTML = `${kicker(step() + ' · деньги во времени')}
    <h2>А если бы деньги работали на вас?</h2>
    <p class="soft">Банк даёт вам ${M(d.principal)} и получает ${M(over)} сверху. Посмотрим на это глазами инвестора.</p>
    <h3>На вашу переплату можно купить</h3>
    <div class="stats three" id="things"></div>
    <p class="tiny">Цены 2026 года: ${D.things.filter(t => t.p).map(t => t.t + ' — ' + M(t.p)).join(', ')}; аренда такой квартиры — ${R(Mdl.rentNow(d.cashPrice))} в месяц.</p>
    <h3 style="margin-top:22px">Ставка глазами инвестора</h3>
    <p class="soft small">Банк зарабатывает на вашей ипотеке ровно столько, сколько вы заработали бы на вкладе под ту же ставку. Но есть третий участник — инфляция: каждый год она «списывает» часть долга. Возьмём каждый 1 000 000 ₽ долга и один год.</p>
    <div class="tbl-wrap"><table class="wrap-last"><thead><tr><th>Ставка</th><th>Проценты<br>банку*</th><th>Инфляция<br>спишет</th><th>Реальная<br>цена</th></tr></thead><tbody>
    ${D.ladder.map(r => {
      const net = (r - infl) * 1e6;
      return `<tr class="${D.ladder.reduce((b, x) => Math.abs(x - d.rate) < Math.abs(b - d.rate) ? x : b) === r ? 'hl' : ''}"><td>${P(r, 0)}</td><td>${M(r * 1e6)}</td><td>−${M(infl * 1e6)}</td><td>${net < 0 ? `<span class="good">выгода ${M(-net)}</span>` : M(net)}</td></tr>`;
    }).join('')}
    </tbody></table></div>
    <p class="tiny">* Столько же принёс бы вам вклад в 1 млн ₽ под эту ставку. Инфляция — ${P(infl, 0)} в год (базовый сценарий игры: цель ЦБ — 4%, в среднем за 2011–2025 годы было ${P(D.infl.avg15, 1)}).</p>
    <div class="card gold" id="mydebt"></div>
    <div id="q5"></div>
    <div id="concl"></div>`;
  const th = $('#things', el);
  th.innerHTML = D.things.map(t => {
    const n = over / (t.p || Mdl.rentNow(d.cashPrice) * 12);
    return stat(`${t.ic} ${t.t}`, n >= 10 ? nf0.format(Math.floor(n)) : X(n), t.unit(n));
  }).join('');

  /* --- ваш долг глазами инвестора --- */
  (() => {
    const y1 = s.rows.slice(0, 12);
    const int1 = y1.reduce((a, r) => a + r.interest, 0);
    const avgBal = y1.reduce((a, r) => a + r.bal, 0) / Math.max(1, y1.length);
    const eros = avgBal * infl;
    const net = int1 - eros;
    const depN = D.deposit.now * 0.87;
    const verdict = d.rate < infl
      ? `<b class="good">Долг работает на вас.</b> Инфляция списывает больше, чем вы платите банку. Досрочно не гасите — копите и инвестируйте.`
      : d.rate < depN
        ? `<b class="good">Долг почти бесплатный.</b> Вклад сейчас даёт ${P(depN, 1)} после налога — больше вашей ставки, так что свободные деньги выгоднее держать на вкладе. Когда ставки по вкладам опустятся ниже ${P(d.rate, 1)}, переключайтесь на досрочку.`
        : `<b class="bad">Долг дорогой.</b> Каждый досрочный рубль «приносит» ${P(d.rate, 1)} без налога и риска — больше, чем вклад (${P(depN, 1)} после налога). Гасите досрочно, сокращая срок, и следите за рефинансированием.`;
    $('#mydebt', el).innerHTML = `<h3>Ваш долг ${M(d.principal)} под ${P(d.rate, 1)}</h3>
      <div class="kv"><span>Проценты банку за первый год</span><span>${M(int1)}</span>
      <span>Инфляция спишет с долга</span><span>−${M(eros)}</span>
      <span>Реальная цена долга</span><span>${net < 0 ? `выгода ${M(-net)} в год` : `${M(net)} в год · ${R(net / 12)}/мес`}</span></div>
      <p class="small" style="margin:0">${verdict}</p>`;
  })();

  /* --- тест 5: досрочка или вклад --- */
  const dep = D.deposit.now;
  const depNet = dep * (1 - 0.13);
  const prepay = d.rate > depNet;
  quiz(el, $('#q5', el), {
    id: 'prepay', n: 5, tag: 'досрочка или вклад',
    q: `У вас появились свободные 500 000 ₽. Ипотека — ${P(d.rate, 1)}, лучший вклад — ${P(dep, 1)}. Подушка безопасности уже есть. Что выгоднее сейчас?`,
    opts: [{ t: 'Досрочно погасить ипотеку' }, { t: 'Положить на вклад' }, { t: 'Без разницы' }],
    right: prepay ? 0 : 1,
    head: prepay ? `Досрочка: она «приносит» ${P(d.rate, 1)} без налога.` : `Вклад: ${P(depNet, 1)} после налога больше, чем ${P(d.rate, 1)} по ипотеке.`,
    explain: prepay
      ? `<p>Досрочный платёж — это гарантированная доходность, равная ставке кредита. Вклад даёт ${P(dep, 1)}, а после НДФЛ 13% (если проценты больше необлагаемого лимита) — около ${P(depNet, 1)}. Ипотека дороже — гасите её.</p><p class="small soft" style="margin:0">Исключение: нет подушки на 3–6 платежей. Сначала подушка, потом досрочка.</p>`
      : `<p>Ваш кредит дешевле, чем приносят деньги на вкладе. Пока так, выгоднее держать деньги на вкладе или в фонде денежного рынка и гасить по графику. Но учтите: ставки по вкладам упадут вслед за ключевой — ЦБ ждёт ${P(D.key.forecast2028, 0)} в 2028 году. Когда вклад станет приносить меньше ставки ипотеки, переводите деньги в досрочку.</p>`,
    onDone: () => {
      $('#concl', el).innerHTML = conclusion(`<p><b>Правило одной строки:</b> сравните ставку ипотеки с доходностью, которую вы реально получаете после налога. Ипотека дороже — гасите досрочно. Дешевле — копите и инвестируйте, а ипотека пусть обесценивается инфляцией.</p><p>При ставке ниже инфляции (льготные 2–6%) банк фактически доплачивает вам: каждый год долг «худеет» в реальных деньгах на ${P(Math.max(0, infl - Math.min(d.rate, 0.06)), 0)}–${P(infl, 0)}.</p>`) + src(['cbrDeposits', 'moexIndex']) + navHtml();
      bindNav($('#concl', el));
    },
  });
  bindNav(el);
};

/* =========================================================================
   ПОЧЕМУ ИПОТЕКУ ВСЁ-ТАКИ БЕРУТ
   ========================================================================= */
SCREENS.why = (el) => {
  const d = Mdl.deal();
  const H = D.hist;
  const i0 = H.years.indexOf(2000);
  const cpiIdx = [1];
  for (let k = 1; k < H.years.length; k++) cpiIdx.push(cpiIdx[k - 1] * (1 + H.cpi[k] / 100));
  const pOld = H.ppmOld.map(v => v / H.ppmOld[0] * 100);
  const pNew = H.ppmNew.map(v => v / H.ppmNew[0] * 100);
  const wg = H.wage.map(v => v / H.wage[0] * 100);
  const cp = cpiIdx.map(v => v * 100);
  const last = H.years.length - 1;
  el.innerHTML = `${kicker(step() + ' · взгляд в будущее')}
    <h2>Почему ипотеку всё-таки берут</h2>
    <p class="soft">Переплата пугает. Но у ипотеки есть сильные стороны, которые не видны в калькуляторе банка: инфляция, рост цен на жильё и аренда, которую иначе платили бы всю жизнь.</p>
    <div id="q6"></div>
    <div id="hist"></div>
    <div id="burden"></div>
    <div id="rvb"></div>
    <div id="concl"></div>`;

  /* --- тест 6 --- */
  const truth = D.ppmOldNow;
  const g = guessOpts(truth, [0.25, 0.5, 1, 2], v => nf0.format(round(v, 500)) + ' ₽');
  quiz(el, $('#q6', el), {
    id: 'hist', n: 6, tag: 'история цен',
    q: `В 2000 году квадратный метр на вторичке стоил в среднем ${nf0.format(H.ppmOld[0] * 1000)} ₽. Сколько он стоит сейчас?`,
    sub: 'Средняя цена по России, Росстат.',
    opts: g.opts, right: g.right,
    head: `${nf0.format(round(truth, 500))} ₽ — в ${X(truth / (H.ppmOld[0] * 1000))} раза дороже.`,
    explain: `<p>Цены в магазинах за то же время выросли примерно в ${X(cpiIdx[last])} раза. Жильё обгоняло инфляцию: тот, кто купил квартиру в 2000-х даже в ипотеку, сейчас владеет активом, который вырос сильнее денег на вкладе.</p>`,
    after: () => drawHist(),
  });

  function drawHist() {
    const box = $('#hist', el);
    box.innerHTML = '<div id="hch"></div>';
    CH.lines($('#hch', box), H.years.map(String), [
      { name: 'Зарплата', c: '--c-good', values: wg },
      { name: 'Новостройки, м²', c: '--c-home', values: pNew },
      { name: 'Вторичка, м²', c: '--c-extra', values: pOld },
      { name: 'Цены в магазинах', c: '--c-cost', values: cp },
    ], { title: 'Что дорожало быстрее с 2000 года', sub: 'Индекс: 2000 год = 100. Средние по России, Росстат', fmt: v => nf0.format(Math.round(v)), yFmt: v => nf0.format(v), xHead: 'Год', tableStep: 5, h: 240 });
    box.insertAdjacentHTML('beforeend', `<div class="card"><p class="small" style="margin:0">Честно о графике: с 2000 года зарплаты росли быстрее квартир, и жильё стало доступнее. Но с 2020 года льготная ипотека разогнала новостройки: м² подорожал в ${X(H.ppmNew[last] / H.ppmNew[H.years.indexOf(2020)])} раза, а зарплата — в ${X(H.wage[last] / H.wage[H.years.indexOf(2020)])}. Сейчас семье из двух работающих нужно ${D.affordYears} года всех доходов, чтобы купить новостройку (ДОМ.РФ).</p></div>${src(['rosstatPrice', 'rosstatWage', 'cpi'])}`);
    drawBurden();
  }

  /* --- платёж, который не растёт --- */
  function drawBurden() {
    const pth = Mdl.paths();
    const s = d.simNoIns;
    const years = Math.ceil(s.months / 12);
    const xs = [], share = [], realPay = [];
    for (let y = 0; y < years; y++) {
      const m = y * 12;
      const inc = S.income * E.index(pth.infl.map(i => i + D.wage.real), m);
      const pay = s.rows[Math.min(m, s.rows.length - 1)].pay;
      xs.push(String(D.startYear + y));
      share.push(pay / inc * 100);
      realPay.push(pay * Mdl.realK(m));
    }
    const box = $('#burden', el);
    box.innerHTML = `<h3 style="margin-top:22px">Платёж стоит на месте, а зарплата растёт</h3>
      <p class="soft small">Ипотека с фиксированной ставкой — один из немногих расходов, который не дорожает. Аренда, продукты и зарплаты растут вместе с инфляцией, а платёж через 10 лет — те же ${R(s.firstPay)}.</p>
      <div id="bch"></div>`;
    CH.lines($('#bch', box), xs, [
      { name: 'Платёж в % от дохода', c: '--c-home', values: share, area: true },
    ], { title: 'Какую часть дохода съедает платёж', sub: `Если доход растёт на инфляцию + ${P(D.wage.real, 0)} в год (как в среднем у зарплат в России)`, fmt: v => v.toFixed(0) + '%', yFmt: v => v + '%', xHead: 'Год', h: 200 });
    const y10 = Math.min(10, years - 1);
    box.insertAdjacentHTML('beforeend', `<p class="small">Сейчас платёж — ${P(share[0] / 100, 0)} дохода, через ${y10} лет — около ${P(share[y10] / 100, 0)}. В сегодняшних деньгах последний платёж будет равен ${R(realPay[realPay.length - 1])}.</p>`);
    drawRvb();
  }

  /* --- аренда + инвестиции против ипотеки --- */
  function drawRvb() {
    const box = $('#rvb', el);
    const inv = S.plan.inv || 'dep';
    const rvb = Mdl.rentVsBuy(d, { inv });
    const lastR = rvb[rvb.length - 1];
    const k = Mdl.realK(rvb.length);
    const save = E.saveUp({
      start: S.stage === 'pay' ? 0 : Math.min(S.savings, d.down), rent0: Mdl.rentNow(d.cashPrice), budget: d.sim.firstPay + d.sim.rows[0].ins / 12,
      price: d.cashPrice, homeGrowth: Mdl.paths().home, rentGrowth: Mdl.paths().rentGrowth, invReturn: Mdl.paths().dep, tax: 0.13, budgetGrowth: D.infl.longRun + D.wage.real,
    });
    const xs = rvb.filter((_, m) => m % 12 === 0 || m === rvb.length - 1).map(r => String(D.startYear + Math.floor(r.m / 12)));
    const pick = rvb.filter((_, m) => m % 12 === 0 || m === rvb.length - 1);
    const buyerWins = lastR.buyer > lastR.renter;
    box.innerHTML = `<h3 style="margin-top:22px">Ипотека или аренда с инвестициями?</h3>
      <p class="soft small">${S.stage === 'pay'
        ? `Сравним два пути при одном бюджете. А — оставить квартиру и платить ипотеку. Б — продать её, погасить долг, вложить остаток ${M(Math.max(0, d.cashPrice - d.principal))}, снимать такую же за ${R(Mdl.rentNow(d.cashPrice))}/мес и инвестировать разницу.`
        : `Честное сравнение при одном бюджете. Покупатель платит взнос и ипотеку. Арендатор вкладывает тот же взнос, платит аренду ${R(Mdl.rentNow(d.cashPrice))}/мес и инвестирует разницу. Если аренда дороже ипотеки — разницу инвестирует покупатель.`}</p>
      <div class="toggle" id="invt"><button data-v="dep" class="${inv === 'dep' ? 'on' : ''}">Вклады</button><button data-v="stocks" class="${inv === 'stocks' ? 'on' : ''}">Акции (индекс)</button></div>
      <div id="rch"></div>
      <div class="stats">
        ${stat('Капитал покупателя', M(lastR.buyer), `квартира ${M(lastR.home)}${lastR.buyerCash > 1000 ? ' + вложения ' + M(lastR.buyerCash) : ''}`, buyerWins ? 'hl' : '')}
        ${stat('Капитал арендатора', M(lastR.renter), 'портфель, квартиры нет', buyerWins ? '' : 'hl')}
      </div>
      <p class="tiny">Через ${ym(rvb.length)} (${D.startYear + Math.round(rvb.length / 12)} год), в будущих рублях. В сегодняшних деньгах: ${M(lastR.buyer * k)} против ${M(lastR.renter * k)}. Допущения: квартиры дорожают на инфляцию + ${P(D.homeReal, 0)}, аренда — на инфляцию + ${P(D.rentReal, 1)}, вклады следуют за прогнозом ключевой ставки ЦБ (минус ${P(-D.deposit.spread, 0)} и НДФЛ), акции — ${P(D.stocks.avg, 1)} в год (среднее MCFTR за 2010–2025).</p>
      ${S.stage === 'pay' ? '' : `<div class="card ${isFinite(save.months) && save.months < d.months ? '' : 'warn'}"><h3>А если копить на квартиру самому?</h3>
      <p class="small" style="margin:0">Откладывая ${R(Math.max(0, d.sim.firstPay - Mdl.rentNow(d.cashPrice)))} в месяц (ваш платёж минус аренда) на вклад, вы накопите на эту квартиру ${isFinite(save.months) ? `через <b>${ym(save.months)}</b> — к тому времени она будет стоить ${M(save.price)}` : '<b>никогда</b>: аренда съедает почти весь бюджет, а квартира дорожает быстрее накоплений'}. Всё это время вы платите аренду и живёте не у себя.</p></div>`}`;
    CH.lines($('#rch', box), xs, [
      { name: 'Покупатель: квартира − долг', c: '--c-home', values: pick.map(r => r.buyer) },
      { name: 'Арендатор: портфель', c: '--c-invest', values: pick.map(r => r.renter) },
    ], { title: 'Чистый капитал по годам', sub: 'Номинальные рубли', xHead: 'Год', h: 220 });
    $$('#invt button', box).forEach(b => b.onclick = () => { S.plan.inv = b.dataset.v; save(); drawRvb(); drawConcl(); });
    drawConcl();
  }
  function drawConcl() {
    const inv = S.plan.inv || 'dep';
    const rvb = Mdl.rentVsBuy(d, { inv });
    const L = rvb[rvb.length - 1];
    const buyerWins = L.buyer > L.renter;
    const cross = rvb.findIndex((r, m) => m > 0 && (r.buyer > r.renter) !== (rvb[m - 1].buyer > rvb[m - 1].renter));
    const crossTxt = cross > 0 && buyerWins && rvb[0].buyer < rvb[0].renter ? ` Но первые ${ym(cross)} впереди арендатор — ипотека обгоняет только в ${LIFE.yearOf(cross)} году. Поэтому покупать на 3–5 лет почти никогда не выгодно.` : '';
    $('#concl', el).innerHTML = conclusion(`<p>${buyerWins
      ? `В вашем сценарии ипотека выигрывает: к концу срока у покупателя на <b>${M(L.buyer - L.renter)}</b> больше. Квартира дорожает вместе с инфляцией, а долг — нет.${crossTxt}`
      : `В вашем сценарии аренда с дисциплинированными инвестициями выигрывает на <b>${M(L.renter - L.buyer)}</b>. Так бывает при высокой ставке и дешёвой аренде. Но выигрыш есть, только если вы действительно каждый месяц инвестируете разницу — без пропусков 20+ лет. На практике это удаётся немногим.`}</p>
      <p>Ипотека разумна, когда: 1) ставка ниже или около будущего роста цен и инфляции; 2) платёж не больше 35–40% дохода; 3) вы собираетесь жить в квартире долго — 7–10 лет и больше; 4) есть подушка на полгода платежей.</p>`) + navHtml();
    bindNav($('#concl', el));
  }
  bindNav(el);
};
