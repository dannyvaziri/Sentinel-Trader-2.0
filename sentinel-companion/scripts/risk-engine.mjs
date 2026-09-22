export const policy = Object.freeze({ version:1, allowedSymbols:['SPY','VOO','VTI','QQQ','BND'], maxPositionPct:0.08, maxOrderUSD:10, maxDailyLossPct:0.02, maxTrades:4, maxSpreadPct:0.005, maxPriceDeviationPct:0.01, quoteMaxAgeMs:60000, maxDayBuyUSD:20 });
export const strategies = ['Core ETF accumulation','Target allocation review','Trend watch','Capital preservation'];
export function marketTime(now=Date.now()) { const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now); const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,regular:!['Sat','Sun'].includes(p.weekday) && (+p.hour*60 + +p.minute)>=570 && (+p.hour*60 + +p.minute)<960}; }
export function riskGate({intent, snapshot, quote, state, now=Date.now(), execution=false}) {
 const checks=[]; const check=(code,ok,detail)=>checks.push({code,passed:!!ok,detail});
 const qty=Number(intent.quantity), limit=Number(intent.limit_price), amount=qty*limit;
 const value=Number(snapshot.portfolio.total_value), cash=Number(snapshot.portfolio.cash), buying=Number(snapshot.portfolio.buying_power?.unleveraged_buying_power);
 const date=marketTime(now).date;
 const today=state.proposals.filter(p=>p.attemptedAt && marketTime(Date.parse(p.attemptedAt)).date===date);
 const open=snapshot.orders.filter(o=>!['filled','cancelled','rejected','failed','voided','partially_filled_rest_cancelled'].includes(o.state));
 const position=snapshot.positions.find(p=>p.symbol===intent.symbol);
 check('complete_broker_coverage',snapshot.complete===true,'All relevant asset positions and order categories must be verified, including advanced orders.');
 check('approved_asset',policy.allowedSymbols.includes(intent.symbol),'Only the configured ETF allowlist is tradable.');
 check('limit_order',intent.type==='limit' && Number.isSafeInteger(qty) && qty>0 && Number.isFinite(limit) && limit>0,'Whole-share, day limit orders only.');
 check('side', ['buy','sell'].includes(intent.side),'Buy or sell existing shares.');
 check('account',snapshot.account.agentic_allowed===true && snapshot.account.state==='active' && snapshot.account.account_number===state.account,'Active selected Agentic account.');
 check('fresh_snapshot',now-snapshot.at<=30000 && now>=snapshot.at,'Broker account data fetched within 30 seconds.');
 check('quote',quote?.state==='active' && quote?.has_traded && +quote.ask_price>0 && +quote.bid_price>0 && +quote.ask_price>=+quote.bid_price && [quote.venue_ask_time,quote.venue_bid_time].every(t=>Number.isFinite(Date.parse(t)) && now-Date.parse(t)<=policy.quoteMaxAgeMs && now>=Date.parse(t)),'Fresh active bid and ask required.');
 check('spread',(+quote?.ask_price - +quote?.bid_price)/+quote?.ask_price<=policy.maxSpreadPct,'Maximum spread 0.5%.');
 check('price',Math.abs(limit - +(intent.side==='buy'?quote?.ask_price:quote?.bid_price))/limit<=policy.maxPriceDeviationPct,'Limit must remain within 1% of current quote.');
 check('order_size',Number.isFinite(amount) && amount>0 && amount<=policy.maxOrderUSD,'Maximum $10 per order.');
 check('cash_only',intent.side==='sell' || amount<=Math.min(cash,buying),'Cash and unleveraged buying power only.');
 check('position_size',intent.side==='sell' || ((Number(position?.quantity||0)*Math.max(limit,+quote?.ask_price))+amount)<=value*policy.maxPositionPct,'Maximum 8% of account value in one asset.');
 check('owned_shares',intent.side!=='sell' || qty<=Number(position?.shares_available_for_sells||0),'No short selling.');
 check('open_orders',open.length===0,'Resolve existing open equity orders before submitting another.');
 check('uncertain_orders',!state.proposals.some(p=>['submitting','unknown'].includes(p.status)),'Uncertain submissions require broker reconciliation.');
 check('daily_trades',today.length<policy.maxTrades,'Maximum four submission attempts per New York trading day.');
 check('daily_buys',intent.side!=='buy' || today.filter(p=>p.intent.side==='buy').reduce((sum,p)=>sum+Number(p.intent.quantity)*Number(p.intent.limit_price),0)+amount<=policy.maxDayBuyUSD,'Maximum $20 in buy attempts per day.');
 check('loss_limit',state.baseline?.date===date && Number.isFinite(value) && state.baseline.value>0 && value>=state.baseline.value*(1-policy.maxDailyLossPct),'2% loss limit relative to first observed account value each day; deposits and withdrawals affect this measure.');
 if(execution) { check('enabled',state.live && state.mode==='approval','Owner must enable approval-mode live trading.');check('kill_switch',!state.kill,'Kill switch must be released.');check('regular_hours',marketTime(now).regular,'Regular US weekday session only; fresh quotes and broker review also required.'); }
 return {allowed:checks.every(c=>c.passed),checks,estimatedNotional:Number.isFinite(amount)?amount:null,policyVersion:policy.version,evaluatedAt:new Date(now).toISOString()};
}
