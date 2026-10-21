"""Home readiness and passenger capacity against a disposable, real local API.

The route provider and map tiles are synthetic. Frontend assets are built into
the temporary directory and served by Playwright, leaving app/dist untouched.
"""

import json
import os
import socket
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright


APP = Path(__file__).resolve().parents[1]
RESULTS = Path('/tmp/usput-home-ready-capacity-results')
RESULTS.mkdir(exist_ok=True)


with tempfile.TemporaryDirectory(prefix='usput-home-ready-capacity-', dir='/tmp') as data:
    assets = Path(data) / 'frontend'
    subprocess.run([str(APP / 'node_modules/.bin/vite'), 'build', '--outDir', str(assets)],
        cwd=APP, check=True, capture_output=True, text=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
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
                raise RuntimeError('Disposable Home fixture failed to start')

            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                errors = []

                def post(ctx, path, body=None):
                    response = ctx.request.post(base + '/api' + path,
                        headers={'Origin': base}, data=body if body is not None else {})
                    assert response.ok, (path, response.text())
                    return response.json()

                def serve_frontend(route):
                    path = urlsplit(route.request.url).path
                    if path.startswith('/api/'):
                        route.continue_()
                    elif 'tile.openstreetmap.org' in route.request.url:
                        route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef0e5"/></svg>')
                    else:
                        file = assets / path.lstrip('/') if path != '/' else assets / 'index.html'
                        if file.is_file():
                            route.fulfill(path=str(file))
                        else:
                            route.continue_()

                def account(name, email):
                    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
                    ctx.route('**/*', serve_frontend)
                    result = post(ctx, '/auth/register', {'name': name, 'email': email,
                        'password': 'fixture-password-123', 'city': 'Sarajevo',
                        'adult': True, 'terms': True})
                    page = ctx.new_page()
                    page.set_default_timeout(7000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.add_locator_handler(page.locator('.notification-popup'),
                        lambda: page.locator('.notification-popup-close').click())
                    return ctx, page, result['user']

                driver, d, driver_user = account('Vozač za jutarnji put', 'driver@example.test')
                passenger, page, passenger_user = account('Putnik', 'passenger@example.test')
                other, other_page, _ = account('Drugi putnik', 'other@example.test')
                today = datetime.now(ZoneInfo('Europe/Sarajevo')).date()
                date = (today + timedelta(days=1)).isoformat()
                query = {'from': 'cengic', 'to': 'marijin', 'date': date,
                    'time': '07:30', 'walkMinutes': '5'}
                places = driver.request.get(base + '/api/places').json()['places']
                points = [next(p for p in places if p['id'] == id) for id in ['cengic', 'marijin']]

                def publish(time='07:30', seats=3):
                    offer = {key: value for key, value in query.items() if key != 'walkMinutes'}
                    offer.update({'time': time, 'car': 'Volkswagen Golf · crvena', 'seats': seats})
                    preview = post(driver, '/routes/preview', {**offer, 'meetingStops': points})
                    return post(driver, '/rides', {**offer,
                        'meetingStops': preview['meetingStops'],
                        'previewToken': preview['previewToken'], 'stopsConfirmed': True,
                        'routeConfirmed': True})['ride']

                def request(ctx, ride, accepted=False):
                    search = {**query, 'time': ride['time']}
                    booking = post(ctx, '/rides/' + ride['id'] + '/request', {'search': search})['booking']
                    if accepted:
                        post(driver, '/bookings/' + booking['id'] + '/accept')
                    return booking

                def refresh_home(page):
                    with page.expect_response(lambda r: r.url.endswith('/api/my-rides')) as refreshed:
                        page.evaluate("window.dispatchEvent(new Event('usput:booking-changed'))")
                    refreshed.value.json()
                    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')

                # A pending request is not a confirmed pickup on Home.
                ride = publish()
                booking = request(passenger, ride)
                post(passenger, '/saved-searches', {'query': {
                    key: value for key, value in query.items() if key != 'date'}})
                page.clock.install()
                with page.expect_response(lambda r: r.url.endswith('/api/my-rides')) as loaded:
                    page.goto(base + '/#home')
                loaded.value.json()
                expect(page.locator('.saved-searches')).to_be_visible()
                expect(page.locator('.saved-search-card')).to_have_count(1)
                expect(page.locator('.upcoming-ride')).to_have_count(0)

                # Keep an open search and its selected date intact while ready is sent.
                chosen_date = (today + timedelta(days=2)).isoformat()
                page.locator('.date-picker-trigger').first.click()
                page.locator('[data-date="' + chosen_date + '"]').click()
                page.locator('.saved-search-load').click()
                page.get_by_label('Najviše minuta hodanja', exact=True).select_option('10')
                selected_date = page.locator('.date-picker-trigger').first.inner_text()
                post(driver, '/bookings/' + booking['id'] + '/accept')
                refresh_home(page)
                card = page.locator('.upcoming-ride')
                expect(card).to_be_visible()
                expect(card).to_contain_text('Vozač za jutarnji put')
                mine = passenger.request.get(base + '/api/my-rides').json()['bookings']
                agreed = next(b for b in mine if b['id'] == booking['id'])['match']
                expect(card).to_contain_text(agreed['pickup']['name'])
                pickup_time = datetime.fromtimestamp(agreed['pickupAt'] / 1000,
                    ZoneInfo('Europe/Sarajevo')).strftime('%H:%M')
                expect(card).to_contain_text(pickup_time)
                assert card.get_by_role('link', name='Pogledaj vožnju', exact=True).get_attribute('href') == '#ride/' + ride['id']
                original_url = page.url

                # Delay one real request to inspect busy state, then make the API reject
                # a stale agreement. The passenger can see the error and retry in place.
                with sqlite3.connect(Path(data) / 'usput.sqlite') as db:
                    db.execute("UPDATE bookings SET status='pending' WHERE id=?", (booking['id'],))
                held = []
                ready_path = '**/api/bookings/' + booking['id'] + '/ready'
                page.route(ready_path, lambda route: held.append(route))
                card.get_by_role('button', name='Na mjestu sam', exact=True).click()
                expect(card).to_have_attribute('aria-busy', 'true')
                expect(card.locator('.button')).to_be_disabled()
                assert len(held) == 1
                with page.expect_response(lambda r: r.url.endswith('/bookings/' + booking['id'] + '/ready')) as rejected:
                    held[0].continue_()
                assert rejected.value.status == 409
                page.unroute(ready_path)
                expect(card.get_by_role('alert')).to_contain_text('Spremnost se može potvrditi samo za dogovorenu vožnju.')
                expect(card.get_by_role('button', name='Na mjestu sam', exact=True)).to_be_enabled()
                with sqlite3.connect(Path(data) / 'usput.sqlite') as db:
                    db.execute("UPDATE bookings SET status='accepted' WHERE id=?", (booking['id'],))
                with page.expect_response(lambda r: r.url.endswith('/bookings/' + booking['id'] + '/ready') and r.request.method == 'POST') as ready:
                    card.get_by_role('button', name='Na mjestu sam', exact=True).click()
                assert ready.value.ok, ready.value.text()
                expect(card).to_contain_text('Vozač zna da si tu.')
                expect(card.get_by_role('button', name='Na mjestu sam', exact=True)).to_have_count(0)
                assert page.url == original_url
                expect(page.locator('.date-picker-trigger').first).to_have_text(selected_date)
                expect(page.get_by_label('Najviše minuta hodanja', exact=True)).to_have_value('10')
                expect(page.get_by_role('textbox', name='Polazište', exact=True)).to_have_value(points[0]['name'])
                page.get_by_role('button', name='Sačuvane pretrage', exact=True).click()
                expect(page.locator('.saved-search-card')).to_have_count(1)
                expect(page.locator('.date-picker-trigger').first).to_have_text(selected_date)
                actual = next(b for b in passenger.request.get(base + '/api/my-rides').json()['bookings'] if b['id'] == booking['id'])
                assert actual['status'] == 'ready'
                assert actual['match'] == agreed
                for width in [320, 390, 1440]:
                    page.set_viewport_size({'width': width, 'height': 900})
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
                page.set_viewport_size({'width': 390, 'height': 844})
                page.screenshot(path=str(RESULTS / 'home-ready-mobile.png'), full_page=True)
                page.get_by_role('button', name='ENG', exact=True).click()
                expect(card).to_contain_text("The driver knows you're here.")
                expect(card.get_by_role('link', name='View ride', exact=True)).to_be_visible()
                page.get_by_role('button', name='BHS', exact=True).click()

                # Ready is retained after refresh. A driver's passenger requests stay out.
                page.reload()
                expect(page.locator('.upcoming-ride')).to_contain_text('Vozač zna da si tu.')
                with d.expect_response(lambda r: r.url.endswith('/api/my-rides')) as loaded:
                    d.goto(base + '/#home')
                loaded.value.json()
                expect(d.locator('.saved-searches')).to_be_visible()
                expect(d.locator('.upcoming-ride')).to_have_count(0)

                # Select by the immutable pickup time, not API insertion order.
                later_ride = publish('08:00')
                later_booking = request(passenger, later_ride, accepted=True)
                refresh_home(page)
                expect(page.locator('.upcoming-ride a')).to_have_attribute('href', '#ride/' + ride['id'])
                post(driver, '/bookings/' + booking['id'] + '/complete')
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                expect(page.locator('.upcoming-ride a')).to_have_attribute('href', '#ride/' + later_ride['id'])
                post(passenger, '/bookings/' + later_booking['id'] + '/cancel')
                with page.expect_response(lambda r: r.url.endswith('/api/my-rides')):
                    page.clock.fast_forward(15001)
                expect(page.locator('.upcoming-ride')).to_have_count(0)

                past_ride = publish('07:00')
                past_booking = request(passenger, past_ride, accepted=True)
                # Advancing only this disposable DB verifies stale accepted data is hidden.
                with sqlite3.connect(Path(data) / 'usput.sqlite') as db:
                    db.execute('UPDATE rides SET departure=? WHERE id=?', (1, past_ride['id']))
                    db.execute('UPDATE booking_routes SET match_json=json_set(match_json,\'$.pickupAt\',1) WHERE booking_id=?', (past_booking['id'],))
                refresh_home(page)
                expect(page.locator('.upcoming-ride')).to_have_count(0)
                declined_ride = publish('09:00')
                declined_booking = request(passenger, declined_ride)
                post(driver, '/bookings/' + declined_booking['id'] + '/decline')
                refresh_home(page)
                expect(page.locator('.upcoming-ride')).to_have_count(0)

                # Publishing exposes 1..7 passenger seats and sends a number in its POST.
                post(driver, '/vehicle', {'makeId': 'other', 'make': 'Volkswagen',
                    'model': 'Golf', 'color': 'crvena', 'manualModel': True})
                d.reload()
                d.get_by_role('button', name='Nudim vožnju', exact=True).click()
                seats = d.get_by_label('Slobodna mjesta za putnike', exact=True)
                expect(seats).to_have_value('1')
                assert seats.locator('option').evaluate_all('(nodes) => nodes.map(n => n.value)') == [str(i) for i in range(1, 8)]
                d.get_by_role('button', name='ENG', exact=True).click()
                expect(d.get_by_label('Available passenger seats', exact=True)).to_have_value('1')
                d.get_by_role('button', name='BHS', exact=True).click()
                seats.select_option('3')
                assert seats.evaluate('(e) => parseFloat(getComputedStyle(e).fontSize)') >= 16

                def choose(page, label, text):
                    page.get_by_role('textbox', name=label, exact=True).fill(text)
                    page.get_by_role('button', name='Pretraži adresu — ' + label, exact=True).click()
                    page.locator('.street-results button').first.click()
                    page.get_by_role('dialog', name='Potvrdi približnu lokaciju').get_by_role('button', name='Potvrdi ovaj pin', exact=True).click()

                choose(d, 'Polazište', 'Marijin Dvor 10, Sarajevo')
                choose(d, 'Odredište', 'Nedzarici 20, Sarajevo')
                d.locator('textarea[name=note]').fill('Jutarnja vožnja uz muziku')
                d.locator('input[name=costSharing]').check()
                d.get_by_role('button', name='Objavi vožnju', exact=True).click()
                dialog = d.get_by_role('dialog', name='Je li ovo ruta kojom stvarno voziš?')
                with d.expect_response(lambda r: r.url.endswith('/api/routes/preview')) as recalculated:
                    dialog.get_by_role('button', name='Proračunaj trasu s ovim tačkama', exact=True).click()
                assert recalculated.value.ok, recalculated.value.text()
                dialog.locator('.stop-confirmation input').check()
                with d.expect_response(lambda r: r.url.endswith('/api/rides') and r.request.method == 'POST') as published:
                    dialog.get_by_role('button', name='Vozim ovom trasom — objavi', exact=True).click()
                assert published.value.ok, published.value.text()
                payload = published.value.request.post_data_json
                assert payload['seats'] == 3 and isinstance(payload['seats'], int), payload
                offer = published.value.json()['ride']
                assert offer['seats'] == 3 and offer['seatsAvailable'] == 3, offer
                assert all(stop['name'].strip() for stop in offer['meetingStops'])
                expect(d.locator('.ride-facts')).to_contain_text('3 od 3 mjesta slobodno')

                # Search and details render actual remaining seats after one acceptance.
                remaining_ride = publish('10:00', seats=3)
                first = request(passenger, remaining_ride, accepted=True)
                search = {**query, 'time': remaining_ride['time']}
                found = other.request.get(base + '/api/rides?' + urlencode(search))
                assert found.ok, found.text()
                remaining = next(r for r in found.json()['rides'] if r['id'] == remaining_ride['id'])
                assert remaining['seatsAvailable'] == 2
                post(other, '/saved-searches', {'query': {key: value for key, value in search.items() if key != 'date'}})
                other_page.goto(base + '/#home')
                other_page.locator('.saved-search-load').click()
                other_page.get_by_role('button', name='Pronađi vožnju', exact=True).click()
                result = other_page.locator('.ride-card').filter(has_text='2 slobodna mjesta')
                expect(result).to_have_count(1)
                other_page.get_by_role('button', name='ENG', exact=True).click()
                expect(result).to_have_count(0)
                result = other_page.locator('.ride-card').filter(has_text='2 seats available')
                expect(result).to_have_count(1)
                other_page.get_by_role('button', name='BHS', exact=True).click()
                other_page.locator('.ride-card').filter(has_text='2 slobodna mjesta').get_by_role('button', name='Pogledaj vožnju', exact=True).click()
                expect(other_page.locator('.ride-facts')).to_contain_text('2 od 3 mjesta slobodno')
                other_page.get_by_role('button', name='Pošalji zahtjev', exact=True).click()
                second = next(b for b in other.request.get(base + '/api/my-rides').json()['bookings'] if b['ride']['id'] == remaining_ride['id'])
                post(driver, '/bookings/' + second['id'] + '/accept')
                other_page.evaluate("window.dispatchEvent(new Event('usput:booking-changed'))")
                expect(other_page.locator('.driver-request-avatar[data-request-state="accepted"]')).to_be_visible()
                post(driver, '/bookings/' + first['id'] + '/complete')
                d.goto(base + '/#ride/' + remaining_ride['id'])
                expect(d.locator('.driver-actions')).to_contain_text('Drugi putnik')
                expect(d.get_by_role('button', name='Završi vožnju', exact=True)).to_have_count(1)
                expect(d.get_by_role('heading', name='Tvoja vožnja.', exact=True)).to_be_visible()

                # A completed offer remains history and starts a separate future draft.
                repeated_search = {**query, 'from': offer['from']['id'], 'to': offer['to']['id'],
                    'fromLocation': json.dumps(offer['from']), 'toLocation': json.dumps(offer['to']),
                    'date': offer['date'], 'time': offer['time']}
                old_booking = post(passenger, '/rides/' + offer['id'] + '/request', {'search': repeated_search})['booking']
                post(driver, '/bookings/' + old_booking['id'] + '/accept')
                post(driver, '/bookings/' + old_booking['id'] + '/complete')
                yesterday = (today - timedelta(days=1)).isoformat()
                with sqlite3.connect(Path(data) / 'usput.sqlite') as db:
                    db.execute('UPDATE rides SET date=?,departure=1 WHERE id=?', (yesterday, offer['id']))
                original = next(r for r in driver.request.get(base + '/api/my-rides').json()['rides'] if r['id'] == offer['id'])
                old_agreement = next(b for b in passenger.request.get(base + '/api/my-rides').json()['bookings'] if b['id'] == old_booking['id'])
                post(driver, '/vehicle', {'makeId': 'other', 'make': 'Volkswagen',
                    'model': 'Polo', 'color': 'plava', 'manualModel': True})
                d.goto(base + '/#trips')
                d.locator('.trips-toolbar .role-switch button').nth(1).click()
                history = d.locator('.trip-card').filter(has=d.locator('.status-completed')).filter(has_text=original['from']['name'])
                expect(history.locator('.status-completed')).to_be_visible()
                expect(history).to_contain_text('.'.join(reversed(yesterday.split('-'))))
                for width in [320, 390, 1440]:
                    d.set_viewport_size({'width': width, 'height': 900})
                    assert d.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
                d.set_viewport_size({'width': 390, 'height': 844})
                d.screenshot(path=str(RESULTS / 'completed-driver-history.png'), full_page=True)
                d.get_by_role('button', name='ENG', exact=True).click()
                expect(history.get_by_role('button', name='Offer this ride again', exact=True)).to_be_visible()
                d.get_by_role('button', name='BHS', exact=True).click()
                history.get_by_role('button', name='Ponovi vožnju', exact=True).click()
                expect(d.get_by_label('Slobodna mjesta za putnike', exact=True)).to_have_value('3')
                expect(d.locator('textarea[name=note]')).to_have_value(original['note'])
                expect(d.locator('input[name=costSharing]')).to_be_checked()
                expect(d.locator('.date-picker-trigger').first).to_contain_text('Sutra')
                expect(d.get_by_role('textbox', name='Polazište', exact=True)).to_have_value(original['from']['name'])
                expect(d.get_by_role('textbox', name='Odredište', exact=True)).to_have_value(original['to']['name'])
                expect(d.locator('.saved-vehicle')).to_contain_text('Polo')
                d.screenshot(path=str(RESULTS / 'repeat-future-driver-draft.png'), full_page=True)
                before_count = len(driver.request.get(base + '/api/my-rides').json()['rides'])
                with d.expect_response(lambda r: r.url.endswith('/api/routes/preview')) as repeat_preview:
                    d.get_by_role('button', name='Objavi vožnju', exact=True).click()
                assert repeat_preview.value.ok, repeat_preview.value.text()
                preview_body = repeat_preview.value.request.post_data_json
                assert [(p['lat'], p['lng']) for p in preview_body['meetingStops']] == [(p['lat'], p['lng']) for p in original['meetingStops']]
                assert len(driver.request.get(base + '/api/my-rides').json()['rides']) == before_count
                repeat_dialog = d.get_by_role('dialog', name='Je li ovo ruta kojom stvarno voziš?')
                repeat_confirm = repeat_dialog.get_by_role('button', name='Vozim ovom trasom — objavi', exact=True)
                expect(repeat_confirm).to_be_disabled()
                repeat_dialog.locator('.stop-confirmation input').check()
                with d.expect_response(lambda r: r.url.endswith('/api/rides') and r.request.method == 'POST') as repeated:
                    repeat_confirm.click()
                assert repeated.value.ok, repeated.value.text()
                new_offer = repeated.value.json()['ride']
                assert new_offer['id'] != original['id']
                assert new_offer['status'] == 'open' and new_offer['date'] == date
                assert new_offer['seats'] == original['seats'] == 3
                assert new_offer['note'] == original['note'] and new_offer['costSharing'] == original['costSharing']
                assert new_offer['from'] == original['from'] and new_offer['to'] == original['to']
                assert 'Polo' in new_offer['car']
                assert [(p['lat'], p['lng']) for p in new_offer['meetingStops']] == [(p['lat'], p['lng']) for p in original['meetingStops']]
                assert [p['name'] for p in new_offer['meetingStops']] == [p['name'] for p in original['meetingStops']]
                remaining_history = next(r for r in driver.request.get(base + '/api/my-rides').json()['rides'] if r['id'] == original['id'])
                assert remaining_history == original
                retained_agreement = next(b for b in passenger.request.get(base + '/api/my-rides').json()['bookings'] if b['id'] == old_booking['id'])
                assert retained_agreement == old_agreement
                assert not errors, errors
                browser.close()
                print('PASS: real API Home readiness with busy/error retry, immutable pickup, no navigation, preserved saved cards/date, active passenger exclusions, event/focus/poll refresh; BHS/ENG and 320/390/1440px; numeric 1..7 passenger seats, unnamed-pin publish, remaining seats and individual completion; completed history repeats into a new future offer with ordered stops/current vehicle and unchanged old ride/bookings')
        finally:
            server.terminate()
            server.wait(timeout=10)
