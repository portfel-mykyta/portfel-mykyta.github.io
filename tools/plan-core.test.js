// Перевірка правила поповнення: node tools/plan-core.test.js
'use strict';
var assert = require('assert');
var P = require('../plan-core.js');

function close(a, b, eps, msg) { assert.ok(Math.abs(a - b) <= eps, (msg || '') + ': ' + a + ' ≠ ' + b); }

// Рахунок, схожий на справжній: дві акції й два фонди на S&P 500
var holdings = [
  { sym: 'VOO', value: 55.52, type: 'tracker' },
  { sym: 'VUAA', value: 47.53, type: 'tracker' },
  { sym: 'TSLA', value: 37.34, type: 'stock', name: 'Tesla' },
  { sym: 'AAPL', value: 18.01, type: 'stock', name: 'Apple' }
];
var nav = 158.49, cash = 0.09;

// 1. Без облігацій: усе в один фонд, VOO для малих сум
var m = P.model({ nav: nav, cash: cash, amount: 50, cap: 0.1, bonds: 0, holdings: holdings });
assert.strictEqual(m.orders.length, 1);
assert.strictEqual(m.orders[0].sym, 'VOO');
close(m.orders[0].amount, 50, 1e-9, 'уся сума у фонд');
assert.deepStrictEqual(m.over.map(function (s) { return s.sym; }), ['TSLA', 'AAPL']);   // Apple ще й у фондах

// 2. Великі суми: ірландські фонди
assert.strictEqual(P.model({ nav: nav, cash: 0, amount: 500, cap: 0.1, bonds: 0, holdings: holdings }).orders[0].sym, 'VUAA');
assert.strictEqual(P.pickFund('bonds', 100), 'SGOV');
assert.strictEqual(P.pickFund('bonds', 200), 'IB01');

// 3. Облігації 10%: частина в SGOV, щоб дійти до 10% рахунку після покупки
m = P.model({ nav: nav, cash: cash, amount: 50, cap: 0.1, bonds: 0.1, holdings: holdings });
var T = nav - cash + 50;
var bonds = m.orders.filter(function (o) { return o.kind === 'bonds'; })[0];
var stocks = m.orders.filter(function (o) { return o.kind === 'stocks'; })[0];
close(bonds.amount, Math.round(0.1 * T * 100) / 100, 0.011, 'облігації до 10%');
close(bonds.amount + stocks.amount, 50, 1e-9, 'сума заявок');
assert.strictEqual(bonds.sym, 'SGOV');
close(m.bondAfter, 0.1, 0.001, 'частка облігацій після');

// 4. Облігацій уже вистачає: усе в акції
var withBonds = holdings.concat([{ sym: 'SGOV', value: 40, type: 'bond' }]);
m = P.model({ nav: nav + 40, cash: 0, amount: 50, cap: 0.1, bonds: 0.1, holdings: withBonds });
assert.strictEqual(m.orders.length, 1);
assert.strictEqual(m.orders[0].kind, 'stocks');

// 5. Дрібниця на облігації (менше долара) не стає окремою заявкою
m = P.model({ nav: 100, cash: 0, amount: 50, cap: 0.25, bonds: 0.1, holdings: [{ sym: 'SGOV', value: 14.6, type: 'bond' }, { sym: 'VOO', value: 85.4, type: 'tracker' }] });
assert.strictEqual(m.orders.length, 1, 'дрібна заявка');

// 6. Формула «скільки ще треба» збігається з покроковим моделюванням
function simulate(v, w, F, Bv, base, cap, b) {
  var step = 0.01, D = 0;
  for (var i = 0; i < 2e6; i++) {
    var T2 = base + D;
    var bondsT = Math.max(Bv, b * T2);
    var fund = F + D - (bondsT - Bv);
    if ((v + w * fund) / T2 <= cap + 1e-12) return D;
    D += step;
  }
  return Infinity;
}
[
  [37.34, 0.0224, 103.05, 0, 158.4, 0.1, 0],
  [37.34, 0.0224, 103.05, 0, 158.4, 0.1, 0.1],
  [37.34, 0.0224, 103.05, 0, 158.4, 0.05, 0.3],
  [18.01, 0.0714, 103.05, 0, 158.4, 0.1, 0.2],
  [37.34, 0.0224, 103.05, 60, 218.4, 0.1, 0.1],
  [37.34, 0.0224, 103.05, 120, 278.4, 0.1, 0.2]
].forEach(function (c) {
  var f = P.needFor.apply(null, c), s = simulate.apply(null, c);
  close(f, s, 0.02, 'needFor ' + JSON.stringify(c));
});

// 7. Межа нижча за частку акції в самому ринку: фондами не досягти
assert.strictEqual(P.needFor(10, 0.0714, 100, 0, 110, 0.05, 0), Infinity);

// 8. Налаштування в посиланні
assert.strictEqual(P.toHash({ amount: 50.5, cap: 0.1, bonds: 0.2 }), 'p-5050-10-20');
assert.deepStrictEqual(P.fromHash('#p-5050-10-20'), { amount: 50.5, cap: 0.1, bonds: 0.2 });
assert.strictEqual(P.fromHash('#p-5050-11-20'), null);
assert.strictEqual(P.fromHash('#evil'), null);

// 9. Пояснення
m = P.model({ nav: nav, cash: cash, amount: 50, cap: 0.1, bonds: 0.1, holdings: holdings });
var n = P.notes(m).join(' ');
assert.ok(/Tesla і Apple вище межі 10%/.test(n), n);
assert.ok(/Облігацій зараз немає, після покупки буде 10\.0%/.test(n), n);
assert.ok(/VOO і SGOV: комісія до 1% суми; ірландські VUAA і IB01/.test(n), n);
assert.ok(/SGOV щомісяця виплачує відсотки/.test(n), n);
assert.ok(!/\u2014/.test(n), 'довге тире');
n = P.notes(P.model({ nav: nav, cash: 0, amount: 500, cap: 0.1, bonds: 0, holdings: holdings })).join(' ');
assert.ok(/VUAA: комісія близько \$1\.70, це 0\.3% суми/.test(n), n);

console.log('plan-core: усі перевірки пройшли');
