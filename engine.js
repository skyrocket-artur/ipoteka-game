'use strict';
/* =========================================================================
   ИПОТЕКА БЕЗ ИЛЛЮЗИЙ · расчётное ядро
   Аннуитет, досрочка (срок/платёж), каникулы, смена ставки, страховки,
   «ипотека против аренды с инвестициями», «копить самому».
   Все ставки — годовые, в долях (0.06 = 6%). Месяцы считаются с 0.
   ========================================================================= */

const E = {};

/* Ежемесячный аннуитетный платёж */
E.pmt = (P, r, n) => {
  if (P <= 0 || n <= 0) return 0;
  const i = r / 12;
  if (i === 0) return P / n;
  return P * i / (1 - Math.pow(1 + i, -n));
};

/* Сколько месяцев нужно, чтобы погасить P платежом pay */
E.nper = (P, r, pay) => {
  const i = r / 12;
  if (P <= 0) return 0;
  if (i === 0) return Math.ceil(P / pay);
  if (pay <= P * i) return Infinity;
  return Math.ceil(-Math.log(1 - P * i / pay) / Math.log(1 + i) - 1e-9);
};

/* Годовая ставка → месячный множитель (для вкладов и инвестиций) */
E.mGrow = r => Math.pow(1 + r, 1 / 12) - 1;

/* Значение «пути» по месяцу: путь задан массивом по годам [r0, r1, ...] (последний тянется дальше) */
E.atYear = (path, m) => {
  if (typeof path === 'number') return path;
  const y = Math.floor(m / 12);
  return path[Math.min(y, path.length - 1)];
};

/* Накопленный индекс по годовому пути: стоимость 1 ₽ через m месяцев */
E.index = (path, m) => {
  let v = 1;
  for (let k = 0; k < m; k++) v *= 1 + E.mGrow(E.atYear(path, k));
  return v;
};

/* -------------------------------------------------------------------------
   Симуляция кредита помесячно.
   opt = {
     principal, months, rate,                  // базовые условия
     rateSteps: [{from, rate}],                // смена ставки с месяца from (промо, рефинанс, отказ от страховки)
     floating: {from, spread, keyPath, floor}, // плавающая: ключевая + спред с месяца from
     extraMonthly, extraFrom, extraMode,       // регулярная доплата: 'term' | 'payment'
     lumps: [{month, amount, mode}],           // разовые досрочки
     holidays: [{from, len}],                  // ипотечные каникулы (платежи переносятся в конец)
     ins: {life, prop, title, titleYears, base, lifeFrom, lifeTo, steps:[{from, life}]} // тарифы в долях от остатка в год
   }
   ------------------------------------------------------------------------- */
