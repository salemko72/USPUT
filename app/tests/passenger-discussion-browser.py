"""Two real local accounts: direct map selection, optional exit, chat and revision confirmation."""
import importlib.util,json,uuid
from pathlib import Path
from urllib.parse import urlencode
import unittest
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class Discussion(h.AutoRoutePreview):
 def test_map_chat_and_counterproposal(self):
  self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
  expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
  ride=self.ctx.request.get(self.base+'/api/my-rides').json()['rides'][0]
  driver=self.page
  passenger=self.browser.new_context(viewport={'width':390,'height':844})
  try:
   r=passenger.request.post(self.base+'/api/auth/register',headers={'Origin':self.base},data={'name':'Passenger','email':uuid.uuid4().hex+'@example.test','password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True});self.assertTrue(r.ok,r.text())
   p=passenger.new_page();p.set_default_timeout(10000);h.install_vector_map(p)
   q={'from':ride['from']['id'],'to':ride['to']['id'],'fromLocation':json.dumps(ride['from']),'toLocation':json.dumps(ride['to']),'date':ride['date'],'time':ride['time'],'walkMinutes':'10','meetingProposal':'1'}
   p.goto(self.base+'/#ride/'+ride['id']+'?'+urlencode(q))
   expect(p.locator('.passenger-meeting-picker .route-meeting-handle')).to_be_visible()
   expect(p.get_by_role('combobox')).to_have_count(0)
   optional=p.get_by_text('Dodaj mjesto izlaska (opcionalno)',exact=True)
   expect(optional).to_be_visible();self.assertFalse(optional.evaluate('el=>el.parentElement.open'))
   marker=p.locator('.passenger-meeting-picker .route-meeting-handle')
   marker.hover();box=marker.bounding_box();x=box['x']+16;y=box['y']+16
   with p.expect_response(lambda r:'/api/rides/'+ride['id']+'?' in r.url and 'pickupLocation=' in r.url) as moved:
    p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+20,y,steps=8);p.mouse.up()
   self.assertTrue(moved.value.ok,moved.value.text());self.assertIsNotNone(moved.value.json()['ride']['match'])
   p.get_by_role('button',name='Pošalji zahtjev',exact=True).click()
   expect(p.get_by_role('heading',name='Zahtjev je poslan.',exact=True)).to_be_visible()
   p.get_by_role('textbox',name='Kratka poruka',exact=True).fill('Mogu sići do tramvajske. <b>Ovdje</b>')
   p.get_by_role('button',name='Pošalji poruku',exact=True).click()
   expect(p.locator('.booking-messages')).to_contain_text('<b>Ovdje</b>')
   expect(p.locator('.booking-messages b')).to_have_count(0)
   driver.reload();expect(driver.locator('.booking-messages')).to_contain_text('Mogu sići')
   self.assertEqual(driver.locator('.booking-messages p').first.evaluate('e=>getComputedStyle(e).color'),'rgb(21, 24, 21)')
   driver.screenshot(path='/tmp/usput-discussion-driver.png',full_page=True)
   driver.get_by_role('button',name='Predloži drugi ulazak na mapi',exact=True).click()
   expect(driver.locator('.booking-discussion .route-meeting-handle')).to_be_visible()
   driver.get_by_role('button',name='Pošalji prijedlog mjesta',exact=True).click()
   expect(driver.get_by_text('Čekamo potvrdu druge osobe za ovaj pin.',exact=True)).to_be_visible()
   p.reload();p.get_by_role('button',name='Potvrdi predloženi susret',exact=True).click()
   expect(p.get_by_role('heading',name='Dogovoreno.',exact=True)).to_be_visible()
   mine=passenger.request.get(self.base+'/api/my-rides').json()['bookings'][0]
   self.assertEqual(mine['status'],'accepted');self.assertEqual(mine['proposal']['version'],2)
  finally:passenger.close()
if __name__=='__main__':unittest.main(defaultTest='Discussion.test_map_chat_and_counterproposal',verbosity=2)
