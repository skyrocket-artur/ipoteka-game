'use strict';
/* =========================================================================
   ИПОТЕКА БЕЗ ИЛЛЮЗИЙ · «Жизнь с ипотекой» (7 решений), план погашения, финал
   ========================================================================= */

const LIFE = {};

/* Ключевая ставка по годам игры: базовый прогноз ЦБ + кризис на 9-м году (рисковый сценарий ЦБ) */
LIFE.CRISIS_Y = 8;
LIFE.key = () => {
  const a = [];
  for (let y = 0; y < 45; y++) a.push(y < D.key.path.length ? D.key.path[y] : D.key.longRun);
  D.key.shock.forEach((v, k) => { a[LIFE.CRISIS_Y + k] = v; });
  return a;
};
LIFE.dep = () => LIFE.key().map(k => Math.max(0.03, k + D.deposit.spread));
LIFE.market = (y) => LIFE.key()[y] + (y < 2 ? D.market.spread : 0.03);
LIFE.yearOf = (m) => D.startYear + Math.floor((m + 9) / 12); // старт — октябрь
const depNet = (y) => LIFE.dep()[y] * 0.87;

/* -------------------------------------------------------------------------
   Сборка сценария из решений
   ------------------------------------------------------------------------- */
LIFE.blank = (d) => ({
  sets: [],      // {m, rate, keep} — смена ставки (рефинанс: keep=false отменяет базовые шаги после m)
  plus: [],      // {m, v} — надбавка к ставке
  lumps: [], holidays: [], extraMonthly: 0, extraFrom: 0,
  kSteps: [], lifeTo: null,
  side: [],      // {m, amount, kind:'dep'|'stocks'|'infl', monthly?: n} — деньги вне кредита
});

LIFE.apply = (d, ch, upto) => {
  const o = LIFE.blank(d);
  const evs = LIFE.events(d);
  evs.forEach((ev, k) => {
    if (upto != null && k >= upto) return;
    const c = ch[ev.id];
    const opt = c && ev.opts.find(x => x.id === c);
    if (opt && opt.fx) opt.fx(o, LIFE.ctx(d, o));
  });
  return o;
};

/* Ставка в месяц m: базовые шаги (конец промо/субсидии), рефинансирование (отменяет базовые шаги после себя),
   смена ставки семейной (keep — базовые шаги после неё остаются), надбавки */
LIFE.rateAt = (d, o, m) => {
  const evs = d.steps.map(s => ({ from: s.from, rate: s.rate, base: true }))
    .concat(o.sets.map(s => ({ from: s.from, rate: s.rate, keep: s.keep })))
    .sort((a, b) => a.from - b.from || (a.base ? -1 : 1));
  let r = d.rate, refiAt = -1;
  for (const e of evs) {
    if (e.from > m) break;
    if (e.base) { if (e.from > refiAt) r = e.rate; }
    else { r = e.rate; if (!e.keep) refiAt = e.from; }
  }
  for (const p of o.plus) if (m >= p.from) r += p.v;
  return r;
};

LIFE.sim = (d, o) => {
  const steps = [];
  let prev = LIFE.rateAt(d, o, 0);
  for (let m = 1; m < d.months + 60; m++) {
    const r = LIFE.rateAt(d, o, m);
    if (Math.abs(r - prev) > 1e-9) { steps.push({ from: m, rate: r }); prev = r; }
  }
  return E.simulate({
    principal: d.principal, months: d.months, rate: LIFE.rateAt(d, o, 0), rateSteps: steps,
    lumps: o.lumps, holidays: o.holidays, extraMonthly: o.extraMonthly, extraFrom: o.extraFrom, extraMode: 'term',
    ins: Object.assign({}, d.ins, { kSteps: o.kSteps, lifeTo: o.lifeTo }),
  });
};

/* Деньги вне кредита (подушка, вклады, акции, маткапитал) на месяц T */
LIFE.sideAt = (o, T) => {
  const dep = LIFE.dep();
  let v = { dep: 0, stocks: 0, infl: 0 };
  for (let m = 0; m <= T; m++) {
    const y = Math.floor(m / 12);
    v.dep *= 1 + E.mGrow(dep[y]) * 0.87;
    v.stocks *= 1 + E.mGrow(D.stocks.avg);
    v.infl *= 1 + E.mGrow(E.atYear(D.infl.path, m));
    for (const s of o.side) {
      const k = s.kind || 'dep';
      if (s.monthly) { if (m >= s.m && m < s.m + s.monthly) v[k] += s.amount; }
      else if (s.m === m) v[k] += s.amount;
    }
  }
  return v.dep + v.stocks + v.infl;
};

/* Контекст для текстов событий */
LIFE.ctx = (d, o) => {
  const sim = LIFE.sim(d, o);
  return { d, o, sim, pay: sim.rows[0].pay, rate: d.rate };
};

/* Подушка: свободные деньги после взноса */
LIFE.cushion = (d) => (S.stage === 'pay' ? S.savings : Math.max(0, S.savings - d.down));

/* Налоговый вычет по годам: база 260 тыс + 13% процентов до 390 тыс, не больше НДФЛ за год */
LIFE.deductionFlows = (d, sim) => {
  const ndfl = S.income / 0.87 * 0.13 * 12;
  const flows = [];
  let base = d.price >= 2e6 ? D.deduction.base : d.price * 0.13;
  let pct = D.deduction.pct;
  const ys = E.yearly(sim);
  for (let y = 0; y < Math.min(ys.length, 40) && (base > 1 || pct > 1); y++) {
    let cap = ndfl;
    const b = Math.min(base, cap); base -= b; cap -= b;
    const p = Math.min(pct, ys[y].interest * 0.13, cap); pct -= p;
    if (b + p > 1) flows.push({ m: 15 + y * 12, amount: Math.round(b + p) });
  }
  return flows;
};

/* -------------------------------------------------------------------------
   События
   ------------------------------------------------------------------------- */
