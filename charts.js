'use strict';
/* =========================================================================
   ИПОТЕКА БЕЗ ИЛЛЮЗИЙ · графики (SVG, без библиотек)
   Цвета — роли из style.css: --c-home, --c-invest, --c-cost, --c-extra, --c-good
   ========================================================================= */

const CH = {};
const SVGNS = 'http://www.w3.org/2000/svg';

CH.el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

/* Короткая запись денег для осей и подписей: 1,2 млн / 850 тыс */
CH.money = (v, full) => {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',') + ' млрд';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' млн';
  if (a >= 1e3) return s + Math.round(a / 1e3) + ' тыс';
  return s + Math.round(a);
};

/* «Красивые» деления оси */
CH.ticks = (max, n = 4) => {
  if (max <= 0) return [0];
  const raw = max / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
};

/* Общий тултип */
CH.tip = (() => {
  let t = null;
  return {
    show(host, html, x, y) {
      if (!t) { t = document.createElement('div'); t.className = 'ch-tip'; }
      if (t.parentNode !== host) host.appendChild(t);
      t.innerHTML = html;
      t.style.display = 'block';
      const w = host.clientWidth, tw = t.offsetWidth;
      t.style.left = Math.max(4, Math.min(w - tw - 4, x - tw / 2)) + 'px';
      t.style.top = Math.max(0, y - t.offsetHeight - 10) + 'px';
    },
    hide() { if (t) t.style.display = 'none'; },
  };
})();

