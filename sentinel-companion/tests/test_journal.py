import json, os, sqlite3, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from journal import Journal
from dashboard import render

class JournalTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.path=Path(self.temp.name)/'test.sqlite3'; self.j=Journal(self.path)
    def tearDown(self): self.j.db.close(); self.temp.cleanup()
    def proposal(self): return self.j.run('proposal',{'intent':{'symbol':'BND','side':'buy','type':'limit','quantity':'1'},'thesis':'Synthetic test only','committee':[],'sources':[],'risk':{'allowed':True}})
    def test_defaults_persist(self):
        self.assertTrue(self.j.run('status')['kill']); self.j.run('control',{'mode':'approval'}); other=Journal(self.path);self.assertEqual(other.run('status')['mode'],'approval');other.db.close()
    def test_credentials_rejected(self):
        for key in ['password','access_token','refresh_token','api_key','authorization']:
            with self.assertRaises(ValueError): self.j.run('snapshot',{'account':{},'portfolio':{},key:'never-store'})
        self.assertEqual(self.j.run('verify')['events'],0)
    def test_redaction(self):
        self.j.run('snapshot',{'account':{'account_number':'123456789'},'portfolio':{}})
        self.assertEqual(self.j.run('status')['snapshot']['account']['account_number'],'••••6789')
        self.assertNotIn('123456789',json.dumps(self.j.run('export')))
    def test_proposal_cannot_skip_review(self):
        p=self.proposal()
        with self.assertRaises(ValueError): self.j.run('transition',{'id':p['id'],'status':'approved'})
    def test_paused_blocks_approval(self):
        p=self.proposal(); self.j.run('transition',{'id':p['id'],'status':'reviewed','review':{'quote':'synthetic'}})
        with self.assertRaises(ValueError):self.j.run('transition',{'id':p['id'],'status':'approved','approval':{'explicitOwnerConfirmation':True}})
    def test_final_confirmation_required(self):
        self.j.run('control',{'mode':'approval','live':True,'kill':False}); p=self.proposal(); self.j.run('transition',{'id':p['id'],'status':'reviewed','review':{'quote':'synthetic'}})
        with self.assertRaises(ValueError):self.j.run('transition',{'id':p['id'],'status':'approved'})
    def test_immutable_terms(self):
        p=self.proposal()
        with self.assertRaises(ValueError):self.j.run('transition',{'id':p['id'],'status':'reviewed','review':{'quote':'x'},'intent':{'symbol':'EVIL'}})
    def test_unknown_locks_and_preserves_idempotency(self):
        self.j.run('control',{'mode':'approval','live':True,'kill':False});p=self.proposal();self.j.run('transition',{'id':p['id'],'status':'reviewed','review':{'quote':'synthetic'}})
        self.j.run('transition',{'id':p['id'],'status':'approved','approval':{'explicitOwnerConfirmation':True}})
        attempt=self.j.run('transition',{'id':p['id'],'status':'submitting'});self.assertTrue(attempt['ref_id'])
        self.j.run('transition',{'id':p['id'],'status':'unknown'});s=self.j.run('status');self.assertTrue(s['kill']);self.assertFalse(s['live']);self.assertEqual(s['proposals'][0]['ref_id'],attempt['ref_id'])
        with self.assertRaises(ValueError):self.j.run('transition',{'id':p['id'],'status':'submitting'})
    def test_corruption_blocks_reads_and_writes(self):
        self.j.run('control',{'kill':True});self.j.db.execute("UPDATE events SET payload='{}'");self.j.db.commit()
        with self.assertRaises(ValueError):self.j.run('status')
        with self.assertRaises(ValueError):self.j.run('control',{'kill':False})
    def test_modes_and_bots(self):
        with self.assertRaises(ValueError):self.j.run('control',{'mode':'autonomous'})
        bot=self.j.run('bot',{'name':'Watch','strategy':'Trend watch','symbols':['SPY']});self.assertFalse(bot['active'])
    def test_snapshot_html_escapes_untrusted_text(self):
        self.j.run('snapshot',{'account':{'nickname':'<script>alert(1)</script>'},'portfolio':{}})
        page=render(self.j.run('status'));self.assertIn('&lt;script&gt;',page);self.assertNotIn('<script>',page);self.assertIn('does not poll Robinhood',page)
    def test_owner_only_database(self):self.assertEqual(os.stat(self.path).st_mode&0o777,0o600)
    def test_research_roundtrip_and_dashboard(self):
        entry={'title':'Account review','committee':[{'role':r,'analysis':'Test evidence'} for r in ['Analyst','Skeptic','Risk','Chair']],'conclusion':'Research only'}
        self.j.run('research',entry);state=self.j.run('status');self.assertEqual(len(state['research']),1);self.assertIn('Account review',render(state));self.assertTrue(state['kill'])
    def test_submission_confirmation_and_duplicate_block(self):
        self.j.run('control',{'mode':'approval','live':True,'kill':False});p=self.proposal();self.j.run('transition',{'id':p['id'],'status':'reviewed','review':{'quote':'synthetic'}})
        self.j.run('transition',{'id':p['id'],'status':'approved','approval':{'explicitOwnerConfirmation':True}})
        attempt=self.j.run('transition',{'id':p['id'],'status':'submitting'})
        with self.assertRaises(ValueError):self.j.run('transition',{'id':p['id'],'status':'submitted','broker':{'id':'synthetic'},'ref_id':'changed'})
        self.j.run('transition',{'id':p['id'],'status':'submitted','broker':{'id':'synthetic','state':'confirmed'}})
        with self.assertRaises(ValueError):self.j.run('transition',{'id':p['id'],'status':'submitting'})
        self.j.run('transition',{'id':p['id'],'status':'filled','broker':{'id':'synthetic','state':'filled'}})
        state=self.j.run('status');self.assertEqual(state['proposals'][0]['status'],'filled');self.assertEqual(state['proposals'][0]['ref_id'],attempt['ref_id']);self.assertTrue(self.j.run('verify')['ok'])

if __name__=='__main__':unittest.main()
