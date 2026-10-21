"""European calendar regression. Run with CALENDAR_URL pointing at local app."""
import os,re,time
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
    for width in (390,1280):
        page=browser.new_page(viewport={'width':width,'height':900},locale='en-US')
        base=os.environ.get('CALENDAR_URL','http://127.0.0.1:8788')
        response=page.request.post(base+'/api/auth/register',data={'name':'Calendar Test','email':f'calendar-{time.time_ns()}@example.test','password':'testna-lozinka-123','city':'Sarajevo','adult':True,'terms':True},headers={'Origin':base})
        assert response.ok,response.text()
        page.goto(base)
        page.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click()
        trigger=page.get_by_role('button',name=re.compile('Datum polaska:'))
        expect(trigger).to_have_text('Danas')
        trigger.click(position={'x':8,'y':12})
        calendar=page.get_by_role('dialog',name='Odaberi datum polaska')
        expect(calendar).to_be_visible()
        current=page.evaluate("new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Sarajevo'}).format(new Date())")
        calendar.get_by_role('button',name='.'.join(reversed(current.split('-'))),exact=True).click()
        expect(trigger).to_have_text('Danas')
        trigger.click()
        assert calendar.locator('.calendar-weekdays span').all_text_contents()==['Pon','Uto','Sri','Čet','Pet','Sub','Ned']
        assert calendar.locator('button[aria-pressed="true"]').count()==1
        assert calendar.locator('.calendar-grid button:disabled').count()==int(current.split('-')[2])-1
        page.get_by_role('button',name='Sljedeći mjesec').click()
        choice=calendar.locator('.calendar-grid button:not(:disabled)').first
        selected=choice.get_attribute('aria-label');choice.click()
        expect(calendar).not_to_be_visible();expect(trigger).to_contain_text(selected)
        assert re.fullmatch(r'\d{2}\.\d{2}\.\d{4}',selected)
        trigger.click();page.keyboard.press('ArrowRight');page.keyboard.press('Escape')
        expect(calendar).not_to_be_visible();expect(trigger).to_be_focused()
        page.locator('.time-picker > button').click(position={'x':8,'y':12})
        expect(page.get_by_role('dialog',name='Odaberi vrijeme polaska')).to_be_visible()
        hours=page.get_by_label('Sat polaska');assert hours.locator('option').all_text_contents()==[f'{i:02d}' for i in range(24)]
        hours.select_option('23');page.get_by_label('Minuta polaska').select_option('45')
        page.get_by_role('button',name='Potvrdi vrijeme').click()
        expect(page.locator('.time-picker > button')).to_contain_text('23:45')
        page.close()
    browser.close()
print('PASS: mobile/desktop full-chip activation, Monday-first calendar, dd.MM.yyyy, past dates disabled, month navigation, selection, keyboard/Escape/focus, time picker activation')
