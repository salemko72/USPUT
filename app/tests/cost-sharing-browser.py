from playwright.sync_api import sync_playwright, expect
import time,os,datetime
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8793')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium');ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();page.set_default_timeout(5000)
 def post(path,data):
  r=ctx.request.post(base+'/api'+path,data=data,headers={'Origin':base});assert r.ok,r.text();return r.json()
 post('/auth/register',{'name':'Cost Test','email':f'cost-{time.time_ns()}@example.test','password':'testna-lozinka-123','adult':True,'terms':True})
 day=(datetime.date.today()+datetime.timedelta(days=2)).isoformat()
 rides=[]
 for shared in (False,True):
  rides.append(post('/rides',{'from':'ilidza','to':'otoka','date':day,'time':'14:00','car':'Test Car','note':'','costSharing':shared})['ride'])
 def check_badge(shared,label):
  badge=page.locator('.cost-sharing-badge');expect(badge).to_have_text(label)
  colors=badge.evaluate('(e)=>{const s=getComputedStyle(e);return [s.backgroundColor,s.color,s.width,s.height,s.borderRadius]}')
  assert colors[0]==('rgb(0, 0, 0)' if shared else 'rgb(184, 224, 110)'),colors
  assert colors[1]==('rgb(255, 255, 255)' if shared else 'rgb(0, 0, 0)'),colors
  assert colors[2]==colors[3] and colors[4]=='50%',colors
 for english in (False,True):
  page.goto(base)
  page.get_by_role('button',name='ENG' if english else 'BHS',exact=True).click()
  for shared,ride in zip((False,True),rides):
   page.goto(base+'/#ride/'+ride['id'])
   check_badge(shared,('YES' if shared else 'NO') if english else ('DA' if shared else 'NE'))
  page.route('**/api/rides/search',lambda r:r.fulfill(json={'rides':rides}))
  page.goto(base+'/#home')
  page.get_by_label('Maximum walking time' if english else 'Najviše minuta hodanja',exact=True).select_option('5')
  page.get_by_role('button',name='Find a ride' if english else 'Pronađi vožnju',exact=True).click()
  expect(page.locator('.ride-card .cost-sharing-badge')).to_have_count(2)
  assert sorted(page.locator('.ride-card .cost-sharing-badge').all_text_contents())==sorted(['NO','YES'] if english else ['NE','DA'])
 browser.close()
print('PASS: cards/details reuse circular badges; BHS NE/DA and ENG NO/YES; green/black backgrounds and black/white letters')