LIFE.events = (d) => {
  const evs = [];
  const base = d.sim;
  const pay = base.rows[0].pay;
  const cushionOk = LIFE.cushion(d) >= 3 * pay;
  const rate0 = d.rate;

  /* 1. Премия */
  const bonus = clamp(round(3 * pay, 10000), 100000, 1500000);
  evs.push({
    id: 'bonus', m: 11, ic: '💰', title: 'Премия',
    text: (c) => `<p>Прошёл год. На работе выплатили годовую премию — <b>${M(bonus)}</b> на руки.</p><p class="small soft">Ставка по ипотеке ${P(LIFE.rateAt(d, c.o, 11), 1)}, вклады сейчас дают около ${P(LIFE.dep()[1], 1)}. ${cushionOk ? 'Подушка безопасности у вас есть.' : '<b>Подушки почти нет:</b> свободных денег меньше трёх платежей.'}</p>`,
    opts: [
      { id: 'term', t: 'Внести досрочно — сократить срок', fx: (o) => o.lumps.push({ month: 11, amount: bonus, mode: 'term' }) },
      { id: 'pay', t: 'Внести досрочно — уменьшить платёж', fx: (o) => o.lumps.push({ month: 11, amount: bonus, mode: 'payment' }) },
      { id: 'save', t: 'Положить на вклад — это подушка', fx: (o) => o.side.push({ m: 11, amount: bonus }) },
      { id: 'spend', t: 'Отпуск и новый телефон', fx: null },
    ],
    tip: (c) => (!cushionOk ? 'Без резерва на 3–6 платежей любая неприятность превращается в долг под 30%.' : LIFE.rateAt(d, c.o, 11) > depNet(1) ? 'Ставка кредита выше доходности вклада — досрочка выгоднее.' : 'Вклад приносит больше, чем стоит ваш кредит.'),
    grade: (id, c) => {
      const r = LIFE.rateAt(d, c.o, 11);
      if (!cushionOk) return { save: 'good', term: 'ok', pay: 'ok', spend: 'bad' }[id];
      if (r > depNet(1)) return { term: 'good', pay: 'ok', save: 'ok', spend: 'bad' }[id];
      return { save: 'good', term: 'ok', pay: 'ok', spend: 'bad' }[id];
    },
    lesson: (id, c, w, wo) => {
      const dInt = (wo.sim.totalInterest + wo.sim.totalIns) - (w.sim.totalInterest + w.sim.totalIns);
      if (id === 'term') return `<p>Срок сократился на <b>${ym(wo.sim.months - w.sim.months)}</b>, банку уйдёт на <b>${M(dInt)}</b> меньше. Каждый досрочный рубль убрал ${X(dInt / bonus)} ₽ будущих процентов — тех, что пришлись бы на последние годы кредита.</p>`;
      if (id === 'pay') {
        const alt = LIFE.sim(d, (() => { const o = LIFE.apply(d, S.life.ch, 0); o.lumps.push({ month: 11, amount: bonus, mode: 'term' }); return o; })());
        const altSave = (wo.sim.totalInterest + wo.sim.totalIns) - (alt.totalInterest + alt.totalIns);
        return `<p>Платёж снизился на <b>${R(Math.max(0, (wo.sim.rows[12] ? wo.sim.rows[12].pay : 0) - (w.sim.rows[12] ? w.sim.rows[12].pay : 0)))}</b> в месяц, экономия процентов — ${M(dInt)}. Если бы сокращали срок, сэкономили бы ${M(altSave)} — в ${X(altSave / Math.max(1, dInt))} раза больше.</p><p class="small soft">Уменьшать платёж стоит, когда тяжело платить или ждёте снижения дохода.</p>`;
      }
      if (id === 'save') return `<p>${cushionOk ? 'Подушка стала толще.' : 'Теперь у вас есть подушка — это важнее досрочки.'} На вкладе премия к концу срока превратится в ~${M(LIFE.sideAt({ side: [{ m: 11, amount: bonus }] }, d.months))}.</p><p class="small soft">Правило: сначала резерв на 3–6 платежей, потом досрочка или инвестиции.</p>`;
      return `<p>Отдых — это нормально. Но эти ${M(bonus)} в досрочку сэкономили бы ${M((() => { const o = LIFE.apply(d, S.life.ch, 0); o.lumps.push({ month: 11, amount: bonus, mode: 'term' }); const s = LIFE.sim(d, o); return (wo.sim.totalInterest + wo.sim.totalIns) - (s.totalInterest + s.totalIns); })())} процентов. Компромисс — 70% в дело, 30% на радость.</p>`;
    },
  });

  /* 2. Налоговый вычет */
  evs.push({
    id: 'tax', m: 15, ic: '🧾', title: 'Налоговый вычет',
    text: () => `<p>Весна. Можно вернуть НДФЛ за покупку жилья — до <b>260 000 ₽</b> с цены и до <b>390 000 ₽</b> с уплаченных процентов. Подать можно через Госуслуги или личный кабинет налогоплательщика.</p><p class="small soft">${S.stage === 'pay' ? 'Если вы уже получали вычет — представьте, что делаете это впервые. ' : ''}Если квартира в совместной собственности, вычет с цены может получить каждый из супругов — до 520 000 ₽ на семью.</p>`,
    opts: [
      { id: 'prepay', t: 'Оформлять каждый год и вносить в досрочку', fx: (o, c) => LIFE.deductionFlows(d, base).forEach(f => o.lumps.push({ month: f.m, amount: f.amount, mode: 'term' })) },
      { id: 'save', t: 'Оформлять и откладывать на вклад', fx: (o) => LIFE.deductionFlows(d, base).forEach(f => o.side.push({ m: f.m, amount: f.amount })) },
      { id: 'skip', t: 'Не оформлять — слишком сложно', fx: null },
    ],
    tip: (c) => (LIFE.rateAt(d, c.o, 15) > depNet(1) ? 'Ставка кредита выше вклада — вычет работает сильнее в досрочке.' : 'Ваш кредит дешевле вклада — вычет выгоднее копить.'),
    grade: (id, c) => {
      if (id === 'skip') return 'bad';
      const r = LIFE.rateAt(d, c.o, 15);
      return (r > depNet(1) ? { prepay: 'good', save: 'ok' } : { prepay: 'ok', save: 'good' })[id];
    },
    lesson: (id, c, w, wo) => {
      const fl = LIFE.deductionFlows(d, base);
      const tot = fl.reduce((s, f) => s + f.amount, 0);
      if (id === 'skip') return `<p>Вы оставили государству <b>${M(tot)}</b>. Заявление в личном кабинете налогоплательщика занимает 15 минут: банк сам присылает справку об уплаченных процентах.</p>`;
      const years = fl.length;
      return `<p>За ${years} ${plural(years, ['год', 'года', 'лет'])} вы вернёте <b>${M(tot)}</b>${tot < D.deduction.base + D.deduction.pct - 1000 ? ' (больше не позволяет ваш НДФЛ или уплаченные проценты)' : ''}. ${id === 'prepay' ? `В досрочке это сократило срок на ${dot(ym(wo.sim.months - w.sim.months))}` : 'Деньги на вкладе работают на подушку.'}</p>`;
    },
  });

  /* 3. Ставки упали: рефинансирование или «доплачивать/инвестировать» */
  const y3 = 2, m3 = 24;
  const mk3 = LIFE.market(y3);
  evs.push({
    id: 'rates', m: m3, ic: '📉', title: 'Ставки снизились',
    text: (c) => {
      const r = LIFE.rateAt(d, c.o, m3);
      const promoJump = d.steps.some(s => s.from <= m3 + 1 && s.rate > d.rate) && d.id === 'dev';
      return `<p>${LIFE.yearOf(m3)} год. ЦБ снизил ключевую ставку до <b>${P(LIFE.key()[y3], 1)}</b>. Рыночная ипотека — около ${P(mk3, 1)}, вклады — ${P(LIFE.dep()[y3], 1)}.</p>
        ${promoJump ? `<p class="bad small">Промо-период застройщика закончился: ваша ставка выросла до ${P(r, 1)}, платёж — до ${R(c.sim.rows[m3 + 1] ? c.sim.rows[m3 + 1].pay : 0)}.</p>` : `<p class="small soft">Ваша ставка — ${P(r, 1)}.</p>`}`;
    },
    opts: (() => {
      const high = () => true;
      return [
        { id: 'refi', t: `Рефинансировать в другом банке под ${P(mk3, 1)}`, s: 'Расходы ~30 000 ₽: оценка, страховка, регистрация', fx: (o) => { o.sets.push({ from: m3 + 1, rate: mk3, keep: false }); o.side.push({ m: m3, amount: -30000 }); }, show: (r) => r > mk3 + 0.01 },
        { id: 'ask', t: 'Попросить свой банк снизить ставку', s: 'Банки часто снижают на 1–2 п.п., чтобы не потерять клиента', fx: (o, c) => { const r = LIFE.rateAt(d, o, m3 + 1); o.sets.push({ from: m3 + 1, rate: Math.max(mk3, r - 0.015), keep: false }); }, show: (r) => r > mk3 + 0.01 },
        { id: 'extra', t: `Доплачивать по ${R(round(S.income * 0.1, 1000))} в месяц`, s: '10% дохода — в досрочку, сокращая срок', fx: (o) => { o.extraMonthly = round(S.income * 0.1, 1000); o.extraFrom = m3; }, show: (r) => r <= mk3 + 0.01 },
        { id: 'invest', t: `Инвестировать по ${R(round(S.income * 0.1, 1000))} в месяц`, s: 'В индекс акций Мосбиржи — на долгий срок', fx: (o) => { o.side.push({ m: m3, amount: round(S.income * 0.1, 1000), kind: 'stocks', monthly: d.months - m3 }); }, show: (r) => r <= mk3 + 0.01 },
        { id: 'keep', t: 'Ничего не менять', fx: null },
      ];
    })(),
    tip: (c) => (LIFE.rateAt(d, c.o, m3) > mk3 + 0.01 ? 'Разница больше 1,5–2 п.п. — рефинансирование окупает расходы.' : LIFE.rateAt(d, c.o, m3) > depNet(y3) ? 'Вклады подешевели — теперь досрочка приносит больше.' : 'Кредит дешевле вкладов — свободные деньги выгоднее вкладывать.'),
    grade: (id, c) => {
      const r = LIFE.rateAt(d, c.o, m3);
      if (r > mk3 + 0.01) return { refi: 'good', ask: 'ok', keep: 'bad' }[id];
      if (r > depNet(y3)) return { extra: 'good', invest: 'ok', keep: 'ok' }[id];
      return { invest: 'good', extra: 'ok', keep: 'ok' }[id];
    },
    lesson: (id, c, w, wo) => {
      const dInt = (wo.sim.totalInterest + wo.sim.totalIns) - (w.sim.totalInterest + w.sim.totalIns);
      if (id === 'refi') return `<p>Новая ставка ${P(mk3, 1)}: экономия <b>${M(dInt - 30000)}</b> за вычетом расходов. Рефинансирование окупается, когда разница больше 1,5–2 п.п. и впереди много лет кредита.</p>`;
      if (id === 'ask') return `<p>Свой банк снизил ставку до ${P(LIFE.rateAt(d, w.o, m3 + 1), 1)} — экономия ${M(dInt)} без бумажной волокиты. Но в другом банке могло быть ещё дешевле.</p>`;
      if (id === 'extra') return `<p>Вы закроете ипотеку на <b>${ym(wo.sim.months - w.sim.months)}</b> раньше и сэкономите ${M(dInt)} на процентах. Досрочка — гарантированная доходность ${P(LIFE.rateAt(d, w.o, m3), 1)} без налога.</p>`;
      if (id === 'invest') {
        const v = LIFE.sideAt({ side: [{ m: m3, amount: round(S.income * 0.1, 1000), kind: 'stocks', monthly: d.months - m3 }] }, d.months);
        return `<p>При средней доходности индекса ${P(D.stocks.avg, 1)} к концу срока накопится ~<b>${M(v)}</b>. Риск: бывают годы с −37% (2022), и нужна дисциплина не продавать в панике.</p>`;
      }
      const r = LIFE.rateAt(d, c.o, m3);
      return r > mk3 + 0.01 ? `<p>Вы продолжаете платить ${P(r, 1)}, хотя рынок дешевле. Это лишние <b>${M(Math.max(0, (() => { const o = LIFE.apply(d, S.life.ch, 2); o.sets.push({ from: m3 + 1, rate: mk3 }); const s = LIFE.sim(d, o); return (wo.sim.totalInterest) - s.totalInterest - 30000; })()))}</b> банку.</p>` : '<p>Спокойная стратегия: ваша ставка и так ниже рынка. Главное — не тратить свободные деньги.</p>';
    },
  });

  /* 4. Потеря работы */
  const m4 = 36;
  const bal4 = () => base.rows[m4] ? base.rows[m4].bal : 0;
  const holOk = d.principal <= D.holidays.maxLoan;
  evs.push({
    id: 'job', m: m4, ic: '⚡', title: 'Форс-мажор',
    text: (c) => `<p>${LIFE.yearOf(m4)} год. Сокращение на работе: полгода доход семьи будет на 40% меньше. Платёж ${R(c.sim.rows[m4] ? c.sim.rows[m4].pay : pay)} — что делать?</p>
      <p class="small soft">По закону можно взять ипотечные каникулы до ${D.holidays.months} месяцев, если кредит не больше ${M(D.holidays.maxLoan)}, жильё единственное, а доход упал больше чем на 30% или вы потеряли работу. С 01.09.2026 при рождении второго ребёнка — до ${D.holidays.babyMonths} месяцев.</p>`,
    opts: [
      { id: 'hol', t: 'Взять ипотечные каникулы на 6 месяцев', s: holOk ? 'Пропущенные платежи переносятся в конец срока' : `Не положены: кредит больше ${M(D.holidays.maxLoan)}`, fx: (o) => { if (holOk) o.holidays.push({ from: m4, len: 6 }); } },
      { id: 'cushion', t: 'Платить из подушки', s: 'Снимаем с вклада 6 платежей', fx: (o, c) => o.side.push({ m: m4, amount: -6 * (c.sim.rows[m4] ? c.sim.rows[m4].pay : pay) }) },
      { id: 'card', t: 'Платить кредиткой', s: 'Ставка по кредиткам — 30–40% годовых', fx: (o, c) => o.side.push({ m: m4 + 12, amount: -6 * (c.sim.rows[m4] ? c.sim.rows[m4].pay : pay) * 0.25 }) },
      { id: 'skip', t: 'Перестать платить и ждать', s: 'Авось банк подождёт', fx: (o, c) => { o.holidays.push({ from: m4, len: 6 }); o.side.push({ m: m4 + 6, amount: -6 * (c.sim.rows[m4] ? c.sim.rows[m4].pay : pay) * 0.12 }); } },
    ],
    tip: () => 'Каникулы по закону бесплатны: платежи просто переносятся в конец. Подушка — второй рубеж.',
    grade: (id, c) => {
      const side = LIFE.sideAt(c.o, m4) + LIFE.cushion(d);
      const need = 6 * (c.sim.rows[m4] ? c.sim.rows[m4].pay : pay);
      return { hol: holOk ? 'good' : 'bad', cushion: side >= need ? 'good' : 'ok', card: 'bad', skip: 'bad' }[id];
    },
    lesson: (id, c, w, wo) => {
      const need = 6 * (c.sim.rows[m4] ? c.sim.rows[m4].pay : pay);
      const side = LIFE.sideAt(c.o, m4) + LIFE.cushion(d);
      if (id === 'hol') return holOk ? `<p>Каникулы сняли нагрузку на полгода: 6 платежей (${M(need)}) переносятся в самый конец срока, без процентов сверху. Срок сдвинется на полгода, кредитная история не испортится. Подушка осталась целой.</p><p class="small soft">Каникулы даются один раз за весь кредит — берегите их для настоящей беды.</p>` : `<p>Каникулы не положены: кредит больше лимита. Остаются подушка или реструктуризация — по желанию банка, а не по закону.</p>`;
      if (id === 'cushion') return side >= need ? `<p>Подушка сработала: ${M(need)} — и никаких долгов, просрочек и переговоров с банком. Ради этого её и копят.</p>` : `<p>Подушки не хватило: на вкладе было ~${M(side)}, а нужно ${M(need)}. Разницу пришлось занимать у родных. Вывод: 3–6 платежей в резерве — до досрочки.</p>`;
      if (id === 'card') return `<p>Полгода по кредитке под 30%+ обошлись примерно в <b>${M(need * 0.25)}</b> процентов. Плюс нагрузка выросла, а банк видит это в кредитной истории.</p>`;
      return `<p>Просрочка — худший вариант: неустойка, звонки коллекторов, испорченная кредитная история (рефинансирование станет недоступно), а после трёх просрочек за год банк вправе потребовать вернуть весь долг и через суд забрать квартиру. Мы засчитали вам ~${M(need * 0.12)} пеней — в жизни могло быть хуже.</p>`;
    },
  });

  /* 5. Пополнение в семье (или наследство) */
  const m5 = 48;
  const child = S.age < 45;
  const kidsNow = S.kids || 0;
  const mat = child ? (kidsNow >= 1 ? D.matcap.second : D.matcap.first) + (kidsNow + 1 >= 3 ? D.matcap.large : 0) : 500000;
  const famNew = child && d.id === 'family' && S.stage !== 'pay' && kidsNow < 5 ? D.programs.family.rateFor(Object.assign({}, S, { kids: kidsNow + 1 }), d.down / d.price) : null;
  evs.push({
    id: 'kid', m: m5, ic: child ? '👶' : '🎁', title: child ? 'Пополнение в семье' : 'Наследство',
    text: () => child
      ? `<p>${LIFE.yearOf(m5)} год. В семье родился ${kidsNow + 1}-й ребёнок! Положено: ${kidsNow >= 1 ? `доплата маткапитала ${M(D.matcap.second)}` : `материнский капитал ${M(D.matcap.first)}`}${kidsNow + 1 >= 3 ? ` и ещё ${M(D.matcap.large)} многодетным — только на ипотеку` : ''}. Всего <b>${M(mat)}</b>.</p>${famNew && famNew < d.rate ? `<p class="small good">Бонус: семейную ипотеку можно переоформить под ставку для ${kidsNow + 1} детей — ${P(famNew, 0)} вместо ${P(d.rate, 0)}. В игре сделаем это автоматически.</p>` : ''}<p class="small soft">Маткапитал на ипотеку можно направить сразу, не дожидаясь трёх лет ребёнка. Понадобится нотариальное соглашение о долях детей (~7–8 тыс. ₽).</p>`
      : `<p>${LIFE.yearOf(m5)} год. Вы получили наследство — <b>${M(mat)}</b>.</p>`,
    opts: [
      { id: 'term', t: `${child ? 'Маткапитал' : 'Деньги'} — в досрочку, сократить срок`, fx: (o) => { o.lumps.push({ month: m5, amount: mat, mode: 'term' }); if (famNew && famNew < d.rate) o.sets.push({ from: m5 + 1, rate: famNew, keep: true }); } },
      { id: 'pay', t: 'В досрочку, уменьшить платёж', s: child ? 'Пока один из родителей в декрете' : '', fx: (o) => { o.lumps.push({ month: m5, amount: mat, mode: 'payment' }); if (famNew && famNew < d.rate) o.sets.push({ from: m5 + 1, rate: famNew, keep: true }); } },
      { id: 'save', t: child ? 'Сохранить на образование ребёнка' : 'Положить на вклад', fx: (o) => { o.side.push({ m: m5, amount: mat, kind: child ? 'infl' : 'dep' }); if (famNew && famNew < d.rate) o.sets.push({ from: m5 + 1, rate: famNew, keep: true }); } },
    ],
    tip: () => '',
    grade: (id, c) => {
      const r = LIFE.rateAt(d, c.o, m5);
      if (child) return { term: r > depNet(4) ? 'good' : 'ok', pay: 'good', save: 'ok' }[id];
      return r > depNet(4) ? { term: 'good', pay: 'ok', save: 'ok' }[id] : { save: 'good', term: 'ok', pay: 'ok' }[id];
    },
    lesson: (id, c, w, wo) => {
      const dInt = (wo.sim.totalInterest + wo.sim.totalIns) - (w.sim.totalInterest + w.sim.totalIns);
      const fam = famNew && famNew < d.rate ? ` С учётом новой ставки по семейной ипотеке.` : '';
      if (id === 'term') return `<p>Срок короче на <b>${ym(wo.sim.months - w.sim.months)}</b>, экономия ${M(dInt)}.${fam}</p>`;
      if (id === 'pay') return `<p>Платёж снизился до ${R(w.sim.rows[m5 + 1] ? w.sim.rows[m5 + 1].pay : 0)} — в декрет это спасает бюджет. Экономия процентов — ${M(dInt)}.${fam}</p>`;
      return child ? `<p>Сертификат маткапитала индексируется примерно на инфляцию — деньги не сгорят, но и не вырастут. Его можно потратить на учёбу, когда ребёнок подрастёт.${fam}</p>` : `<p>Деньги на вкладе работают на вас.${fam}</p>`;
    },
  });

  /* 6. Страховка */
  const m6 = 60;
  evs.push({
    id: 'ins', m: m6, ic: '🛡️', title: 'Продление страховки',
    text: (c) => {
      const row = c.sim.rows[m6];
      return `<p>${LIFE.yearOf(m6)} год. Банк прислал счёт за страховку на следующий год — <b>${R(row ? row.ins : 0)}</b>. У других аккредитованных страховых та же защита стоит на 20–40% дешевле.</p><p class="small soft">Отказ от страхования жизни разрешён, но тогда ставка вырастет примерно на ${P(D.ins.refusePlus, 0).replace('%', '')} п.п.</p>`;
    },
    opts: [
      { id: 'switch', t: 'Сравнить цены и купить у другой страховой', s: 'Из списка аккредитованных банком, без разрыва в покрытии', fx: (o) => o.kSteps.push({ from: m6, k: 0.7 }) },
      { id: 'refuse', t: 'Отказаться от страхования жизни', fx: (o) => { o.lifeTo = m6; o.plus.push({ from: m6, v: D.ins.refusePlus }); } },
      { id: 'keep', t: 'Продлить в банке, не глядя', fx: null },
    ],
    tip: () => 'Та же защита у другой аккредитованной страховой стоит на 20–40% дешевле.',
    grade: (id, c) => {
      if (id === 'switch') return 'good';
      if (id === 'keep') return 'ok';
      const o2 = LIFE.apply(d, S.life.ch, 5); o2.lifeTo = m6; o2.plus.push({ from: m6, v: D.ins.refusePlus });
      const s2 = LIFE.sim(d, o2), s1 = LIFE.sim(d, LIFE.apply(d, S.life.ch, 5));
      return (s2.totalInterest + s2.totalIns) < (s1.totalInterest + s1.totalIns) ? 'ok' : 'bad';
    },
    lesson: (id, c, w, wo) => {
      const dd = (wo.sim.totalInterest + wo.sim.totalIns) - (w.sim.totalInterest + w.sim.totalIns);
      if (id === 'switch') return `<p>Минус 30% к страховке до конца срока — экономия <b>${M(dd)}</b>. Делайте так каждый год: за месяц до продления запросите цены в 3–4 страховых.</p>`;
      if (id === 'refuse') return dd >= 0 ? `<p>В вашем случае надбавка к ставке обошлась дешевле полиса — экономия ${M(dd)}. Но без страховки при болезни или инвалидности долг ляжет на семью.</p>` : `<p>Надбавка +${P(D.ins.refusePlus, 0).replace('%', '')} п.п. к ставке обойдётся в <b>${M(-dd)}</b> больше, чем страховка. Отказ выгоден редко — обычно при маленьком остатке или очень дорогом полисе.</p>`;
      return '<p>Удобно, но дорого: банковский полис почти всегда дороже, чем у партнёров. На смене страховщика теряете 20–40% каждый год.</p>';
    },
  });

  /* 7. Кризис */
  const m7 = LIFE.CRISIS_Y * 12;
  evs.push({
    id: 'crisis', m: m7, ic: '🌪️', title: 'Кризис',
    text: (c) => {
      const r = LIFE.rateAt(d, c.o, m7);
      return `<p>${LIFE.yearOf(m7)} год. Новый кризис: ЦБ поднял ключевую ставку до <b>${P(D.key.shock[0], 0)}</b> (как в рисковом сценарии ЦБ). Рыночная ипотека — ${P(D.key.shock[0] + D.market.spread, 0)}, вклады — ${P(LIFE.dep()[LIFE.CRISIS_Y], 0)}. По телевизору говорят, что квартиры подешевеют.</p><p class="small soft">У вас фиксированная ставка ${P(r, 1)}, остаток долга ${M(c.sim.rows[m7] ? c.sim.rows[m7].bal : 0)}.</p>`;
    },
    opts: [
      { id: 'hold', t: 'Ничего не делать — моя ставка зафиксирована', fx: null },
      { id: 'dep', t: `Открыть вклад под ${P(LIFE.dep()[LIFE.CRISIS_Y], 0)} и откладывать 10% дохода`, s: 'На 2 года, пока ставки высокие', fx: (o) => o.side.push({ m: m7, amount: round(S.income * 0.1, 1000), monthly: 24 }) },
      { id: 'prepay', t: 'Всё свободное — в досрочку', s: 'Чтобы быстрее избавиться от долга', fx: (o, c) => { const v = LIFE.sideAt(c.o, m7); if (v > 1000) { o.side.push({ m: m7, amount: -v }); o.lumps.push({ month: m7, amount: v, mode: 'term' }); } } },
      { id: 'sell', t: 'Продать квартиру, пока не подешевела', fx: null },
    ],
    tip: (c) => (LIFE.rateAt(d, c.o, m7) < depNet(LIFE.CRISIS_Y) ? 'Когда вклад даёт больше ставки кредита, свободные деньги выгоднее держать на вкладе.' : 'Ваша ставка выше даже кризисных вкладов — гасите.'),
    grade: (id, c) => {
      const r = LIFE.rateAt(d, c.o, m7);
      if (id === 'sell') return 'bad';
      if (r < depNet(LIFE.CRISIS_Y)) return { dep: 'good', hold: 'ok', prepay: 'ok' }[id];
      return { prepay: 'good', dep: 'ok', hold: 'ok' }[id];
    },
    lesson: (id, c, w, wo) => {
      const r = LIFE.rateAt(d, c.o, m7);
      const fixed = `<p class="small soft">Фиксированная ставка — ваша защита: в кризис инфляция разгоняется, зарплаты догоняют цены, а платёж остаётся прежним и «худеет».</p>`;
      if (id === 'sell') {
        const row = c.sim.rows[m7];
        const home = d.cashPrice * E.index(Mdl.paths().home, m7);
        return `<p>Хорошо, что это игра — мы вас отговорили. Продажа в панике: комиссия риелтору и скидка «за срочность» ~10% — минус <b>${M(home * 0.1)}</b>, потом аренда и покупка заново после кризиса, когда цены отрастут. С 2000 года средняя цена м² снижалась только в 2009, 2011 и 2015–2017 годах — и каждый раз ненадолго.</p>${fixed}`;
      }
      if (id === 'dep') return `<p>Вклад под ${P(LIFE.dep()[LIFE.CRISIS_Y], 0)} при ипотеке ${P(r, 1)} — вы зарабатываете на кризисе. К концу срока эти взносы превратятся в ~${M(LIFE.sideAt({ side: [{ m: m7, amount: round(S.income * 0.1, 1000), monthly: 24 }] }, d.months))}.</p>${fixed}`;
      if (id === 'prepay') {
        const v = LIFE.sideAt(c.o, m7);
        return v > 1000 ? `<p>Вы внесли ${M(v)}. ${r > depNet(LIFE.CRISIS_Y) ? 'При вашей ставке это разумно.' : `Но вклад сейчас даёт ${P(LIFE.dep()[LIFE.CRISIS_Y], 0)} — больше вашей ставки ${P(r, 1)}. Выгоднее было переждать на вкладе.`}</p>${fixed}` : `<p>Свободных денег вне кредита у вас нет — гасить нечем. Хорошо, что ставка фиксирована.</p>${fixed}`;
      }
      return `<p>Спокойствие — правильная реакция. Ваш платёж не изменился, а через 2–3 года ставки обычно возвращаются вниз.</p>${fixed}`;
    },
  });

  /* показываем только подходящие варианты */
  evs.forEach(ev => {
    const all = ev.opts;
    ev.opts = all;
    ev.visible = (c) => all.filter(o => !o.show || o.show(LIFE.rateAt(d, c.o, ev.m)));
  });
  return evs;
};

