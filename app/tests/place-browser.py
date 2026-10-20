from playwright.sync_api import sync_playwright,expect
import os,time
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8791')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium');page=browser.new_page(viewport={'width':390,'height':844})
 r=page.request.post(base+'/api/auth/register',headers={'Origin':base},data={'name':'Location Test','email':f'locations-{time.time_ns()}@example.test','password':'testna-lozinka-123','adult':True,'terms':True});assert r.ok,r.text()
 page.goto(base);page.get_by_text('Probna mjesta iz prethodne bete',exact=True).click();page.get_by_label('Najviše minuta hodanja',exact=True).select_option('5');origin=page.get_by_role('combobox',name='Polazište',exact=True)
 for query,name in [('bistr','Bistrik'),('alfakovac','Alifakovac'),('bascars','Baščaršija'),('logav','Logavina'),('kated','Katedrala'),('kovacici','Kovačići'),('sirokaca','Širokača')]:
  origin.fill(query);page.get_by_role('option',name=name,exact=True).click();expect(origin).to_have_value(name)
 origin.fill('bistr');origin.press('Enter');expect(origin).to_have_value('Bistrik')
 origin.fill('unfinished');origin.press('Escape');page.get_by_role('button',name='Zamijeni polazište i odredište',exact=True).click();expect(page.get_by_role('combobox',name='Odredište',exact=True)).to_have_value('');page.get_by_role('combobox',name='Odredište',exact=True).fill('ilidza');page.get_by_role('combobox',name='Odredište',exact=True).press('Enter')
 origin.fill('unknown street');origin.press('Escape');page.get_by_role('button',name='Pronađi vožnju',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('Odaberi polazište i odredište iz prijedloga.')
 origin.fill('bistr');origin.press('Enter');page.get_by_role('button',name='Pronađi vožnju',exact=True).click();expect(page.get_by_role('heading',name='Usput ti je.',exact=True)).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 browser.close();print('PASS searchable new neighbourhoods/landmark, diacritics/Alfakovac alias, keyboard selection, unknown text blocked, valid search, mobile width')
