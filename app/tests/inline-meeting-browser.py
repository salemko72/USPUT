"""Meeting drafts use the existing map without a nested dialog."""
import importlib.util
from pathlib import Path
import unittest
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class InlineMeeting(h.AutoRoutePreview):
    def test_inline_place_cancel_confirm_and_edit(self):
        for width in [1440,390]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width':width,'height':900})
                self.open_preview(with_meeting=False)
                count=len(self.previews)
                self.dialog.get_by_role('button',name='Dodaj mjesto susreta',exact=True).click()
                expect(self.page.get_by_role('dialog')).to_have_count(1)
                marker=self.dialog.locator('.route-meeting-handle')
                expect(marker).to_be_visible()
                expect(self.publish).to_have_count(0)
                box=marker.bounding_box();x=box['x']+16;y=box['y']+16
                self.page.mouse.move(x,y);self.page.mouse.down();self.page.mouse.move(x+10,y,steps=5);self.page.mouse.up()
                self.page.wait_for_timeout(500)
                self.assertEqual(len(self.previews),count)
                self.dialog.get_by_role('button',name='Odustani',exact=True).click()
                expect(marker).to_have_count(0)
                expect(self.names).to_have_count(0)
                self.assertEqual(len(self.previews),count)
                self.dialog.get_by_role('button',name='Dodaj mjesto susreta',exact=True).click()
                button=self.dialog.get_by_role('button',name='Potvrdi mjesto susreta',exact=True)
                expect(button).to_be_enabled()
                body,result=self.updated(button.click)
                self.assertEqual(len(body['meetingStops']),3)
                expect(self.names).to_have_count(1)
                self.dialog.get_by_role('button',name='Provjeri ili pomjeri pin',exact=True).click()
                expect(self.page.get_by_role('dialog')).to_have_count(1)
                expect(marker).to_be_visible()
                self.dialog.get_by_role('button',name='Odustani',exact=True).click()
                self.approval.check();expect(self.publish).to_be_enabled()
                self.dialog.get_by_role('button',name='Nazad na unos vožnje',exact=True).click()
if __name__=='__main__':
    unittest.main(defaultTest='InlineMeeting.test_inline_place_cancel_confirm_and_edit',verbosity=2)
