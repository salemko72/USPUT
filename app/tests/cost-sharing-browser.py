from playwright.sync_api import sync_playwright,expect
import time,re,os
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8793')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium');ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page()
 def post(path,data):
  r=ctx.request.post(base+'/api'+path,data=data,headers={'Origin':base});assert r.ok,r.text();return r.json()
 post('/auth/register',{'name':'Cost Test','email':f'cost-{time.time_ns()}@example.test','password':'testna-lozinka-123','adult':True,'terms':True})
 post('/vehicle',{'makeId':'other','make':'Test','model':'Car','color':'crvena','manualModel':True})
 page.goto(base);page.get_by_role('button',name='Nudim vožnju',exact=True).click();choice=page.get_by_role('checkbox',name=re.compile('Očekujem dijeljenje troškova'));expect(choice).not_to_be_checked();choice.check();page.get_by_role('button',name='Objavi vožnju',exact=True).click();expect(page.get_by_text('Dijeljenje troškova: Da',exact=True)).to_be_visible();page.reload();expect(page.get_by_text('Dijeljenje troškova: Da',exact=True)).to_be_visible()
 page.get_by_role('button',name='ENG',exact=True).click();expect(page.get_by_text('Cost sharing: Yes',exact=True)).to_be_visible();assert page.get_by_text('Free',exact=True).count()==0
 assert ctx.request.get(base+'/api/my-rides').json()['rides'][0]['costSharing'] is True
 browser.close();print('PASS cost-sharing checkbox defaults off, true saved via publication, persists after reload, Yes translated, no free label')