E.simulate = (o) => {
  const rows = [];
  let bal = o.principal;
  let remN = o.months;
  let rate = o.rate;
  let pay = E.pmt(bal, rate, remN);
  let deferred = 0;          // проценты, отложенные на время каникул
  let tPrin = 0, tIns = 0, tPaid = 0, tExtra = 0;
  const ins = o.ins || {};
  const insBase = ins.base || 1;   // страховая сумма = остаток × base (часто +10%)
  const steps = (o.rateSteps || []).slice().sort((a, b) => a.from - b.from);
  const lumps = o.lumps || [];
  const hol = o.holidays || [];
  const firstPay = pay;
  const maxM = o.months + 120;
  let m = 0;
  let recalc = false;

  for (; m < maxM && (bal > 0.5 || deferred > 0.5); m++) {
    /* 1. ставка на этот месяц */
    let r = rate;
    for (const s of steps) if (m >= s.from) r = s.rate;
    if (o.floating && m >= o.floating.from) {
      r = Math.max(o.floating.floor || 0, E.atYear(o.floating.keyPath, m) + o.floating.spread);
    }
    if (r !== rate) { rate = r; recalc = true; }
    if (recalc && bal > 0) { pay = E.pmt(bal, rate, Math.max(1, remN)); recalc = false; }

    /* 2. страховка — раз в год по остатку */
    let insPay = 0;
    if (m % 12 === 0 && bal > 0) {
      const y = m / 12;
      let life = ins.life || 0;
      for (const s of ins.steps || []) if (m >= s.from) life = s.life;
      const lifeOn = (ins.lifeTo == null || m < ins.lifeTo) && (ins.lifeFrom == null || m >= ins.lifeFrom);
      let t = (lifeOn ? life : 0) + (ins.prop || 0) + (y < (ins.titleYears || 0) ? (ins.title || 0) : 0);
      for (const s of ins.kSteps || []) if (m >= s.from) t *= s.k;   // смена страховщика: −30% и т.п.
      insPay = bal * insBase * t;
    }

    /* 3. каникулы */
    const onHoliday = hol.some(h => m >= h.from && m < h.from + h.len);
    const interest = bal > 0.5 ? bal * rate / 12 : 0;
    let principalPart = 0, payNow = 0, extra = 0;

    if (onHoliday && bal > 0.5) {
      /* Ипотечные каникулы (ст. 6.1-1 353-ФЗ): платежи льготного периода не вносятся, график идёт дальше,
         а пропущенные платежи уплачиваются после окончания срока — без процентов сверху */
      const due = Math.min(pay, bal + interest);
      principalPart = due - interest;
      bal -= principalPart;
      remN -= 1;
      deferred += due;
      principalPart = 0;               // в этот месяц долг фактически не гасится деньгами заёмщика
    } else if (bal > 0.5) {
      payNow = Math.min(pay, bal + interest);
      principalPart = payNow - interest;
      bal -= principalPart;
      remN -= 1;

      /* 4. досрочки */
      let extraTerm = 0, extraPay = 0;
      if (o.extraMonthly && m >= (o.extraFrom || 0) && bal > 0) {
        const x = Math.min(o.extraMonthly, bal);
        if (o.extraMode === 'payment') extraPay += x; else extraTerm += x;
      }
      for (const l of lumps) if (l.month === m && bal > 0) {
        const x = Math.min(l.amount, bal - extraTerm - extraPay);
        if (x <= 0) continue;
        if (l.mode === 'payment') extraPay += x; else extraTerm += x;
      }
      extra = extraTerm + extraPay;
      if (extra > 0) {
        bal -= extra;
        if (bal < 0.5) bal = 0;
        if (bal > 0) {
          if (extraPay > 0) pay = E.pmt(bal, rate, Math.max(1, remN));
          else remN = Math.min(remN, E.nper(bal, rate, pay));
        }
      }
    } else {
      /* основной долг закрыт — вносим отложенные за каникулы платежи */
      payNow = Math.min(pay, deferred);
      deferred -= payNow;
    }

    tPrin += principalPart + extra;
    tIns += insPay;
    tExtra += extra;
    tPaid += payNow + extra + insPay;
    rows.push({ m, rate, pay: payNow, interest, principal: principalPart, extra, ins: insPay, bal: Math.max(0, bal), holiday: onHoliday });
  }
  return {
    rows,
    months: rows.length,
    firstPay,
    totalInterest: rows.reduce((s, r) => s + r.interest, 0),
    totalIns: tIns,
    totalExtra: tExtra,
    totalPaid: tPaid,
  };
};

/* Итоги по годам: сколько ушло на проценты, на долг, на страховку */
E.yearly = (sim) => {
  const ys = [];
  for (const r of sim.rows) {
    const y = Math.floor(r.m / 12);
    if (!ys[y]) ys[y] = { y, interest: 0, principal: 0, ins: 0, pay: 0, bal: 0 };
    ys[y].interest += r.interest;
    ys[y].principal += r.principal + r.extra;
    ys[y].ins += r.ins;
    ys[y].pay += r.pay + r.extra;
    ys[y].bal = r.bal;
  }
  return ys;
};

/* Полная стоимость кредита (как ПСК по 353-ФЗ: месячная IRR × 12): получили кредит → платежи + страховки + разовые расходы */
E.effRate = (principal, sim, oneOff = 0) => {
  const cf = sim.rows.map(r => r.pay + r.extra + r.ins);
  const npv = (i) => {
    let v = -(principal - oneOff);
    let d = 1;
    for (let k = 0; k < cf.length; k++) { d /= (1 + i); v += cf[k] * d; }
    return v;
  };
  let lo = 0, hi = 0.2;               // месячная ставка
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2 * 12;
};

