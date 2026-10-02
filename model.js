'use strict';
/* =========================================================================
   ИПОТЕКА БЕЗ ИЛЛЮЗИЙ · модель игрока: квартира, программа, ставка, расчёты
   ========================================================================= */

const SIZES = {
  studio: { t: 'Студия', a: 26 },
  1: { t: '1-комнатная', a: 38 },
  2: { t: '2-комнатная', a: 56 },
  3: { t: '3-комнатная', a: 76 },
};

const Mdl = {
  reg: () => D.regions[S.region || 'city'],
  isNew: () => S.stage !== 'pay' && S.home !== 'old',
  ppm2: () => Mdl.reg()[Mdl.isNew() ? 'ppmNew' : 'ppmOld'],
  area: () => SIZES[S.size || '2'].a,
  basePrice: () => round(Mdl.area() * Mdl.ppm2(), 50000),
  price: () => S.price || Mdl.basePrice(),
  /* аренда сопоставимой квартиры: доходность аренды × цена вторички (новостройки дороже, а аренда — нет) */
  rentNow: (price) => {
    const r = Mdl.reg();
    const k = Mdl.isNew() ? r.ppmOld / r.ppmNew : 1;
    return round((price || Mdl.price()) * k * r.rentYield / 12, 500);
  },
};

/* Программы, доступные игроку: {id, ok, why, ...D.programs[id]} */
Mdl.programs = () => D.programOrder.map(id => {
  const p = D.programs[id];
  const r = p.check ? p.check(S) : { ok: true };
  return Object.assign({ id }, p, { ok: r.ok, why: r.why || '' });
});

/* Рыночная ставка для типа жилья */
Mdl.market = () => (Mdl.isNew() ? D.market.new : D.market.old);

