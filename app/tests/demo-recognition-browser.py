"""Generated portraits must appear in the confirmed recognition card, not just headers."""
import importlib.util,sqlite3,subprocess
from pathlib import Path
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import unittest
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class DemoRecognition(h.AutoRoutePreview):
 def test_generated_portrait_for_every_seeded_driver(self):
  today=datetime.now(ZoneInfo('Europe/Sarajevo')).date();day=(today+timedelta(days=1)).isoformat()
  sql=Path(self.data.name)/'demo.sql'
  keys=['kerim','senad','vesna','amar','lejla','damir']
  subprocess.run(['node','scripts/seed-demo-drivers.mjs',str(sql),today.isoformat(),','.join(keys)],cwd=h.APP,check=True,capture_output=True)
  with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.executescript(sql.read_text())
  for key in keys:
   with self.subTest(driver=key):
    ride_id='usput-demo-'+key+'-'+day
    response=self.ctx.request.get(self.base+'/api/rides/'+ride_id);self.assertTrue(response.ok,response.text());ride=response.json()['ride']
    import json
    query={'from':ride['from']['id'],'to':ride['to']['id'],'fromLocation':json.dumps(ride['from']),'toLocation':json.dumps(ride['to']),'date':day,'time':'07:30','walkMinutes':'15','meetingProposal':'1'}
    response=self.ctx.request.post(self.base+'/api/rides/'+ride_id+'/request',headers={'Origin':self.base},data={'search':query});self.assertTrue(response.ok,response.text());booking=response.json()['booking']
    response=self.ctx.request.post(self.base+'/api/bookings/'+booking['id']+'/simulate-accept',headers={'Origin':self.base},data={'expectedVersion':1});self.assertTrue(response.ok,response.text())
    self.page.goto(self.base+'/#ride/'+ride_id)
    card=self.page.locator('.connection-photos')
    expect(card.get_by_role('img',name='AI ilustracija izmišljene osobe',exact=True)).to_be_visible()
    expect(card).not_to_contain_text('Profilna fotografija još nije dodana.')
    self.assertIn('/demo/people-cars.png',card.locator('.demo-generated-image').evaluate('e=>getComputedStyle(e).backgroundImage'))
    popup=self.page.get_by_role('dialog',name='Vaš zahtjev je prihvaćen',exact=True)
    expect(popup).to_be_visible()
    popup.get_by_role('button',name='Zatvori',exact=True).click()
    self.page.get_by_role('button',name='Na mjestu sam',exact=True).click()
    expect(self.page.get_by_role('heading',name='Vozač zna da si tu.',exact=True)).to_be_visible()
    expect(card.get_by_role('img',name='AI ilustracija izmišljene osobe',exact=True)).to_be_visible()
  self.page.screenshot(path='/tmp/usput-demo-recognition.png',full_page=True)
 def test_empty_search_sends_the_chosen_pin_from_the_map(self):
  today=datetime.now(ZoneInfo('Europe/Sarajevo')).date();day=(today+timedelta(days=2)).isoformat()
  sql=Path(self.data.name)/'demo-map.sql'
  subprocess.run(['node','scripts/seed-demo-drivers.mjs',str(sql),today.isoformat(),'vesna'],cwd=h.APP,check=True,capture_output=True)
  with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.executescript(sql.read_text())
  ride_id='usput-demo-vesna-'+day
  self.page.goto(self.base+'/#ride/'+ride_id+'?from=&to=&date='+day+'&time=07%3A30')
  picker=self.page.locator('.passenger-meeting-picker')
  send=picker.get_by_role('button',name='Pošalji mjesto susreta vozaču',exact=True)
  expect(send).to_be_enabled()
  expect(self.page.locator('.route-match-summary')).to_contain_text('Bez početne adrese ne računamo hodanje do susreta.')
  self.page.screenshot(path='/tmp/usput-meeting-send-visible.png',full_page=True)
  marker=picker.locator('.route-meeting-handle');marker.hover();box=marker.bounding_box();x=box['x']+16;y=box['y']+16
  with self.page.expect_response(lambda r:'/api/rides/'+ride_id+'?' in r.url and 'pickupLocation=' in r.url) as preview:
   self.page.mouse.move(x,y);self.page.mouse.down();self.page.mouse.move(x+20,y,steps=8);self.page.mouse.up()
  self.assertTrue(preview.value.ok,preview.value.text());self.assertIsNotNone(preview.value.json()['ride']['match'])
  expect(send).to_be_enabled()
  with self.page.expect_request(lambda r:r.url.endswith('/api/rides/'+ride_id+'/request') and r.method=='POST') as sent:
   send.click()
  import json
  request=sent.value.post_data_json['search']
  self.assertEqual(json.loads(request['fromLocation'])['lat'],json.loads(request['pickupLocation'])['lat'])
  self.assertEqual(json.loads(request['fromLocation'])['lng'],json.loads(request['pickupLocation'])['lng'])
  expect(self.page.locator('.meeting-send-status')).to_contain_text('Mjesto susreta je poslano vozaču.')
  expect(self.page.get_by_role('heading',name='Zahtjev je poslan.',exact=True)).to_be_visible()
  self.assertEqual(len(self.ctx.request.get(self.base+'/api/my-rides').json()['bookings']),1)
if __name__=='__main__':unittest.main(defaultTest=['DemoRecognition.test_generated_portrait_for_every_seeded_driver','DemoRecognition.test_empty_search_sends_the_chosen_pin_from_the_map'],verbosity=2)
