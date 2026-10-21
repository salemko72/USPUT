"""Driver request visuals against real bookings in an isolated local API.

The route provider and map tiles are synthetic. No production data is used.
Build the app before running this browser check.
"""

import base64
import json
import os
import socket
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright


APP = Path(__file__).resolve().parents[1]
RESULTS = Path('/tmp/usput-driver-request-results')
RESULTS.mkdir(exist_ok=True)

with tempfile.TemporaryDirectory(prefix='usput-driver-request-', dir='/tmp') as data:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with open(data + '/server.log', 'w+') as log:
        server = subprocess.Popen(
            ['node', 'tests/street-fixture-server.mjs'], cwd=APP,
            env={**os.environ, 'PORT': str(port), 'USPUT_DATA_DIR': data},
            stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            for _ in range(100):
                try:
                    urlopen(base + '/api/places', timeout=.2).close()
                    break
                except OSError:
                    time.sleep(.1)
            else:
                raise RuntimeError('Isolated driver status fixture did not start')

            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                errors = []

                def post(ctx, path, body=None):
                    response = ctx.request.post(base + '/api' + path,
                        headers={'Origin': base}, data=body if body is not None else {})
                    assert response.ok, response.text()
                    return response.json()

                def account(name, email):
                    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
                    post(ctx, '/auth/register', {
                        'name': name, 'email': email, 'password': 'fixture-password-123',
                        'city': 'Sarajevo', 'adult': True, 'terms': True,
                    })
                    page = ctx.new_page()
                    page.set_default_timeout(7000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('**/tile.openstreetmap.org/**', lambda route: route.fulfill(
                        content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef0e5"/></svg>'))
                    return ctx, page

                driver, d = account('Vozač sa dužim imenom i prezimenom', 'driver@example.test')
                passenger, page = account('Putnik', 'passenger@example.test')
                # The driver's private owner photo must not become a passenger avatar.
                d.goto(base + '/#profile')
                encoded = d.evaluate('''() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 400;
                    const context = canvas.getContext('2d');
                    context.fillStyle = '#c7d7a4'; context.fillRect(0, 0, 400, 400);
                    return canvas.toDataURL('image/png').split(',')[1];
                }''')
                d.get_by_label('Odaberi profilnu fotografiju', exact=True).set_input_files({
                    'name': 'private-owner.png', 'mimeType': 'image/png',
                    'buffer': base64.b64decode(encoded),
                })
                d.get_by_role('button', name='Sačuvaj fotografiju', exact=True).click()
                expect(d.locator('.profile-identity .avatar img')).to_have_count(1)
                date = (datetime.now(ZoneInfo('Europe/Sarajevo')).date() + timedelta(days=1)).isoformat()
                query = {'from': 'cengic', 'to': 'marijin', 'date': date, 'time': '07:30', 'walkMinutes': '5'}
                places = driver.request.get(base + '/api/places').json()['places']
                points = [next(p for p in places if p['id'] == id) for id in ['cengic', 'marijin']]

                def publish():
                    offer = {key: value for key, value in query.items() if key != 'walkMinutes'}
                    offer['car'] = 'Volkswagen Golf · crvena'
                    preview = post(driver, '/routes/preview', {**offer, 'meetingStops': points})
                    return post(driver, '/rides', {
                        **offer, 'meetingStops': preview['meetingStops'],
                        'previewToken': preview['previewToken'], 'stopsConfirmed': True,
                        'routeConfirmed': True,
                    })['ride']['id']

                def booking_for(ride_id):
                    bookings = passenger.request.get(base + '/api/my-rides').json()['bookings']
                    return next(b for b in bookings if b['ride']['id'] == ride_id)

                def open_ride(ride_id):
                    page.goto(base + '/#ride/' + ride_id + '?' + urlencode(query))
                    expect(page.locator('.driver-heading')).to_be_visible()

                def check_layout():
                    for width in [320, 390, 1440]:
                        page.set_viewport_size({'width': width, 'height': 844})
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
                        assert page.locator('.driver-heading').evaluate('(e) => e.scrollWidth <= e.clientWidth'), width
                    page.set_viewport_size({'width': 390, 'height': 844})

                def ring_style():
                    return page.locator('.driver-request-avatar').evaluate('''e => {
                        const ring = getComputedStyle(e, '::before');
                        return {animation: ring.animationName, border: ring.borderTopColor,
                            width: ring.borderTopWidth, content: ring.content};
                    }''')

                def no_request_visuals():
                    expect(page.locator('.request-sent-indicator, .request-accepted-indicator')).to_have_count(0)
                    expect(page.locator('.driver-request-avatar[data-request-state]')).to_have_count(0)

                ride_id = publish()
                page.clock.install()
                open_ride(ride_id)
                no_request_visuals()
                page.get_by_role('button', name='Pošalji zahtjev', exact=True).click()
                expect(page.get_by_role('heading', name='Zahtjev je poslan.', exact=True)).to_be_visible()
                expect(page.locator('.driver-request-avatar[data-request-state="pending"]')).to_be_visible()
                expect(page.locator('.driver-request-avatar img')).to_have_count(0)
                expect(page.locator('.demo-simulation')).to_have_count(0)
                expect(page.locator('.request-sent-caption')).to_have_text('Zahtjev je\nposlan')
                expect(page.get_by_role('status', name='Zahtjev poslan — čeka se odgovor vozača.')).to_be_visible()
                assert ring_style()['animation'] != 'none'
                assert page.locator('.request-sent-symbol').evaluate('(e) => getComputedStyle(e).backgroundColor') == 'rgb(21, 24, 21)'
                check_layout()
                page.screenshot(path=str(RESULTS / 'pending-mobile.png'), full_page=True)

                # Polling pending data cannot approve a request on its own.
                with page.expect_response(lambda r: r.url.endswith('/api/my-rides')):
                    page.clock.fast_forward(15001)
                expect(page.locator('.driver-request-avatar[data-request-state="pending"]')).to_be_visible()
                assert booking_for(ride_id)['status'] == 'pending'
                booking_id = booking_for(ride_id)['id']
                post(driver, '/bookings/' + booking_id + '/accept')
                # Keep the page open: the existing 15-second poll must show approval.
                with page.expect_response(lambda r: r.url.endswith('/api/my-rides')):
                    page.clock.fast_forward(15001)
                expect(page.locator('.driver-request-avatar[data-request-state="accepted"]')).to_be_visible()
                expect(page.locator('.request-sent-indicator')).to_have_count(0)
                expect(page.locator('.request-accepted-caption')).to_have_text('Zahtjev\nprihvaćen')
                expect(page.locator('.request-accepted-symbol svg.lucide-thumbs-up')).to_have_count(1)
                expect(page.get_by_role('status', name='Zahtjev prihvaćen — vozač je potvrdio vožnju.')).to_be_visible()
                assert ring_style()['border'] == 'rgb(215, 245, 106)'
                assert ring_style()['animation'] != 'none'
                assert page.locator('.request-accepted-symbol').evaluate('(e) => getComputedStyle(e).backgroundColor') == 'rgb(21, 24, 21)'
                check_layout()
                page.screenshot(path=str(RESULTS / 'accepted-mobile.png'), full_page=True)

                page.get_by_role('button', name='ENG', exact=True).click()
                expect(page.locator('.request-accepted-caption')).to_have_text('Request\naccepted')
                expect(page.get_by_role('status', name='Request accepted — the driver confirmed the ride.')).to_be_visible()
                page.emulate_media(reduced_motion='reduce')
                assert ring_style()['animation'] == 'none'
                assert ring_style()['width'] != '0px'
                assert ring_style()['content'] != 'none'
                page.screenshot(path=str(RESULTS / 'accepted-reduced-motion-en.png'), full_page=True)
                page.get_by_role('button', name='BHS', exact=True).click()
                # Ready is still accepted, and action() must reload its actual booking.
                page.get_by_role('button', name='Na mjestu sam', exact=True).click()
                expect(page.get_by_role('heading', name='Vozač zna da si tu.', exact=True)).to_be_visible()
                assert booking_for(ride_id)['status'] == 'ready'
                expect(page.locator('.request-accepted-caption')).to_have_text('Zahtjev\nprihvaćen')
                post(driver, '/bookings/' + booking_id + '/complete')
                page.reload()
                expect(page.get_by_role('heading', name='Lijep put. Hvala!', exact=True)).to_be_visible()
                no_request_visuals()

                for end_state, ctx, action in [('declined', driver, 'decline'), ('cancelled', passenger, 'cancel')]:
                    other_ride = publish()
                    booking = post(passenger, '/rides/' + other_ride + '/request', {'search': query})['booking']
                    open_ride(other_ride)
                    expect(page.locator('.request-sent-indicator')).to_be_visible()
                    assert ring_style()['animation'] == 'none'
                    assert ring_style()['width'] != '0px'
                    page.get_by_role('button', name='ENG', exact=True).click()
                    expect(page.locator('.request-sent-caption')).to_have_text('Request\nsent')
                    post(ctx, '/bookings/' + booking['id'] + '/' + action)
                    page.reload()
                    assert booking_for(other_ride)['status'] == end_state
                    expect(page.locator('.action-card')).to_contain_text('You have no confirmed ride.')
                    no_request_visuals()
                    page.get_by_role('button', name='BHS', exact=True).click()

                # Seed the requested synthetic drivers only in this disposable DB.
                # The manual control must call the real restricted API transition.
                seed_file = Path(data) / 'demo.sql'
                subprocess.run(['node', 'scripts/seed-demo-drivers.mjs', str(seed_file)],
                    cwd=APP, check=True, capture_output=True)
                with sqlite3.connect(Path(data) / 'usput.sqlite') as connection:
                    connection.executescript(seed_file.read_text())
                demo_ride_id = 'usput-demo-senad-' + date
                demo_response = passenger.request.get(base + '/api/rides/' + demo_ride_id)
                assert demo_response.ok, demo_response.text()
                demo_ride = demo_response.json()['ride']
                assert demo_ride['demo'] is True
                demo_query = {
                    'from': demo_ride['from']['id'], 'to': demo_ride['to']['id'],
                    'fromLocation': json.dumps(demo_ride['from']),
                    'toLocation': json.dumps(demo_ride['to']),
                    'date': date, 'time': '07:30', 'walkMinutes': '5',
                }
                found = passenger.request.get(base + '/api/rides?' + urlencode(demo_query))
                assert found.ok, found.text()
                assert any(offer['id'] == demo_ride_id for offer in found.json()['rides']), found.text()
                page.goto(base + '/#ride/' + demo_ride_id + '?' + urlencode(demo_query))
                page.get_by_role('button', name='Pošalji zahtjev', exact=True).click()
                expect(page.locator('.driver-request-avatar[data-request-state="pending"]')).to_be_visible()
                expect(page.locator('.demo-simulation')).to_contain_text('Samo demo vožnja — izmišljeni vozač.')
                assert booking_for(demo_ride_id)['status'] == 'pending'
                with page.expect_response(lambda r: r.url.endswith('/simulate-accept') and r.request.method == 'POST') as simulated:
                    page.get_by_role('button', name='Simuliraj prihvatanje', exact=True).click()
                assert simulated.value.ok, simulated.value.text()
                expect(page.locator('.driver-request-avatar[data-request-state="accepted"]')).to_be_visible()
                expect(page.locator('.request-accepted-symbol svg.lucide-thumbs-up')).to_have_count(1)
                expect(page.locator('.request-accepted-caption')).to_have_text('Zahtjev\nprihvaćen')
                expect(page.locator('.demo-simulation')).to_have_count(0)
                assert booking_for(demo_ride_id)['status'] == 'accepted'
                page.reload()
                expect(page.locator('.request-accepted-caption')).to_have_text('Zahtjev\nprihvaćen')
                page.screenshot(path=str(RESULTS / 'demo-manual-accepted.png'), full_page=True)

                # A driver never receives their passenger's status ring or tile.
                d.goto(base + '/#ride/' + ride_id)
                expect(d.get_by_role('heading', name='Lijep put. Hvala!', exact=True)).to_be_visible()
                expect(d.locator('.request-sent-indicator, .request-accepted-indicator')).to_have_count(0)
                expect(d.locator('.driver-request-avatar img')).to_have_count(1)
                assert not errors, errors
                browser.close()
                print('PASS: real pending/accepted/ready/completed/declined/cancelled bookings; demo-only manual acceptance persists; existing polling and action reload; BHS/ENG; reduced motion; 320/390/1440px; owner avatar stays private')
        finally:
            server.terminate()
            server.wait(timeout=10)
