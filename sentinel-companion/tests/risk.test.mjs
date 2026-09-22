import test from 'node:test';
import assert from 'node:assert/strict';
import { riskGate } from '../scripts/risk-engine.mjs';
import { seal, unseal, passwordHash, passwordValid, mask } from '../scripts/security.mjs';
const now=Date.parse('2026-09-21T15:00:00Z');
function fixture(){return {now,execution:true,intent:{symbol:'BND',side:'buy',quantity:'1',limit_price:'9',type:'limit'},quote:{state:'active',has_traded:true,ask_price:'9',bid_price:'8.99',venue_ask_time:new Date(now).toISOString(),venue_bid_time:new Date(now).toISOString()},snapshot:{at:now,account:{agentic_allowed:true,state:'active',account_number:'test'},portfolio:{total_value:'1000',cash:'1000',buying_power:{unleveraged_buying_power:'1000'}},positions:[],orders:[]},state:{account:'test',proposals:[],live:true,mode:'approval',kill:false,baseline:{date:'2026-09-21',value:1000}}};}
const baseFixture=fixture;
function completeFixture(){const x=baseFixture();x.snapshot.complete=true;return x;}
test('valid synthetic fixture passes the gate',()=>assert.equal(riskGate(completeFixture()).allowed,true));
for(const [name,change] of Object.entries({
 'incomplete order coverage':x=>x.snapshot.complete=false,
 'kill switch':x=>x.state.kill=true,
 'live disabled':x=>x.state.live=false,
 'autonomous disabled':x=>x.state.mode='autonomous',
 'forged account':x=>x.snapshot.account.account_number='other',
 'non-agentic account':x=>x.snapshot.account.agentic_allowed=false,
 'stale snapshot':x=>x.snapshot.at-=31000,
 'stale quote':x=>x.quote.venue_ask_time='2026-09-20T15:00:00Z',
 'future quote':x=>x.quote.venue_ask_time='2027-09-20T15:00:00Z',
 'excess size':x=>x.intent.quantity='2',
 'negative size':x=>x.intent.quantity='-1',
 'fractional limit':x=>x.intent.quantity='0.5',
 'nonfinite price':x=>x.intent.limit_price='Infinity',
 'missing price':x=>delete x.intent.limit_price,
 'price moved':x=>x.intent.limit_price='8',
 'wide spread':x=>x.quote.bid_price='8',
 'missing quote':x=>x.quote=null,
 'wrong asset':x=>x.intent.symbol='NVDA',
 'position concentration':x=>x.snapshot.positions=[{symbol:'BND',quantity:'9'}],
 'cash shortage':x=>x.snapshot.portfolio.cash='1',
 'margin only':x=>x.snapshot.portfolio.buying_power.unleveraged_buying_power='0',
 'short sale':x=>x.intent.side='sell',
 'open order':x=>x.snapshot.orders=[{state:'unconfirmed'}],
 'ambiguous previous submission':x=>x.state.proposals=[{status:'unknown'}],
 'daily loss':x=>x.snapshot.portfolio.total_value='979',
 'missing daily baseline':x=>x.state.baseline=null,
 'daily trade count':x=>x.state.proposals=Array.from({length:4},()=>({attemptedAt:new Date(now).toISOString(),intent:{side:'sell'}})),
 'daily buy cap':x=>x.state.proposals=[{attemptedAt:new Date(now).toISOString(),intent:{side:'buy',quantity:'2',limit_price:'9'}}],
 'weekend':x=>x.now=Date.parse('2026-09-20T15:00:00Z')
}))test(`blocks ${name}`,()=>{const x=completeFixture();change(x);assert.equal(riskGate(x).allowed,false);});
test('client account values cannot override broker values',()=>{const x=fixture();x.intent.accountValue=1e10;x.snapshot.portfolio.cash='0';assert.equal(riskGate(x).allowed,false);});
test('encryption roundtrip and tamper rejection',()=>{const key='a'.repeat(64),secret={token:'test-secret'};const encrypted=seal(secret,key);assert.deepEqual(unseal(encrypted,key),secret);assert.ok(!encrypted.includes(secret.token));const bytes=Buffer.from(encrypted,'base64');bytes[30]^=1;assert.throws(()=>unseal(bytes.toString('base64'),key));});
test('passwords and account redaction',()=>{const hash=passwordHash('synthetic-long-password');assert.ok(passwordValid('synthetic-long-password',hash));assert.ok(!passwordValid('wrong',hash));assert.equal(mask({account_number:'12345678'}).account_number,'••••5678');});
