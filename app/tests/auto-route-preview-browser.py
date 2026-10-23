"""Automatic driver-route previews against synthetic roads and temporary assets.

Builds outside app/dist so this check can run beside other frontend work.
No production accounts, real journeys, or public map/provider requests are used.
"""
import json
import math
import mimetypes
import os
import re
import socket
import subprocess
import tempfile
import time
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright
from map_fixture import install_vector_map

APP = Path(__file__).resolve().parents[1]
CALCULATING = 'Provjeravam mjesta susreta na odabranoj trasi…'


class AutoRoutePreview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = tempfile.TemporaryDirectory(prefix='usput-auto-route-', dir='/tmp')
        cls.assets = Path(os.environ.get('USPUT_TEST_ASSETS_DIR', cls.data.name + '/assets'))
        if not os.environ.get('USPUT_TEST_ASSETS_DIR'):
            subprocess.run(['npx', 'vite', 'build', '--outDir', str(cls.assets), '--emptyOutDir'],
                           cwd=APP, check=True, stdout=subprocess.DEVNULL)
        cls.log = open(cls.data.name + '/server.log', 'w+')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.server = subprocess.Popen(['node', 'tests/street-fixture-server.mjs'], cwd=APP,
            env={**os.environ, 'PORT': str(port), 'USPUT_DATA_DIR': cls.data.name},
            stdout=cls.log, stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                urlopen(cls.base + '/api/places', timeout=.2).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Synthetic API failed to start')
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.log.close()
        cls.data.cleanup()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={'width':390, 'height':844})
        registered = self.ctx.request.post(self.base + '/api/auth/register',
            headers={'Origin':self.base}, data={'name':'Auto route tester',
                'email':uuid.uuid4().hex + '@example.test', 'password':'fixture-password-123',
                'city':'Sarajevo', 'adult':True, 'terms':True})
        self.assertTrue(registered.ok, registered.text())
        self.post('/vehicle', {'makeId':'other', 'make':'Volkswagen', 'model':'Golf 5',
                              'color':'crvena', 'manualModel':True})
        self.post('/saved-searches', {'query':{'from':'bascarsija', 'to':'ilidza', 'time':'07:30', 'walkMinutes':'5'}})
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(6000)
        self.errors = []
        self.page.on('pageerror', lambda error:self.errors.append(str(error)))
        self.previews = []
        self.publish_requests = []
        self.page.on('response', self.record_preview)
        self.page.on('request', lambda req:self.publish_requests.append(req.post_data_json)
                     if req.url.endswith('/api/rides') and req.method == 'POST' else None)

        def serve_assets(route):
            path = unquote(urlparse(route.request.url).path)
            if path.startswith('/api/'):
                return route.continue_()
            asset = (self.assets / path.lstrip('/')).resolve()
            if not asset.is_relative_to(self.assets.resolve()) or not asset.is_file():
                asset = self.assets / 'index.html'
            route.fulfill(path=str(asset), content_type=mimetypes.guess_type(asset)[0] or 'application/octet-stream')

        self.page.route(self.base + '/**', serve_assets)
        install_vector_map(self.page)
        self.page.route('**/tile.openstreetmap.org/**', lambda route:route.fulfill(
            content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef0e5"/></svg>'))

    def tearDown(self):
        folder = Path('/tmp/usput-auto-route-results')
        folder.mkdir(exist_ok=True)
        self.page.screenshot(path=str(folder / (self._testMethodName + '.png')), full_page=True)
        self.ctx.close()
        self.assertEqual(self.errors, [])

    def post(self, path, body):
        result = self.ctx.request.post(self.base + '/api' + path, headers={'Origin':self.base}, data=body)
        self.assertTrue(result.ok, result.text())
        return result.json()

    def record_preview(self, response):
        if response.url.endswith('/api/routes/preview'):
            self.previews.append({'status':response.status, 'body':response.request.post_data_json,
                                  'result':response.json()})

    def open_preview(self, with_meeting=True, shape_only=False):
        self.page.goto(self.base)
        self.page.locator('.saved-search-load').click()
        tomorrow = (datetime.now(ZoneInfo('Europe/Sarajevo')).date() + timedelta(days=1)).isoformat()
        self.page.get_by_role('button', name=re.compile('^Datum polaska:')).click()
        if not self.page.locator('[data-date="' + tomorrow + '"]').count():
            self.page.get_by_role('button', name='Sljedeći mjesec', exact=True).click()
        self.page.locator('[data-date="' + tomorrow + '"]').click()
        self.page.get_by_role('button', name='Nudim vožnju', exact=True).click()
        expect(self.page.get_by_role('button',name='Uredi vozilo',exact=True)).to_be_visible()
        self.page.get_by_role('button', name='Objavi vožnju', exact=True).click()
        self.dialog = self.page.get_by_role('dialog', name='Je li ovo ruta kojom stvarno voziš?')
        expect(self.dialog).to_be_visible()
        self.approval = self.dialog.locator('.stop-confirmation input')
        self.publish = self.dialog.get_by_role('button', name='Vozim ovom trasom — objavi', exact=True)
        self.names = self.dialog.get_by_role('textbox', name='Naziv mjesta susreta', exact=True)
        expect(self.names).to_have_count(0)
        expect(self.dialog.locator('.route-via-handle')).to_have_count(1)
        if shape_only:
            return self.previews[-1]
        self.dialog.get_by_role('button', name='Potvrdi trasu — odaberi mjesta susreta', exact=True).click()
        expect(self.approval).to_be_enabled()
        if with_meeting:
            self.updated(self.add_pin)
        return self.previews[-1]

    def updated(self, action):
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as response:
            action()
        self.assertTrue(response.value.ok, response.value.text())
        expect(self.approval).to_be_enabled()
        self.assertFalse(self.approval.is_checked())
        expect(self.publish).to_be_disabled()
        result = response.value.json()
        self.assertTrue(result['previewToken'])
        return response.value.request.post_data_json, result

    def assert_stats(self, result):
        values = self.dialog.locator('.route-planner-stats strong')
        km = math.floor(result['route']['distance'] / 100 + .5) / 10
        expect(values.nth(0)).to_have_text(f'{km:g} km')
        expect(values.nth(1)).to_have_text(f'{math.ceil(result["route"]["duration"] / 60)} min')

    def point_at(self, fraction):
        geometry = self.previews[-1]['result']['route']['coordinates']
        lengths = [math.hypot((b[0]-a[0])*math.cos(math.radians(a[1])),b[1]-a[1]) for a,b in zip(geometry,geometry[1:])]
        left = sum(lengths)*fraction
        for i,length in enumerate(lengths):
            if left <= length:
                a,b=geometry[i],geometry[i+1];f=left/length if length else 0
                return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]
            left-=length
        return geometry[-1]

    def click_along(self,pin,fraction,center=None):
        target=self.point_at(fraction);center=center or self.point_at(.5)
        scale=256*2**17
        def y(lat):
            phi=math.radians(lat)
            return (1-math.log(math.tan(phi)+1/math.cos(phi))/math.pi)/2*scale
        box=pin.locator('.street-pin-map').bounding_box()
        pin.locator('.street-pin-map').click(position={'x':box['width']/2+(target[0]-center[0])/360*scale,'y':box['height']/2+y(target[1])-y(center[1])})

    def add_pin(self):
        self.dialog.get_by_role('button', name='Dodaj mjesto susreta', exact=True).click()
        pin = self.page.get_by_role('dialog', name='Mjesto gdje možeš stati', exact=True)
        expect(pin.locator('canvas.maplibregl-canvas')).to_be_visible()
        if self.names.count():
            self.click_along(pin,.502)
        expect(pin.get_by_role('button', name='Koristi ovaj pin', exact=True)).to_be_enabled()
        pin.get_by_role('button', name='Koristi ovaj pin', exact=True).click()

    def test_initial_proposal_is_automatically_ready_without_manual_recalculation(self):
        latest = self.open_preview(with_meeting=False)
        expect(self.names).to_have_count(0)
        expect(self.dialog.get_by_role('button', name='Proračunaj trasu s ovim tačkama', exact=True)).to_have_count(0)
        self.page.wait_for_timeout(600)
        self.assertEqual(len(self.previews), 2, 'One proposal followed by one signed preview')
        self.assertTrue(latest['result']['previewToken'])
        self.assert_stats(latest['result'])
        self.approval.check()
        expect(self.publish).to_be_enabled()
        self.publish.click()
        expect(self.page.get_by_role('heading', name='Tvoja vožnja.', exact=True)).to_be_visible()
        self.assertEqual(self.publish_requests[0]['previewToken'], latest['result']['previewToken'])
        self.assertEqual(self.publish_requests[0]['meetingStops'], latest['result']['meetingStops'])

    def test_meeting_edits_keep_confirmed_geometry_and_reject_reverse_order(self):
        initial = self.open_preview()['result']
        self.approval.check()
        body, added = self.updated(self.add_pin)
        self.assertEqual(len(body['meetingStops']), 4)
        expect(self.names).to_have_count(2)
        self.assertEqual(initial['route']['coordinates'], added['route']['coordinates'])
        self.assert_stats(added)

        def move_pin():
            self.dialog.get_by_role('button', name='Provjeri ili pomjeri pin', exact=True).first.click()
            pin = self.page.get_by_role('dialog', name='Mjesto gdje možeš stati', exact=True)
            expect(pin.get_by_role('button', name='Koristi ovaj pin', exact=True)).to_be_enabled()
            stop=self.previews[-1]['body']['meetingStops'][1]
            self.click_along(pin,.499,center=[stop['lng'],stop['lat']])
            pin.get_by_role('button', name='Koristi ovaj pin', exact=True).click()

        self.approval.check()
        body, moved = self.updated(move_pin)
        self.assertEqual(added['route']['coordinates'], moved['route']['coordinates'])
        self.assertEqual(added['route']['distance'], moved['route']['distance'])
        self.assert_stats(moved)
        before = [(p['lat'], p['lng']) for p in body['meetingStops']]
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as bad:
            self.dialog.get_by_role('button', name='Pomjeri tačku dolje', exact=True).first.click()
        self.assertEqual(bad.value.status,400)
        expect(self.publish).to_be_disabled()
        body, reordered = self.updated(lambda:self.dialog.get_by_role('button', name='Pomjeri tačku gore', exact=True).last.click())
        self.assert_stats(reordered)
        body, removed = self.updated(lambda:self.dialog.get_by_role('button', name='Ukloni tačku', exact=True).first.click())
        self.assertEqual(len(body['meetingStops']), 3)
        expect(self.names).to_have_count(1)
        self.assert_stats(removed)

    def test_metadata_edits_debounce_and_require_fresh_approval_and_signed_token(self):
        first = self.open_preview()['result']
        self.approval.check()
        count = len(self.previews)

        def rename():
            self.names.fill('Kod')
            self.names.fill('Kod ulaza')
            self.names.fill('Kod ulaza na parking')
            expect(self.approval).not_to_be_checked()
            expect(self.approval).to_be_disabled()
            expect(self.publish).to_be_disabled()
            expect(self.dialog.get_by_role('status')).to_have_text(CALCULATING)
            self.publish.evaluate('button => button.click()')

        body, named = self.updated(rename)
        self.assertEqual(len(self.previews), count + 1, 'Rapid typing should trigger only the latest preview')
        self.assertEqual(body['meetingStops'][1]['name'], 'Kod ulaza na parking')
        self.assertNotEqual(named['previewToken'], first['previewToken'])
        expect(self.names).to_have_value('Kod ulaza na parking')
        self.assertEqual(self.publish_requests, [], 'An outdated draft must never publish')
        self.dialog.get_by_text('Prilaz i strana ulice (opcionalno)', exact=True).click()
        self.approval.check()
        body, approached = self.updated(lambda:self.dialog.get_by_role('textbox', name='Prilaz / kratka uputa', exact=True).fill('Sa bočne ulice'))
        self.assertEqual(body['meetingStops'][1]['approach'], 'Sa bočne ulice')
        self.assertNotEqual(approached['previewToken'], named['previewToken'])
        self.approval.check()
        self.publish.click()
        expect(self.page.get_by_role('heading', name='Tvoja vožnja.', exact=True)).to_be_visible()
        self.assertEqual(len(self.publish_requests), 1)
        self.assertEqual(self.publish_requests[0]['previewToken'], approached['previewToken'])
        self.assertEqual(self.publish_requests[0]['meetingStops'], approached['meetingStops'])

    def test_older_response_cannot_replace_newer_draft_route_token_or_approval(self):
        self.open_preview()
        held = []

        def delay_older(route):
            response = route.fetch()
            if route.request.post_data_json['meetingStops'][1]['name'] == 'Starija izmjena':
                held.append((route, response))
            else:
                route.fulfill(response=response)

        self.page.route('**/api/routes/preview', delay_older)
        self.names.fill('Starija izmjena')
        for _ in range(60):
            if held:
                break
            self.page.wait_for_timeout(50)
        self.assertEqual(len(held), 1, 'The older background request should be pending')
        expect(self.names).to_be_enabled()
        body, newest = self.updated(lambda:self.names.fill('Najnovija izmjena'))
        self.approval.check()
        route, response = held.pop()
        route.fulfill(response=response)
        self.page.wait_for_timeout(150)
        expect(self.names).to_have_value('Najnovija izmjena')
        expect(self.approval).to_be_checked()
        self.assert_stats(newest)
        self.publish.click()
        expect(self.page.get_by_role('heading', name='Tvoja vožnja.', exact=True)).to_be_visible()
        self.assertEqual(self.publish_requests[0]['previewToken'], newest['previewToken'])
        self.assertEqual(self.publish_requests[0]['meetingStops'], newest['meetingStops'])

    def test_close_during_calculation_keeps_draft_and_ignores_late_result(self):
        self.open_preview()
        held = []

        def hold_once(route):
            held.append((route, route.fetch()))
            self.page.unroute('**/api/routes/preview', hold_once)

        self.page.route('**/api/routes/preview', hold_once)
        self.names.fill('Sačuvani nacrt')
        for _ in range(60):
            if held:
                break
            self.page.wait_for_timeout(50)
        self.assertEqual(len(held), 1)
        self.dialog.get_by_role('button', name='Nazad na unos vožnje', exact=True).click()
        expect(self.dialog).to_have_count(0)
        self.page.get_by_role('button', name='Objavi vožnju', exact=True).click()
        expect(self.dialog).to_be_visible()
        self.dialog.get_by_role('button', name='Potvrdi trasu — odaberi mjesta susreta', exact=True).click()
        expect(self.names).to_have_value('Sačuvani nacrt')
        expect(self.approval).to_be_enabled()
        self.approval.check()
        route, response = held.pop()
        route.fulfill(response=response)
        self.page.wait_for_timeout(150)
        expect(self.approval).to_be_checked()
        expect(self.names).to_have_value('Sačuvani nacrt')
        self.assertEqual(self.publish_requests, [])

    def test_failed_background_preview_preserves_edits_and_offers_recovery_retry(self):
        self.open_preview()

        def fail_once(route):
            route.fulfill(status=503, json={'error':'Proračun trenutno nije dostupan.'})
            self.page.unroute('**/api/routes/preview', fail_once)

        self.page.route('**/api/routes/preview', fail_once)
        self.names.fill('Nacrt nakon greške')
        expect(self.dialog.get_by_text('Proračun trenutno nije dostupan.', exact=True)).to_be_visible()
        expect(self.names).to_have_value('Nacrt nakon greške')
        expect(self.approval).to_be_disabled()
        expect(self.publish).to_be_disabled()
        retry = self.dialog.get_by_role('button', name='Pokušaj ponovo', exact=True)
        expect(retry).to_be_visible()
        body, recovered = self.updated(retry.click)
        self.assertEqual(body['meetingStops'][1]['name'], 'Nacrt nakon greške')
        expect(retry).to_have_count(0)
        expect(self.dialog.get_by_text('Proračun trenutno nije dostupan.', exact=True)).to_have_count(0)
        expect(self.names).to_have_value('Nacrt nakon greške')
        self.assert_stats(recovered)

    def test_unmount_during_calculation_does_not_restore_old_planner(self):
        self.open_preview()
        held = []

        def hold(route):
            held.append((route, route.fetch()))

        self.page.route('**/api/routes/preview', hold)
        self.names.fill('Nacrt prije izlaska')
        for _ in range(60):
            if held:
                break
            self.page.wait_for_timeout(50)
        self.assertEqual(len(held), 1)
        self.page.evaluate("location.hash = 'profile'")
        expect(self.dialog).to_have_count(0)
        route, response = held.pop()
        route.fulfill(response=response)
        self.page.wait_for_timeout(150)
        expect(self.dialog).to_have_count(0)
        self.assertNotEqual(self.page.evaluate('getComputedStyle(document.body).overflow'), 'hidden')
        self.assertEqual(self.publish_requests, [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
