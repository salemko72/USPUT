"""Duplicate UI and no-show reporting with disposable real API/database."""
import importlib.util
from pathlib import Path
import unittest
import subprocess
import json
import uuid
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class Corrections(h.AutoRoutePreview):
    def test_duplicate_links_to_existing_offer(self):
        self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
        expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
        ride=self.publish_requests[0]
        mine=self.ctx.request.get(self.base+'/api/my-rides').json();existing=mine['rides'][0]['id']
        self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
        expect(self.dialog.get_by_role('alert')).to_contain_text('Ponuda sa tom satnicom')
        link=self.dialog.get_by_role('link',name='Pogledaj postojeću vožnju',exact=True)
        expect(link).to_have_attribute('href','#ride/'+existing)
        self.assertEqual(len(self.ctx.request.get(self.base+'/api/my-rides').json()['rides']),1)
        link.click();expect(self.page).to_have_url(self.base+'/#ride/'+existing)
    def test_no_show_report_is_visible_on_both_accounts(self):
        self.open_preview(with_meeting=False);self.approval.check();self.publish.click()
        expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
        mine=self.ctx.request.get(self.base+'/api/my-rides').json();ride=mine['rides'][0]
        passenger=self.browser.new_context()
        try:
            r=passenger.request.post(self.base+'/api/auth/register',headers={'Origin':self.base},data={'name':'Passenger','email':uuid.uuid4().hex+'@example.test','password':'fixture-password-123','city':'Sarajevo','adult':True,'terms':True});self.assertTrue(r.ok,r.text())
            user=r.json()['user'];booking=uuid.uuid4().hex
            sql="INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES(?,?,?,'accepted',?);"
            script="import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.prepare(process.argv[2]).run(...JSON.parse(process.argv[3]));db.prepare('UPDATE rides SET departure=? WHERE id=?').run(Date.now()-11*60000,process.argv[4]);db.close();"
            subprocess.run(['node','--input-type=module','-e',script,self.data.name+'/usput.sqlite',sql,json.dumps([booking,ride['id'],user['id'],1]),ride['id']],check=True,capture_output=True)
            self.page.goto(self.base+'/#ride/'+ride['id'])
            self.page.reload()
            self.page.get_by_role('button',name='Putnik se nije pojavio',exact=True).click()
            modal=self.page.get_by_role('dialog',name='Putnik se nije pojavio',exact=True)
            modal.get_by_role('button',name='Potvrdi prijavu nedolaska',exact=True).click()
            expect(modal).to_have_count(0)
            expect(self.page.get_by_text('Prijavljeno: putnik se nije pojavio',exact=True)).to_be_visible()
            mine=passenger.request.get(self.base+'/api/my-rides').json();self.assertEqual(mine['bookings'][0]['noShowReports'][0]['reportedRole'],'passenger')
        finally:passenger.close()
if __name__=='__main__':
    unittest.main(defaultTest=['Corrections.test_duplicate_links_to_existing_offer','Corrections.test_no_show_report_is_visible_on_both_accounts'],verbosity=2)
