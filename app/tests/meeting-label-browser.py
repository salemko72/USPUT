"""Coordinate-bound meeting addresses in real detail, stop list and Home views.

Disposable API/database and synthetic Nominatim/map fixtures. Builds only to /tmp.
"""
import os
import json
import socket
import subprocess
import tempfile
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright
from map_fixture import install_vector_map

APP = Path(__file__).resolve().parents[1]
RESULTS = Path('/tmp/usput-meeting-label-results')
RESULTS.mkdir(exist_ok=True)

with tempfile.TemporaryDirectory(prefix='usput-meeting-labels-', dir='/tmp') as data:
    assets = Path(data) / 'frontend'
    subprocess.run([str(APP / 'node_modules/.bin/vite'), 'build', '--outDir', str(assets)],
                   cwd=APP, check=True, capture_output=True)
    with socket.socket() as free:
        free.bind(('127.0.0.1', 0))
        port = free.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with open(data + '/server.log', 'w+') as log:
        server = subprocess.Popen(['node', 'tests/meeting-label-fixture-server.mjs'], cwd=APP,
            env={**os.environ, 'PORT': str(port), 'USPUT_DATA_DIR': data},
            stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                try:
                    urlopen(base + '/api/places', timeout=.2).close()
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Meeting label fixture did not start')
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                def serve(route):
                    path = urlsplit(route.request.url).path
                    file = assets / (path.lstrip('/') if path != '/' else 'index.html')
                    if not path.startswith('/api/') and file.is_file():
                        route.fulfill(path=str(file))
                    else:
                        route.continue_()
                def context():
                    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
                    ctx.route('**/*', serve)
                    install_vector_map(ctx)
                    ctx.add_cookies([{'name': 'usput_session', 'value': 'meeting-label-browser-session', 'url': base}])
                    return ctx
                ctx = context()
                baseline = ctx.request.get(base + '/api/my-rides').json()['bookings'][0]
                ride = baseline['ride']
                # Three deliberately distinct locations: the driver origin,
                # this passenger's origin, and the saved agreed meeting pin.
                passenger_origin = {'id': 'passenger-origin', 'lat': 43.8512, 'lng': 18.3831, 'name': 'Passenger origin street 3, Sarajevo', 'detail': ''}
                assert ride['from']['lat'] != passenger_origin['lat'] != baseline['match']['pickup']['lat']
                page = ctx.new_page()
                page.set_default_timeout(10000)
                errors, lookups = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: lookups.append(request.url) if '/api/places/label?' in request.url else None)
                passenger_query = urlencode({'from': '', 'to': '', 'date': ride['date'], 'time': ride['time'], 'fromLocation': json.dumps(passenger_origin)})
                page.goto(base + '/#ride/' + ride['id'] + '?' + passenger_query)
                summary = page.locator('.route-match-summary').first
                expect(summary).to_be_visible()
                # Regression: persisted Demo names must leave the main address.
                assert 'Demo —' not in summary.locator('strong').inner_text()
                expect(summary.locator('.meeting-point-address').first).to_have_text('Aleja lipa, Sarajevo')
                expect(summary.locator('.meeting-point-address').nth(1)).to_have_text('Obala Kulina bana, Sarajevo')
                expect(page.locator('.meeting-label .meeting-point-address')).to_have_text('Aleja lipa, Sarajevo')
                expect(page.locator('.meeting-label .meeting-point-demo')).to_be_visible()
                expect(page.locator('.meeting-label')).to_contain_text('nije provjerena')
                assert '99' not in summary.inner_text()
                page.locator('.published-meeting-stops summary').click()
                expect(page.locator('.published-meeting-stops .meeting-point-address').nth(1)).to_have_text('Druga ulica, Sarajevo')
                keys = [(parse_qs(urlsplit(url).query)['lat'][0], parse_qs(urlsplit(url).query)['lng'][0]) for url in lookups]
                assert Counter(keys)[('43.85107', '18.38276')] == 1, 'Concurrent summary, map and stop-list lookups must be deduplicated'
                assert ('43.85118', '18.38276') in keys, 'Nearby pins must not share a rounded-three-decimal lookup'
                assert not any(lat in ('43.84', '43.8512') for lat, lng in keys), 'Meeting labels must not resolve a driver or passenger origin instead'
                page.screenshot(path=str(RESULTS / 'detail-mobile.png'), full_page=True)
                page.goto(base + '/#home')
                home = page.locator('.upcoming-ride')
                expect(home.locator('.meeting-point-address')).to_have_text('Aleja lipa, Sarajevo')
                expect(home.get_by_role('button', name='Na mjestu sam', exact=True)).to_be_visible()
                assert home.locator('.meeting-point-demo').evaluate('el => getComputedStyle(el).display') == 'inline-block', 'The separate Demo badge must stay compact within the meeting address'
                assert len(lookups) == 3, 'Navigation should reuse the memory cache'
                assert ctx.request.get(base + '/api/my-rides').json()['bookings'][0]['match'] == baseline['match'], 'Labels must never rewrite the saved agreement or replace it with the geocoder centroid'
                storage = page.evaluate('Object.keys(localStorage)')
                assert not any('meeting' in key or 'address' in key for key in storage)
                page.set_viewport_size({'width': 320, 'height': 568})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.screenshot(path=str(RESULTS / 'home-small.png'), full_page=True)
                assert not errors, errors
                ctx.close()
                # A fresh client with an unavailable label provider keeps the
                # actual pin reference, never a demo name or another origin.
                failed = context()
                failed.route('**/api/places/label?*', lambda route: route.fulfill(status=503, json={'error': 'offline'}))
                fallback = failed.new_page()
                fallback.goto(base + '/#ride/' + ride['id'])
                expect(fallback.locator('.meeting-label .meeting-point-address')).to_contain_text('43.85107, 18.38276')
                assert 'Demo —' not in fallback.locator('.meeting-label strong').inner_text()
                assert 'Driver origin' not in fallback.locator('.meeting-label').inner_text()
                assert 'Passenger origin' not in fallback.locator('.meeting-label').inner_text()
                failed.close()
                browser.close()
                print('Meeting label browser checks passed: precise Latin streets, distinct nearby pins, deduplication, memory cache, demo separation, coordinates on failure, immutable accepted agreement, mobile layout.')
        finally:
            server.terminate()
            server.wait(timeout=10)
