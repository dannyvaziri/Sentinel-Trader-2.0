#!/usr/bin/env python3
"""Private Sentinel companion journal; no network, secrets or order execution."""
import argparse, datetime, hashlib, json, os, sqlite3, sys, uuid
from pathlib import Path

def stamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def default_path():
    config=Path.home()/'.codex/sentinel-trader.json'
    if config.exists(): return json.loads(config.read_text())['journalPath']
    return str(Path.home()/'Library/Application Support/Sentinel Trader/companion.sqlite3')
def canonical(x): return json.dumps(x, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
def clean(x):
    if isinstance(x, list): return [clean(v) for v in x]
    if isinstance(x, dict):
        out = {}
        for k,v in x.items():
            if any(word in k.lower() for word in ('password','access_token','refresh_token','authorization','client_secret','api_key','cookie')): raise ValueError('credentials_must_not_be_stored')
            out[k] = ('••••' + str(v)[-4:]) if k.endswith('account_number') else clean(v)
        return out
    return x

class Journal:
    def __init__(self, path):
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(str(self.path), timeout=10)
        os.chmod(self.path, 0o600)
        self.db.execute('PRAGMA journal_mode=DELETE')
        self.db.execute('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL)')
        self.db.commit()

    def events(self):
        previous=''; result=[]
        for seq,payload,old,hash_ in self.db.execute('SELECT id,payload,previous_hash,hash FROM events ORDER BY id'):
            if old != previous or hashlib.sha256((previous+payload).encode()).hexdigest() != hash_: raise ValueError('journal_integrity_failed')
            result.append(dict(json.loads(payload), sequence=seq, hash=hash_, previous_hash=old)); previous=hash_
        return result

    def state(self, events):
        s={'mode':'research','kill':True,'live':False,'snapshot':None,'bots':[],'proposals':[],'research':[],'activityCount':len(events)}
        for e in events:
            d=e['data']; kind=e['kind']
            if kind=='snapshot': s['snapshot']=dict(d,observedAt=e['time'])
            if kind=='control': s.update(d)
            if kind=='bot': s['bots'].append(d)
            if kind=='proposal': s['proposals'].append(d)
            if kind=='research': s['research'].append(d)
            if kind=='transition':
                p=next(p for p in s['proposals'] if p['id']==d['id']); p.update(d)
        return s

    def run(self, command, data=None):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            events=self.events(); state=self.state(events)
            if command=='verify': result={'ok':True,'events':len(events),'head':events[-1]['hash'] if events else None}
            elif command=='status': result=state
            elif command=='audit': result=events
            elif command=='export': result={'schemaVersion':1,'state':state,'events':events,'exportedAt':stamp()}
            else:
                d=clean(data or {})
                if command=='snapshot':
                    if not isinstance(d.get('portfolio'),dict) or not isinstance(d.get('account'),dict): raise ValueError('account_and_portfolio_required')
                    d['source']='official_robinhood_tools'
                elif command=='control':
                    if any(k not in ['kill','mode','live'] for k in d): raise ValueError('unsupported_control')
                    if 'mode' in d and d['mode'] not in ['research','approval']: raise ValueError('autonomous_unavailable')
                    if any(k in d and type(d[k]) is not bool for k in ['kill','live']): raise ValueError('boolean_required')
                    if d.get('live') and d.get('mode',state['mode'])!='approval': raise ValueError('approval_mode_required')
                    if d.get('mode')=='research': d['live']=False
                elif command=='bot':
                    if d.get('strategy') not in ['Core ETF accumulation','Target allocation review','Trend watch','Capital preservation']: raise ValueError('unknown_strategy')
                    if not str(d.get('name','')).strip(): raise ValueError('name_required')
                    d.update(id=str(uuid.uuid4()),mode='research',active=False,createdAt=stamp())
                elif command=='research':
                    if not d.get('title') or not isinstance(d.get('committee'),list) or len(d['committee'])!=4: raise ValueError('four_perspective_research_required')
                    d.update(id=str(uuid.uuid4()),createdAt=stamp(),mode='research',generatedBy='one_model_four_perspectives')
                elif command=='proposal':
                    for field in ['intent','thesis','committee','sources','risk']:
                        if field not in d: raise ValueError('proposal_missing_'+field)
                    intent=d['intent']
                    if not isinstance(intent,dict) or not all(k in intent for k in ['symbol','side','type']): raise ValueError('exact_order_required')
                    if ('quantity' in intent)==('dollar_amount' in intent): raise ValueError('exactly_one_size_required')
                    d.update(id=str(uuid.uuid4()),createdAt=stamp(),status='draft' if d['risk'].get('allowed') else 'blocked')
                elif command=='transition':
                    p=next((p for p in state['proposals'] if p['id']==d.get('id')),None)
                    if not p: raise ValueError('unknown_proposal')
                    target=d.get('status'); valid={'draft':['reviewed','rejected'],'reviewed':['reviewed','approved','rejected'],'approved':['submitting','reviewed','rejected'],'submitting':['submitted','unknown','rejected'],'unknown':['submitted','rejected'],'submitted':['filled','cancelled','rejected']}
                    if target not in valid.get(p['status'],[]): raise ValueError('invalid_transition')
                    allowed={'id','status','review','approval','broker','reason'}
                    if set(d)-allowed: raise ValueError('immutable_proposal_terms')
                    if target=='reviewed':
                        if not d.get('review'): raise ValueError('broker_review_required')
                        d['reviewedAt']=stamp()
                    if target=='approved':
                        if state['kill'] or not state['live'] or state['mode']!='approval': raise ValueError('workflow_paused')
                        age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(p['reviewedAt'])).total_seconds()
                        if age>60 or age<0: raise ValueError('review_expired')
                        if not d.get('approval',{}).get('explicitOwnerConfirmation'): raise ValueError('final_confirmation_required')
                        d['approvedAt']=stamp()
                    if target=='submitting':
                        age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(p['approvedAt'])).total_seconds()
                        if state['kill'] or not state['live'] or state['mode']!='approval' or age>60 or age<0: raise ValueError('approval_expired_or_paused')
                        if any(q['status'] in ['submitting','unknown'] for q in state['proposals']): raise ValueError('unresolved_submission')
                        d['ref_id']=str(uuid.uuid4()); d['attemptedAt']=stamp()
                    if target=='submitted' and not d.get('broker',{}).get('id'): raise ValueError('broker_order_id_required')
                    if target=='unknown': d['reason']=d.get('reason','broker_outcome_unconfirmed')
                else: raise ValueError('unknown_command')
                event={'time':stamp(),'kind':command,'data':d}; payload=canonical(event); previous=events[-1]['hash'] if events else ''; hash_=hashlib.sha256((previous+payload).encode()).hexdigest()
                self.db.execute('INSERT INTO events(payload,previous_hash,hash) VALUES(?,?,?)',(payload,previous,hash_))
                if command=='transition' and d['status']=='unknown':
                    lock={'time':stamp(),'kind':'control','data':{'kill':True,'live':False}}; encoded=canonical(lock); self.db.execute('INSERT INTO events(payload,previous_hash,hash) VALUES(?,?,?)',(encoded,hash_,hashlib.sha256((hash_+encoded).encode()).hexdigest()))
                result=d
            self.db.commit(); return result
        except Exception:
            self.db.rollback(); raise

def main():
    parser=argparse.ArgumentParser(description=__doc__,epilog='Mutations take JSON on stdin. snapshot: {account,portfolio,positions,orders}; bot: {name,strategy,symbols}; proposal: {intent,thesis,committee,sources,risk}; transition: {id,status,review|approval|broker}; control: {kill,mode,live}.')
    parser.add_argument('--db',default=default_path())
    parser.add_argument('command',choices=['status','snapshot','bot','research','proposal','transition','control','audit','verify','export'])
    a=parser.parse_args(); data=None
    if a.command not in ['status','audit','verify','export']:
        raw=sys.stdin.read(1048577)
        if len(raw)>1048576: raise ValueError('input_too_large')
        data=json.loads(raw)
    print(json.dumps(Journal(a.db).run(a.command,data),ensure_ascii=False,indent=2))

if __name__=='__main__':
    try: main()
    except Exception as e: print(json.dumps({'error':str(e)}),file=sys.stderr);sys.exit(1)
