from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import time,os
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8787')
stamp=str(int(time.time()*1000))
password='testna-lozinka-123!'
Path('test-results').mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 errors=[]
 def context():
  c=browser.new_context(viewport={'width':390,'height':844},locale='bs-BA');page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return c,page
 def register(page,name,email):
  page.goto(base);page.get_by_role('button',name='Krenimo zajedno').click();page.get_by_role('button',name='Napravi račun',exact=True).click()
  page.get_by_label('Grad ili mjesto',exact=True).fill('Sarajevo');page.get_by_label('Tvoje ime').fill(name);page.get_by_label('Email adresa').fill(email);page.get_by_label('Lozinka',exact=True).fill(password)
  page.get_by_text('Imam najmanje 18 godina.').click();page.locator('input[name="terms"]').check();page.get_by_role('button',name='Napravi račun',exact=True).click()
  expect(page.get_by_role('button',name='Pronađi vožnju')).to_be_visible()
 ca,a=context();cb,b=context()
 register(a,'Amar Test','amar-'+stamp+'@example.test')
 a.get_by_role('button',name='Nudim vožnju').click();a.get_by_role('button',name='Dodaj vozilo',exact=True).click();a.get_by_role('combobox',name='Marka vozila').fill('vw');a.get_by_role('option',name='Volkswagen',exact=True).click();a.get_by_role('combobox',name='Model vozila').fill('golf');a.get_by_role('option',name='GOLF',exact=True).click();a.get_by_role('radio',name='Siva',exact=True).check();a.get_by_role('button',name='Sačuvaj vozilo',exact=True).click();a.get_by_role('button',name='Objavi vožnju').click()
 expect(a.get_by_role('heading',name='Tvoja vožnja.')).to_be_visible()
 a.screenshot(path='test-results/mobile-offer.png',full_page=True)
 register(b,'Lejla Test','lejla-'+stamp+'@example.test')
 b.get_by_label('Najviše minuta hodanja',exact=True).select_option('5');b.get_by_role('button',name='Pronađi vožnju').click();b.get_by_role('button',name='Pogledaj vožnju').first.click();b.get_by_role('button',name='Pošalji zahtjev').click()
 expect(b.get_by_role('heading',name='Zahtjev je poslan.')).to_be_visible()
 a.reload();a.get_by_role('button',name='Prihvati',exact=True).click()
 expect(a.get_by_role('heading',name='Društvo je dogovoreno.')).to_be_visible()
 b.reload();expect(b.get_by_role('heading',name='Dogovoreno.')).to_be_visible()
 b.get_by_role('button',name='Na mjestu sam').click();expect(b.get_by_role('heading',name='Vozač zna da si tu.')).to_be_visible()
 a.reload();expect(a.get_by_text('Putnik je na mjestu',exact=True)).to_be_visible()
 a.get_by_role('button',name='Završi vožnju').click();b.reload();expect(b.get_by_role('heading',name='Lijep put. Hvala!')).to_be_visible()
 b.get_by_role('button',name='Profil',exact=True).click();b.get_by_label('Tvoje ime',exact=True).fill('Lejla Novo');b.get_by_role('button',name='Sačuvaj promjene').click();expect(b.get_by_role('heading',name='Lejla Novo',exact=True)).to_be_visible();b.reload();expect(b.get_by_role('heading',name='Lejla Novo',exact=True)).to_be_visible()
 b.get_by_role('button',name='Odjavi se').click();b.get_by_role('button',name='Krenimo zajedno').click();b.get_by_label('Email adresa').fill('lejla-'+stamp+'@example.test');b.get_by_label('Lozinka',exact=True).fill('pogresna-lozinka');b.get_by_role('button',name='Prijavi se',exact=True).click();expect(b.get_by_role('alert')).to_contain_text('Email ili lozinka nisu ispravni.')
 b.get_by_label('Lozinka',exact=True).fill(password);b.get_by_role('button',name='Prijavi se',exact=True).click();expect(b.get_by_role('button',name='Pronađi vožnju')).to_be_visible()
 # Validate important widths without horizontal scroll on real data.
 for width,height in [(320,740),(390,844),(768,1024),(1440,1000)]:
  b.set_viewport_size({'width':width,'height':height});b.evaluate('document.fonts.ready');assert b.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
 b.screenshot(path='test-results/desktop-real-home.png',full_page=True)
 assert not errors,errors
 ca.close();cb.close();browser.close()
 print('PASS: two real accounts, publish, search, request, driver accept, readiness, completion, profile persistence, logout, wrong/correct login, responsive widths 320/390/768/1440')