/* Обёртка: заголовок графика, легенда, таблица-двойник */
CH.frame = (host, { title, sub, legend, table }) => {
  host.innerHTML = '';
  host.classList.add('chart');
  if (title) { const h = document.createElement('div'); h.className = 'ch-title'; h.textContent = title; host.appendChild(h); }
  if (sub) { const s = document.createElement('div'); s.className = 'ch-sub'; s.innerHTML = sub; host.appendChild(s); }
  if (legend && legend.length > 1) {
    const l = document.createElement('div'); l.className = 'ch-legend';
    l.innerHTML = legend.map(x => `<span><i style="background:var(${x.c})"></i>${x.t}</span>`).join('');
    host.appendChild(l);
  }
  const plot = document.createElement('div'); plot.className = 'ch-plot'; host.appendChild(plot);
  if (table) {
    const d = document.createElement('details'); d.className = 'ch-table';
    d.innerHTML = `<summary>Показать цифрами</summary><div class="tbl-wrap"><table><thead><tr>${table.head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${table.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    host.appendChild(d);
  }
  return plot;
};

/* -------------------------------------------------------------------------
   Горизонтальные столбики: [{label, value, c, note}]
   ------------------------------------------------------------------------- */
CH.barsH = (host, items, opt = {}) => {
  const plot = CH.frame(host, { title: opt.title, sub: opt.sub, legend: opt.legend,
    table: opt.noTable ? null : { head: ['', opt.valueHead || 'Сумма'], rows: items.map(i => [i.label, opt.fmt ? opt.fmt(i.value) : CH.money(i.value) + ' ₽']) } });
  const max = Math.max(...items.map(i => i.value), 1);
  const wrap = document.createElement('div'); wrap.className = 'hbars';
  items.forEach((it, k) => {
    const row = document.createElement('div'); row.className = 'hbar' + (it.strong ? ' strong' : '');
    const pct = Math.max(0.6, it.value / max * 100);
    row.innerHTML = `<div class="hbar-l">${it.label}</div>
      <div class="hbar-track"><div class="hbar-fill" style="--w:${pct}%;background:var(${it.c || '--c-home'});animation-delay:${k * 90}ms"></div>
      <div class="hbar-v">${opt.fmt ? opt.fmt(it.value) : CH.money(it.value) + ' ₽'}</div></div>
      ${it.note ? `<div class="hbar-n">${it.note}</div>` : ''}`;
    wrap.appendChild(row);
  });
  plot.appendChild(wrap);
};

/* -------------------------------------------------------------------------
   Вертикальные колонки (одна или две серии рядом): cats = ['3%', ...],
   series = [{name, c, values:[...]}]
   ------------------------------------------------------------------------- */
CH.columns = (host, cats, series, opt = {}) => {
  const plot = CH.frame(host, { title: opt.title, sub: opt.sub, legend: series.map(s => ({ t: s.name, c: s.c })),
    table: { head: [opt.catHead || ''].concat(series.map(s => s.name)), rows: cats.map((c, k) => [c].concat(series.map(s => (opt.fmt || (v => CH.money(v) + ' ₽'))(s.values[k])))) } });
  const draw = () => {
    plot.innerHTML = '';
    const W = Math.max(280, plot.clientWidth), H = opt.h || 220;
    const pl = 46, pr = 6, pt = 18, pb = 26;
    const svg = CH.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opt.title || '' }, plot);
    const max = Math.max(...series.flatMap(s => s.values), 1);
    const tk = CH.ticks(max);
    const top = tk[tk.length - 1];
    const y = v => pt + (H - pt - pb) * (1 - v / top);
    tk.forEach(t => {
      CH.el('line', { x1: pl, x2: W - pr, y1: y(t), y2: y(t), class: t === 0 ? 'ax-base' : 'ax-grid' }, svg);
      const tx = CH.el('text', { x: pl - 6, y: y(t) + 4, class: 'ax-t', 'text-anchor': 'end' }, svg); tx.textContent = CH.money(t);
    });
    const band = (W - pl - pr) / cats.length;
    const bw = Math.min(24, (band - 10) / series.length - 2);
    cats.forEach((c, k) => {
      const cx = pl + band * k + band / 2;
      const tx = CH.el('text', { x: cx, y: H - 8, class: 'ax-t' + (opt.hl === k ? ' ax-hl' : ''), 'text-anchor': 'middle' }, svg); tx.textContent = c;
      series.forEach((s, j) => {
        const v = s.values[k];
        const x0 = cx - (series.length * (bw + 2)) / 2 + j * (bw + 2) + 1;
        const h = Math.max(1, (H - pt - pb) - (y(v) - pt));
        const r = Math.min(4, bw / 2, h);
        const yb = H - pb, yt = yb - h;
        const p = CH.el('path', { d: `M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${yb} Z`,
          fill: `var(${s.c})`, class: 'col' + (opt.hl != null && opt.hl !== k ? ' dim' : '') }, svg);
        p.style.animationDelay = (k * 60) + 'ms';
        if (opt.labelTop && (series.length === 1 || j === series.length - 1)) {
          const lt = CH.el('text', { x: x0 + bw / 2, y: yt - 5, class: 'col-v', 'text-anchor': 'middle' }, svg); lt.textContent = CH.money(v);
        }
      });
      /* зона наведения на всю полосу */
      const hit = CH.el('rect', { x: pl + band * k, y: pt, width: band, height: H - pt - pb, fill: 'transparent' }, svg);
      const show = (ev) => {
        const rect = plot.getBoundingClientRect();
        CH.tip.show(plot, `<b>${opt.tipCat ? opt.tipCat(c, k) : c}</b>` + series.map(s => `<div><i style="background:var(${s.c})"></i>${s.name}: <b>${(opt.fmt || (v => CH.money(v) + ' ₽'))(s.values[k])}</b></div>`).join(''), cx, y(Math.max(...series.map(s => s.values[k]))));
      };
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', () => CH.tip.hide());
    });
  };
  draw();
  CH.onResize(host, draw);
};

/* -------------------------------------------------------------------------
   Стек по годам: сколько из платежей ушло на проценты/долг/страховку
   stacks = [{name, c, values}] (снизу вверх), cats = годы
   ------------------------------------------------------------------------- */
CH.stack = (host, cats, stacks, opt = {}) => {
  const plot = CH.frame(host, { title: opt.title, sub: opt.sub, legend: stacks.map(s => ({ t: s.name, c: s.c })),
    table: { head: [opt.catHead || 'Год'].concat(stacks.map(s => s.name)), rows: cats.map((c, k) => [c].concat(stacks.map(s => CH.money(s.values[k]) + ' ₽'))) } });
  const draw = () => {
    plot.innerHTML = '';
    const W = Math.max(280, plot.clientWidth), H = opt.h || 200;
    const pl = 46, pr = 6, pt = 10, pb = 24;
    const svg = CH.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opt.title || '' }, plot);
    const tot = cats.map((_, k) => stacks.reduce((s, x) => s + x.values[k], 0));
    const tk = CH.ticks(Math.max(...tot, 1));
    const top = tk[tk.length - 1];
    const sc = v => (H - pt - pb) * v / top;
    tk.forEach(t => {
      const yy = H - pb - sc(t);
      CH.el('line', { x1: pl, x2: W - pr, y1: yy, y2: yy, class: t === 0 ? 'ax-base' : 'ax-grid' }, svg);
      const tx = CH.el('text', { x: pl - 6, y: yy + 4, class: 'ax-t', 'text-anchor': 'end' }, svg); tx.textContent = CH.money(t);
    });
    const band = (W - pl - pr) / cats.length;
    const bw = Math.max(2, Math.min(18, band - 2));
    const every = Math.ceil(cats.length / Math.floor((W - pl) / 34));
    cats.forEach((c, k) => {
      const x0 = pl + band * k + (band - bw) / 2;
      let acc = 0;
      stacks.forEach((s, j) => {
        const v = s.values[k]; if (v <= 0) return;
        const h = sc(v);
        const y1 = H - pb - sc(acc) - (acc > 0 ? 1 : 0);
        const hh = Math.max(0.5, h - (acc > 0 ? 1 : 0));
        const isTop = stacks.slice(j + 1).every(x => x.values[k] <= 0);
        const r = isTop ? Math.min(3, bw / 2, hh) : 0;
        const yt = y1 - hh;
        CH.el('path', { d: `M${x0},${y1} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${y1} Z`, fill: `var(${s.c})` }, svg);
        acc += v;
      });
      if (k % every === 0) {
        const tx = CH.el('text', { x: x0 + bw / 2, y: H - 7, class: 'ax-t', 'text-anchor': 'middle' }, svg); tx.textContent = c;
      }
      const hit = CH.el('rect', { x: pl + band * k, y: pt, width: band, height: H - pt - pb, fill: 'transparent' }, svg);
      const show = () => CH.tip.show(plot, `<b>${opt.tipCat ? opt.tipCat(c, k) : c}</b>` + stacks.slice().reverse().map(s => `<div><i style="background:var(${s.c})"></i>${s.name}: <b>${CH.money(s.values[k])} ₽</b></div>`).join(''), x0 + bw / 2, H - pb - sc(tot[k]));
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', () => CH.tip.hide());
    });
  };
  draw();
  CH.onResize(host, draw);
};

/* -------------------------------------------------------------------------
   Линии: xs = подписи по оси X (массив), series = [{name, c, values, area, dash}]
   ------------------------------------------------------------------------- */
CH.lines = (host, xs, series, opt = {}) => {
  const fmt = opt.fmt || (v => CH.money(v) + ' ₽');
  const step = opt.tableStep || Math.max(1, Math.round(xs.length / 8));
  const tIdx = xs.map((_, k) => k).filter(k => k % step === 0 || k === xs.length - 1);
  const plot = CH.frame(host, { title: opt.title, sub: opt.sub, legend: series.map(s => ({ t: s.name, c: s.c })),
    table: { head: [opt.xHead || ''].concat(series.map(s => s.name)), rows: tIdx.map(k => [xs[k]].concat(series.map(s => s.values[k] == null ? '—' : fmt(s.values[k])))) } });
  const draw = () => {
    plot.innerHTML = '';
    const W = Math.max(280, plot.clientWidth), H = opt.h || 220;
    const pl = opt.pl || 48, pr = opt.pr || 10, pt = 12, pb = 24;
    const svg = CH.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opt.title || '' }, plot);
    const all = series.flatMap(s => s.values.filter(v => v != null));
    const mn = Math.min(0, ...all);
    const tk = CH.ticks(Math.max(...all, 1) - mn).map(t => t + mn);
    const top = tk[tk.length - 1];
    const n = xs.length;
    const x = k => pl + (W - pl - pr) * (n === 1 ? 0.5 : k / (n - 1));
    const y = v => pt + (H - pt - pb) * (1 - (v - mn) / (top - mn));
    tk.forEach(t => {
      CH.el('line', { x1: pl, x2: W - pr, y1: y(t), y2: y(t), class: Math.abs(t) < 1e-9 ? 'ax-base' : 'ax-grid' }, svg);
      const tx = CH.el('text', { x: pl - 6, y: y(t) + 4, class: 'ax-t', 'text-anchor': 'end' }, svg); tx.textContent = opt.yFmt ? opt.yFmt(t) : CH.money(t);
    });
    const nl = Math.min(n, Math.floor((W - pl) / 44));
    for (let j = 0; j < nl; j++) {
      const k = Math.round(j * (n - 1) / Math.max(1, nl - 1));
      const tx = CH.el('text', { x: x(k), y: H - 7, class: 'ax-t', 'text-anchor': j === 0 ? 'start' : j === nl - 1 ? 'end' : 'middle' }, svg); tx.textContent = xs[k];
    }
    (opt.marks || []).forEach(mk => {
      CH.el('line', { x1: x(mk.k), x2: x(mk.k), y1: pt, y2: H - pb, class: 'ax-mark' }, svg);
      const tx = CH.el('text', { x: x(mk.k) + 4, y: pt + 10, class: 'ax-t ax-hl' }, svg); tx.textContent = mk.t;
    });
    series.forEach(s => {
      const pts = s.values.map((v, k) => v == null ? null : [x(k), y(v)]);
      const seg = pts.filter(Boolean);
      if (!seg.length) return;
      const d = seg.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
      if (s.area) CH.el('path', { d: d + `L${seg[seg.length - 1][0]},${y(Math.max(0, mn))}L${seg[0][0]},${y(Math.max(0, mn))}Z`, fill: `var(${s.c})`, 'fill-opacity': 0.1 }, svg);
      const p = CH.el('path', { d, fill: 'none', stroke: `var(${s.c})`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'ln' + (s.dash ? ' ln-dash' : '') }, svg);
      const last = seg[seg.length - 1];
      CH.el('circle', { cx: last[0], cy: last[1], r: 4, fill: `var(${s.c})`, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    });
    /* перекрестие */
    const cross = CH.el('line', { y1: pt, y2: H - pb, class: 'ax-cross', style: 'display:none' }, svg);
    const dots = series.map(s => CH.el('circle', { r: 4, fill: `var(${s.c})`, stroke: 'var(--surface)', 'stroke-width': 2, style: 'display:none' }, svg));
    const hit = CH.el('rect', { x: pl, y: 0, width: W - pl - pr, height: H, fill: 'transparent' }, svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * W / r.width;
      const k = Math.max(0, Math.min(n - 1, Math.round((px - pl) / (W - pl - pr) * (n - 1))));
      cross.setAttribute('x1', x(k)); cross.setAttribute('x2', x(k)); cross.style.display = '';
      let ymin = H;
      series.forEach((s, j) => {
        const v = s.values[k];
        if (v == null) { dots[j].style.display = 'none'; return; }
        dots[j].setAttribute('cx', x(k)); dots[j].setAttribute('cy', y(v)); dots[j].style.display = '';
        ymin = Math.min(ymin, y(v));
      });
      CH.tip.show(plot, `<b>${opt.tipX ? opt.tipX(xs[k], k) : xs[k]}</b>` + series.map(s => s.values[k] == null ? '' : `<div><i style="background:var(${s.c})"></i>${s.name}: <b>${fmt(s.values[k])}</b></div>`).join(''), x(k) * r.width / W, ymin * r.height / H);
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; dots.forEach(d => d.style.display = 'none'); CH.tip.hide(); });
  };
  draw();
  CH.onResize(host, draw);
};

/* Перерисовка при изменении ширины */
CH.onResize = (host, fn) => {
  if (!window.ResizeObserver) return;
  let w = host.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 4) { w = host.clientWidth; fn(); } });
  ro.observe(host);
};

/* Полукруглый индикатор (ПДН, доля процентов) */
CH.gauge = (host, value, opt = {}) => {
  const v = Math.max(0, Math.min(1, value));
  const zones = opt.zones || [[0.3, '--c-good'], [0.5, '--c-home'], [1, '--c-cost']];
  const W = 220, H = 128, cx = 110, cy = 112, R = 92, w = 14;
  const arc = (a0, a1) => {
    const p = a => [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`;
  };
  host.innerHTML = '';
  host.classList.add('gauge');
  const svg = CH.el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': opt.label || '' }, host);
  let a = 0;
  zones.forEach(([to, c]) => { CH.el('path', { d: arc(a + 0.004, to - 0.004), stroke: `var(${c})`, 'stroke-width': w, fill: 'none', 'stroke-opacity': 0.28 }, svg); a = to; });
  a = 0;
  zones.forEach(([to, c]) => { if (v > a) CH.el('path', { d: arc(a + 0.004, Math.min(v, to) - 0.004), stroke: `var(${c})`, 'stroke-width': w, fill: 'none' }, svg); a = to; });
  const ang = Math.PI * (1 - v);
  CH.el('circle', { cx: cx + R * Math.cos(ang), cy: cy - R * Math.sin(ang), r: 9, fill: 'var(--tx-bright)', stroke: 'var(--surface)', 'stroke-width': 3 }, svg);
  const t = CH.el('text', { x: cx, y: cy - 18, class: 'g-val', 'text-anchor': 'middle' }, svg); t.textContent = opt.text || Math.round(v * 100) + '%';
  if (opt.caption) { const c = CH.el('text', { x: cx, y: cy + 2, class: 'g-cap', 'text-anchor': 'middle' }, svg); c.textContent = opt.caption; }
};