/* Ставка, эквивалентная «комбинированной» ипотеке (лимит по льготе + остаток по рынку) */
Mdl.blend = (P, n, parts) => {
  const target = parts.reduce((s, x) => s + E.pmt(x.P, x.r, n), 0);
  let lo = 0, hi = 0.6;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (E.pmt(P, mid, n) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
};

/* Страховки на год (доли от остатка) */
Mdl.ins = (opt = {}) => {
  const life = opt.noLife ? 0 : D.ins.life(S.age || 33);
  return {
    life, prop: D.ins.prop,
    title: (!Mdl.isNew() && S.stage !== 'pay') ? D.ins.title : 0, titleYears: 3,
    base: D.ins.base,
  };
};

/* -------------------------------------------------------------------------
   Сделка: из чего состоит ипотека игрока при выбранной программе
   ------------------------------------------------------------------------- */
Mdl.deal = (progId, over = {}) => {
  const id = progId || S.prog || 'market';
  const p = D.programs[id] || D.programs.market;
  const mk = Mdl.market();

  /* уже платит: берём его остаток и ставку */
  if (S.stage === 'pay' && !over.fresh) {
    const L = S.loan;
    const months = Math.round(L.years * 12);
    const d = { id: L.prog, prog: D.programs[L.prog] || D.programs.market, price: L.value, down: 0, principal: L.bal, months, rate: L.rate, steps: [], note: '', oneOff: 0, cashPrice: L.value };
    d.ins = Mdl.ins();
    d.sim = E.simulate({ principal: d.principal, months, rate: d.rate, ins: d.ins });
    d.simNoIns = E.simulate({ principal: d.principal, months, rate: d.rate });
    return d;
  }

  const cashPrice = over.price || Mdl.price();
  const price = Math.round(cashPrice * (1 + (p.markup || 0)));
  const down = over.down != null ? over.down : Mdl.down(price, p);
  const principal = Math.max(0, price - down);
  const months = Math.min((over.term || S.term || 30) * 12, p.maxMonths || 360);
  let rate = p.rateFor ? p.rateFor(S, down / price) : p.rate != null ? p.rate : mk;
  let steps = [];
  let note = months < (over.term || S.term || 30) * 12 ? `Максимальный срок программы — ${dot(ym(months))} ` : '';
  /* лимит льготы: остаток по рыночной ставке (комбинированная ипотека) */
  const lim = p.limit ? p.limit(S) : 0;
  if (lim && principal > lim) {
    rate = Mdl.blend(principal, months, [{ P: lim, r: rate }, { P: principal - lim, r: mk }]);
    note += `Лимит программы ${M(lim)}: остальные ${M(principal - lim)} — по рыночной ставке ${P(mk, 1)}. В сумме — как кредит под ${P(rate, 1)}. `;
  }
  if (p.subsidyMonths && months > p.subsidyMonths) {
    steps = [{ from: p.subsidyMonths, rate: Math.max(rate, D.market.longRun) }];
    note += `Льгота действует ${ym(p.subsidyMonths)}, дальше в игре — рыночная ставка ≈${P(D.market.longRun, 0)} (ключевая ${P(D.key.longRun, 0)} + 3 п.п.; точные условия пока не опубликованы).`;
  }
  if (p.promoMonths) {
    steps = [{ from: p.promoMonths, rate: mk }];
    note += `Первые ${ym(p.promoMonths)} — ${P(rate, 1)}, затем ${P(mk, 1)} (рыночная на дату сделки).`;
  }
  const ins = Mdl.ins();
  const d = { id, prog: p, cashPrice, price, down, principal, months, rate, steps, note, ins, markup: price - cashPrice };
  d.sim = E.simulate({ principal, months, rate, rateSteps: steps, ins });
  d.simNoIns = E.simulate({ principal, months, rate, rateSteps: steps });
  d.oneOff = Mdl.oneOff(d);
  return d;
};

/* Первый взнос: сколько игрок может/хочет, но не меньше минимума программы */
Mdl.down = (price, p) => {
  const minD = price * ((p && p.minDown) || D.minDown);
  if (S.stage === 'pay') return 0;
  const want = S.down != null ? S.down : Math.min(S.savings, price * 0.3);
  return Math.round(Math.max(minD, Math.min(want, price * 0.9)));
};

/* Разовые расходы на старте (без ремонта и аренды на время стройки) */
Mdl.oneOff = (d) => {
  const o = D.oneOff;
  return o.appraisal + o.duty + o.eReg + o.safe + (Mdl.isNew() ? 0 : o.realtor * d.price);
};

/* Скрытые и сопутствующие расходы, по пунктам */
Mdl.hidden = (d) => {
  const items = [];
  const s = d.sim;
  const propY = d.principal * D.ins.base * D.ins.prop;
  const lifeY = d.principal * D.ins.base * d.ins.life;
  const insSim = (ins) => E.simulate({ principal: d.principal, months: d.months, rate: d.rate, rateSteps: d.steps, ins }).totalIns;
  const propT = insSim({ prop: D.ins.prop, base: D.ins.base });
  const lifeT = insSim({ life: d.ins.life, base: D.ins.base });
  items.push({ id: 'prop', on: true, t: 'Страхование квартиры (залога)', s: `Обязательно по закону. ≈${P(D.ins.prop, 2)} от долга в год: в первый год ${R(propY)}`, v: propT, when: 'весь срок' });
  /* отказ от страхования жизни → надбавка к ставке */
  const plus = D.ins.refusePlus;
  const noLife = E.simulate({ principal: d.principal, months: d.months, rate: d.rate + plus, rateSteps: d.steps.map(x => ({ from: x.from, rate: x.rate + plus })) });
  const refuseCost = noLife.totalInterest - d.simNoIns.totalInterest;
  items.push({ id: 'life', on: true, t: 'Страхование жизни и здоровья', s: `Формально добровольно. Откажетесь — ставка вырастет примерно на ${P(plus, 1).replace('%', '')} п.п. (+${M(refuseCost)} за срок). С полисом: ≈${P(d.ins.life, 2)} от долга в год, в первый год ${R(lifeY)}`, v: lifeT, when: 'весь срок' });
  if (!Mdl.isNew() && S.stage !== 'pay') {
    const titleT = insSim({ title: D.ins.title, titleYears: 3, base: D.ins.base });
    items.push({ id: 'title', on: true, t: 'Титульное страхование', s: `Вторичка: защита от оспаривания сделки. Банк часто просит на первые 3 года, ≈${P(D.ins.title, 2)} в год`, v: titleT, when: '3 года' });
  }
  const o = D.oneOff;
  items.push({ id: 'appr', on: true, t: 'Оценка квартиры', s: 'Отчёт оценщика для банка', v: o.appraisal, when: 'разово' });
  items.push({ id: 'duty', on: true, t: 'Госпошлина и регистрация', s: o.dutyNote, v: o.duty, when: 'разово' });
  items.push({ id: 'ereg', on: true, t: 'Электронная регистрация и безопасные расчёты', s: 'Платные услуги банка при сделке (аккредитив/СБР)', v: o.eReg + o.safe, when: 'разово' });
  if (!Mdl.isNew()) items.push({ id: 'realtor', on: false, t: 'Риелтор / юрист', s: `Часто ${P(o.realtor, 0)}–3% цены, если без него — ноль`, v: o.realtor * d.price, when: 'разово' });
  if (Mdl.isNew()) {
    items.push({ id: 'repair', on: true, t: 'Ремонт (новостройка без отделки)', s: `≈${R(D.repairPerM2)} за м² × ${Mdl.area()} м²`, v: D.repairPerM2 * Mdl.area(), when: 'разово' });
    items.push({ id: 'rent', on: S.stage !== 'pay', t: `Аренда, пока дом строится (${D.buildMonths} мес.)`, s: `Платите и ипотеку, и аренду ≈${R(Mdl.rentNow(d.cashPrice))}/мес`, v: Mdl.rentNow(d.cashPrice) * D.buildMonths, when: `${D.buildMonths} мес.` });
  }
  if (d.markup > 0) items.push({ id: 'markup', on: true, t: 'Наценка за «низкую ставку»', s: `Застройщик заложил стоимость субсидии в цену: +${P(d.prog.markup, 0)} к цене при оплате без субсидии`, v: d.markup, when: 'в цене' });
  return items;
};

/* Ставка → платёж/переплата для «лестницы» */
Mdl.ladder = (principal, months) => D.ladder.map(r => {
  const q = E.quick(principal, r, months);
  return Object.assign({ r }, q);
});

/* Пути ключевой ставки, инфляции, доходностей по годам от текущего */
Mdl.paths = () => {
  const key = D.key.path;
  const dep = key.map(k => Math.max(0.03, k + D.deposit.spread));
  const infl = D.infl.path;
  const home = infl.map(i => i + D.homeReal);
  return { key, dep, infl, home, stocks: D.stocks.avg, rentGrowth: infl.map(i => i + D.rentReal) };
};

/* Ипотека против аренды: горизонт = срок кредита */
Mdl.rentVsBuy = (d, opt = {}) => {
  const pth = Mdl.paths();
  const inv = opt.inv === 'stocks' ? pth.stocks : pth.dep;
  const rent0 = Mdl.rentNow(d.cashPrice);
  const repair = Mdl.isNew() && S.stage !== 'pay' ? D.repairPerM2 * Mdl.area() : 0;
  const sim = opt.sim || d.sim;
  return E.rentVsBuy({
    /* «уже плачу»: альтернатива — продать, погасить долг, снимать и вкладывать остаток */
    price: d.cashPrice, down: S.stage === 'pay' ? Math.max(0, d.cashPrice - d.principal) : d.down, oneOff: (d.oneOff || 0) + repair,
    sim, horizon: opt.horizon || Math.max(sim.months, d.months),
    homeGrowth: pth.home, rent0, rentGrowth: pth.rentGrowth, inflation: pth.infl,
    invReturn: inv, tax: opt.inv === 'stocks' ? 0 : 0.13,
    ownerCost: D.ownerCostPerM2 * Mdl.area(),
    buildMonths: Mdl.isNew() && S.stage !== 'pay' ? D.buildMonths : 0,
  });
};

/* Пересчёт в «сегодняшние» деньги */
Mdl.realK = (m) => 1 / E.index(Mdl.paths().infl, m);

/* Доход и ПДН */
Mdl.pdn = (pay) => pay / Math.max(1, S.income);
