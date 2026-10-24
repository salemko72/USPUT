"""GPS consent and two-account sharing with emulated devices; no real GPS or users."""
import importlib.util,json,sqlite3,uuid,time
from pathlib import Path
import unittest
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
WATCH_STATS="""(() => {
 const geo=navigator.geolocation,watch=geo.watchPosition.bind(geo),clear=geo.clearWatch.bind(geo),get=geo.getCurrentPosition.bind(geo);
 window.__gps={active:new Set(),gets:0};
 geo.watchPosition=(...args)=>{const id=watch(...args);window.__gps.active.add(id);return id;};
 geo.clearWatch=id=>{window.__gps.active.delete(id);return clear(id);};
 geo.getCurrentPosition=(...args)=>{window.__gps.gets++;return get(...args);};
})();"""
class LiveGPS(h.AutoRoutePreview):
 def setup_pair(self):
  self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
  expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
  ride=self.ctx.request.get(self.base+'/api/my-rides').json()['rides'][0]
  passenger=self.browser.new_context(viewport={'width':390,'height':844},geolocation={'latitude':43.8597,'longitude':18.4312,'accuracy':14},permissions=['geolocation'])
  r=passenger.request.post(self.base+'/api/auth/register',headers={'Origin':self.base},data={'name':'GPS Passenger','email':uuid.uuid4().hex+'@example.test','password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True});self.assertTrue(r.ok,r.text())
  booking=uuid.uuid4().hex
  with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.execute("INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES(?,?,?,'accepted',?)",(booking,ride['id'],r.json()['user']['id'],int(time.time()*1000)))
  self.ctx.grant_permissions(['geolocation'],origin=self.base);self.ctx.set_geolocation({'latitude':43.8593,'longitude':18.4308,'accuracy':12})
  self.ctx.add_init_script(WATCH_STATS);passenger.add_init_script(WATCH_STATS)
  p=passenger.new_page();p.set_default_timeout(12000);h.install_vector_map(p)
  p.goto(self.base+'/#ride/'+ride['id']);self.page.reload()
  return ride,booking,passenger,p
 def activate_window(self,ride):
  with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.execute('UPDATE rides SET departure=? WHERE id=?',(int(time.time()*1000)+120000,ride['id']))
 def test_two_people_share_only_in_window_and_stop_on_hide_navigation_and_finish(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   driver=self.page
   card=p.locator('.live-location-card')
   expect(card.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_disabled()
   expect(card).to_contain_text('pet minuta prije susreta')
   self.assertEqual(p.evaluate('window.__gps.gets'),0)
   self.activate_window(ride);p.reload();driver.reload()
   self.assertIn('geolocation=(self)',passenger.request.get(self.base).headers['permissions-policy'])
   dc=driver.locator('.live-location-card');expect(dc.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled()
   dc.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   expect(dc.get_by_role('button',name='Prekini dijeljenje lokacije',exact=True)).to_be_visible()
   expect(card.locator('.gps-peer-status')).to_contain_text('Svježa lokacija',timeout=10000)
   expect(p.locator('.gps-location-marker:not(.own)')).to_have_count(1)
   expect(p.locator('.gps-role-car:not(.own) svg')).to_have_count(1)
   self.assertEqual(p.evaluate('window.__gps.gets'),0,'Seeing a consenting driver must not request the passenger GPS')
   card.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   expect(driver.locator('.gps-peer-status')).to_contain_text('GPS Passenger',timeout=10000)
   expect(driver.locator('.gps-role-person:not(.own) svg')).to_have_count(1)
   expect(p.locator('.gps-location-marker')).to_have_count(2)
   p.screenshot(path='/tmp/usput-gps-active.png',full_page=True)
   self.assertEqual(p.evaluate('window.__gps.active.size'),1)
   self.assertEqual(driver.evaluate('window.__gps.active.size'),1)
   # A new GPS fix updates only the position layer, not the chosen zoom or route.
   route_requests=[]
   p.on('request',lambda req:route_requests.append(req.url) if '/api/routes/' in req.url else None)
   p.get_by_role('button',name='Približi mapu',exact=True).click()
   route_line=p.locator('.leaflet-overlay-pane path[stroke="#151815"][fill="none"]').first
   before=route_line.get_attribute('d')
   with driver.expect_response(lambda r:r.url.endswith('/location') and r.request.method=='POST' and r.request.post_data_json.get('lat')==43.8595,timeout=20000):
    self.ctx.set_geolocation({'latitude':43.8595,'longitude':18.4310,'accuracy':9})
   expect(card.locator('.gps-peer-status')).to_contain_text('±9 m',timeout=10000)
   self.assertEqual(route_line.get_attribute('d'),before,'GPS refresh must preserve zoom/pan and the driver route')
   self.assertEqual(route_requests,[])
   # Internal navigation retains explicit sharing and one watch.
   p.goto(self.base+'/#trips');expect(p.locator('.live-sharing-banner')).to_contain_text('Dijeliš GPS lokaciju')
   self.assertEqual(p.evaluate('window.__gps.active.size'),1)
   p.get_by_role('button',name='Prekini dijeljenje',exact=True).click()
   self.assertEqual(p.evaluate('window.__gps.active.size'),0)
   expect(dc.locator('.gps-peer-status')).to_contain_text('još ne dijeli',timeout=10000)
   self.assertIsNone(self.ctx.request.get(self.base+'/api/bookings/'+booking+'/location').json()['peerLocation'])
   # Backgrounding clears device collection and revokes the scoped lease.
   with driver.expect_response(lambda r:r.url.endswith('/location-sharing') and r.request.post_data_json.get('enabled') is False):
    driver.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
   self.assertEqual(driver.evaluate('window.__gps.active.size'),0)
   state=passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json();self.assertIsNone(state['peerLocation'])
   driver.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
   self.assertEqual(driver.evaluate('window.__gps.active.size'),0,'Returning must not silently enable sharing')
   expect(dc.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled()
   dc.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   expect(driver.locator('.live-sharing-banner')).to_contain_text('Dijeliš GPS lokaciju')
   r=self.ctx.request.post(self.base+'/api/bookings/'+booking+'/complete',headers={'Origin':self.base},data={});self.assertTrue(r.ok,r.text())
   driver.evaluate("window.dispatchEvent(new Event('usput:booking-changed'))")
   expect(driver.locator('.live-location-card')).to_have_count(0)
   expect(driver.locator('.gps-location-marker')).to_have_count(0)
   self.assertEqual(driver.evaluate('window.__gps.active.size'),0)
   self.assertIsNone(passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()['peerLocation'])
  finally:passenger.close()
 def test_denied_permission_never_enables_or_publishes_location(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   self.activate_window(ride);p.reload()
   p.evaluate("() => {navigator.geolocation.getCurrentPosition=(_,fail)=>fail({code:1});}")
   card=p.locator('.live-location-card');expect(card.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled();card.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   expect(card.get_by_role('alert')).to_contain_text('Pristup lokaciji nije odobren')
   state=passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json();self.assertFalse(state['ownSharing']);self.assertIsNone(state['ownLocation']);self.assertEqual(p.evaluate('window.__gps.active.size'),0)
  finally:passenger.close()
 def test_old_position_is_marked_and_expired_position_disappears_even_on_legacy_ride(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   self.activate_window(ride)
   with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.execute('UPDATE rides SET route_json=NULL WHERE id=?',(ride['id'],))
   started=self.ctx.request.post(self.base+'/api/bookings/'+booking+'/location-sharing',headers={'Origin':self.base},data={'enabled':True});self.assertTrue(started.ok,started.text())
   fix={'sharingId':started.json()['sharingId'],'lat':43.8594,'lng':18.4310,'accuracy':35,'capturedAt':int(time.time()*1000)-45000}
   r=self.ctx.request.post(self.base+'/api/bookings/'+booking+'/location',headers={'Origin':self.base},data=fix);self.assertTrue(r.ok,r.text())
   p.reload();card=p.locator('.live-location-card')
   expect(card.locator('.gps-peer-status')).to_contain_text('Starija lokacija',timeout=10000)
   expect(p.locator('.gps-location-marker.stale')).to_have_count(1)
   self.assertEqual(p.evaluate('window.__gps.gets'),0)
   with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.execute('UPDATE location_fixes SET expires_at=? WHERE booking_id=?',(int(time.time()*1000)-1,booking))
   p.evaluate("window.dispatchEvent(new Event('focus'))")
   expect(p.locator('.gps-location-marker')).to_have_count(0,timeout=10000)
   expect(card.locator('.gps-peer-status')).to_contain_text('Čekamo svježu')
  finally:passenger.close()
 def test_cancelled_pending_permission_cannot_replace_or_cancel_a_new_attempt(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   self.activate_window(ride);p.reload()
   p.evaluate("() => {window.__pendingGPS=[];navigator.geolocation.getCurrentPosition=(ok,fail)=>window.__pendingGPS.push({ok,fail});}")
   enabled=[]
   p.on('request',lambda req:enabled.append(req.post_data_json) if req.url.endswith('/location-sharing') and req.method=='POST' and req.post_data_json.get('enabled') is True else None)
   card=p.locator('.live-location-card');expect(card.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled();card.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   p.wait_for_function('() => window.__pendingGPS.length===1')
   p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
   p.goto(self.base+'/#trips')
   p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
   p.goto(self.base+'/#ride/'+ride['id'])
   card=p.locator('.live-location-card');expect(card.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled();card.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   p.wait_for_function('() => window.__pendingGPS.length===2')
   p.evaluate("window.__pendingGPS[0].ok({coords:{latitude:43.85,longitude:18.4,accuracy:10},timestamp:Date.now()})")
   p.wait_for_timeout(500)
   self.assertEqual(enabled,[],'An old permission result must not create a sharing session after restart')
   p.evaluate("window.__pendingGPS[1].ok({coords:{latitude:43.8597,longitude:18.4312,accuracy:14},timestamp:Date.now()})")
   expect(card.get_by_role('button',name='Prekini dijeljenje lokacije',exact=True)).to_be_visible()
   expect(card.locator('.gps-own-status')).to_contain_text('Svježa lokacija',timeout=10000)
   self.assertEqual(len(enabled),1)
   self.assertEqual(p.evaluate('window.__gps.active.size'),1)
   state=passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json();self.assertEqual(state['ownLocation']['lat'],43.8597)
  finally:passenger.close()
 def test_late_enable_response_cannot_invalidate_a_replacement_session(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   self.activate_window(ride);p.reload()
   held=[]
   def intercept(route):
    body=route.request.post_data_json
    if route.request.method=='POST' and body.get('enabled') is True and not held:
     held.append(route)
    else:route.continue_()
   p.route('**/api/bookings/'+booking+'/location-sharing',intercept)
   card=p.locator('.live-location-card');expect(card.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled()
   with p.expect_request(lambda r:r.url.endswith('/location-sharing') and r.post_data_json.get('enabled') is True):
    card.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   p.wait_for_timeout(100);self.assertEqual(len(held),1)
   p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
   p.goto(self.base+'/#trips')
   p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
   p.goto(self.base+'/#ride/'+ride['id'])
   card=p.locator('.live-location-card');expect(card.get_by_role('button',name='Dijeli moju lokaciju',exact=True)).to_be_enabled();card.get_by_role('button',name='Dijeli moju lokaciju',exact=True).click()
   expect(card.locator('.gps-own-status')).to_contain_text('Svježa lokacija',timeout=10000)
   expected=passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()['ownSharingId']
   with p.expect_response(lambda r:r.request==held[0].request) as obsolete:
    held[0].continue_()
   self.assertEqual(obsolete.value.status,409,'The obsolete enable must not mutate the replacement session')
   p.wait_for_timeout(300)
   current=passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()
   self.assertEqual(current['ownSharingId'],expected);self.assertIsNotNone(current['ownLocation'])
   self.assertEqual(p.evaluate('window.__gps.active.size'),1)
  finally:passenger.close()
 def test_profile_opt_in_automatically_shares_only_in_window_from_any_screen(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:db.execute('UPDATE users SET gps_auto=NULL WHERE id=(SELECT passenger_id FROM bookings WHERE id=?)',(booking,))
   p.reload();p.goto(self.base+'/#profile')
   toggle=p.get_by_role('checkbox',name='Automatski dijeli GPS tokom dogovorene vožnje',exact=True)
   expect(p.get_by_role('button',name='Uključi GPS',exact=True)).to_be_visible();p.get_by_role('button',name='Uključi GPS',exact=True).click();expect(toggle).to_be_checked()
   expect(p.get_by_text('GPS postavka je sačuvana.',exact=True)).to_be_visible()
   self.assertEqual(passenger.request.get(self.base+'/api/auth/me').json()['user']['gpsAuto'],True)
   self.assertEqual(p.evaluate('window.__gps.active.size'),0)
   self.assertEqual(passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()['ownSharing'],False)
   self.activate_window(ride);p.goto(self.base+'/#home')
   expect(p.locator('.live-sharing-banner')).to_contain_text('Dijeliš GPS',timeout=20000)
   self.assertEqual(p.evaluate('window.__gps.active.size'),1)
   p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
   p.wait_for_timeout(200);self.assertEqual(p.evaluate('window.__gps.active.size'),0)
   p.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
   expect(p.locator('.live-sharing-banner')).to_contain_text('Dijeliš GPS',timeout=20000)
   p.locator('.live-sharing-banner').get_by_role('button',name='Prekini dijeljenje',exact=True).click()
   p.wait_for_timeout(16000)
   self.assertEqual(p.evaluate('window.__gps.active.size'),0)
   self.assertFalse(passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()['ownSharing'])
   p.reload();expect(p.locator('.live-sharing-banner')).to_contain_text('Dijeliš GPS',timeout=20000)
   p.goto(self.base+'/#profile');toggle=p.get_by_role('checkbox',name='Automatski dijeli GPS tokom dogovorene vožnje',exact=True)
   toggle.click();expect(p.get_by_text('GPS postavka je sačuvana.',exact=True)).to_be_visible()
   self.assertEqual(passenger.request.get(self.base+'/api/auth/me').json()['user']['gpsAuto'],False)
   self.assertEqual(p.evaluate('window.__gps.active.size'),0)
   self.assertFalse(passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()['ownSharing'])
   p.reload();expect(p.get_by_role('checkbox',name='Automatski dijeli GPS tokom dogovorene vožnje',exact=True)).not_to_be_checked()
  finally:passenger.close()
 def test_unsupported_permission_query_never_automatically_prompts(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   self.activate_window(ride)
   r=passenger.request.post(self.base+'/api/profile/location-sharing',headers={'Origin':self.base},data={'enabled':True});self.assertTrue(r.ok)
   p.add_init_script("navigator.permissions.query=async()=>{throw new Error('unsupported')}")
   p.goto(self.base+'/#home');p.reload()
   expect(p.locator('.live-sharing-banner')).to_contain_text('Dozvoli GPS u profilu',timeout=10000)
   self.assertEqual(p.evaluate('window.__gps.gets'),0)
   self.assertEqual(p.evaluate('window.__gps.active.size'),0)
   self.assertFalse(passenger.request.get(self.base+'/api/bookings/'+booking+'/location').json()['ownSharing'])
  finally:passenger.close()
if __name__=='__main__':unittest.main(defaultTest=['LiveGPS.test_two_people_share_only_in_window_and_stop_on_hide_navigation_and_finish','LiveGPS.test_denied_permission_never_enables_or_publishes_location','LiveGPS.test_old_position_is_marked_and_expired_position_disappears_even_on_legacy_ride','LiveGPS.test_cancelled_pending_permission_cannot_replace_or_cancel_a_new_attempt','LiveGPS.test_late_enable_response_cannot_invalidate_a_replacement_session','LiveGPS.test_profile_opt_in_automatically_shares_only_in_window_from_any_screen','LiveGPS.test_unsupported_permission_query_never_automatically_prompts'],verbosity=2)
