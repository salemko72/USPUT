"""Notification UI and real service-worker checks with disposable HTTP fixtures.

Vite serves the actual components and worker. Only the account/inbox/push API and
browser push subscription are fixtures; no push provider or production is used.
The worker runs in Chromium, with showNotification captured instead of OS UI.
"""

import base64
from datetime import datetime, timedelta
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.parse import unquote
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from playwright.sync_api import expect, sync_playwright


APP = Path(__file__).resolve().parents[1]
KEY = base64.urlsafe_b64encode(bytes([4]) + bytes(range(64))).decode().rstrip('=')
EVENT = {'id': 'notice-alice', 'bookingId': 'booking-alice', 'rideId': 'ride-alice',
         'type': 'booking-accepted', 'createdAt': '2026-10-21T10:00:00Z',
         'driverName': 'Senad', 'date': '2099-10-22', 'time': '07:30'}
HARNESS = """
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { setLanguage } from '/src/i18n.ts';
import '/src/styles.css';
import '/src/driver-request-status.css';
const files = import.meta.glob('/src/Notifications.tsx', { eager: true });
const Notifications = files['/src/Notifications.tsx']?.Notifications || (({children}) => children);
const Settings = files['/src/Notifications.tsx']?.NotificationSettings || (() => null);
function Fixture() {
  const [userId, setUserId] = useState('alice');
  window.switchNotificationUser = id => flushSync(() => setUserId(id));
  window.changeNotificationLanguage = setLanguage;
  window.bookingChanges = 0;
  return userId ? <Notifications key={userId} userId={userId}>
    <div className="app-shell"><main style={{padding: 24, width: '100%'}}>
      <h1>Current page</h1><input aria-label="Unfinished form" defaultValue="Keep this draft" />
      <button onClick={() => location.hash = 'profile'}>Change page</button>
      <Settings />
      <span className="request-accepted-symbol"><svg><path d="M1 1h2"/></svg></span>
    </main></div>
  </Notifications> : <h1>Signed out</h1>;
}
window.addEventListener('usput:booking-changed', () => window.bookingChanges++);
window.authChanges = 0;
window.addEventListener('usput:auth-changed', () => window.authChanges++);
createRoot(document.getElementById('root')).render(<Fixture />);
"""
MOCK_PUSH = """
window.permissionRequests = 0;
window.mockPermission = 'default';
Object.defineProperty(Notification, 'permission', {get: () => window.mockPermission});
Notification.requestPermission = async () => {
  window.permissionRequests++;
  if (window.delayPermission) return new Promise(resolve => {
    window.resolveFixturePermission = () => resolve(window.mockPermission = 'granted');
  });
  return window.mockPermission = 'granted';
};
window.fixtureSubscription = null;
PushManager.prototype.getSubscription = async () => window.fixtureSubscription;
PushManager.prototype.subscribe = async function(options) {
  window.fixtureSubscription = {
    endpoint: 'https://push.example.test/device', expirationTime: null, options,
    toJSON() { return {endpoint: this.endpoint, expirationTime: null,
      keys: {p256dh: 'fixture-public-key', auth: 'fixture-auth'}}; },
    async unsubscribe() {
      if (window.failUnsubscribe) return false;
      window.fixtureSubscription = null; return true;
    }
  };
  return window.fixtureSubscription;
};
"""


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


class Inbox:
    def __init__(self):
        self.events = []
        self.seen = set()
        self.claims = []
        self.bindings = []
        self.unsubscribed = []
        self.detail_status = 200
        self.user_id = 'alice'
        self.lock = threading.Lock()
        self.delay = False
        self.waiting = threading.Event()
        self.release = threading.Event()
        self.delay_seen = False
        self.seen_waiting = threading.Event()
        self.release_seen = threading.Event()