/* -------------------------------------------------------------------------
   Экран «Жизнь с ипотекой»
   ------------------------------------------------------------------------- */
const GRADE = {
  good: { t: 'Сильное решение', cls: 'good' },
  ok: { t: 'Нормально, но можно лучше', cls: 'mid' },
  bad: { t: 'Дорогая ошибка', cls: 'bad' },
};

SCREENS.life = (el) => {
  const d = Mdl.deal();
  const evs = LIFE.events(d);
  const i = clamp(S.life.i, 0, evs.length);
  if (i >= evs.length) return lifeSummary(el, d, evs);
  const ev = evs[i];
  const o = LIFE.apply(d, S.life.ch, i);
  const c = LIFE.ctx(d, o);
  const row = c.sim.rows[Math.min(ev.m, c.sim.rows.length - 1)];
  const termY = Math.max(1, Math.round(d.months / 12));
  const yNow = Math.floor(ev.m / 12) + 1;
  const picked = S.life.ch[ev.id];
  el.innerHTML = `${kicker(step() + ' · жизнь с ипотекой')}
    <h2>${i === 0 ? 'Проживите свою ипотеку' : ev.title}</h2>
    ${i === 0 ? `<p class="soft">7 событий, которые случаются почти с каждым заёмщиком. Ваши решения меняют срок, переплату и капитал. Ставки по годам — по прогнозу ЦБ, а на ${LIFE.CRISIS_Y + 1}-м году — кризис из рискового сценария ЦБ.</p>` : ''}
    <div class="yearbar"><div class="yb"><i style="width:${Math.min(100, yNow / termY * 100)}%"></i></div><div class="yl">${LIFE.yearOf(ev.m)} · год ${yNow} из ${termY}</div></div>
    <div class="stats three mini">
      ${stat('Остаток долга', M(row ? row.bal : 0))}
      ${stat('Ключевая ставка', P(LIFE.key()[Math.floor(ev.m / 12)], 1))}
      ${stat('Ваша ставка', P(LIFE.rateAt(d, o, ev.m), 1))}
    </div>
    <div class="event-card"><div class="ev-ic">${ev.ic}</div><h3>Решение ${i + 1} из ${evs.length}: ${ev.title}</h3>${ev.text(c)}</div>
    ${optsHtml(ev.visible(c).map(x => ({ id: x.id, t: x.t, s: x.s })), picked)}
    <div id="out"></div>`;
  const showOut = (id) => {
    const ch2 = Object.assign({}, S.life.ch, { [ev.id]: id });
    const w = { o: LIFE.apply(d, ch2, i + 1) }; w.sim = LIFE.sim(d, w.o);
    const wo = { o: LIFE.apply(d, Object.assign({}, S.life.ch, { [ev.id]: null }), i + 1) }; wo.sim = LIFE.sim(d, wo.o);
    const gr = ev.grade(id, c);
    const g = GRADE[gr] || GRADE.ok;
    const best = gr !== 'good' ? ev.visible(c).find(x => ev.grade(x.id, c) === 'good') : null;
    $('#out', el).innerHTML = `<div class="card reveal"><span class="pill ${g.cls}">${g.t}</span><div style="margin-top:10px">${ev.lesson(id, c, w, wo)}</div>${best ? `<p class="small" style="margin:10px 0 0"><b class="gold">Сильнее было бы:</b> «${best.t}». ${ev.tip ? ev.tip(c) : ''}</p>` : ''}</div>
      ${navHtml(i + 1 < evs.length ? 'Следующий год' : 'Итоги 30 лет')}`;
    bindNav($('#out', el), () => { S.life.i = i + 1; save(); render(); });
  };
  bindOpts(el, (id) => { S.life.ch[ev.id] = id; /* решения после этого пересчитываются */ evs.slice(i + 1).forEach(e => { delete S.life.ch[e.id]; }); save(); showOut(id); $$('.opt', el).forEach(b => { b.disabled = true; if (!b.classList.contains('sel')) b.classList.add('dim'); }); });
  if (picked) { showOut(picked); $$('.opt', el).forEach(b => { b.disabled = true; if (!b.classList.contains('sel')) b.classList.add('dim'); }); }
  bindNav(el);
};

