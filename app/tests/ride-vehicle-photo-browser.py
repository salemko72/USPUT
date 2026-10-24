"""Vehicle recognition on real ride cards, detail and Home with private local photos.

Uses a disposable API/database/storage and synthetic image/map/routing fixtures.
Does not access production users or photos.
"""
import io
import os
import socket
import subprocess
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from PIL import Image
from playwright.sync_api import expect, sync_playwright
from map_fixture import install_vector_map

APP = Path(__file__).resolve().parents[1]
RESULTS = Path('/tmp/usput-ride-vehicle-photo-results')
RESULTS.mkdir(exist_ok=True)

with tempfile.TemporaryDirectory(prefix='usput-vehicle-thumbs-', dir='/tmp') as data:
    assets = Path(data) / 'frontend'
    subprocess.run([str(APP / 'node_modules/.bin/vite'), 'build', '--outDir', str(assets)],
                   cwd=APP, check=True, capture_output=True)
    with socket.socket() as free:
        free.bind(('127.0.0.1', 0))
        port = free.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with open(data + '/server.log', 'w+') as log:
        server = subprocess.Popen(['node', 'tests/street-fixture-server.mjs'], cwd=APP,
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
                raise RuntimeError('Photo fixture did not start')
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                def serve(route):
                    path = urlsplit(route.request.url).path
                    file = assets / (path.lstrip('/') if path != '/' else 'index.html')
                    if not path.startswith('/api/') and file.is_file():
                        route.fulfill(path=str(file))
                    else:
                        route.continue_()
                def account(name):
                    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
                    ctx.route('**/*', serve)
                    install_vector_map(ctx)
                    response = ctx.request.post(base + '/api/auth/register', headers={'Origin': base}, data={
                        'name': name, 'email': name.lower() + '@example.test', 'city': 'Sarajevo',
                        'password': 'fixture-password-123', 'adult': True, 'terms': True})
                    assert response.ok, response.text()
                    return ctx
                def post(ctx, path, body=None):
                    response = ctx.request.post(base + '/api' + path,
                        headers={'Origin': base}, data=body or {})
                    assert response.ok, (path, response.text())
                    return response.json()
                driver, passenger = account('Driver'), account('Passenger')
                vehicle = post(driver, '/vehicle', {'makeId': 'other', 'make': 'Volkswagen',
                    'model': 'Golf 5', 'color': 'crvena', 'manualModel': True})['vehicle']
                image = io.BytesIO()
                Image.new('RGB', (800, 600), '#b92b36').save(image, format='WEBP')
                uploaded = driver.request.post(base + '/api/photos/vehicle',
                    headers={'Origin': base, 'Content-Type': 'image/webp'}, data=image.getvalue())
                assert uploaded.ok, uploaded.text()
                photo_url = uploaded.json()['photo']['url']
                tomorrow = (datetime.now(ZoneInfo('Europe/Sarajevo')).date() + timedelta(days=1)).isoformat()
                points = driver.request.get(base + '/api/places').json()['places']
                stops = [next(p for p in points if p['id'] == id) for id in ['cengic', 'marijin']]
                offer = {'from': 'cengic', 'to': 'marijin', 'date': tomorrow, 'time': '07:30',
                         'car': 'Volkswagen Golf 5 · Crvena', 'vehicleId': vehicle['id'], 'seats': 1}
                preview = post(driver, '/routes/preview', {**offer, 'meetingStops': stops})
                ride = post(driver, '/rides', {**offer, 'meetingStops': preview['meetingStops'],
                    'previewToken': preview['previewToken'], 'routeConfirmed': True, 'stopsConfirmed': True})['ride']
                booking = post(passenger, '/rides/' + ride['id'] + '/request', {'search': {
                    'from': 'cengic', 'to': 'marijin', 'date': tomorrow, 'time': '07:30', 'walkMinutes': '5'}})['booking']
                page = passenger.new_page()
                page.set_default_timeout(7000)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_locator_handler(page.locator('.notification-popup'),
                    lambda: page.locator('.notification-popup-close').click())
                # Pending bookings have no private photo preview or image request.
                requested_images = []
                page.on('request', lambda r: requested_images.append(r.url) if photo_url in r.url else None)
                page.goto(base + '/#trips')
                expect(page.locator('.trip-card')).to_have_count(1)
                expect(page.get_by_role('button', name='Povećaj fotografiju automobila', exact=True)).to_have_count(0)
                expect(page.locator(".trip-card-top .ride-vehicle-thumb img")).to_have_attribute("src", photo_url)
                post(driver, '/bookings/' + booking['id'] + '/accept')
                page.reload()
                card = page.locator('.trip-card')
                thumb = card.locator('.trip-card-top .ride-vehicle-thumb')
                expect(thumb).to_be_visible()
                expect(thumb.locator('img')).to_have_attribute('src',photo_url)
                expect(thumb.locator('img')).to_have_js_property('complete',True)
                assert thumb.locator('img').evaluate('el=>el.naturalWidth')>0
                assert page.locator('button button').count()==0
                page.screenshot(path=str(RESULTS / 'trips-mobile.png'), full_page=True)
                page.set_viewport_size({'width': 1440, 'height': 900})
                page.screenshot(path=str(RESULTS / 'trips-desktop.png'), full_page=True)
                # The main card still opens the ride, separate from the photo action.
                card.locator('.trip-card-main-action').click()
                expect(page).to_have_url(base + '/#ride/' + ride['id'])
                detail = page.locator('.driver-card')
                detail_thumb = detail.get_by_role('button', name='Povećaj fotografiju automobila', exact=True)
                expect(detail_thumb).to_be_visible()
                detail_thumb.click()
                expect(page.get_by_role('dialog', name='Za lakši susret.', exact=True)).to_be_visible()
                page.keyboard.press('Escape')
                # Home keeps the urgent ready action next to the recognizable car.
                page.goto(base + '/#home')
                home = page.locator('.upcoming-ride')
                expect(home.get_by_role('button', name='Na mjestu sam', exact=True)).to_be_visible()
                home_thumb = home.get_by_role('button', name='Povećaj fotografiju automobila', exact=True)
                expect(home_thumb).to_be_visible()
                expect(home).to_contain_text('Volkswagen Golf 5')
                page.set_viewport_size({'width': 320, 'height': 568})
                expect(home.get_by_role('button', name='Na mjestu sam', exact=True)).to_be_in_viewport()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.screenshot(path=str(RESULTS / 'home-small.png'), full_page=True)
                # Removal/broken private images fall back without a broken image/zoom.
                post(driver, '/photos/vehicle/remove')
                page.goto(base + '/#trips')
                expect(page.locator('.trip-card')).to_have_count(1)
                expect(page.get_by_role('button', name='Povećaj fotografiju automobila', exact=True)).to_have_count(0)
                expect(page.locator('.trip-card img')).to_have_count(0)
                expect(page.locator('.trip-card')).to_contain_text('Golf 5')
                assert passenger.request.get(base + photo_url).status == 404
                # A new photo is usable, then cancellation closes an already open preview.
                replacement = driver.request.post(base + '/api/photos/vehicle',
                    headers={'Origin': base, 'Content-Type': 'image/webp'}, data=image.getvalue())
                assert replacement.ok, replacement.text()
                replacement_url = replacement.json()['photo']['url']
                page.reload()
                thumb=page.locator('.trip-card-top .ride-vehicle-thumb')
                expect(thumb.locator('img')).to_have_attribute('src', replacement_url)
                assert passenger.request.get(base + replacement_url).status == 200
                thumb.click()
                page.locator('.driver-card').get_by_role('button',name='Povećaj fotografiju automobila',exact=True).click()
                expect(page.get_by_role('dialog', name='Za lakši susret.', exact=True)).to_be_visible()
                post(passenger, '/bookings/' + booking['id'] + '/cancel')
                page.evaluate("window.dispatchEvent(new Event('usput:booking-changed'))")
                expect(page.get_by_role('dialog', name='Za lakši susret.', exact=True)).to_have_count(0)
                expect(page.locator('.trip-card img')).to_have_count(0)
                assert passenger.request.get(base + replacement_url).status == 200
                assert not errors, errors
                browser.close()
                print('PASS: private vehicle photo on trips/detail/Home; tap-to-enlarge without navigation; pending/removal fallback, ready action, mobile/desktop and no nested buttons')
        finally:
            server.terminate()
            server.wait(timeout=10)
