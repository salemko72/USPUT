"""Date carry-over and driver/map regressions against an isolated local API.
The street fixture and tile grid are synthetic; production accounts are never used.
"""
import json, os, re, socket, subprocess, tempfile, time, unittest, uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

APP = Path(__file__).resolve().parents[1]

class CommuteCorrections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = tempfile.TemporaryDirectory(prefix='usput-corrections-', dir='/tmp')
        cls.log = open(cls.data.name+'/server.log','w+')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        cls.base=f'http://127.0.0.1:{port}'
        cls.server=subprocess.Popen(['node','tests/street-fixture-server.mjs'],cwd=APP,
            env={**os.environ,'PORT':str(port),'USPUT_DATA_DIR':cls.data.name},stdout=cls.log,stderr=subprocess.STDOUT)
        for _ in range(100):
            try: urlopen(cls.base+'/api/places',timeout=.2).close();break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('Fixture failed to start')
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
        cls.tomorrow=(datetime.now(ZoneInfo('Europe/Sarajevo')).date()+timedelta(days=1)).isoformat()
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.terminate();cls.server.wait(timeout=10)
        cls.log.close();cls.data.cleanup()
    def setUp(self):
        self.ctx=self.account('Tester')
        self.page=self.ctx.new_page();self.page.set_default_timeout(6000)
        self.errors=[];self.page.on('pageerror',lambda error:self.errors.append(str(error)))
        self.page.route('**/tile.openstreetmap.org/**',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef0e5"/><path d="M0 128H256M128 0V256" stroke="#fff" stroke-width="14"/></svg>'))
    def tearDown(self):
        Path('/tmp/usput-corrections-results').mkdir(exist_ok=True)
        self.page.screenshot(path='/tmp/usput-corrections-results/'+self._testMethodName+'.png',full_page=True)
        self.ctx.close()
        self.assertEqual(self.errors,[])
    def account(self,name):
        ctx=self.browser.new_context(viewport={'width':390,'height':844})
        r=ctx.request.post(self.base+'/api/auth/register',headers={'Origin':self.base},data={
            'name':name,'email':uuid.uuid4().hex+'@example.test','password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True})
        assert r.ok,r.text()
        return ctx
    def post(self,path,body,ctx=None):
        response=(ctx or self.ctx).request.post(self.base+'/api'+path,headers={'Origin':self.base},data=body)
        assert response.ok,response.text()
        return response.json()
    def saved(self,start='cengic',end='marijin'):
        self.post('/saved-searches',{'query':{'from':start,'to':end,'time':'07:30','walkMinutes':'5'}})
    def select_tomorrow(self):
        trigger=self.page.get_by_role('button',name=re.compile('^Datum polaska:'))
        trigger.click()
        if self.page.locator('[data-date="'+self.tomorrow+'"]').count()==0:
            self.page.get_by_role('button',name='Sljedeći mjesec',exact=True).click()
        self.page.locator('[data-date="'+self.tomorrow+'"]').click()
        expect(trigger).to_contain_text('Sutra')
    def preview(self):
        self.saved('bascarsija','ilidza')
        self.post('/vehicle',{'makeId':'other','make':'Volkswagen','model':'Golf 5','color':'crvena','manualModel':True})
        self.page.goto(self.base)
        self.page.locator('.saved-search-load').click()
        self.select_tomorrow()
        self.page.get_by_role('button',name='Nudim vožnju',exact=True).click()
        self.page.get_by_role('button',name='Objavi vožnju',exact=True).click()
        dialog=self.page.get_by_role('dialog',name='Je li ovo ruta kojom stvarno voziš?')
        expect(dialog).to_be_visible()
        expect(dialog.locator('img.leaflet-tile-loaded').first).to_be_visible()
        return dialog
    def test_selected_tomorrow_survives_search_return_and_saved_route_load(self):
        driver=self.account('Driver')
        try:
            places=driver.request.get(self.base+'/api/places').json()['places']
            points=[next(p for p in places if p['id']==id) for id in ['cengic','marijin']]
            offer={'from':'cengic','to':'marijin','date':self.tomorrow,'time':'07:30','car':'VW Golf · crveni'}
            preview=self.post('/routes/preview',{**offer,'meetingStops':points},driver)
            self.post('/rides',{**offer,'meetingStops':preview['meetingStops'],'previewToken':preview['previewToken'],'stopsConfirmed':True,'routeConfirmed':True},driver)
            self.saved();self.page.goto(self.base);self.page.locator('.saved-search-load').click();self.select_tomorrow()
            with self.page.expect_response(lambda r:r.url.endswith('/api/rides/search') and r.request.method=='POST') as response:
                self.page.get_by_role('button',name='Pronađi vožnju',exact=True).click()
            self.assertEqual(response.value.request.post_data_json['date'],self.tomorrow)
            self.assertGreaterEqual(len(response.value.json()['rides']),1)
            self.page.get_by_role('button',name='Nazad',exact=True).click()
            self.page.locator('.saved-search-load').click()
            expect(self.page.get_by_role('button',name=re.compile('^Datum polaska:'))).to_contain_text('Sutra')
            with self.page.expect_response(lambda r:r.url.endswith('/api/rides/search') and r.request.method=='POST') as response:
                self.page.get_by_role('button',name='Pronađi vožnju',exact=True).click()
            self.assertEqual(response.value.request.post_data_json['date'],self.tomorrow)
            self.assertGreaterEqual(len(response.value.json()['rides']),1)
            self.page.get_by_role('button',name='Nazad',exact=True).click()
            self.page.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click()
            expect(self.page.get_by_role('button',name=re.compile('^Datum polaska:'))).to_contain_text('Sutra')
        finally: driver.close()
    def test_driver_starts_with_one_meeting_point_and_add_before_finish(self):
        dialog=self.preview()
        names=dialog.get_by_role('textbox',name='Naziv mjesta susreta',exact=True)
        expect(names).to_have_count(1)
        expect(names).to_have_value('')
        expect(dialog.get_by_text('Polazište vozača',exact=True)).to_be_visible()
        expect(dialog.get_by_text('Završna tačka',exact=True)).to_be_visible()
        add=dialog.get_by_role('button',name='Dodaj mjesto susreta',exact=True)
        order=dialog.evaluate("el => {const button=Array.from(el.querySelectorAll('button')).find(x=>x.textContent.includes('Dodaj mjesto susreta'));const end=el.querySelector('[data-stop-role=end]');return !!end && !!(button.compareDocumentPosition(end)&Node.DOCUMENT_POSITION_FOLLOWING)}")
        self.assertTrue(order,'Add meeting point belongs before the final endpoint')
        add.click()
        pin=self.page.get_by_role('dialog',name='Mjesto gdje možeš stati',exact=True)
        pin.locator('.street-pin-map').click(position={'x':200,'y':140})
        pin.get_by_role('button',name='Koristi ovaj pin',exact=True).click()
        expect(names).to_have_count(2)
    def test_later_date_survives_switching_saved_cards_and_new_search(self):
        self.saved();self.saved('bascarsija','ilidza');self.page.goto(self.base)
        future=(datetime.now(ZoneInfo('Europe/Sarajevo')).date()+timedelta(days=8)).isoformat()
        trigger=self.page.get_by_role('button',name=re.compile('^Datum polaska:'))
        trigger.click()
        if self.page.locator('[data-date="'+future+'"]').count()==0:
            self.page.get_by_role('button',name='Sljedeći mjesec',exact=True).click()
        self.page.locator('[data-date="'+future+'"]').click()
        display='.'.join(reversed(future.split('-')))
        expect(self.page.locator('.saved-search-load')).to_have_count(2)
        self.page.locator('.saved-search-load').first.click();expect(trigger).to_contain_text(display)
        self.page.get_by_role('button',name='Sačuvane pretrage',exact=True).click()
        self.page.locator('.saved-search-load').last.click();expect(trigger).to_contain_text(display)
        self.page.get_by_role('button',name='Sačuvane pretrage',exact=True).click()
        self.page.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click()
        expect(trigger).to_contain_text(display)
    def test_route_map_zoom_and_edit_keep_the_chosen_view(self):
        dialog=self.preview()
        map=dialog.locator('.leaflet-container-wrap')
        def level():
            return map.evaluate("e=>Math.max(...Array.from(e.querySelectorAll('img.leaflet-tile-loaded')).map(i=>Number(new URL(i.src).pathname.split('/')[1])))")
        before=level()
        dialog.get_by_role('button',name='Približi mapu',exact=True).click()
        self.page.wait_for_function("v=>Array.from(document.querySelectorAll('.leaflet-container-wrap img.leaflet-tile-loaded')).some(i=>Number(new URL(i.src).pathname.split('/')[1])>v)",arg=before)
        zoomed=level();self.assertGreater(zoomed,before)
        self.page.wait_for_function("!document.querySelector('.leaflet-container-wrap.leaflet-zoom-anim')")
        # Editing the name must not recreate the map and reset zoom/pan.
        dialog.get_by_role('textbox',name='Naziv mjesta susreta',exact=True).first.fill('Kod parkinga')
        self.assertEqual(level(),zoomed)
        map.scroll_into_view_if_needed()
        map.hover()
        self.page.mouse.wheel(0,-500)
        self.page.wait_for_function("v=>Array.from(document.querySelectorAll('.leaflet-container-wrap img.leaflet-tile-loaded')).some(i=>Number(new URL(i.src).pathname.split('/')[1])>v)",arg=zoomed)
        dialog.get_by_role('button',name='Prikaži cijelu trasu',exact=True).click()
        self.page.wait_for_function("v=>Math.max(...Array.from(document.querySelectorAll('.leaflet-container-wrap img.leaflet-tile-loaded')).map(i=>Number(new URL(i.src).pathname.split('/')[1])))===v",arg=before)

if __name__=='__main__': unittest.main(verbosity=2)
