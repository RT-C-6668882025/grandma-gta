import test from 'node:test';
import assert from 'node:assert/strict';
import {E,C,R,Town} from './economy-modules.mjs';
const invariant=e=>{assert.equal(C.totalCoins(e.crypto),e.crypto.supply);assert.equal(E.totalMoney(e),15000+e.issued);assert.equal(C.validCrypto(e),true);};
test('resident identities survive reload and are never reused after migration',()=>{
  const e=E.createEconomy(),original=e.households.map(h=>h.uid);R.populate(e,12);R.populate(e,24);
  assert.deepEqual(e.households.slice(0,12).map(h=>h.uid),original.slice(0,12));assert.ok(e.households.slice(12).every(h=>!original.includes(h.uid)));
  const loaded=E.restoreEconomy(JSON.parse(JSON.stringify(e)));assert.deepEqual(loaded.households.map(h=>h.uid),e.households.map(h=>h.uid));R.populate(loaded,48);assert.equal(new Set(loaded.households.map(h=>h.uid)).size,48);invariant(loaded);
});
test('coin settlement cancels escrow and funds real wages, stock and purchases',()=>{
  const e=E.createEconomy();C.setCryptoEnabled(e,true);C.placeOrder(e,'player','buy',1,1);E.setCoinMode(e,true);assert.equal(e.cryptoEscrow,0);assert.equal(e.crypto.orders.length,0);
  for(const d of Town.INDUSTRIES)assert.equal(Town.investIndustry(e,d.id,100),true);
  const before=e.crypto.holders.player,stock=e.stock.bread;assert.equal(E.buyGood(e,'bread',E.price(e,'bread')),true);assert.equal(e.crypto.holders.player,before-E.price({...e,stock:{...e.stock,bread:stock}},'bread'));assert.equal(e.stock.bread,stock-1);
  E.economyRound(e);assert.ok(e.metrics.wages>0);assert.ok(e.metrics.production>0);assert.ok(e.industries.shop.revenue>0);assert.ok(e.coinLedger.some(t=>t.to.startsWith('R')));invariant(e);
});
test('unfunded and closed businesses cannot pay or sell; coin delivery conserves',()=>{
  const e=E.createEconomy();E.setCoinMode(e,true);E.economyRound(e);assert.equal(e.metrics.wages,0);
  const stock=e.stock.bread;e.industries.shop.open=false;assert.equal(E.buyGood(e,'bread',1),false);assert.equal(e.stock.bread,stock);e.industries.shop.open=true;
  E.pickupCargo(e);assert.equal(E.deliverCargo(e),false);Town.investIndustry(e,'shop',100);assert.equal(E.deliverCargo(e),true);assert.equal(E.deliverCargo(e),false);invariant(e);
});
test('long town runs and population changes preserve both currencies and issuer rights',()=>{
  let e=E.createEconomy();E.setCoinMode(e,true);for(const d of Town.INDUSTRIES)Town.investIndustry(e,d.id,200);
  for(let i=0;i<300;i++){if(i===80)R.populate(e,48);if(i===160)R.populate(e,12);if(i===200){C.mintCoins(e,'player',100,'reserve');C.mintCoins(e,'player',50);}E.economyRound(e);invariant(e);}
  assert.ok(e.households.some(h=>h.mined>0));const total=C.totalCoins(e.crypto);e=E.restoreEconomy(JSON.parse(JSON.stringify(e)));assert.equal(e.coinMode,true);assert.equal(C.totalCoins(e.crypto),total);assert.ok(e.coinLedger.length<=120);invariant(e);assert.equal(C.mintCoins(e,'h:0',1),false);
});
