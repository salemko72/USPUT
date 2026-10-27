"""Two-account mutual reviews against isolated local API and synthetic roads."""
import importlib.util, sqlite3, time, unittest, re
from pathlib import Path
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('gps_helper',Path(__file__).with_name('live-location-browser.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

class Reviews(h.LiveGPS):
 def test_completed_pair_reviews_reveal_and_scores_follow_driver(self):
  ride,booking,passenger,p=self.setup_pair()
  try:
   with sqlite3.connect(Path(self.data.name)/'usput.sqlite') as db:
    db.execute('UPDATE rides SET departure=? WHERE id=?',(int(time.time()*1000)-3600000,ride['id']))
   self.page.reload()
   badge=self.page.locator('.driver-heading .user-rating')
   expect(badge).to_contain_text('Još nema ocjena')
   self.page.get_by_role('button',name='Završi vožnju',exact=True).click()
   driver_form=self.page.locator('.trip-review')
   expect(driver_form).to_contain_text('Ocijeni putnika')
   p.reload()
   form=p.locator('.trip-review')
   expect(form).to_contain_text('Ocijeni vozača')
   expect(form.get_by_role('button',name='Pošalji ocjenu',exact=True)).to_be_disabled()
   form.get_by_role('button',name='5 od 5 zvjezdica',exact=True).click()
   form.get_by_role('button',name='Pošalji ocjenu',exact=True).click()
   expect(form).to_contain_text('Tvoja ocjena: 5/5')
   expect(form).to_contain_text('kada oboje ocijenite')
   score=passenger.request.get(self.base+'/api/users/'+ride['driver']['id']+'/reputation').json()
   self.assertEqual(score['driver']['count'],0)
   p.reload();expect(p.locator('.trip-review')).to_contain_text('Tvoja ocjena: 5/5')
   self.assertEqual(p.locator('.trip-review .review-star-picker').count(),0)
   driver_form.get_by_role('button',name='4 od 5 zvjezdica',exact=True).click()
   driver_form.get_by_role('button',name='Pošalji ocjenu',exact=True).click()
   expect(driver_form).to_contain_text('Ocjena je objavljena.')
   expect(badge).to_contain_text(re.compile(r'5[.,]0'))
   self.assertEqual(self.ctx.request.get(self.base+'/api/users/'+passenger.request.get(self.base+'/api/auth/me').json()['user']['id']+'/reputation').json()['passenger']['average'],4)
   p.evaluate("window.dispatchEvent(new Event('focus'))")
   expect(p.locator('.driver-heading .user-rating')).to_contain_text(re.compile(r'5[.,]0'))
   expect(p.locator('.trip-review')).to_contain_text('Ocjena je objavljena.')
   p.screenshot(path='/tmp/usput-reviews-detail-mobile.png',full_page=True)
   p.goto(self.base+'/#trips')
   expect(p.locator('.trip-driver .user-rating')).to_contain_text(re.compile(r'5[.,]0'))
   expect(p.locator('.trip-review')).to_contain_text('Tvoja ocjena: 5/5')
   self.assertTrue(p.evaluate('document.documentElement.scrollWidth <= innerWidth'))
   p.screenshot(path='/tmp/usput-reviews-mobile.png',full_page=True)
   self.page.goto(self.base+'/#profile')
   expect(self.page.locator('.profile-reputation [data-rating-role="driver"]')).to_contain_text(re.compile(r'5[.,]0'))
   expect(self.page.locator('.profile-reputation [data-rating-role="passenger"]')).to_contain_text('Još nema ocjena')
   # Driver also sees their completed passenger's immutable submitted rating in trips.
   self.page.goto(self.base+'/#trips')
   self.page.get_by_role('button',name=__import__('re').compile('^Vozim')).click()
   expect(self.page.locator('.trip-review')).to_contain_text('Tvoja ocjena: 4/5')
   self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
   p.goto(self.base+'/#results')
   expect(p.locator('.ride-person .user-rating').first).to_contain_text(re.compile(r'5[.,]0'))
   p.screenshot(path='/tmp/usput-reviews-results-mobile.png',full_page=True)
   p.route('**/api/users/*/reputation',lambda route:route.fulfill(status=503,json={'error':'fixture unavailable'}))
   p.reload()
   expect(p.locator('.ride-person .user-rating').first).to_contain_text('Ocjene trenutno nisu dostupne.')
  finally:passenger.close()

if __name__=='__main__':
 unittest.main(defaultTest=['Reviews.test_completed_pair_reviews_reveal_and_scores_follow_driver'])
