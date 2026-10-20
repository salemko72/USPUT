from playwright.sync_api import sync_playwright,expect
from urllib.parse import urlparse,parse_qs
import os,time
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8825')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium');ctx=browser.new_context(viewport={'width':390,'height':844})
 r=ctx.request.post(base+'/api/auth/register',headers={'Origin':base},data={'name':'Salem Original','email':'salem.oauth.fixture@gmail.com','password':'testna-lozinka-123','city':'Sarajevo','adult':True,'terms':True});assert r.ok;original=r.json()['user']['id']
 ctx.request.post(base+'/api/auth/logout',headers={'Origin':base},data={})
 def sign_in(context):
  start=context.request.get(base+'/api/auth/google',max_redirects=0);assert start.status==302;state=parse_qs(urlparse(start.headers['location']).query)['state'][0]
  page=context.new_page();page.goto(base+'/api/auth/google/callback?state='+state+'&code=fixture');expect(page.get_by_role('button',name='Pronađi vožnju',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Napravi račun',exact=True)).to_have_count(0)
  me=context.request.get(base+'/api/auth/me').json()['user'];assert me['id']==original and me['name']=='Salem Original' and me['city']=='Sarajevo';return page
 link_page=ctx.new_page();link_page.goto(base+'/?google=link');expect(link_page.get_by_role('button',name='Prijavi se',exact=True)).to_be_visible();expect(link_page.locator('input[name="city"],input[name="name"]')).to_have_count(0);link_page.close()
 page=sign_in(ctx);cookie=next(c for c in ctx.cookies() if c['name']=='usput_session');assert cookie['httpOnly'] and cookie['expires']>time.time()+29*86400
 # Recreate the browser context from durable cookies, without localStorage credentials.
 state=ctx.storage_state();ctx.close();restored=browser.new_context(storage_state=state,viewport={'width':390,'height':844});page=restored.new_page();page.goto(base);expect(page.get_by_role('button',name='Pronađi vožnju',exact=True)).to_be_visible()
 page.get_by_role('button',name='Profil',exact=True).click();page.get_by_role('button',name='Odjavi se',exact=True).click();expect(page.get_by_role('button',name='Krenimo zajedno',exact=True)).to_be_visible()
 sign_in(restored);browser.close();print('PASS Google reuses email account, no onboarding, original profile, 30-day cookie, restored browser session, logout and returning Google login (synthetic provider)')