state = Inbox()
vite_port, port = free_port(), free_port()
base = f'http://127.0.0.1:{port}'


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_json(self, status, value):
        if status == 200:
            value = {**value, 'userId': value.get('userId', state.user_id)}
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def do_GET(self):
        if self.path == '/api/notifications':
            with state.lock:
                events = [e for e in state.events if e['id'] not in state.seen]
                owner = state.user_id
            if state.delay:
                state.waiting.set()
                state.release.wait(timeout=10)
            return self.send_json(200, {'notifications': events, 'userId': owner})
        if self.path.startswith('/api/notifications/'):
            event_id = unquote(self.path.split('/')[-1])
            event = next((e for e in state.events if e['id'] == event_id), None)
            if event_id == EVENT['id']:
                event = EVENT
            status = state.detail_status if event else 404
            return self.send_json(status,
                {'notification': event} if status == 200 else {'error': 'Not found'})
        if self.path == '/api/push/config':
            return self.send_json(200, {'enabled': True, 'publicKey': KEY})
        try:
            response = urlopen(f'http://127.0.0.1:{vite_port}' + self.path)
        except HTTPError as error:
            response = error
        body = response.read()
        self.send_response(response.status)
        self.send_header('Content-Type', response.headers.get('Content-Type', 'text/plain'))
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
        if self.path.endswith('/seen'):
            event_id = self.path.split('/')[-2]
            owner = state.user_id
            with state.lock:
                claimed = event_id not in state.seen
                state.claims.append(event_id)
                state.seen.add(event_id)
            if state.delay_seen:
                state.seen_waiting.set()
                state.release_seen.wait(timeout=10)
            return self.send_json(200, {'claimed': claimed, 'userId': owner})
        if self.path == '/api/push/subscribe':
            state.bindings.append(data)
            return self.send_json(200, {'ok': True})
        if self.path == '/api/push/unsubscribe':
            state.unsubscribed.append(data)
            return self.send_json(200, {'ok': True})
        self.send_json(404, {'error': 'Not found'})


