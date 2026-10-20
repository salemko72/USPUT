from playwright.sync_api import sync_playwright,expect
import os,uuid
from pathlib import Path
Path("test-results").mkdir(exist_ok=True)
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8788')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium');page=b.new_page(viewport={'width':390,'height':844},locale='bs-BA');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 response=page.context.request.post(base+'/api/auth/register',headers={'Origin':base},data={'name':'Vehicle Test','email':'vehicle-'+uuid.uuid4().hex+'@example.test','password':'testna-lozinka-123','adult':True,'terms':True});assert response.ok,response.text()
 page.goto(base);page.get_by_role('button',name='Profil',exact=True).click();page.get_by_role('button',name='Dodaj vozilo',exact=True).click()
 make=page.get_by_role('combobox',name='Marka vozila');make.fill('vw');page.get_by_role('option',name='Volkswagen',exact=True).click()
 model=page.get_by_role('combobox',name='Model vozila');model.fill('golf');page.get_by_role('option',name='GOLF',exact=True).click()
 page.get_by_role('radio',name='Siva',exact=True).check();page.get_by_role('button',name='Sačuvaj vozilo',exact=True).click();expect(page.get_by_text('Volkswagen GOLF',exact=True)).to_be_visible();page.reload();expect(page.get_by_text('Volkswagen GOLF',exact=True)).to_be_visible()
 page.get_by_role('button',name='Uredi vozilo').click();make=page.get_by_role('combobox',name='Marka vozila');make.fill('skoda');make.press('ArrowDown');make.press('Enter');expect(page.get_by_role('combobox',name='Model vozila')).to_have_value('')
 page.get_by_role('button',name='Model nije na listi').click();page.get_by_label('Naziv modela').fill('Moj model');page.get_by_role('radio',name='Crna',exact=True).check();page.get_by_role('button',name='Sačuvaj vozilo',exact=True).click();expect(page.get_by_text('Škoda Moj model',exact=True)).to_be_visible()
 page.screenshot(path='test-results/mobile-vehicle-profile.png',full_page=True)
 page.get_by_role('button',name='Početna',exact=True).click();page.get_by_role('button',name='Nudim vožnju',exact=True).click();expect(page.get_by_text('Škoda Moj model',exact=True)).to_be_visible();page.get_by_role('button',name='Objavi vožnju',exact=True).click();expect(page.get_by_role('heading',name='Tvoja vožnja.')).to_be_visible();expect(page.get_by_text('Škoda Moj model · Crna',exact=True)).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;b.close();print('PASS: vehicle catalogue search, aliases/diacritics, model dependency, keyboard selection, manual fallback, persistence, offer integration, mobile layout')
