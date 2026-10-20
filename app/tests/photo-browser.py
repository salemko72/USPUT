from playwright.sync_api import sync_playwright, expect
from PIL import Image
from pathlib import Path
import os,time
base=os.environ.get('USPUT_TEST_URL','http://127.0.0.1:8788')
fixture=Path('/tmp/usput-photo-fixture.jpg')
im=Image.effect_noise((1600,1200),75).convert('RGB');exif=Image.Exif();exif[270]='PRIVATE-GPS-MARKER';im.save(fixture,quality=95,exif=exif)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 def post(path,data):
  r=ctx.request.post(base+'/api'+path,data=data,headers={'Origin':base});assert r.ok,r.text();return r.json()
 post('/auth/register',{'name':'Photo Test','email':f'photo-{time.time_ns()}@example.test','password':'testna-lozinka-123','adult':True,'terms':True})
 post('/vehicle',{'makeId':'other','make':'Test','model':'Test Car','color':'siva','manualModel':True})
 page.goto(base+'/#profile')
 for label,kind,alt,cap in [('Odaberi profilnu fotografiju','avatar','Tvoja profilna fotografija',50*1024),('Odaberi fotografiju automobila','vehicle','Fotografija tvog automobila',150*1024)]:
  page.get_by_label(label,exact=True).set_input_files(str(fixture))
  expect(page.get_by_alt_text('Pregled kompresovane fotografije')).to_be_visible()
  with page.expect_request(lambda r:r.url.endswith('/api/photos/'+kind) and r.method=='POST') as sent:
   page.get_by_role('button',name='Sačuvaj fotografiju',exact=True).click()
  image=page.get_by_alt_text(alt,exact=True);expect(image).to_be_visible();expect(image).to_have_js_property('complete',True);assert image.evaluate('(i)=>i.naturalWidth')>0
  r=ctx.request.get(image.get_attribute('src') if image.get_attribute('src').startswith('http') else base+image.get_attribute('src'));assert r.status==200 and 'no-store' in r.headers['cache-control']
  data=r.body();assert len(data)<=cap;assert data[:4]==b'RIFF' and data[8:12]==b'WEBP';assert b'PRIVATE-GPS-MARKER' not in data and b'EXIF' not in data
  print('PASS',kind,len(data),'bytes, decodable WebP, metadata stripped, private response')
 page.screenshot(path='test-results/mobile-private-photos.png',full_page=True)
 page.get_by_role('button',name='Ukloni profilnu fotografiju',exact=True).click();page.get_by_role('button',name='Da, ukloni fotografiju',exact=True).click();expect(page.get_by_alt_text('Tvoja profilna fotografija',exact=True)).to_have_count(0)
 assert not errors,errors
 browser.close()