with tempfile.TemporaryDirectory(prefix='notification-', dir=APP / 'tests') as directory:
    fixture = Path(directory)
    (fixture / 'index.html').write_text('<div id="root"></div><script type="module" src="./harness.tsx"></script>')
    (fixture / 'harness.tsx').write_text(HARNESS)
    server = ThreadingHTTPServer(('127.0.0.1', port), FixtureHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryFile(mode='w+') as log:
        vite = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
            '--port', str(vite_port), '--strictPort'], cwd=APP, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                try:
                    urlopen(f'http://127.0.0.1:{vite_port}', timeout=.2).close()
                    break
                except OSError:
                    time.sleep(.1)
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                context = browser.new_context(viewport={'width': 390, 'height': 844})
                context.add_init_script(MOCK_PUSH)
                page = context.new_page()
                page.set_default_timeout(6000)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '/' + str(fixture.relative_to(APP)) + '/index.html')
                page.get_by_label('Unfinished form').fill('A draft that must survive')
                state.events = [EVENT]
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                popup = page.get_by_role('dialog', name='Vaš zahtjev je prihvaćen')
                expect(popup).to_be_visible()
                expect(popup).to_contain_text('Senad')
                assert state.claims == ['notice-alice']
                assert page.evaluate('window.bookingChanges') == 1
                for width in [320, 390, 1440]:
                    page.set_viewport_size({'width': width, 'height': 844})
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
                    assert popup.evaluate('e => e.scrollWidth <= e.clientWidth'), width
                assert popup.locator('.notification-thumb svg').evaluate('e => getComputedStyle(e).animationName') != 'none'
                page.emulate_media(reduced_motion='reduce')
                assert popup.locator('.notification-thumb svg').evaluate('e => getComputedStyle(e).animationName') == 'none'
                page.keyboard.press('Escape')
                expect(popup).to_have_count(0)
                expect(page.get_by_label('Unfinished form')).to_have_value('A draft that must survive')
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                page.wait_for_timeout(150)
                assert state.claims == ['notice-alice']
                assert page.evaluate('window.permissionRequests') == 0

                page.get_by_role('button', name='Obavijesti', exact=False).click()
                settings = page.get_by_role('dialog', name='Obavijesti')
                expect(settings).to_contain_text('i kada je aplikacija zatvorena')
                page.evaluate('window.delayPermission = true')
                settings.get_by_role('button', name='Uključi obavijesti', exact=True).click()
                page.evaluate("window.changeNotificationLanguage('en'); window.resolveFixturePermission()")
                expect(page.get_by_role('dialog', name='Notifications')).to_contain_text('Notifications are on')
                page.evaluate("window.changeNotificationLanguage('bhs')")
                expect(settings).to_contain_text('Obavijesti su uključene')
                assert page.evaluate('window.permissionRequests') == 1
                for _ in range(50):
                    if state.bindings and state.bindings[-1]['language'] == 'bhs':
                        break
                    page.wait_for_timeout(50)
                assert state.bindings[-1]['language'] == 'bhs'
                page.evaluate("window.changeNotificationLanguage('en')")
                expect(page.get_by_role('dialog', name='Notifications')).to_contain_text('Notifications are on')
                page.wait_for_function("document.documentElement.lang === 'en'")
                for _ in range(50):
                    if state.bindings[-1]['language'] == 'en':
                        break
                    page.wait_for_timeout(50)
                assert state.bindings[-1]['language'] == 'en'
                page.evaluate('window.failUnsubscribe = true')
                binding_count = len(state.bindings)
                page.get_by_role('button', name='Turn off notifications', exact=True).click()
                expect(page.get_by_role('dialog', name='Notifications')).to_contain_text('Notification check failed')
                page.wait_for_timeout(100)
                assert len(state.bindings) == binding_count, 'A failed disable must not re-enable the device'
                page.evaluate('window.failUnsubscribe = false')
                page.get_by_role('button', name='Try again', exact=True).click()
                expect(page.get_by_role('dialog', name='Notifications')).to_contain_text('Notifications are on')
                page.get_by_role('button', name='Turn off notifications', exact=True).click()
                expect(page.get_by_role('dialog', name='Notifications')).to_contain_text('Notifications are off')
                assert state.unsubscribed[-1]['endpoint'] == 'https://push.example.test/device'
                assert page.evaluate('window.fixtureSubscription') is None
                page.get_by_role('button', name='Close', exact=True).click()

                # A late response belonging to the old account cannot display after switching.
                state.events = [{**EVENT, 'id': 'late-alice'}]
                state.delay = True
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                assert state.waiting.wait(timeout=3)
                state.events = []
                state.delay = False
                state.user_id = 'bob'
                page.evaluate("window.switchNotificationUser('bob')")
                state.release.set()
                page.wait_for_timeout(250)
                expect(page.locator('.notification-popup')).to_have_count(0)
                assert 'late-alice' not in state.claims

                # Hidden pages leave the durable event unseen until they become visible.
                page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true, get:()=>true})")
                state.events = [{**EVENT, 'id': 'hidden-bob'}]
                page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
                page.wait_for_timeout(150)
                assert 'hidden-bob' not in state.claims
                page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true, get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))")
                expect(page.get_by_role('dialog', name='Your request has been accepted')).to_be_visible()
                page.get_by_role('button', name='View ride', exact=True).click()
                assert page.evaluate('location.hash') == '#ride/ride-alice'
                state.events = []

                # A claim may finish after the tab becomes hidden. Cancelling or
                # departing before resume must invalidate the queued acceptance.
                state.events = [{**EVENT, 'id': 'cancelled-while-hidden'}]
                state.delay_seen = True
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                assert state.seen_waiting.wait(timeout=3)
                page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true, get:()=>true})")
                state.events = []
                state.delay_seen = False
                state.release_seen.set()
                page.wait_for_timeout(100)
                page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true, get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))")
                page.wait_for_timeout(200)
                expect(page.locator('.notification-popup')).to_have_count(0)

                # Two tabs may poll together; the atomic server claim shows only one popup.
                state.user_id = 'alice'
                page.evaluate("window.switchNotificationUser('alice')")
                other = context.new_page()
                other.goto(base + '/' + str(fixture.relative_to(APP)) + '/index.html')
                expect(other.get_by_label('Unfinished form')).to_be_visible()
                state.events = [{**EVENT, 'id': 'two-tabs'}]
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                other.evaluate("window.dispatchEvent(new Event('focus'))")
                page.wait_for_timeout(250)
                assert page.locator('.notification-popup').count() + other.locator('.notification-popup').count() == 1
                if page.locator('.notification-popup').count():
                    page.keyboard.press('Escape')
                else:
                    other.keyboard.press('Escape')
                state.events = []
                other.close()

                # Another tab can replace the shared session cookie without a
                # React prop change. The response owner must prevent this tab
                # from claiming or showing the replacement account's event.
                state.user_id = 'carol'
                state.events = [{**EVENT, 'id': 'new-shared-cookie-owner'}]
                auth_changes = page.evaluate('window.authChanges')
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                page.wait_for_timeout(200)
                expect(page.locator('.notification-popup')).to_have_count(0)
                assert 'new-shared-cookie-owner' not in state.claims
                assert page.evaluate('window.authChanges') > auth_changes
                state.events = []
                state.user_id = 'alice'
                page.evaluate("window.switchNotificationUser(null); window.switchNotificationUser('alice')")

                # Permission denied is explanatory and never triggers another permission request.
                page.evaluate("window.mockPermission='denied'; window.dispatchEvent(new Event('focus'))")
                page.get_by_role('button', name='Notifications', exact=False).click()
                expect(page.get_by_role('dialog', name='Notifications')).to_contain_text('browser settings')
                assert page.evaluate('window.permissionRequests') == 1
                page.get_by_role('button', name='Close', exact=True).click()

                # iOS Safari must show installation guidance before requesting permission.
                ios = browser.new_context(user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Version/16.4 Mobile/15E148 Safari/604.1')
                ios.add_init_script(MOCK_PUSH)
                ip = ios.new_page()
                ip.goto(base + '/' + str(fixture.relative_to(APP)) + '/index.html')
                ip.get_by_role('button', name='Obavijesti', exact=False).click()
                expect(ip.get_by_role('dialog', name='Obavijesti')).to_contain_text('Dodaj na početni ekran')
                assert ip.evaluate('window.permissionRequests') == 0
                ios.close()

                # Worker-specific behavior is exercised below once the actual worker is active.
                page.evaluate('navigator.serviceWorker.ready')
                worker = context.service_workers[0]
                worker.evaluate("() => { self.__shown=[]; self.registration.showNotification=async(title,options)=>self.__shown.push({title,options}); }")
                session = context.new_cdp_session(page)
                registrations = []
                session.on('ServiceWorker.workerRegistrationUpdated', lambda e: registrations.extend(e['registrations']))
                session.send('ServiceWorker.enable')
                for _ in range(50):
                    if any(r['scopeURL'] == base + '/' for r in registrations):
                        break
                    page.wait_for_timeout(50)
                registration = next(r for r in registrations if r['scopeURL'] == base + '/')

                def push(title='Vaš zahtjev je prihvaćen'):
                    session.send('ServiceWorker.deliverPushMessage', {'origin': base,
                        'registrationId': registration['registrationId'], 'data': json.dumps({
                            'id': EVENT['id'], 'type': 'booking-accepted',
                            'title': title, 'body': 'PRIVATE ADDRESS MUST BE IGNORED',
                            'url': 'https://evil.example/steal'})})

                push()
                for _ in range(50):
                    if worker.evaluate('self.__shown.length'):
                        break
                    page.wait_for_timeout(50)
                shown = worker.evaluate('self.__shown')
                assert len(shown) == 1, shown
                assert shown[0]['options']['tag'].endswith(EVENT['id'])
                assert shown[0]['options']['renotify'] is False
                assert 'PRIVATE' not in json.dumps(shown)
                assert 'evil.example' not in json.dumps(shown)
                for status in [401, 404]:
                    state.detail_status = status
                    push()
                    page.wait_for_timeout(150)
                    assert worker.evaluate('self.__shown.length') == 1
                state.detail_status = 200

                # The app has no open window; the installed worker still handles
                # a real Chromium push event and performs its authenticated GET.
                page.goto('about:blank')
                push()
                for _ in range(50):
                    if worker.evaluate('self.__shown.length') == 2:
                        break
                    page.wait_for_timeout(50)
                assert worker.evaluate('self.__shown.length') == 2
                assert worker.evaluate('self.__shown[0].options.tag === self.__shown[1].options.tag')
                push(title='Your request was accepted')
                for _ in range(50):
                    if worker.evaluate('self.__shown.length') == 3:
                        break
                    page.wait_for_timeout(50)
                assert worker.evaluate('self.__shown[2].title') == 'Your request has been accepted'

                # Browser APIs for focus/open need a trusted OS user gesture.
                # Capture them while dispatching the real worker click listener;
                # the HTTP ownership check and safe URL construction stay real.
                click = """async ({existing}) => {
                    const calls = [];
                    self.clients.matchAll = async () => existing ? [
                      {url: 'https://evil.example/', navigate: async () => { throw Error('External client used'); }},
                      {url: self.location.origin + '/#profile', navigate: async url => {
                        calls.push({navigate:url}); return {focus:async()=>calls.push({focus:true})};
                      }}] : [];
                    self.clients.openWindow = async url => calls.push({open:url});
                    let finished;
                    const event = new Event('notificationclick');
                    event.notification = {data: {id:'notice-alice', rideId:'forged-ride',
                      url:'https://evil.example/steal'}, close:()=>calls.push({close:true})};
                    event.waitUntil = promise => { finished=promise; };
                    self.dispatchEvent(event);
                    await finished;
                    return calls;
                }"""
                calls = worker.evaluate(click, {'existing': False})
                assert calls == [{'close': True}, {'open': base + '/#ride/ride-alice'}], calls
                calls = worker.evaluate(click, {'existing': True})
                assert calls == [{'close': True}, {'navigate': base + '/#ride/ride-alice'}, {'focus': True}], calls
                for status in [401, 404]:
                    state.detail_status = status
                    assert worker.evaluate(click, {'existing': False}) == [{'close': True}]
                assert not errors, errors
                browser.close()
                print('PASS: visible claims, persistent form, idempotence, two-tab dedup, identity race, hidden page, BHS/ENG, reduced motion, 320/390/1440px, explicit permission including locale switch while pending, subscribe/unsubscribe, iOS installation; real Chromium service-worker push with no app window, 401/404 privacy checks, revalidated safe click target. OS display, focus/open gestures and provider delivery are fixtures.')
        finally:
            vite.terminate()
            vite.wait(timeout=10)
            server.shutdown()


if '--real-api' in sys.argv:
    # Optional built-app integration. The default fixture checks above work
    # directly through Vite and never race another task's shared dist build.
    with tempfile.TemporaryDirectory(prefix='notification-api-', dir='/tmp') as data:
        api_port = free_port()
        api_base = f'http://127.0.0.1:{api_port}'
        with tempfile.TemporaryFile(mode='w+') as log:
            actual = subprocess.Popen(['node', 'tests/street-fixture-server.mjs'], cwd=APP,
                env={**os.environ, 'PORT': str(api_port), 'USPUT_DATA_DIR': data},
                stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(100):
                    try:
                        urlopen(api_base + '/api/places', timeout=.2).close()
                        break
                    except OSError:
                        time.sleep(.1)
                else:
                    log.seek(0)
                    raise RuntimeError(log.read())

                with sync_playwright() as pw:
                    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                    driver = browser.new_context()
                    passenger = browser.new_context(viewport={'width': 390, 'height': 844})

                    def post(ctx, path, body=None):
                        response = ctx.request.post(api_base + '/api' + path,
                            headers={'Origin': api_base}, data=body if body is not None else {})
                        assert response.ok, response.text()
                        return response.json()

                    for ctx, name, email in [(driver, 'Senad Fixture', 'driver@example.test'),
                                              (passenger, 'Passenger Fixture', 'passenger@example.test')]:
                        post(ctx, '/auth/register', {'name': name, 'email': email,
                            'password': 'fixture-password-123', 'city': 'Sarajevo',
                            'adult': True, 'terms': True})
                    date = (datetime.now(ZoneInfo('Europe/Sarajevo')).date() + timedelta(days=1)).isoformat()
                    offer = {'from': 'cengic', 'to': 'marijin', 'date': date,
                             'time': '07:30', 'car': 'Volkswagen Golf · crvena'}
                    places = driver.request.get(api_base + '/api/places').json()['places']
                    stops = [next(p for p in places if p['id'] == id) for id in ['cengic', 'marijin']]
                    preview = post(driver, '/routes/preview', {**offer, 'meetingStops': stops})
                    ride = post(driver, '/rides', {**offer, 'meetingStops': preview['meetingStops'],
                        'previewToken': preview['previewToken'], 'stopsConfirmed': True,
                        'routeConfirmed': True})['ride']
                    booking = post(passenger, '/rides/' + ride['id'] + '/request', {'search':{**offer,'walkMinutes':'5'}})['booking']
                    page = passenger.new_page()
                    page.set_default_timeout(8000)
                    page.goto(api_base + '/#profile')
                    expect(page.locator('.profile-card')).to_be_visible()
                    name_input = page.locator('.profile-card input[autocomplete="given-name"]')
                    name_input.fill('This profile edit is not saved')
                    post(driver, '/bookings/' + booking['id'] + '/accept')
                    popup = page.get_by_role('dialog', name='Vaš zahtjev je prihvaćen')
                    expect(popup).to_be_visible(timeout=8000)
                    expect(popup).to_contain_text('Senad Fixture')
                    assert page.evaluate('location.hash') == '#profile'
                    popup.get_by_role('button', name='Zatvori', exact=True).click()
                    expect(name_input).to_have_value('This profile edit is not saved')
                    assert passenger.request.get(api_base + '/api/notifications').json()['notifications'] == []
                    page.reload()
                    expect(page.locator('.profile-card')).to_be_visible()
                    page.evaluate("window.dispatchEvent(new Event('focus'))")
                    page.wait_for_timeout(200)
                    expect(page.locator('.notification-popup')).to_have_count(0)
                    browser.close()
                    print('PASS: built app + real isolated API acceptance popup on Profile, durable seen claim, profile draft preserved, reload does not repeat.')
            finally:
                actual.terminate()
                actual.wait(timeout=10)