/* -------------------------------------------------------------------------
   Ипотека против аренды с инвестициями (симметричное сравнение бюджетов).
   Покупатель платит взнос + разовые расходы, затем платёж + страховку + расходы
   владельца (+ аренду, пока дом строится). Арендатор вкладывает взнос и разовые
   расходы, платит аренду и вкладывает разницу. Если аренда дороже — разницу
   вкладывает уже покупатель. Возвращает помесячные капиталы обоих.
   ------------------------------------------------------------------------- */
E.rentVsBuy = (o) => {
  const H = o.horizon;
  const out = [];
  let renter = o.down + o.oneOff;   // портфель арендатора
  let buyer = 0;                    // портфель покупателя (если аренда дороже его расходов)
  let rent = o.rent0;
  let ownerCost = o.ownerCost || 0;
  let home = o.price;
  for (let m = 0; m < H; m++) {
    if (m > 0 && m % 12 === 0) {
      rent *= 1 + E.atYear(o.rentGrowth, m - 1);
      ownerCost *= 1 + E.atYear(o.inflation, m - 1);
    }
    home *= 1 + E.mGrow(E.atYear(o.homeGrowth, m));
    const r = o.sim.rows[m];
    const mort = r ? r.pay + r.extra + r.ins : 0;
    const building = m < (o.buildMonths || 0);
    const buyerOut = mort + (building ? rent : ownerCost);
    const renterOut = rent;
    const g = E.mGrow(E.atYear(o.invReturn, m)) * (1 - (o.tax || 0));
    renter *= 1 + g;
    buyer *= 1 + g;
    const d = buyerOut - renterOut;
    if (d > 0) renter += d; else buyer += -d;
    const bal = r ? r.bal : 0;
    out.push({ m, home, bal, buyer: home - bal + buyer, renter, buyerCash: buyer, rent, buyerOut, renterOut });
  }
  return out;
};

/* Сколько месяцев копить на квартиру самому, откладывая budget − аренда, если квартира дорожает */
E.saveUp = (o) => {
  let s = o.start;
  let rent = o.rent0;
  let budget = o.budget;
  let price = o.price;
  for (let m = 0; m < 12 * 60; m++) {
    if (m > 0 && m % 12 === 0) {
      rent *= 1 + E.atYear(o.rentGrowth, m - 1);
      budget *= 1 + (o.budgetGrowth || 0);
    }
    price *= 1 + E.mGrow(E.atYear(o.homeGrowth, m));
    s *= 1 + E.mGrow(E.atYear(o.invReturn, m)) * (1 - (o.tax || 0));
    s += Math.max(0, budget - rent);
    if (s >= price) return { months: m + 1, price, saved: s };
  }
  return { months: Infinity, price, saved: s };
};

/* Будущая стоимость регулярных взносов pay в течение n месяцев под ставку r (годовая, ежемесячная капитализация) */
E.fvAnnuity = (pay, r, n) => {
  const i = r / 12;
  if (i === 0) return pay * n;
  return pay * (Math.pow(1 + i, n) - 1) / i;
};

/* Правило 72: за сколько лет деньги удваиваются */
E.doubling = r => Math.log(2) / Math.log(1 + r);

/* Вычет: имущественный (до 2 млн) и по процентам (до 3 млн), 13% */
E.deduction = (price, interestPaid, ndflPerYear, opts = {}) => {
  const base = Math.min(price, 2e6) * 0.13;
  const pct = Math.min(interestPaid, 3e6) * 0.13;
  return { base, pct, total: base + pct, yearsForBase: ndflPerYear > 0 ? base / ndflPerYear : Infinity };
};

/* Удобная обёртка: что получится при данных условиях */
E.quick = (principal, rate, months) => {
  const pay = E.pmt(principal, rate, months);
  const total = pay * months;
  return { pay, total, over: total - principal, firstInterestShare: principal * rate / 12 / pay };
};

if (typeof module !== 'undefined') module.exports = E;
