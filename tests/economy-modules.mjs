import {readFile} from 'node:fs/promises';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');
export const ledgerURL=url(await read('economy-ledger.js'));
export const cryptoURL=url((await read('crypto-market.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)));
export const residentsURL=url((await read('residents.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./crypto-market.js'",JSON.stringify(cryptoURL)));
export const economyURL=url((await read('economy.js')).replace("'./economy-ledger.js'",JSON.stringify(ledgerURL)).replace("'./crypto-market.js'",JSON.stringify(cryptoURL)).replace("'./residents.js'",JSON.stringify(residentsURL)));
export const R=await import(residentsURL);
export const E=await import(economyURL),C=await import(cryptoURL),L=await import(ledgerURL);
