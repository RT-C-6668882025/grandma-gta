import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');
export const ledgerURL=url(await read('economy-ledger.js'));
export const townURL=url((await read('town-currency.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)));
export const cryptoURL=url((await read('crypto-market.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./town-currency.js'",JSON.stringify(townURL)));
export const residentsURL=url((await read('residents.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./crypto-market.js'",JSON.stringify(cryptoURL)));
export const agentsURL=url((await read('town-agents.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./town-currency.js'",JSON.stringify(townURL)));
export const A=await import(agentsURL);
export const effectsURL=url((await read('economy-effects.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./town-currency.js'",JSON.stringify(townURL)));
export const FX=await import(effectsURL);
export const worldURL=url((await read('world-economy.js')).replace("'./economy-effects.js'",JSON.stringify(effectsURL)).replace("'./town-agents.js'",JSON.stringify(agentsURL)).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./town-currency.js'",JSON.stringify(townURL)));
export const World=await import(worldURL);
export const economyURL=url((await read('economy.js')).replace("'./world-economy.js'",JSON.stringify(worldURL)).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./crypto-market.js'",JSON.stringify(cryptoURL)).replace("'./residents.js'",JSON.stringify(residentsURL)).replace("'./town-currency.js'",JSON.stringify(townURL)));
export const Town=await import(townURL);
export const R=await import(residentsURL);
export const E=await import(economyURL),C=await import(cryptoURL),L=await import(ledgerURL);

export const D=await import(url((await read('district.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./town-currency.js'",JSON.stringify(townURL))));
