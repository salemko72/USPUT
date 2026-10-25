"""Real local offers: grouping, explicit extra offers, walking reasons, request consistency."""
import importlib.util,json,sqlite3,uuid,unittest
from pathlib import Path
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class FlexibleMatching(h.AutoRoutePreview):
 def offer_and_passenger(self,walk_offset=0):
  self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
  expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
  ride=self.ctx.request.get(self.base+'/api/my-rides').json()['rides'][0]
  passenger=self.browser.new_context(viewport={'width':390,'height':844})
  r=passenger.request.post(self.base+'/api/auth/register',headers={'Origin':self.base},data={'name':'Flexible Passenger','email':uuid.uuid4().hex+'@example.test','password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True});self.assertTrue(r.ok,r.text())
  def point(f,name,dy=0):
   lng,lat=self.point_at(f);return {'name':name,'lat':round(lat+dy/111195,5),'lng':round(lng,5),'city':'Sarajevo'}
  query={'fromLocation':json.dumps(point(.25,'Početak putnika',walk_offset)),'toLocation':json.dumps(point(.75,'Kraj putnika')),'time':ride['time'],'walkMinutes':'10','date':ride['date'],'meetingProposal':'1'}
  r=passenger.request.post(self.base+'/api/saved-searches',headers={'Origin':self.base},data={'query':query});self.assertTrue(r.ok,r.text())
  p=passenger.new_page();p.set_default_timeout(15000);h.install_vector_map(p);p.on('pageerror',lambda e:self.errors.append(str(e)))
  return ride,passenger,p,query
 def search(self,p,ride):
  p.goto(self.base+'/#home');p.locator('.saved-search-load').click()
  p.get_by_role('button',name=h.re.compile('^Datum polaska:')).click();p.locator('[data-date="'+ride['date']+'"]').click()
  p.get_by_role('button',name='Pronađi vožnju',exact=True).click()
 def test_groups_and_explicit_extra_offers(self):
  ride,passenger,p,q=self.offer_and_passenger()
  try:
   with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:
    db.row_factory=sqlite3.Row;row=dict(db.execute('SELECT * FROM rides WHERE id=?',(ride['id'],)).fetchone())
    for minutes,label in [(20,'maybe'),(40,'more')]:
     clone={**row,'id':'audit-'+label+'-'+uuid.uuid4().hex,'departure':row['departure']+minutes*60000,'time':'07:50' if minutes==20 else '08:10'}
     db.execute('INSERT INTO rides('+','.join(clone)+') VALUES('+','.join('?' for _ in clone)+')',list(clone.values()))
   self.search(p,ride)
   expect(p.get_by_role('region',name='Odgovara',exact=True)).to_be_visible()
   expect(p.get_by_role('region',name='Možda ti odgovara',exact=True)).to_be_visible()
   expect(p.locator('.match-results-group.more')).to_have_count(0)
   more=p.get_by_role('button',name=h.re.compile('^Prikaži još ponuda'));expect(more).to_have_attribute('aria-expanded','false');more.click()
   expect(p.locator('.match-results-group.more .ride-card')).to_have_count(1)
   expect(p.locator('.match-results-group.more')).to_contain_text('kasnije od traženog vremena')
   p.screenshot(path='/tmp/usput-flex-groups.png',full_page=True)
   p.get_by_role('button',name=h.re.compile('^Sakrij dodatne ponude')).click();expect(p.locator('.match-results-group.more')).to_have_count(0)
  finally:passenger.close()
 def test_extra_walking_reason_and_request_remain_consistent(self):
  ride,passenger,p,q=self.offer_and_passenger(850)
  try:
   self.search(p,ride)
   group=p.get_by_role('region',name='Možda ti odgovara',exact=True);expect(group).to_be_visible()
   expect(group).to_contain_text('odabrano 10 min')
   group.get_by_role('button',name='Pogledaj vožnju',exact=True).first.click()
   expect(p.locator('.passenger-meeting-picker')).to_be_visible()
   p.get_by_role('button',name='Pošalji mjesto susreta vozaču',exact=True).click()
   expect(p.get_by_role('heading',name='Zahtjev je poslan.',exact=True)).to_be_visible()
   b=passenger.request.get(self.base+'/api/my-rides').json()['bookings'][0]
   self.assertEqual(b['match']['walkingLimit'],10);self.assertGreater(b['match']['walkToMinutes'],10);self.assertLessEqual(b['match']['walkToMinutes'],15)
  finally:passenger.close()
if __name__=='__main__':unittest.main(defaultTest=['FlexibleMatching.test_groups_and_explicit_extra_offers','FlexibleMatching.test_extra_walking_reason_and_request_remain_consistent'],verbosity=2)
