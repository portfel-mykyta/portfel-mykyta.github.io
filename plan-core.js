/* Портфель: правило поповнення, спільне для застосунку і сторінки «Купівля» в Claude.

   Нові гроші йдуть у фонди: частина в облігації, щоб їхня частка в рахунку
   дійшла до заданої, решта у фонд на S&P 500. Так жодна окрема акція не росте
   понад межу, і нічого не треба продавати. Тут лише арифметика, без DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PortfelPlan = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Частки компаній в S&P 500 (Slickcharts, 27.10.2026). GOOGL і GOOG разом: це одна компанія.
  var SP500 = {
    NVDA: 0.075, AAPL: 0.0714, MSFT: 0.0561, AMZN: 0.0385, GOOGL: 0.0553, GOOG: 0.0553, AVGO: 0.023,
    META: 0.023, TSLA: 0.0224, 'BRK.B': 0.0167, LLY: 0.0163, MU: 0.0149, WMT: 0.0136, JPM: 0.0127,
    AMD: 0.0126, V: 0.0108, XOM: 0.0108, JNJ: 0.0092, MA: 0.0076, ABBV: 0.0072, INTC: 0.0069,
    PLTR: 0.0068, CVX: 0.0065, COST: 0.0063, CSCO: 0.0062, KO: 0.0057, ORCL: 0.0055, PG: 0.0053,
    UNH: 0.0053, BAC: 0.005
  };
  function set(list) { var o = {}; list.split(' ').forEach(function (s) { o[s] = 1; }); return o; }
  // Фонди, що повторюють S&P 500: через них ти теж володієш Apple, Tesla тощо
  var TRACKERS = set('VOO VUAA VUSA CSPX SXR8 IVV SPY SPLG SPYM IUSA SPYL SPX5 I500');
  // Фонди облігацій (американські й ірландські)
  var BONDS = set('SGOV BIL SHV BILS TBIL USFR TFLO SHY VGSH SCHO SPTS IEI IEF VGIT SCHR TLT VGLT SPTL GOVT ' +
    'BND AGG SCHZ BNDX BSV BIV BLV VCIT VCSH LQD HYG JNK TIP VTIP SCHP MUB ' +
    'IB01 IBTA IBTS IBTU IBTM CBU0 IDTL DTLA VDTY VUTY VGOV IGLT AGGU AGGG VAGF VAGS VAGU IHYG IEAC CSBGU0 CSBGU3 ERNS ERNX');
  // Інші фонди акцій: їх склад тут не розкладаємо, але й окремою акцією не вважаємо
  var OTHER_FUNDS = set('QQQ QQQM VTI VT VXUS VEA VWO IEFA IEMG SCHD VIG VYM DGRO SCHB SCHX ITOT IWM VB VO VUG VTV ' +
    'XLK XLF XLE XLV SMH SOXX ARKK GLD IAU SLV IWDA SWDA VWCE VWRA VWRL EQQQ CNDX CSNDX EIMI IEMA EMIM ISAC SSAC XDWD IUIT');

  // Фонди, які пропонує план. conid: ідентифікатор контракту в IBKR
  var FUNDS = {
    VOO: { kind: 'stocks', conid: 136155102, venue: 'US', exch: '', about: 'Фонд: 500 найбільших компаній США' },
    VUAA: { kind: 'stocks', conid: 366244335, venue: 'LSE', exch: 'LSEETF', about: 'Той самий S&P 500, ірландський накопичувальний фонд' },
    SGOV: { kind: 'bonds', conid: 424099317, venue: 'US', exch: '', about: 'Фонд облігацій уряду США до 3 місяців' },
    IB01: { kind: 'bonds', conid: 354802220, venue: 'LSE', exch: 'LSEETF', about: 'Облігації уряду США до року, ірландський накопичувальний фонд' }
  };

  // Комісії з твоїх угод: Лондонська біржа мінімум близько $1.70, американські фонди до 1% суми
  var LSE_MIN_FEE = 1.7;
  var US_FEE_CAP = 0.01;
  var MIN_ORDER = 1;            // менші за долар заявки не створюємо: усе в одну
  var CAPS = [0.05, 0.1, 0.15, 0.2, 0.25];
  var BOND_SHARES = [0, 0.1, 0.2, 0.3, 0.4];

  function typeOf(sym, isFund) {
    if (TRACKERS[sym]) return 'tracker';
    if (BONDS[sym]) return 'bond';
    if (OTHER_FUNDS[sym] || isFund) return 'fund';
    return 'stock';
  }

  // Американський фонд, поки 1% суми менший за мінімальну комісію в Лондоні; далі ірландський
  function pickFund(kind, amount) {
    var us = amount * US_FEE_CAP < LSE_MIN_FEE;
    if (kind === 'bonds') return us ? 'SGOV' : 'IB01';
    return us ? 'VOO' : 'VUAA';
  }
  function feeShare(sym, amount) {
    var f = FUNDS[sym];
    if (!f || !(amount > 0)) return null;
    return f.venue === 'LSE' ? LSE_MIN_FEE / amount : US_FEE_CAP;
  }

  /**
   * Скільки всього треба вкласти (рахуючи від base), щоб частка акції разом
   * із тим, що від неї лежить у фондах, опустилася до межі cap. Нові гроші
   * діляться так, щоб облігації трималися на частці b.
   */
  function needFor(v, w, F, Bv, base, cap, b) {
    var allStocks = cap > w ? (v + w * F - cap * base) / (cap - w) : Infinity;
    if (b > 0) {
      var den = cap - w * (1 - b);
      var split = den > 0 ? (v + w * (F + Bv - b * base) - cap * base) / den : Infinity;
      if (b * (base + Math.max(0, split)) >= Bv) return Math.max(0, split);
    }
    return Math.max(0, allStocks);
  }

  function cents(x) { return Math.round(x * 100) / 100; }

  /**
   * o: {nav, cash, amount, cap, bonds, holdings: [{sym, name, value, type}]}
   *  nav     вартість рахунку разом із грошима
   *  cash    вільні гроші на рахунку (вони підуть у покупку першими)
   *  amount  скільки вкласти зараз
   *  cap     межа для однієї акції (частка рахунку)
   *  bonds   бажана частка облігацій
   */
  function model(o) {
    var nav = o.nav > 0 ? o.nav : 0;
    var A = o.amount > 0 ? o.amount : 0;
    var cap = o.cap, b = o.bonds > 0 ? o.bonds : 0;
    var used = Math.min(A, Math.max(0, o.cash || 0));
    var base = Math.max(0, nav - used);        // рахунок без грошей, які зараз вкладемо
    var T = base + A;                          // рахунок після покупки
    var F = 0, Bv = 0;
    o.holdings.forEach(function (h) {
      if (h.type === 'tracker') F += h.value;
      else if (h.type === 'bond') Bv += h.value;
    });

    // Облігації: стільки, щоб дійти до частки b, але не більше за суму
    var xb = b > 0 ? cents(Math.min(A, Math.max(0, b * T - Bv))) : 0;
    if (xb < MIN_ORDER) xb = 0;
    if (xb > 0 && A - xb < MIN_ORDER) xb = A;
    var xs = cents(A - xb);
    if (xs < 0.005) xs = 0;

    var orders = [];
    if (xs > 0) orders.push({ kind: 'stocks', sym: pickFund('stocks', xs), amount: xs });
    if (xb > 0) orders.push({ kind: 'bonds', sym: pickFund('bonds', xb), amount: xb });
    orders.sort(function (p, q) { return q.amount - p.amount; });
    orders.forEach(function (r) { var f = FUNDS[r.sym]; r.fee = feeShare(r.sym, r.amount); r.about = f.about; r.conid = f.conid; r.venue = f.venue; r.exch = f.exch; });

    var stocks = o.holdings.filter(function (h) { return h.type === 'stock' && h.value > 0; }).map(function (h) {
      var w = SP500[h.sym] || 0;
      var now = nav > 0 ? (h.value + w * F) / nav : 0;
      var after = T > 0 ? (h.value + w * (F + xs)) / T : 0;
      var need = needFor(h.value, w, F, Bv, base, cap, b);
      return { sym: h.sym, name: h.name || h.sym, w: w, now: now, after: after, need: need, over: after > cap + 1e-9 };
    }).sort(function (p, q) { return q.now - p.now; });
    var needAll = stocks.reduce(function (m, s) { return Math.max(m, s.need); }, 0);

    return {
      amount: A, cap: cap, bonds: b, nav: nav, base: base, after: T, orders: orders,
      xs: xs, xb: xb, stocks: stocks, over: stocks.filter(function (s) { return s.over; }),
      needAll: needAll, rest: needAll - A,
      bondNow: nav > 0 ? Bv / nav : 0, bondAfter: T > 0 ? (Bv + xb) / T : 0, bondGap: b * T - Bv
    };
  }

  function listNames(xs) { return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' і ' + xs[xs.length - 1] : xs[0]; }
  function p0(x) { return Math.round(x * 100) + '%'; }
  function p1(x) { return (x * 100).toFixed(1) + '%'; }

  // Пояснення до плану: чому фонд, що з облігаціями, скільки коштує покупка
  function notes(m) {
    var out = [];
    if (m.over.length) out.push('Фонд, а не акції: ' + listNames(m.over.map(function (s) { return s.name; })) + ' вище межі ' + p0(m.cap) + '.');
    else if (m.stocks.length) out.push('Усі акції в межах ' + p0(m.cap) + '. Фонд додає різноманітності; акції можна докупити, але не вище межі.');
    if (m.bonds > 0) {
      out.push(m.xb > 0
        ? (m.bondNow < 0.0005 ? 'Облігацій зараз немає' : 'Облігацій зараз ' + p1(m.bondNow)) + ', після покупки буде ' + p1(m.bondAfter) + '.'
        : 'Облігацій уже ' + p1(m.bondNow) + ', тобто не менше ' + p0(m.bonds) + ': усе в акції.');
    }
    var us = m.orders.filter(function (o) { return o.venue !== 'LSE'; });
    if (us.length) {
      var alts = us.map(function (o) { return o.kind === 'bonds' ? 'IB01' : 'VUAA'; });
      out.push(listNames(us.map(function (o) { return o.sym; })) + ': комісія до 1% суми; ' +
        (alts.length > 1 ? 'ірландські ' + listNames(alts) + ' на таких сумах коштували б' : 'ірландський ' + alts[0] + ' на цій сумі коштував би') + ' від $' + LSE_MIN_FEE.toFixed(2) + '.');
    }
    m.orders.filter(function (o) { return o.venue === 'LSE'; }).forEach(function (o) {
      out.push(o.sym + ': комісія близько $' + LSE_MIN_FEE.toFixed(2) + ', це ' + p1(o.fee) + ' суми; фонд накопичувальний, тож щороку декларувати нічого.');
    });
    if (m.orders.some(function (o) { return o.sym === 'SGOV'; })) out.push('SGOV щомісяця виплачує відсотки: їх треба декларувати в Україні.');
    return out;
  }

  // Налаштування в посиланні: лише літери, цифри й дефіси (так їх передає Claude)
  function toHash(s) {
    return 'p-' + Math.round(s.amount * 100) + '-' + Math.round(s.cap * 100) + '-' + Math.round((s.bonds || 0) * 100);
  }
  function fromHash(h) {
    var m = /^#?p-(\d{1,9})-(\d{1,2})-(\d{1,2})$/.exec(String(h || ''));
    if (!m) return null;
    var amount = Number(m[1]) / 100, cap = Number(m[2]) / 100, bonds = Number(m[3]) / 100;
    if (!(amount > 0) || CAPS.indexOf(cap) < 0 || BOND_SHARES.indexOf(bonds) < 0) return null;
    return { amount: amount, cap: cap, bonds: bonds };
  }

  return {
    SP500: SP500, TRACKERS: TRACKERS, BONDS: BONDS, OTHER_FUNDS: OTHER_FUNDS, FUNDS: FUNDS,
    LSE_MIN_FEE: LSE_MIN_FEE, US_FEE_CAP: US_FEE_CAP, MIN_ORDER: MIN_ORDER, CAPS: CAPS, BOND_SHARES: BOND_SHARES,
    typeOf: typeOf, pickFund: pickFund, feeShare: feeShare, needFor: needFor, model: model, notes: notes, toHash: toHash, fromHash: fromHash
  };
}));