function lifeSummary(el, d, evs) {
  const o = LIFE.apply(d, S.life.ch);
  const sim = LIFE.sim(d, o);
  const base = d.sim;
  const side = LIFE.sideAt(o, d.months);
  const savedInt = (base.totalInterest + base.totalIns) - (sim.totalInterest + sim.totalIns);
  const grades = evs.map(ev => { const id = S.life.ch[ev.id]; if (!id) return null; const c = LIFE.ctx(d, LIFE.apply(d, S.life.ch, evs.indexOf(ev))); return ev.grade(id, c); });
  const pts = grades.reduce((s, g) => s + (g === 'good' ? 2 : g === 'ok' ? 1 : 0), 0);
  S.life.score = pts; S.life.max = evs.length * 2; save();
  const xs = [], b1 = [], b2 = [];
  const n = Math.max(base.months, sim.months);
  for (let m = 0; m <= n; m += 12) {
    xs.push(String(LIFE.yearOf(m)));
    b1.push(base.rows[m] ? base.rows[m].bal : 0);
    b2.push(sim.rows[m] ? sim.rows[m].bal : 0);
  }
  el.innerHTML = `${kicker(step() + ' · итоги игры')}
    <h2>Ваша ипотека прожита</h2>
    <p class="soft">Сравниваем с заёмщиком, который просто платил по графику и ничего не предпринимал.</p>
    <div class="stats">
      ${stat('Закрыли ипотеку за', ym(sim.months), sim.months < base.months ? `на ${ym(base.months - sim.months)} быстрее` : sim.months > base.months ? `на ${ym(sim.months - base.months)} дольше` : 'как по графику', sim.months < base.months ? 'good' : '')}
      ${stat('Проценты и страховки', M(sim.totalInterest + sim.totalIns), savedInt > 0 ? `экономия ${M(savedInt)}` : `переплата +${M(-savedInt)}`, savedInt > 0 ? 'good' : 'bad')}
      ${side >= 0 ? stat('Отложено и вложено', M(side), `к ${LIFE.yearOf(d.months)} году`) : stat('Ушло из резерва и в долги', M(-side), 'с учётом процентов', 'bad')}
      ${stat('Качество решений', `${pts} из ${evs.length * 2}`, pts >= evs.length * 1.5 ? 'финансово грамотно' : pts >= evs.length ? 'неплохо' : 'есть над чем поработать', 'hl')}
    </div>
    <div id="sch"></div>
    <div class="tbl-wrap"><table class="wrap-all"><thead><tr><th>Событие</th><th>Ваш выбор</th><th>Оценка</th></tr></thead><tbody>
      ${evs.map((ev, k) => { const id = S.life.ch[ev.id]; const opt = ev.opts.find(x => x.id === id); const g = GRADE[grades[k]] || null; return `<tr><td>${ev.ic} ${ev.title}</td><td style="white-space:normal">${opt ? opt.t : '—'}</td><td>${g ? `<span class="pill ${g.cls}">${grades[k] === 'good' ? '✓' : grades[k] === 'ok' ? '~' : '✗'}</span>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>
    ${conclusion(`<p>Главное, что двигает ипотеку: <b>досрочка в первые годы</b>, <b>подушка на 3–6 платежей</b>, <b>вычет</b> и <b>ежегодная смена страховщика</b>. Ставка ЦБ будет меняться ещё много раз — фиксированная ставка защищает вас от её роста, а рефинансирование позволяет поймать снижение.</p>`)}
    <div class="btns two"><button class="btn ghost" data-act="replay">Переиграть решения</button><button class="btn" data-act="next">Мой план ${IC.arrow}</button></div>`;
  CH.lines($('#sch', el), xs, [
    { name: 'Платить по графику', c: '--c-cost', values: b1 },
    { name: 'Ваш путь', c: '--c-good', values: b2 },
  ], { title: 'Остаток долга по годам', xHead: 'Год' });
  $('[data-act=replay]', el).onclick = () => { S.life = { i: 0, ch: {}, shown: false }; save(); render(); };
  $('[data-act=next]', el).onclick = next;
}

/* =========================================================================
   ПЛАН ПОГАШЕНИЯ
   ========================================================================= */
SCREENS.plan = (el) => {
  const d = Mdl.deal();
  const base = d.sim;
  const pay = base.rows[0].pay;
  const P8 = S.plan;
  if (P8.useTax == null) P8.useTax = S.stage !== 'pay';
  if (P8.useIns == null) P8.useIns = true;
  const maxExtra = Math.max(50000, round(pay * 1.5, 5000));
  el.innerHTML = `${kicker(step() + ' · ваш план')}
    <h2>Как закрыть ипотеку быстрее</h2>
    <p class="soft">Подберите сумму, которую готовы доплачивать каждый месяц. Даже небольшая доплата в первые годы сокращает срок на годы.</p>
    ${range('ex', 'Доплачивать сверх платежа', 0, maxExtra, 1000, clamp(P8.extra, 0, maxExtra), v => R(v) + '/мес', `Ваш обязательный платёж — ${R(pay)}`)}
    <div class="toggle" id="mode"><button data-v="term" class="${P8.mode !== 'payment' ? 'on' : ''}">Сокращать срок</button><button data-v="payment" class="${P8.mode === 'payment' ? 'on' : ''}">Уменьшать платёж</button></div>
    <ul class="check" id="pl">
      <li data-k="useTax" class="${P8.useTax ? 'on' : ''}"><span class="bx">${IC.check}</span><span class="ct"><b>Вычет — в досрочку</b><span>До 260 000 ₽ с цены и до 390 000 ₽ с процентов</span></span></li>
      <li data-k="useIns" class="${P8.useIns ? 'on' : ''}"><span class="bx">${IC.check}</span><span class="ct"><b>Каждый год менять страховщика</b><span>Минус ~30% к страховке</span></span></li>
    </ul>
    <div id="pres"></div>
    <div id="cbr"></div>
    <div id="q8"></div>
    <div id="pcheck"></div>`;
  const draw = () => {
    const lumps = P8.useTax ? LIFE.deductionFlows(d, base).map(f => ({ month: f.m, amount: f.amount, mode: P8.mode === 'payment' ? 'payment' : 'term' })) : [];
    const sim = E.simulate({ principal: d.principal, months: d.months, rate: d.rate, rateSteps: d.steps, extraMonthly: P8.extra, extraMode: P8.mode, lumps, ins: Object.assign({}, d.ins, { kSteps: P8.useIns ? [{ from: 12, k: 0.7 }] : [] }) });
    S.planSim = { months: sim.months, interest: sim.totalInterest, ins: sim.totalIns, paid: sim.totalPaid };
    save();
    const saved = (base.totalInterest + base.totalIns) - (sim.totalInterest + sim.totalIns);
    const xs = [], b1 = [], b2 = [];
    for (let m = 0; m <= base.months; m += 12) { xs.push(String(LIFE.yearOf(m))); b1.push(base.rows[m] ? base.rows[m].bal : 0); b2.push(sim.rows[m] ? sim.rows[m].bal : 0); }
    /* досрочка против инвестиций той же суммы */
    const inv = (() => {
      if (!P8.extra) return null;
      const T = base.months;
      const simX = E.simulate({ principal: d.principal, months: d.months, rate: d.rate, rateSteps: d.steps, extraMonthly: P8.extra, extraMode: 'term' });
      const r = Mdl.paths().dep;
      let A = 0, B = 0;
      for (let m = 0; m < T; m++) {
        const g = E.mGrow(E.atYear(r, m)) * 0.87;
        A *= 1 + g; B *= 1 + g;
        if (m >= simX.months) A += (base.rows[m] ? base.rows[m].pay : 0) + P8.extra;   // после закрытия — всё на вклад
        B += P8.extra;
      }
      const B2 = E.fvAnnuity(P8.extra, D.stocks.avg, T);
      return { A, B, B2 };
    })();
    $('#pres', el).innerHTML = `<div class="stats">
        ${stat('Закроете за', ym(sim.months), sim.months < base.months ? `вместо ${ym(base.months)}` : '', 'good')}
        ${stat('Экономия', M(saved), 'процентов и страховок', 'hl')}
        ${stat('Платёж', R(sim.rows[13] ? sim.rows[13].pay + (P8.extra || 0) : pay), P8.mode === 'payment' ? 'и снижается после доплат' : 'вместе с доплатой')}
        ${stat('Всего отдадите', M(sim.totalPaid), `вместо ${M(base.totalPaid)}`)}
      </div>
      <div id="pch"></div>
      ${inv ? `<div class="card"><h3>А если эти ${R(P8.extra)} не в досрочку, а инвестировать?</h3>
        <div class="kv"><span>Досрочка, а после закрытия — весь платёж на вклад</span><span>${M(inv.A)}</span><span>Платить по графику, ${R(P8.extra)} — на вклады</span><span>${M(inv.B)}</span><span>Платить по графику, ${R(P8.extra)} — в акции (${P(D.stocks.avg, 1)})</span><span>${M(inv.B2)}</span></div>
        <p class="small soft" style="margin:0">Капитал к ${LIFE.yearOf(base.months)} году. ${inv.A >= inv.B ? 'Досрочка выигрывает у вкладов: ставка кредита выше их доходности.' : 'Вклады выигрывают: ваш кредит дешевле, чем приносят деньги.'} Акции могут дать больше, но с риском и без гарантий.</p></div>` : ''}`;
    CH.lines($('#pch', el), xs, [
      { name: 'По графику', c: '--c-cost', values: b1 },
      { name: 'С вашим планом', c: '--c-good', values: b2, area: true },
    ], { title: 'Остаток долга', xHead: 'Год' });
  };
  bindRange(el, 'ex', v => R(v) + '/мес', v => { P8.extra = v; draw(); });
  $$('#mode button', el).forEach(b => b.onclick = () => { P8.mode = b.dataset.v; $$('#mode button', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $$('#pl li', el).forEach(li => li.onclick = () => { const k = li.dataset.k; P8[k] = !P8[k]; li.classList.toggle('on', P8[k]); draw(); });
  draw();

  /* что делать при разных ставках ЦБ */
  (() => {
    const bal = d.principal, n = d.months - 12;
    const rows = [
      { k: D.key.shock[0], t: 'кризис' },
      { k: D.key.now, t: 'сейчас' },
      { k: 0.10, t: '' },
      { k: D.key.longRun, t: 'прогноз ЦБ на 2029' },
    ].map(x => {
      const mk = x.k + (x.k >= D.key.now ? D.market.spread : 0.03);
      const dep = Math.max(0.03, x.k + D.deposit.spread);
      let act;
      if (d.rate > mk + 0.02) act = `<span class="good">Рефинансировать</span>: платёж ≈${R(E.pmt(bal, mk, n))} вместо ${R(E.pmt(bal, d.rate, n))}`;
      else if (d.rate > dep * 0.87) act = 'Досрочка выгоднее вклада — гасите, сокращая срок';
      else act = 'Вклад выгоднее досрочки — копите, гасите по графику';
      return `<li><span class="cbr-k">${P(x.k, 0)}<small>${x.t || 'ключевая'}</small></span><span class="ct"><span class="cbr-m">Ипотека ≈${P(mk, 0)} · вклады ≈${P(dep, 0)}</span><b>${act}</b></span></li>`;
    });
    $('#cbr', el).innerHTML = `<h3 style="margin-top:22px">Что делать при разных ставках ЦБ</h3>
      <p class="soft small">Ваша ставка ${P(d.rate, 1)}${d.steps.length ? ` (потом ${P(d.steps[0].rate, 1)})` : ''}. ЦБ пересматривает ключевую ставку 8 раз в год — вот готовые решения на любой случай.</p>
      <ul class="check static cbr">${rows.join('')}</ul>
      <p class="tiny">Рефинансирование в расчёте — при остатке ${M(bal)} через год. Учитывайте расходы ~30 000 ₽ на оценку, страховку и регистрацию.</p>`;
  })();

  /* тест 8 */
  const L = 300000;
  const sT = E.simulate({ principal: d.principal, months: d.months, rate: d.rate, rateSteps: d.steps, lumps: [{ month: 11, amount: L, mode: 'term' }] });
  const sP = E.simulate({ principal: d.principal, months: d.months, rate: d.rate, rateSteps: d.steps, lumps: [{ month: 11, amount: L, mode: 'payment' }] });
  const sB = d.simNoIns;
  quiz(el, $('#q8', el), {
    id: 'mode', n: 8, tag: 'срок или платёж',
    q: `Через год вы вносите досрочно ${M(L)}. Что сэкономит больше процентов?`,
    opts: [{ t: 'Уменьшить срок' }, { t: 'Уменьшить платёж' }, { t: 'Одинаково' }],
    right: 0,
    head: `Срок: ${M(sB.totalInterest - sT.totalInterest)} против ${M(sB.totalInterest - sP.totalInterest)}.`,
    explain: `<p>Уменьшение срока экономит в ${X((sB.totalInterest - sT.totalInterest) / Math.max(1, sB.totalInterest - sP.totalInterest))} раза больше: долг гасится быстрее, и проценты начисляются меньше месяцев. Уменьшать платёж стоит, только если сейчас тяжело платить. Ещё вариант: уменьшать платёж, а сэкономленное продолжать вносить досрочно — это почти то же, что сокращать срок, но с запасом прочности.</p>`,
    onDone: drawCheck,
  });
  function drawCheck() {
    const items = [
      { t: `Подушка — ${M(6 * pay)}`, s: '6 платежей на вкладе или в фонде денежного рынка. Это раньше досрочки.' },
      { t: 'Вычет: до 260 000 + до 390 000 ₽', s: 'Личный кабинет налогоплательщика → «Жизненные ситуации» → «Получить вычет». Супруги — каждый на свою долю.' },
      { t: `Страховка: сравнивать каждый год`, s: `Аккредитованные банком страховые на 20–40% дешевле. Сэкономите ~${M(d.sim.totalIns * 0.3)} за срок.` },
      { t: d.rate > depNet(0) ? 'Досрочка: сокращать срок, в первые годы' : 'Досрочку — не торопить', s: d.rate > depNet(0) ? `Ваша ставка ${P(d.rate, 1)} выше вклада после налога — каждый рубль досрочки «приносит» ${P(d.rate, 1)}.` : `Ваша ставка ${P(d.rate, 1)} ниже вклада (${P(D.deposit.now, 1)}). Копите на вкладе, пересмотрите, когда ставки по вкладам упадут ниже ставки кредита.` },
      { t: 'Рефинансирование', s: `Следите за решениями ЦБ (ближайшее — ${D.key.nextMeeting}). Окупается, если рыночная ставка ниже вашей на 1,5–2 п.п. и впереди много лет.` },
      { t: 'Каникулы — ваша страховка', s: `До ${D.holidays.months} месяцев при потере работы или падении дохода больше 30% (кредит до ${M(D.holidays.maxLoan)}). С 01.09.2026 — до ${D.holidays.babyMonths} месяцев при рождении второго ребёнка.` },
    ];
    if (S.kids != null && S.age < 45) items.push({ t: 'Маткапитал и 450 000 ₽ многодетным', s: `Маткапитал ${M(D.matcap.first)} (на второго — +${M(D.matcap.second)}) можно сразу направить на ипотеку. За 3-го ребёнка, рождённого до конца 2030 года, — ещё 450 000 ₽.` });
    if (Mdl.isNew()) items.push({ t: 'Закладывайте задержку сдачи', s: `В 2026 году ${P(D.lateShare, 0)} жилья сдают с нарушением сроков. Держите запас на 3–6 месяцев аренды.` });
    items.push({ t: 'Сравнивайте банки по ПСК', s: 'Полная стоимость кредита — в рамке на первой странице договора. Ставка без ПСК — это реклама.' });
    S.plan.done = S.plan.done || {};
    $('#pcheck', el).innerHTML = `<h3 style="margin-top:24px">Чек-лист на ближайший год</h3><p class="soft small">Отмечайте, что уже сделали, — прогресс сохранится в браузере.</p>
      <ul class="check">${items.map((x, k) => `<li class="${S.plan.done[k] ? 'on' : ''}" data-k="${k}"><span class="bx">${IC.check}</span><span class="ct"><b>${x.t}</b><span>${x.s}</span></span></li>`).join('')}</ul>
      ${navHtml('Мой итог')}`;
    $$('#pcheck li', el).forEach(li => li.onclick = () => { const k = li.dataset.k; S.plan.done[k] = !S.plan.done[k]; li.classList.toggle('on'); save(); });
    bindNav($('#pcheck', el));
  }
  bindNav(el);
};

/* =========================================================================
   ФИНАЛ
   ========================================================================= */
SCREENS.final = (el) => {
  const d = Mdl.deal();
  const pay = d.sim.rows[0].pay;
  const pdn = Mdl.pdn(pay);
  const rvb = Mdl.rentVsBuy(d, { inv: S.plan.inv || 'dep' });
  const L = rvb[rvb.length - 1];
  const T = d.sim.months;
  const planM = S.planSim ? S.planSim.months : T;
  const planOver = S.planSim ? S.planSim.interest + S.planSim.ins : d.sim.totalInterest + d.sim.totalIns;
  const over = d.sim.totalInterest + d.sim.totalIns;
  const oneOff = d.oneOff || 0;
  const totalPaid = d.down + d.sim.totalPaid + oneOff;
  const homeEnd = d.cashPrice * E.index(Mdl.paths().home, T);
  const quizOk = Object.values(S.quiz).filter(x => x.ok).length;
  const quizN = 8;
  const realK = Mdl.realK(T);
  const pay1 = S.stage === 'pay';
  const mk = Mdl.market();
  const buyerWins = L.buyer > L.renter;

  /* вердикт */
  let v;
  if (pay1) {
    if (d.rate > mk + 0.02) v = { cls: '', k: 'Продолжать и рефинансировать', h: 'Платите дальше, но ловите снижение ставок', p: `Ваша ставка ${P(d.rate, 1)} выше рынка (${P(mk, 1)}). Как только разница станет больше 1,5–2 п.п. с учётом расходов — рефинансируйте. До тех пор каждый свободный рубль — в досрочку с сокращением срока.` };
    else if (d.rate > depNet(0)) v = { cls: 'good', k: 'Продолжать и ускорить', h: 'Гасите досрочно — это ваша лучшая инвестиция', p: `Ставка ${P(d.rate, 1)} выше доходности вкладов после налога. Подушка на 6 платежей — и всё сверх неё в досрочку, сокращая срок. По вашему плану ипотека закроется за ${dot(ym(planM))}` };
    else v = { cls: 'good', k: 'Продолжать спокойно', h: 'Ваша ипотека дешёвая — не спешите её гасить', p: `Ставка ${P(d.rate, 1)} ниже вкладов и инфляции: долг сам «худеет». Платите по графику, копите и инвестируйте, а досрочку включайте, когда ставки по вкладам опустятся ниже ставки кредита.` };
  } else if (pdn > 0.5) {
    v = { cls: 'bad', k: 'Не спешить', h: 'Сейчас этот кредит слишком тяжёлый', p: `Платёж ${R(pay)} — ${P(pdn, 0)} дохода. Это красная зона: банк может отказать, а любая неприятность ударит по бюджету. Варианты: квартира дешевле, больше взнос, срок длиннее, или подождать — ЦБ ждёт снижения ключевой ставки в среднем до 8–9% в 2028 году.` };
  } else if (d.rate >= 0.15) {
    v = buyerWins
      ? { cls: '', k: 'Брать с планом', h: 'Можно брать, но с планом рефинансирования', p: `Ставка ${P(d.rate, 1)} высокая, но ЦБ ждёт её снижения. Берите, только если платёж до 35–40% дохода, есть подушка, а через 1–2 года вы готовы рефинансироваться. Каждая досрочка при такой ставке — огромная экономия.` }
      : { cls: 'bad', k: 'Подождать', h: 'Сейчас выгоднее снимать и копить', p: `При ставке ${P(d.rate, 1)} аренда с инвестициями в вашем сценарии выигрывает ${M(L.renter - L.buyer)}. Если можно подождать 1–2 года, пока ставки снижаются, — копите взнос на вкладе под ${P(D.deposit.now, 0)}. Если жильё нужно сейчас — берите только с планом рефинансирования.` };
  } else if (pdn <= 0.4) {
    v = { cls: 'good', k: 'Брать', h: 'Ипотека в вашем случае — разумное решение', p: `Ставка ${P(d.rate, 1)} близка к инфляции и росту цен, платёж — ${P(pdn, 0)} дохода. Время работает на вас: платёж «худеет», квартира дорожает. Держите подушку, оформите вычет и не гасите досрочно в ущерб резерву.` };
  } else {
    v = { cls: '', k: 'Брать осторожно', h: 'Условия хорошие, но нагрузка высокая', p: `Ставка ${P(d.rate, 1)} выгодная, но платёж — ${P(pdn, 0)} дохода. Сначала подушка на 6 платежей, потом сделка. Подумайте о квартире чуть дешевле или большем взносе.` };
  }

  el.innerHTML = `${kicker('Итог · ' + CONFIG.author)}
    <h2>Что вас ждёт</h2>
    <div class="verdict ${v.cls}"><div class="vk">Вывод: ${v.k}</div><h2>${v.h}</h2><p style="margin:0">${v.p}</p></div>
    <div class="stats">
      ${stat(pay1 ? 'Ваша квартира' : 'Квартира', pay1 ? M(d.cashPrice) : `${SIZES[S.size].t}, ${Mdl.area()} м²`, pay1 ? 'стоит сейчас' : `${D.regions[S.region].name}, ${M(d.cashPrice)}`)}
      ${stat('Платежей', `${nf0.format(T)} × ${R(pay)}`, planM < T ? `по плану — ${nf0.format(planM)}` : '', 'hl')}
      ${stat('Переплата банку и страховщикам', M(over), planM < T ? `по плану — ${M(planOver)}` : `${X(over / Math.max(1, d.principal))}× от кредита`, 'bad')}
      ${stat('Квартира к концу срока', M(homeEnd), `≈${M(homeEnd * realK)} в сегодняшних деньгах`)}
    </div>
    <div class="toggle" id="rt"><button data-v="0" class="${!S.real ? 'on' : ''}">В будущих рублях</button><button data-v="1" class="${S.real ? 'on' : ''}">В сегодняшних деньгах</button></div>
    <div id="fbars"></div>
    <div class="card"><h3>Ваши результаты в игре</h3><div class="kv wide">
      <span>Тесты</span><span>${quizOk} из ${quizN}</span>
      <span>Решения в «жизни с ипотекой»</span><span>${S.life.score != null ? `${S.life.score} из ${S.life.max}` : 'не пройдено'}</span>
      <span>Ипотека против аренды с инвестициями</span><span>${buyerWins ? 'ипотека выгоднее' : 'аренда выгоднее'} на ${M(Math.abs(L.buyer - L.renter))}</span>
      <span>Как закрыть быстрее</span><span>${planM < T ? `за ${ym(planM)}, экономия ${M(over - planOver)}` : 'добавьте доплату в плане'}</span>
    </div></div>
    <div class="card gold"><h3>🎮 Следующий уровень (4 из 7) — «Инвест-старт»</h3><p class="small">Проживите 20 лет на фондовом рынке за 5 минут: кризисы, обвалы и бумы. Получится обогнать ленивого инвестора?</p>
      <div class="btns"><button class="btn" data-act="next">Играть в «Инвест-старт» 🎮</button><button class="btn tg-btn" data-act="sky">Узнать про закрытый канал 🔒</button></div></div>
    <div class="card gold"><h3>Если вам понравилась игра</h3><p class="small">Отправьте её тем, кто сейчас выбирает квартиру или платит ипотеку. Пятнадцать минут здесь могут сэкономить им миллионы.</p>
      <div class="btns"><button class="btn tg-btn" data-act="share">${IC.tg} Отправить другу в Telegram</button><button class="btn ghost" data-act="copy">Скопировать ссылку на бота</button></div></div>
    <div class="author-card"><img src="img/author.jpg" alt="${CONFIG.author}" loading="lazy"><div><div class="an">${CONFIG.author}</div><p>${CONFIG.authorBio} В канале — разборы рынка, ставок и личных финансов без воды.</p></div></div>
    <div class="btns"><button class="btn" data-act="channel">Подписаться на канал ${CONFIG.channelName}</button><button class="btn ghost" data-act="bot">Открыть бота</button><button class="btn ghost" data-act="again">Пройти с другими цифрами</button></div>
    <p class="tiny" style="margin-top:14px">Прогноз: ключевая ставка — по базовому сценарию ЦБ, инфляция ~${P(D.infl.longRun, 0)} в год, жильё дорожает на инфляцию + ${P(D.homeReal, 0)}. Будущее никто не знает точно: считайте это ориентиром, а не гарантией.</p>`;

  const drawBars = () => {
    const k = S.real ? realK : 1;
    /* в «сегодняшних деньгах» платежи дисконтируем помесячно */
    const paidReal = S.real ? d.down + oneOff + d.sim.rows.reduce((s, r) => s + (r.pay + r.extra + r.ins) * Mdl.realK(r.m), 0) : totalPaid;
    const overReal = S.real ? d.sim.rows.reduce((s, r) => s + (r.interest + r.ins) * Mdl.realK(r.m), 0) : over;
    CH.barsH($('#fbars', el), [
      { label: 'Квартира сегодня', value: d.cashPrice, c: '--c-home' },
      { label: 'Заплатите за неё всего (взнос, платежи, страховки, сборы)', value: paidReal, c: '--c-extra' },
      { label: 'Из них переплата банку и страховщикам', value: overReal, c: '--c-cost' },
      { label: `Ваш капитал с ипотекой в ${LIFE.yearOf(rvb.length)} году: квартира${L.buyerCash > 1000 ? ' + вложения' : ''}`, value: L.buyer * (S.real ? Mdl.realK(rvb.length) : 1), c: '--c-home', strong: true },
      { label: pay1 ? 'Капитал, если продать, снимать и инвестировать' : 'Капитал, если снимать и инвестировать разницу', value: L.renter * (S.real ? Mdl.realK(rvb.length) : 1), c: '--c-invest', strong: true },
    ], { title: S.real ? 'В сегодняшних деньгах' : 'В рублях будущего', sub: S.real ? 'С поправкой на инфляцию: так честнее сравнивать суммы через 20–30 лет' : 'Номинальные суммы — то, что вы увидите в выписках' });
  };
  drawBars();
  $$('#rt button', el).forEach(b => b.onclick = () => { S.real = b.dataset.v === '1'; save(); $$('#rt button', el).forEach(x => x.classList.toggle('on', x === b)); drawBars(); });
  $('[data-act=share]', el).onclick = share;
  $('[data-act=copy]', el).onclick = (e) => {
    const t = CONFIG.shareBotUrl;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { e.target.textContent = 'Ссылка скопирована ✓'; }).catch(() => { prompt('Скопируйте ссылку:', t); });
  };
  $('[data-act=next]', el).onclick = () => openUrl(CONFIG.nextUrl);
  $('[data-act=sky]', el).onclick = () => openUrl(CONFIG.skyUrl);
  $('[data-act=channel]', el).onclick = () => openUrl(CONFIG.channelUrl);
  $('[data-act=bot]', el).onclick = () => openUrl(CONFIG.botUrl);
  $('[data-act=again]', el).onclick = () => { const keep = { stage: S.stage }; S = S0(); S.stage = keep.stage; save(); go('q-stage'); };
};
