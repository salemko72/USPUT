from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import os,time,re
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8788')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 ctx=browser.new_context(viewport={'width':390,'height':844},locale='en-US');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 # The old demo marker must not bypass mandatory account login.
 page.add_init_script("localStorage.setItem('usput-demo-active','1')")
 page.goto(base+'/#profile');expect(page.get_by_role('button',name='Krenimo zajedno',exact=True)).to_be_visible();expect(page.get_by_role('button',name=re.compile('demo',re.I))).to_have_count(0)
 page.get_by_role('button',name='English',exact=True).click();expect(page.locator('html')).to_have_attribute('lang','en');expect(page.get_by_role('button',name="Let's go together",exact=True)).to_be_visible()
 page.reload();expect(page.get_by_role('button',name="Let's go together",exact=True)).to_be_visible();page.get_by_role('button',name="Let's go together",exact=True).click();page.get_by_role('button',name='Create account',exact=True).click()
 page.get_by_label('City or town',exact=True).fill('Sarajevo');page.get_by_label('Your name',exact=True).fill('Language Test');page.get_by_label('Email address',exact=True).fill('language-'+str(time.time_ns())+'@example.test');page.get_by_label('Password',exact=True).fill('testna-lozinka-123');page.locator('input[name="adult"]').check();page.locator('input[name="terms"]').check();page.get_by_role('button',name='Create account',exact=True).click()
 # Passenger home opens on saved searches; a new search retains the selected day.
 page.get_by_role('button',name='New ride Choose another route',exact=True).click()
 expect(page.get_by_role('button',name='Find a ride',exact=True)).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 date=page.get_by_role('button',name=re.compile('Departure date:'));expect(date).to_have_text('Tomorrow');date.click();cal=page.get_by_role('dialog',name='Choose departure date');expect(cal).to_be_visible();assert cal.locator('.calendar-weekdays span').all_text_contents()==['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];page.keyboard.press('Escape')
 page.get_by_role('button',name=re.compile('Departure time:')).click();expect(page.get_by_role('dialog',name='Choose departure time')).to_be_visible();assert page.get_by_label('Departure hour',exact=True).locator('option').count()==24;page.get_by_role('button',name='Confirm time',exact=True).click()
 # Backend errors translate, user-entered names are kept intact, and language changes without losing session.
 page.get_by_role('button',name='Open profile',exact=True).first.click();expect(page.get_by_role('heading',name='Hi, Language',exact=False)).to_be_visible();page.get_by_role('button',name='Bosanski',exact=True).click();expect(page.get_by_role('button',name='Sačuvaj promjene',exact=True)).to_be_visible()
 page.get_by_role('button',name='English',exact=True).click();page.get_by_role('button',name='Sign out',exact=True).click();expect(page.get_by_role('button',name="Let's go together",exact=True)).to_be_visible();page.goto(base+'/#home');expect(page.get_by_role('button',name="Let's go together",exact=True)).to_be_visible()
 page.get_by_role('button',name="Let's go together",exact=True).click();page.get_by_label('Email address',exact=True).fill('missing@example.test');page.get_by_label('Password',exact=True).fill('wrong-password');page.get_by_role('button',name='Sign in',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('Incorrect email or password.')
 Path('test-results').mkdir(exist_ok=True);page.screenshot(path='test-results/mobile-english-login.png',full_page=True)
 assert not errors,errors
 # Cookie-based sign-in still works when persistent browser storage is blocked.
 blocked=browser.new_context();blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}})")
 r=blocked.request.post(base+'/api/auth/register',headers={'Origin':base},data={'name':'Storage Test','email':'storage-'+str(time.time_ns())+'@example.test','password':'testna-lozinka-123','city':'Sarajevo','adult':True,'terms':True});assert r.ok
 bp=blocked.new_page();bp.goto(base);bp.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click();expect(bp.get_by_role('button',name='Pronađi vožnju',exact=True)).to_be_visible();bp.get_by_role('button',name='English',exact=True).click();expect(bp.get_by_role('button',name='Find a ride',exact=True)).to_be_visible()
 browser.close();print('PASS mandatory auth incl old demo marker, BHS/ENG persistence, English registration/profile/logout/errors, European English calendar and24h time')
