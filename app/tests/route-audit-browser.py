"""Driver route, intermediate passenger search, request, two-way chat and completion. Local fixtures only."""
import importlib.util,json,uuid,unittest
from pathlib import Path
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class RouteAudit(h.AutoRoutePreview):
 def test_full_current_flow(self):
  self.open_preview(with_meeting=True);self.approval.check();self.publish.click()
  expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
  ride=self.ctx.request.get(self.base+'/api/my-rides').json()['rides'][0];driver=self.page
  passenger=self.browser.new_context(viewport={'width':390,'height':844})
  try:
   r=passenger.request.post(self.base+'/api/auth/register',headers={'Origin':self.base},data={'name':'Audit Passenger','email':uuid.uuid4().hex+'@example.test','password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True});self.assertTrue(r.ok,r.text())
   def point(fraction,name):
    lng,lat=self.point_at(fraction);return {'id':name,'name':name,'lat':lat,'lng':lng,'city':'Sarajevo'}
   q={'fromLocation':json.dumps(point(.25,'Ulaz četvrtina trase')),'toLocation':json.dumps(point(.75,'Izlaz tri četvrtine trase')),'time':ride['time'],'walkMinutes':'10'}
   r=passenger.request.post(self.base+'/api/saved-searches',headers={'Origin':self.base},data={'query':q});self.assertTrue(r.ok,r.text())
   p=passenger.new_page();p.set_default_timeout(12000);h.install_vector_map(p);p.on('pageerror',lambda e:self.errors.append(str(e)))
   p.goto(self.base+'/#home');p.locator('.saved-search-load').click()
   p.get_by_role('button',name=h.re.compile('^Datum polaska:')).click();p.locator('[data-date="'+ride['date']+'"]').click()
   with p.expect_response(lambda r:r.url.endswith('/api/rides/search')) as search:p.get_by_role('button',name='Pronađi vožnju',exact=True).click()
   self.assertTrue(search.value.ok,search.value.text());self.assertIn(ride['id'],[r['id'] for r in search.value.json()['rides']])
   p.get_by_role('button',name='Pogledaj vožnju',exact=True).first.click();expect(p.locator('.passenger-meeting-picker .route-meeting-handle')).to_be_visible()
   p.get_by_role('button',name='Pošalji mjesto susreta vozaču',exact=True).click();expect(p.get_by_role('heading',name='Zahtjev je poslan.',exact=True)).to_be_visible()
   p.get_by_role('textbox',name='Kratka poruka',exact=True).fill('Čekam kod označenog ulaza.');p.get_by_role('button',name='Pošalji poruku',exact=True).click()
   driver.reload();expect(driver.locator('.booking-messages')).to_contain_text('Čekam kod označenog ulaza.')
   driver.get_by_role('textbox',name='Kratka poruka',exact=True).fill('U redu, vidimo se na pinu.');driver.get_by_role('button',name='Pošalji poruku',exact=True).click()
   expect(p.locator('.booking-messages')).to_contain_text('U redu, vidimo se na pinu.',timeout=16000)
   driver.get_by_role('button',name='Prihvati',exact=True).click();p.reload();expect(p.get_by_role('heading',name='Dogovoreno.',exact=True)).to_be_visible()
   accepted=p.get_by_role('dialog',name='Vaš zahtjev je prihvaćen',exact=True);expect(accepted).to_be_visible();accepted.get_by_role('button',name='Zatvori',exact=True).click()
   p.get_by_role('button',name='Na mjestu sam',exact=True).click();expect(p.locator('.arrival-priority')).to_contain_text('Vozač zna da si tu.')
   driver.reload();driver.get_by_role('button',name='Završi vožnju',exact=True).click();p.reload();expect(p.get_by_role('heading',name='Lijep put. Hvala!',exact=True)).to_be_visible()
   b=passenger.request.get(self.base+'/api/my-rides').json()['bookings'][0];self.assertEqual(b['status'],'completed')
   closed=passenger.request.post(self.base+'/api/bookings/'+b['id']+'/messages',headers={'Origin':self.base},data={'text':'Nakon završetka'});self.assertEqual(closed.status,409)
   p.screenshot(path='/tmp/usput-route-audit-completed.png',full_page=True)
  finally:passenger.close()
if __name__=='__main__':unittest.main(defaultTest='RouteAudit.test_full_current_flow',verbosity=2)
