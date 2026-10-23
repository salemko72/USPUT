"""Date carry-over and driver/map regressions against an isolated local API.
The street fixture and tile grid are synthetic; production accounts are never used.
"""
import json, mimetypes, os, re, socket, subprocess, tempfile, time, unittest, uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect
from map_fixture import install_vector_map

APP = Path(__file__).resolve().parents[1]

class CommuteCorrections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Path('/tmp/usput-corrections-results').mkdir(exist_ok=True)
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
        self.errors=[];self.page.on('pageerror',lambda error:self.errors.append(error.stack))
        if os.environ.get('USPUT_TEST_ASSETS_DIR'):
            assets=Path(os.environ['USPUT_TEST_ASSETS_DIR']).resolve()
            def serve_assets(route):
                path=unquote(urlparse(route.request.url).path)
                if path.startswith('/api/'):return route.continue_()
                asset=(assets/path.lstrip('/')).resolve()
                if not asset.is_relative_to(assets) or not asset.is_file():asset=assets/'index.html'
                route.fulfill(path=str(asset),content_type=mimetypes.guess_type(asset)[0] or 'application/octet-stream')
            self.page.route(self.base+'/**',serve_assets)
        self.map_levels=[]
        install_vector_map(self.page,lambda url:self.map_levels.append(int(url.split('/fixture/')[1].split('/')[0])))
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
    def preview(self,edit=True):
        self.saved('bascarsija','ilidza')
        self.post('/vehicle',{'makeId':'other','make':'Volkswagen','model':'Golf 5','color':'crvena','manualModel':True})
        self.page.goto(self.base)
        self.page.locator('.saved-search-load').click()
        self.select_tomorrow()
        self.page.get_by_role('button',name='Nudim vožnju',exact=True).click()
        self.page.get_by_role('button',name='Objavi vožnju',exact=True).click()
        dialog=self.page.get_by_role('dialog',name='Je li ovo ruta kojom stvarno voziš?')
        expect(dialog).to_be_visible()
        expect(dialog.locator('canvas.maplibregl-canvas').first).to_be_visible()
        expect(dialog.get_by_role('textbox',name='Naziv mjesta susreta',exact=True)).to_have_count(0)
        dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True).click()
        expect(dialog.locator('.stop-confirmation input')).to_be_enabled()
        dialog.get_by_role('button',name='Dodaj mjesto susreta',exact=True).click()
        expect(dialog.locator('.route-meeting-handle')).to_be_visible()
        dialog.get_by_role('button',name='Potvrdi mjesto susreta',exact=True).click()
        expect(dialog.locator('.stop-confirmation input')).to_be_enabled()
        if not edit:dialog.get_by_role('button',name='Više mape',exact=True).click()
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
    def test_driver_adds_unnamed_meeting_points_after_confirming_the_shape(self):
        self.page.set_viewport_size({'width':1440,'height':900})
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
        self.page.wait_for_timeout(250)
        marker=dialog.locator('.route-meeting-handle')
        box=marker.bounding_box()
        x=box['x']+16;y=box['y']+16
        self.page.mouse.move(x,y);self.page.mouse.down();self.page.mouse.move(x+4,y,steps=4);self.page.mouse.up()
        dialog.get_by_role('button',name='Potvrdi mjesto susreta',exact=True).click()
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
        # The helper now explicitly adds a meeting pin in a separate zoom-17
        # map. Measure route-map tile zooms, not that closed pin dialog's history.
        self.map_levels.clear()
        map=dialog.locator('.leaflet-container-wrap')
        def level():
            return map.locator('path.leaflet-interactive').last.evaluate("e=>e.getBBox().width")
        before=level()
        def wait_width(check, value):
            self.page.wait_for_function("v=>{const p=Array.from(document.querySelectorAll('.leaflet-container-wrap path.leaflet-interactive')).at(-1);return p && "+check+"}",arg=value)
        dialog.get_by_role('button',name='Približi mapu',exact=True).click()
        wait_width("p.getBBox().width>v*1.5",before)
        self.page.wait_for_function("!document.querySelector('.leaflet-container-wrap.leaflet-zoom-anim')")
        zoomed=level();self.assertGreater(zoomed,before)
        # The same road overlay must preserve zoom when only the stop name changes.
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')):
            dialog.get_by_role('textbox',name='Naziv mjesta susreta',exact=True).first.fill('Kod parkinga')
        expect(dialog.locator('.stop-confirmation input')).to_be_enabled()
        self.assertAlmostEqual(level(),zoomed,delta=2)
        map.scroll_into_view_if_needed();map.hover(position={'x':190,'y':145})
        prior=max(self.map_levels)
        self.page.mouse.wheel(0,-500)
        # At high zoom the route SVG is clipped at viewport edges. Tile zoom
        # records actual renderer movement even when the clipped width stops growing.
        until=time.monotonic()+6
        while max(self.map_levels)<=prior and time.monotonic()<until:self.page.wait_for_timeout(50)
        self.assertGreater(max(self.map_levels),prior)
        self.page.wait_for_function("!document.querySelector('.leaflet-container-wrap.leaflet-zoom-anim')")
        dialog.get_by_role('button',name='Prikaži cijelu trasu',exact=True).click()
        wait_width("Math.abs(p.getBBox().width-v)<2",before)

    def test_route_planner_uses_the_viewport_and_preserves_offer_when_closed(self):
        dialog=self.preview(edit=False)
        self.page.screenshot(path='/tmp/usput-corrections-results/planner-mobile-compact.png')
        box=dialog.bounding_box()
        self.assertLessEqual(abs(box['x']),1)
        self.assertLessEqual(abs(box['y']),1)
        self.assertAlmostEqual(box['width'],390,delta=1)
        self.assertAlmostEqual(box['height'],844,delta=1)
        self.assertEqual(self.page.evaluate('getComputedStyle(document.body).overflow'),'hidden')
        # The compact panel leaves the map usable and reveals the existing editor on demand.
        edit=dialog.get_by_role('button',name='Uredi mjesta susreta',exact=True)
        expect(edit).to_be_visible();edit.click()
        name=dialog.get_by_role('textbox',name='Naziv mjesta susreta',exact=True)
        expect(name).to_be_visible();name.fill('Kod parkinga — test')
        self.page.screenshot(path='/tmp/usput-corrections-results/planner-mobile-expanded.png')
        publish=dialog.get_by_role('button',name='Vozim ovom trasom — objavi',exact=True)
        expect(publish).to_be_disabled()
        self.assertLessEqual(publish.bounding_box()['y']+publish.bounding_box()['height'],844)
        self.page.set_viewport_size({'width':1440,'height':900})
        expect(dialog).to_be_visible()
        self.assertAlmostEqual(dialog.bounding_box()['width'],1440,delta=1)
        self.assertAlmostEqual(dialog.bounding_box()['height'],900,delta=1)
        self.assertEqual(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'),True)
        self.page.screenshot(path='/tmp/usput-corrections-results/planner-desktop.png')
        dialog.get_by_role('button',name='Nazad na unos vožnje',exact=True).click()
        expect(dialog).to_have_count(0)
        expect(self.page.get_by_role('button',name='Objavi vožnju',exact=True)).to_be_visible()
        expect(self.page.get_by_role('button',name=re.compile('^Datum polaska:'))).to_contain_text('Sutra')
        expect(self.page.get_by_role('combobox',name='Polazište',exact=True)).to_have_value('Baščaršija')
        expect(self.page.get_by_role('combobox',name='Odredište',exact=True)).to_have_value('Ilidža')
        self.assertNotEqual(self.page.evaluate('getComputedStyle(document.body).overflow'),'hidden')
        self.page.get_by_role('button',name='Objavi vožnju',exact=True).click()
        dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True).click()
        expect(self.page.get_by_role('dialog',name='Je li ovo ruta kojom stvarno voziš?').get_by_role('textbox',name='Naziv mjesta susreta',exact=True)).to_have_value('Kod parkinga — test')
        dialog.get_by_role('button',name='Nazad na unos vožnje',exact=True).click()
        self.page.get_by_role('button',name='Zamijeni polazište i odredište',exact=True).click()
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as changed:
            self.page.get_by_role('button',name='Objavi vožnju',exact=True).click()
        body=changed.value.request.post_data_json
        self.assertEqual((body['from'],body['to']),('ilidza','bascarsija'))
        self.assertNotIn('meetingStops',body,'Stops from the previous route must not leak into a different route')

    def test_small_route_planner_controls_remain_reachable_and_escape_returns_focus(self):
        self.page.set_viewport_size({'width':320,'height':568})
        dialog=self.preview(edit=False)
        self.assertAlmostEqual(dialog.bounding_box()['width'],320,delta=1)
        dialog.get_by_role('button',name='Pregledaj i potvrdi rutu',exact=True).click()
        for label in ['Približi mapu','Udalji mapu','Prikaži cijelu trasu']:
            control=dialog.get_by_role('button',name=label,exact=True)
            self.assertTrue(control.evaluate('el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit)}'),label)
        self.assertLessEqual(dialog.locator('.route-planner-footer').bounding_box()['y']+dialog.locator('.route-planner-footer').bounding_box()['height'],568)
        dialog.get_by_role('button',name='Nazad na unos vožnje',exact=True).focus()
        self.page.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
        expect(self.page.get_by_role('button',name='Objavi vožnju',exact=True)).to_be_focused()

    def test_inline_pin_escape_keeps_route_open_and_restores_focus(self):
        dialog=self.preview()
        edit_pin=dialog.get_by_role('button',name='Provjeri ili pomjeri pin',exact=True).first
        edit_pin.click()
        expect(self.page.get_by_role('dialog')).to_have_count(1)
        expect(dialog.get_by_role('button',name='Potvrdi mjesto susreta',exact=True)).to_be_enabled()
        self.page.keyboard.press('Escape')
        expect(dialog.locator('.route-meeting-handle')).to_have_count(0)
        expect(dialog).to_be_visible()
        expect(edit_pin).to_be_focused()

if __name__=='__main__': unittest.main(verbosity=2)
