"""Real UI/API checks against isolated synthetic roads, never public providers."""
import importlib.util
from pathlib import Path
import re
import unittest
from playwright.sync_api import expect

spec = importlib.util.spec_from_file_location('auto_route_checks', Path(__file__).with_name('auto-route-preview-browser.py'))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


class RouteShape(helpers.AutoRoutePreview):
    def test_add_and_reorder_transit_points_never_adds_meeting_stops(self):
        self.page.set_viewport_size({'width':1440,'height':900})
        self.open_preview(shape_only=True)
        for x in [1000,850]:
            self.dialog.get_by_role('button',name='Dodaj prolaznu tačku',exact=True).click()
            with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as response:
                self.dialog.locator('.leaflet-container-wrap').click(position={'x':x,'y':350})
            self.assertTrue(response.value.ok,response.value.text())
            self.assertEqual(len(response.value.json()['meetingStops']),2)
            expect(self.dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True)).to_be_enabled()
        before=response.value.json()['routeViaPoints']
        self.assertEqual(len(before),2)
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as reordered:
            self.dialog.get_by_role('button',name='Pomjeri prolaznu tačku gore',exact=True).last.click()
        self.assertTrue(reordered.value.ok,reordered.value.text())
        self.assertEqual(reordered.value.json()['routeViaPoints'],list(reversed(before)))
        expect(self.dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True)).to_be_enabled()
        self.page.screenshot(path='/tmp/usput-route-shape-desktop.png')
        self.dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True).click()
        expect(self.approval).to_be_enabled()
        expect(self.names).to_have_count(0)

    def test_drag_then_publish_and_repeat_keeps_transit_separate(self):
        self.page.set_viewport_size({'width':1440,'height':900})
        initial = self.open_preview(shape_only=True)
        self.assertEqual(len(initial['result']['meetingStops']),2)
        self.assertEqual(initial['result']['routeViaPoints'],[])
        handle = self.dialog.locator('.route-via-handle')
        expect(handle).to_be_visible()
        box=handle.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
        count=len(self.previews)
        self.page.mouse.move(x,y);self.page.mouse.down();self.page.mouse.move(x+70,y-60,steps=8)
        self.page.wait_for_timeout(650)
        self.assertEqual(len(self.previews),count,'Dragging must not request a route until release')
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as changed:
            self.page.mouse.up()
        self.assertTrue(changed.value.ok,changed.value.text())
        body=changed.value.request.post_data_json;result=changed.value.json()
        self.assertNotIn('meetingStops',body)
        self.assertEqual(len(body['routeViaPoints']),1)
        via=result['routeViaPoints']
        self.assertNotEqual(result['route']['coordinates'],initial['result']['route']['coordinates'])
        expect(self.dialog.locator('.route-shape-editor li')).to_have_count(1)
        self.dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True).click()
        expect(self.approval).to_be_enabled()
        expect(self.names).to_have_count(0)
        expect(self.dialog.locator('.route-via-handle')).to_have_count(0)
        self.approval.check();self.publish.click()
        expect(self.page.get_by_role('heading',name='Tvoja vožnja.',exact=True)).to_be_visible()
        self.assertEqual(self.publish_requests[-1]['routeViaPoints'],via)
        self.assertEqual(len(self.publish_requests[-1]['meetingStops']),2)
        mine=self.ctx.request.get(self.base+'/api/my-rides').json()
        ride=mine['rides'][0]
        self.assertEqual(ride['routeViaPoints'],via)
        self.assertEqual(ride['geometry'],result['route']['coordinates'])
        self.post('/rides/'+ride['id']+'/cancel',{})
        self.page.goto(self.base+'/#trips')
        self.page.get_by_role('button',name=re.compile(r'^\s*Vozim')).click()
        self.page.get_by_role('button',name='Ponovi vožnju',exact=True).first.click()
        self.page.get_by_role('button',name='Objavi vožnju',exact=True).click()
        expect(self.dialog).to_be_visible()
        expect(self.dialog.locator('.route-via-handle')).to_have_count(1)
        self.assertEqual(self.previews[-1]['body']['routeViaPoints'],via)

    def test_keyboard_map_adjustment_and_mobile_stages(self):
        self.open_preview(shape_only=True)
        self.dialog.get_by_role('button',name='Uredi trasu',exact=True).click()
        self.dialog.get_by_role('button',name='Pomjeri srednju tačku',exact=True).click()
        pin=self.page.get_by_role('dialog',name='Korekcija trase — nije mjesto susreta',exact=True)
        expect(pin.locator('canvas.maplibregl-canvas')).to_be_visible()
        pin.locator('.street-pin-map').click(position={'x':180,'y':150})
        with self.page.expect_response(lambda r:r.url.endswith('/api/routes/preview')) as response:
            pin.get_by_role('button',name='Primijeni korekciju trase',exact=True).click()
        self.assertTrue(response.value.ok,response.value.text())
        expect(pin).to_have_count(0)
        for width,height in [(320,568),(390,844),(1440,900)]:
            self.page.set_viewport_size({'width':width,'height':height})
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            footer=self.dialog.locator('.route-planner-footer').bounding_box()
            self.assertLessEqual(footer['y']+footer['height'],height+1)
        self.dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True).click()
        expect(self.approval).to_be_enabled()
        expect(self.names).to_have_count(0)
        self.dialog.get_by_role('button',name='Nazad na oblikovanje trase',exact=True).click()
        expect(self.dialog.locator('.route-via-handle')).to_have_count(1)
        expect(self.approval).to_have_count(0)
        self.dialog.get_by_role('button',name='Ukloni prolaznu tačku',exact=True).click()
        self.page.wait_for_function('document.querySelectorAll(".route-shape-editor li").length===0')
        expect(self.dialog.get_by_role('button',name='Potvrdi trasu — odaberi mjesta susreta',exact=True)).to_be_enabled()
        self.assertEqual(self.previews[-1]['body']['routeViaPoints'],[])


if __name__ == '__main__':
    unittest.main(defaultTest=[
        'RouteShape.test_add_and_reorder_transit_points_never_adds_meeting_stops',
        'RouteShape.test_drag_then_publish_and_repeat_keeps_transit_separate',
        'RouteShape.test_keyboard_map_adjustment_and_mobile_stages',
    ],verbosity=2)
