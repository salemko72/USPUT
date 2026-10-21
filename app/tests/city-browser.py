from playwright.sync_api import sync_playwright,expect
import os,time
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8816')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 ctx=browser.new_context(viewport={'width':390,'height':844},geolocation={'latitude':43.856321,'longitude':18.413456},permissions=['geolocation'])
 page=ctx.new_page();page.set_default_timeout(15000);page.goto(base)
 page.get_by_role('button',name='Krenimo zajedno',exact=True).click();page.get_by_role('button',name='Napravi račun',exact=True).click()
 page.get_by_label('Tvoje ime',exact=True).fill('City Test');page.get_by_label('Email adresa',exact=True).fill(str(time.time_ns())+'@example.test');page.get_by_label('Lozinka',exact=True).fill('testna-lozinka-123');page.locator('input[name="adult"]').check();page.locator('input[name="terms"]').check()
 page.get_by_role('button',name='Napravi račun',exact=True).click();expect(page.get_by_label('Grad ili mjesto',exact=True)).to_be_visible()
 page.get_by_label('Grad ili mjesto',exact=True).fill('Zagreb');page.get_by_role('button',name='Napravi račun',exact=True).click();page.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click();expect(page.get_by_label('Grad za pretragu ulica')).to_have_value('Zagreb')
 assert 'geolocation=()' in ctx.request.get(base).headers['permissions-policy']
 expect(page.get_by_role('button',name='Koristi moju lokaciju',exact=True)).to_have_count(0)
 page.get_by_label('Grad za pretragu ulica').fill('Sarajevo')
 page.get_by_role('textbox',name='Polazište',exact=True).fill('Put')
 with page.expect_response('**/api/locations/search') as search:
  page.get_by_role('button',name='Pretraži adresu — Polazište',exact=True).click()
 assert search.value.request.post_data_json['scope']['city']=='Sarajevo';expect(page.locator('.street-results button')).to_have_count(1)
 page.get_by_label('Grad za pretragu ulica').fill('Zagreb');expect(page.locator('.street-results')).to_have_count(0)
 with page.expect_response('**/api/locations/search') as search:
  page.get_by_role('button',name='Pretraži adresu — Polazište',exact=True).click()
 assert search.value.request.post_data_json['scope']=={'city':'Zagreb'};expect(page.locator('.street-results button')).to_have_count(0)
 # Old accounts and initial routes stay empty until the user enters a location.
 def old_account(route):
  response=route.fetch();data=response.json();data['user']['city']='';route.fulfill(response=response,json=data)
 page.route('**/api/auth/me',old_account);page.reload();page.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click();expect(page.get_by_label('Grad za pretragu ulica')).to_have_value('');expect(page.get_by_role('textbox',name='Polazište',exact=True)).to_have_value('');expect(page.get_by_role('textbox',name='Odredište',exact=True)).to_have_value('')
 # A complete street + city can also be searched with an empty city field.
 page.get_by_label('Grad za pretragu ulica').fill('');page.get_by_role('textbox',name='Polazište',exact=True).fill('Put, Sarajevo')
 with page.expect_response('**/api/locations/search') as search:
  page.get_by_role('button',name='Pretraži adresu — Polazište',exact=True).click()
 assert search.value.request.post_data_json['scope']['city']=='Sarajevo';expect(page.locator('.street-results button')).to_have_count(1)
 page.get_by_label('Grad za pretragu ulica').fill('Zagreb')
 page.get_by_role('button',name='ENG',exact=True).click();expect(page.get_by_label('City for street searches')).to_have_value('Zagreb')
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000});page.evaluate('document.fonts.ready');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.evaluate('document.fonts.check(\'400 14px "Nunito Variable"\')')
 page.screenshot(path='test-results/city-nunito.png',full_page=True)
 browser.close();print('PASS registration city, manual street search, short names, old accounts, complete address fallback, stale results, no GPS control, BHS/ENG and responsive font')
