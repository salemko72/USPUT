from playwright.sync_api import sync_playwright,expect
from datetime import datetime,timedelta
import time,os
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8789')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 driver=browser.new_context();passenger=browser.new_context(viewport={'width':390,'height':844})
 def post(ctx,path,data):
  r=ctx.request.post(base+'/api'+path,data=data,headers={'Origin':base});assert r.ok,r.text();return r.json()
 for c,name in [(driver,'Driver'),(passenger,'Passenger')]:post(c,'/auth/register',{'name':name,'email':name+str(time.time_ns())+'@example.test','password':'testna-lozinka-123','adult':True,'terms':True})
 date=(datetime.now()+timedelta(days=1)).strftime('%Y-%m-%d')
 ride=post(driver,'/rides',{'from':'ilidza','to':'centar','date':date,'time':'07:30','car':'Test Car','note':''})['ride']
 page=passenger.new_page();page.goto(base);page.get_by_role('button',name='Pronađi vožnju').click()
 expect(page.get_by_text('Susret: Čengić Vila · oko 07:36',exact=True)).to_be_visible()
 page.get_by_role('button',name='Pogledaj vožnju').first.click();expect(page.get_by_text('Susret: Čengić Vila · oko 07:36',exact=True)).to_be_visible();page.get_by_role('button',name='Pošalji zahtjev',exact=True).click()
 expect(page.get_by_role('heading',name='Zahtjev je poslan.')).to_be_visible()
 mine=driver.request.get(base+'/api/my-rides').json();booking=mine['bookings'][0];assert booking['match']['pickup']['id']=='cengic';assert booking['match']['dropoff']['id']=='marijin'
 dp=driver.new_page();dp.goto(base+'/#ride/'+ride['id']);expect(dp.get_by_text('Susret: Čengić Vila · oko 07:36',exact=True)).to_be_visible();dp.get_by_role('button',name='Prihvati',exact=True).click();page.reload();expect(page.get_by_role('heading',name='Dogovoreno.')).to_be_visible();expect(page.get_by_text('Susret: Čengić Vila · oko 07:36',exact=True)).to_be_visible()
 page.screenshot(path='/workspace/USPUT/app/test-results/mobile-road-agreement.png',full_page=True)
 browser.close();print('PASS synthetic routing provider: intermediate pickup, estimated arrival, request snapshot, driver display/acceptance, passenger agreement after reload')
