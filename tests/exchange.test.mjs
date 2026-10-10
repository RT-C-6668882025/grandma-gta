import test from 'node:test';import assert from 'node:assert/strict';
import {E,C,Town,L} from './economy-modules.mjs';
const init=()=>{const e=E.createEconomy();E.setCoinMode(e,true);return e;};
const invariant=e=>{assert.equal(E.totalMoney(e),15000+e.issued);assert.equal(C.totalCoins(e.crypto),e.crypto.supply);assert.equal(C.validCrypto(e),true);};
test('two-way conversion uses one quote and a funded pool without issuing assets',()=>{
  const e=init();assert.equal(Town.exchangeRate(e),10);assert.equal(Town.exchange(e,'player','buy',1),false);
  assert.equal(Town.exchange(e,'player','sell',20),true);assert.equal(e.player,1200);assert.equal(e.bank,1800);assert.equal(e.crypto.holders.bank,20);
  assert.equal(Town.exchange(e,'player','buy',20),true);assert.equal(e.player,1000);assert.equal(e.crypto.holders.player,2000);assert.equal(e.exchanges.length,2);invariant(e);
});
test('bad or unfunded exchange requests have no partial leg or ledger write',()=>{
  const e=init();for(const [owner,side,qty] of [['player','sell',201],['player','sell',2001],['player','buy',1],['bank','sell',1],['bogus','buy',1],['player','sell',-1],['player','sell',.5],['player','buy',Infinity]]){const before=JSON.stringify(e);assert.equal(Town.exchange(e,owner,side,qty),false);assert.equal(JSON.stringify(e),before);}invariant(e);
});
test('commodity, wage and delivery quotes follow actual market price',()=>{
  const e=init();C.placeOrder(e,'player','sell',2,7);C.placeOrder(e,'h:1','buy',2,7);assert.equal(Town.exchangeRate(e),7);
  assert.equal(Town.coinPrice(e,'bread'),Math.ceil(Town.fiatPrice(e,'bread')/7));assert.equal(Town.toCoins(e,28),4);assert.equal(Town.toCoins(e,40),6);
  Town.exchange(e,'player','sell',1);assert.equal(e.exchanges[0].nt,7);invariant(e);
});
test('resident trading remains active in industry mode and reprices the same exchange pool',()=>{
  const e=init();L.transfer(e,'bank','h:3',100,'fixture');Town.coinTransfer(e,'player','h:4',12,'fixture');
  E.economyRound(e);assert.ok(e.crypto.volume>0);assert.notEqual(Town.exchangeRate(e),10);
  const rate=Town.exchangeRate(e);Town.exchange(e,'player','sell',1);assert.equal(e.exchanges[0].nt,rate);assert.equal(E.price(e,'bread'),Math.ceil(Town.fiatPrice(e,'bread')/rate));invariant(e);
});
test('mixed industry wages pay matching wallets and both ledgers survive reload',()=>{
  const e=init();Town.investIndustry(e,'market',200,'beta');Town.investIndustry(e,'shop',200,'ntd');e.industries.shop.currency='ntd';
  E.economyRound(e);assert.ok(e.industries.market.wages>0);assert.ok(e.industries.shop.wagesNT>0);assert.ok(e.industries.shop.revenueNT>0);invariant(e);
  const loaded=E.restoreEconomy(JSON.parse(JSON.stringify(e)));assert.equal(loaded.coinMode,true);assert.equal(loaded.industries.shop.currency,'ntd');assert.equal(loaded.industries.shop.cash,e.industries.shop.cash);invariant(loaded);
});
test('payment shortages automatically exchange available funds at the common rate',()=>{
  const e=init();L.transfer(e,'player','bank',1000,'fixture');e.industries.shop.currency='ntd';const p=E.price(e,'bread');
  assert.equal(Town.canPay(e,'player','ntd',p),true);assert.equal(E.buyGood(e,'bread',p),true);assert.equal(e.industries.shop.cash,p);assert.equal(e.exchanges[0].side,'sell');invariant(e);
  const a=init();Town.exchange(a,'player','sell',20);Town.coinTransfer(a,'player','i:market',a.crypto.holders.player,'fixture');const coins=E.price(a,'bread');assert.equal(Town.canPay(a,'player','beta',coins),true);assert.equal(E.buyGood(a,'bread',coins),true);assert.equal(a.exchanges[0].side,'buy');invariant(a);
});
test('delivery converts once and insufficient pool liquidity leaves cargo untouched',()=>{
  const e=init();E.pickupCargo(e);Town.investIndustry(e,'shop',20);e.industries.shop.currency='ntd';const cashBefore=e.player;assert.equal(E.deliverCargo(e),true);assert.equal(e.player,cashBefore+40);assert.equal(e.industries.market.cash,150);assert.equal(e.cargo,0);invariant(e);
  const a=init();E.pickupCargo(a);Town.investIndustry(a,'shop',20);a.industries.shop.currency='ntd';L.transfer(a,'bank','player',a.bank,'fixture');const before=JSON.stringify(a);assert.equal(E.deliverCargo(a),false);assert.equal(JSON.stringify(a),before);invariant(a);
});
test('long mixed currency runs with exchange and population changes conserve assets',()=>{
  const e=init();Town.exchange(e,'player','sell',100);for(const d of Town.INDUSTRIES){Town.investIndustry(e,d.id,100,'beta');Town.investIndustry(e,d.id,200,'ntd');}
  for(let n=0;n<300;n++){for(const d of Town.INDUSTRIES)e.industries[d.id].currency=(n+d.id.length)%2?'ntd':'beta';E.economyRound(e);invariant(e);}
  assert.ok(e.coinLedger.length<=120);assert.ok(e.ledger.length<=120);invariant(E.restoreEconomy(JSON.parse(JSON.stringify(e))));
});
