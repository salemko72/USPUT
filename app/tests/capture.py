from playwright.sync_api import sync_playwright,expect
from pathlib import Path
Path('test-results').mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 ctx=browser.new_context(viewport={'width':390,'height':844},locale='bs-BA')
 page=ctx.new_page()
 def capture(name,full=False):
  page.evaluate('document.fonts.ready')
  page.screenshot(path='test-results/'+name+'.png',full_page=full)
 page.goto('http://127.0.0.1:8787');capture('01-splash-mobile',True)
 page.get_by_role('button',name='Krenimo zajedno').click();capture('02-login-mobile',True)
 page.get_by_role('button',name='Napravi račun',exact=True).click();capture('03-registration-mobile',True)
 page.get_by_role('button',name='Samo razgledam — isprobaj demo').click();page.get_by_role('button',name='Pronađi vožnju').wait_for();capture('04-main-mobile')
 page.get_by_role('button',name='Pronađi vožnju').click();page.get_by_role('button',name='Pogledaj vožnju').first.wait_for();capture('05-routes-mobile',True)
 page.get_by_role('button',name='Pogledaj vožnju').first.click();page.get_by_role('button',name='Pošalji zahtjev').click();page.get_by_role('button',name='Simuliraj potvrdu vozača').click();page.get_by_role('button',name='Na mjestu sam').wait_for();page.get_by_role('status').filter(has_text='Demo: vozač').wait_for(state='hidden',timeout=10000);capture('06-confirmed-mobile',True)
 page.get_by_role('button',name='Vožnje',exact=True).click();page.get_by_role('heading',name='Tvoj mali krug.').wait_for();
 page.set_viewport_size({'width':1440,'height':1000});page.get_by_role('button',name='Početna',exact=True).first.click();page.get_by_role('button',name='Pronađi vožnju').wait_for();capture('07-main-desktop',True)
 page.get_by_role('button',name='Profil',exact=True).first.click();page.get_by_role('button',name='Odjavi se').click();page.get_by_role('button',name='Krenimo zajedno').wait_for();capture('08-splash-desktop',True)
 browser.close()
 print('Captured eight actual application screenshots.')
