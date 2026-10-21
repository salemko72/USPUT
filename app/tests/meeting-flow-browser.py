"""Isolated synthetic-provider integration: no real journeys or public test accounts."""
import base64, json, os, socket, sqlite3, subprocess, tempfile, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

app = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='usput-meeting-flow-', dir='/tmp') as data:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with open(data+'/server.log', 'w+') as log:
        server = subprocess.Popen(['node', 'tests/street-fixture-server.mjs'], cwd=app,
            env={**os.environ, 'PORT': str(port), 'USPUT_DATA_DIR': data,
                 'ADMIN_EMAILS': 'fixture-editor@example.test'}, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                try: urlopen(base+'/api/places', timeout=.2).close(); break
                except OSError: time.sleep(.1)
            else: raise RuntimeError('Fixture failed to start')
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium')
                errors = []
                def new(name, email=None):
                    ctx = browser.new_context(viewport={'width':390,'height':844})
                    page = ctx.new_page(); page.set_default_timeout(20000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    response = ctx.request.post(base+'/api/auth/register', headers={'Origin':base}, data={
                        'name':name,'email':email or name.lower()+'@example.test',
                        'password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True})
                    assert response.ok, response.text()
                    page.route('**/tile.openstreetmap.org/**', lambda r:r.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef0e5"/><path d="M0 128H256M128 0V256" stroke="#fff" stroke-width="14"/></svg>'))
                    return ctx, page
                editor, e = new('Editor','fixture-editor@example.test')
                # Test fixture links only its synthetic editor account. This is never used in production.
                with sqlite3.connect(data+'/usput.sqlite') as db:
                    db.execute('UPDATE users SET google_id=? WHERE email=?', ('fixture-google-id','fixture-editor@example.test'))
                for name,lat,lng in [('Fixture parking A',43.8553,18.4056),('Fixture parking B',43.8401,18.3445)]:
                    r = editor.request.post(base+'/api/admin/meeting-points', headers={'Origin':base}, data={
                        'name':name,'city':'Sarajevo','lat':lat,'lng':lng,
                        'approach':'Fixture entrance','side':'parking','availability':'active'})
                    assert r.ok, r.text()
                def choose(page, label, text):
                    page.get_by_role('textbox', name=label, exact=True).fill(text)
                    page.get_by_role('button', name='Pretraži adresu — '+label, exact=True).click()
                    page.locator('.street-results button').first.click()
                    dialog = page.get_by_role('dialog',name='Potvrdi približnu lokaciju')
                    expect(dialog).to_be_visible()
                    dialog.get_by_role('button',name='Potvrdi ovaj pin',exact=True).click()
                driver, d = new('Driver')
                r = driver.request.post(base+'/api/vehicle', headers={'Origin':base}, data={
                    'makeId':'other','make':'Volkswagen','model':'Golf 5','color':'crvena','manualModel':True})
                assert r.ok, r.text()
                d.goto(base); d.get_by_role('button', name='Nudim vožnju',exact=True).click()
                choose(d,'Polazište','Safvet-bega Bašagića 1, Sarajevo')
                choose(d,'Odredište','Butmirska cesta 30, Ilidža')
                d.locator('input[name=costSharing]').check()
                d.get_by_role('button',name='Objavi vožnju',exact=True).click()
                dialog = d.get_by_role('dialog',name='Je li ovo ruta kojom stvarno voziš?')
                expect(dialog).to_be_visible()
                publish = dialog.get_by_role('button',name='Vozim ovom trasom — objavi',exact=True)
                expect(publish).to_be_disabled()
                # Remove generic suggestions. Add the reviewed catalogue suggestions instead.
                while dialog.locator('.meeting-editor ol > li').count() > 2:
                    dialog.locator('.meeting-editor ol > li').nth(1).get_by_role('button',name='Ukloni tačku').click()
                dialog.get_by_role('button',name='Fixture parking A Fixture entrance · parking',exact=True).click()
                dialog.get_by_role('button',name='Fixture parking B Fixture entrance · parking',exact=True).click()
                dialog.get_by_role('button',name='Proračunaj trasu s ovim tačkama',exact=True).click()
                checkbox = dialog.locator('.stop-confirmation input')
                expect(checkbox).to_be_enabled(); checkbox.check(); publish.click()
                expect(d.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
                driver_url = d.url
                passenger, s = new('Passenger'); s.goto(base)
                s.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click()
                choose(s,'Polazište','Marijin Dvor 10, Sarajevo'); choose(s,'Odredište','Nedzarici 20, Sarajevo')
                s.get_by_label('Najviše minuta hodanja',exact=True).select_option('5')
                # New search starts today; select the driver's offered date via the European calendar.
                offer = driver.request.get(base+'/api/my-rides').json()['rides'][0]
                s.locator('.date-picker-trigger').first.click()
                s.locator('[data-date="'+offer['date']+'"]').click()
                s.get_by_role('button',name='Pronađi vožnju',exact=True).click()
                expect(s.get_by_role('button',name='Pogledaj vožnju')).to_have_count(1)
                expect(s.locator('.cost-sharing-yes')).to_have_text('DA')
                s.get_by_role('button',name='Pogledaj vožnju').click()
                expect(s.locator('.route-match-summary').first).to_contain_text('Fixture parking A')
                expect(s.locator('.cost-sharing-yes')).to_have_text('DA')
                s.get_by_role('button',name='ENG',exact=True).click()
                expect(s.locator('.cost-sharing-yes')).to_have_text('YES')
                s.get_by_role('button',name='BHS',exact=True).click()
                s.get_by_role('button',name='Pošalji zahtjev',exact=True).click()
                expect(s.get_by_role('heading',name='Zahtjev je poslan.',exact=True)).to_be_visible()
                expect(s.locator('.request-sent-caption')).to_have_text('Zahtjev je\nposlan')
                d.reload(); d.get_by_role('button',name='Prihvati',exact=True).click()
                s.reload(); expect(s.get_by_role('heading',name='Dogovoreno.',exact=True)).to_be_visible()
                d.get_by_role('button',name='Završi vožnju',exact=True).click()
                s.reload(); expect(s.get_by_role('heading',name='Lijep put. Hvala!',exact=True)).to_be_visible()
                feedback = s.locator('.meeting-point-feedback')
                feedback.get_by_role('button',name='Dobro mjesto',exact=True).first.click()
                expect(feedback.get_by_text('Ocjena je sačuvana. Možeš je promijeniti.',exact=True)).to_be_visible()
                # Recognition photo reuses its private compressed blob for profile/header.
                s.goto(base+'/#profile')
                encoded=s.evaluate("""() => {const c=document.createElement('canvas');c.width=c.height=400;const x=c.getContext('2d');x.fillStyle='#c7d7a4';x.fillRect(0,0,400,400);return c.toDataURL('image/png').split(',')[1]}""")
                s.get_by_label('Odaberi profilnu fotografiju',exact=True).set_input_files({'name':'fixture.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
                s.get_by_role('button',name='Sačuvaj fotografiju',exact=True).click()
                expect(s.locator('.profile-identity .avatar img')).to_have_count(1)
                expect(s.locator('.header-profile .avatar img')).to_have_count(1)
                s.reload(); expect(s.locator('.header-profile .avatar img')).to_have_count(1)
                assert len(passenger.request.get(base+'/api/photos/me').json()['avatar']) > 0
                # Private saved route loads with today's date and removes through the circular X.
                s.goto(base+'/#home'); expect(s.locator('.saved-search-card')).to_have_count(1)
                columns = s.locator('.saved-searches-grid').evaluate('(e)=>getComputedStyle(e).gridTemplateColumns')
                assert len(columns.split()) == 2, columns
                s.locator('.saved-search-load').click(); expect(s.locator('.date-picker-trigger').first).to_contain_text('Danas')
                s.get_by_role('button',name='Sačuvane pretrage',exact=True).click()
                s.locator('.saved-search-remove').click(); expect(s.locator('.saved-search-card')).to_have_count(0)
                for page in [d,s]: assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                s.get_by_role('button',name='ENG',exact=True).click()
                expect(s.get_by_role('heading',name='Your everyday journey',exact=True)).to_be_visible()
                assert not errors, errors
                Path('/tmp/usput-meeting-flow-results').mkdir(exist_ok=True)
                s.screenshot(path='/tmp/usput-meeting-flow-results/saved-searches.png',full_page=True)
                d.screenshot(path='/tmp/usput-meeting-flow-results/driver-completed.png',full_page=True)
                browser.close()
                print('PASS: confirmed catalogue stops, route recalculation, walking search, request/accept/complete, feedback, private saved cards/load today/delete, two mobile columns and English')
        finally:
            server.terminate(); server.wait(timeout=10)
