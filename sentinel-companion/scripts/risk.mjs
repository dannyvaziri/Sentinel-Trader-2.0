import { riskGate } from './risk-engine.mjs';
let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>1048576)throw Error('input_too_large');}
try{const input=JSON.parse(raw);const report=riskGate(input);process.stdout.write(JSON.stringify({...report,enforcement:'advisory_companion_only'},null,2)+'\n');}catch{process.stdout.write(JSON.stringify({allowed:false,error:'invalid_or_incomplete_risk_input',enforcement:'advisory_companion_only'})+'\n');process.exitCode=1;}
