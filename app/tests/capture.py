from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import os,uuid
base=os.environ.get("USPUT_TEST_URL","http://127.0.0.1:8788")
driver_name='Capture Driver '+uuid.uuid4().hex[:8]
Path('test-results').mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 ctx=browser.new_context(viewport={'width':390,'height':844},locale='bs-BA')
 page=ctx.new_page()
 def capture(name,full=False):
  page.evaluate('document.fonts.ready')
  page.screenshot(path='test-results/'+name+'.png',full_page=full)
 page.goto(base);capture('01-splash-mobile',True)
 page.get_by_role('button',name='Krenimo zajedno').click();capture('02-login-mobile',True)
 page.get_by_role('button',name='Napravi račun',exact=True).click();capture('03-registration-mobile',True)
 response=ctx.request.post(base+'/api/auth/register',headers={'Origin':base},data={'name':'Capture Passenger','email':'capture-'+uuid.uuid4().hex+'@example.test','password':'testna-lozinka-123','adult':True,'terms':True});assert response.ok,response.text()
 # Publish a real driver's offer on the same default route and departure.
 driver_ctx=browser.new_context(viewport={'width':390,'height':844},locale='bs-BA')
 response=driver_ctx.request.post(base+'/api/auth/register',headers={'Origin':base},data={'name':driver_name,'email':'driver-'+uuid.uuid4().hex+'@example.test','password':'testna-lozinka-123','adult':True,'terms':True});assert response.ok,response.text()
 driver=driver_ctx.new_page();driver.goto(base);driver.get_by_role('button',name='Nudim vožnju').click();driver.get_by_role('button',name='Dodaj vozilo',exact=True).click();driver.get_by_role('button',name='Marka nije na listi',exact=True).click();driver.get_by_label('Naziv marke').fill('Capture');driver.get_by_label('Naziv modela').fill('Car');driver.get_by_role('radio',name='Siva',exact=True).check();driver.get_by_role('button',name='Sačuvaj vozilo',exact=True).click();driver.get_by_role('button',name='Objavi vožnju',exact=True).click();expect(driver.get_by_role('heading',name='Tvoja vožnja.')).to_be_visible()
 page.goto(base);page.get_by_role('button',name='Pronađi vožnju').wait_for();capture('04-main-mobile')
 page.get_by_role('button',name='Pronađi vožnju').click();page.get_by_role('button',name='Pogledaj vožnju').first.wait_for();capture('05-routes-mobile',True)
 page.locator('article').filter(has_text=driver_name).get_by_role('button',name='Pogledaj vožnju').first.click();page.get_by_role('button',name='Pošalji zahtjev').click();driver.reload();driver.get_by_role('button',name='Prihvati',exact=True).click();expect(driver.get_by_role('heading',name='Društvo je dogovoreno.')).to_be_visible();page.reload();page.get_by_role('button',name='Na mjestu sam').wait_for();capture('06-confirmed-mobile',True)
 page.get_by_role('button',name='Vožnje',exact=True).click();page.get_by_role('heading',name='Tvoj mali krug.').wait_for();
 page.set_viewport_size({'width':1440,'height':1000});page.get_by_role('button',name='Početna',exact=True).first.click();page.get_by_role('button',name='Pronađi vožnju').wait_for();capture('07-main-desktop',True)
 page.get_by_role('button',name='Profil',exact=True).first.click();page.get_by_role('button',name='Odjavi se').click();page.get_by_role('button',name='Krenimo zajedno').wait_for();capture('08-splash-desktop',True)
 browser.close()
 print('Captured eight actual application screenshots.')
