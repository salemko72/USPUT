"""Independent city inputs against a real isolated API and synthetic autocomplete."""
import importlib.util,json,os,unittest
from pathlib import Path
from playwright.sync_api import expect
spec=importlib.util.spec_from_file_location('helpers',Path(__file__).with_name('auto-route-preview-browser.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class Intercity(h.AutoRoutePreview):
 @classmethod
 def setUpClass(cls):
  previous=os.environ.get('USPUT_TEST_FIXTURE_SERVER');os.environ['USPUT_TEST_FIXTURE_SERVER']='tests/intercity-fixture-server.mjs'
  try:super().setUpClass()
  finally:
   if previous is None:os.environ.pop('USPUT_TEST_FIXTURE_SERVER',None)
   else:os.environ['USPUT_TEST_FIXTURE_SERVER']=previous
 def open_fields(self):
  self.page.goto(self.base+'/#home');self.page.get_by_role('button',name='Nova vožnja Odaberi drugu rutu',exact=True).click()
  expect(self.page.get_by_label('Grad za pretragu ulica',exact=True)).to_have_count(0)
 def choose(self,label,text,city):
  field=self.page.get_by_role('combobox',name=label,exact=True);field.fill('');field.fill(text)
  picker=field.locator('xpath=ancestor::div[contains(@class,"street-picker")]')
  expect(picker.locator('.street-results [role=option]').first).to_contain_text(city,timeout=12000)
  picker.locator('.street-results [role=option]').first.click()
  dialog=self.page.get_by_role('dialog',name='Potvrdi približnu lokaciju');dialog.get_by_role('button',name='Potvrdi ovaj pin',exact=True).click()
  return picker
 def test_two_cities_prefix_suffix_swap_and_independent_override(self):
  self.open_fields();origin=self.choose('Polazište','Logavina','Sarajevo');destination=self.choose('Odredište','Zenica, Crkvice','Zenica')
  expect(origin.locator('.street-city-hint')).to_contain_text('Sarajevo');expect(destination.locator('.street-city-hint')).to_contain_text('Zenica')
  self.choose('Odredište','Crkvice, Zenica','Zenica');expect(origin.get_by_role('combobox')).to_have_value('Logavina, Sarajevo')
  self.page.get_by_role('combobox',name='Najviše minuta hodanja',exact=True).select_option('10')
  self.page.get_by_role('button',name='Pronađi vožnju',exact=True).click()
  expect(self.page.get_by_role('heading',name='Usput ti je.',exact=True)).to_be_visible()
  saved=self.ctx.request.get(self.base+'/api/saved-searches').json()['searches']
  pair=next(row['query'] for row in saved if 'Crkvice' in row['query'].get('toLocation',''))
  self.assertEqual(json.loads(pair['fromLocation'])['city'],'Sarajevo');self.assertEqual(json.loads(pair['toLocation'])['city'],'Zenica')
  self.page.goto(self.base+'/#home');self.page.locator('.saved-search-card').filter(has_text='Crkvice').locator('.saved-search-load').click()
  expect(origin.locator('.street-city-hint')).to_contain_text('Sarajevo');expect(destination.locator('.street-city-hint')).to_contain_text('Zenica')
  self.page.get_by_role('button',name='Zamijeni polazište i odredište',exact=True).click()
  expect(origin.locator('.street-city-hint')).to_contain_text('Zenica');expect(destination.locator('.street-city-hint')).to_contain_text('Sarajevo')
  destination.get_by_role('button',name='Promijeni grad — Odredište',exact=True).click()
  destination.get_by_role('textbox',name='Grad za ovu lokaciju — Odredište',exact=True).fill('Visoko')
  destination.get_by_role('button',name='Primijeni grad',exact=True).click()
  expect(destination.locator('.street-city-hint')).to_contain_text('Visoko');expect(origin.locator('.street-city-hint')).to_contain_text('Zenica')
  self.page.screenshot(path='/tmp/usput-intercity-fields.png',full_page=True)
 def test_city_only_requires_precise_pin_movement(self):
  self.open_fields();field=self.page.get_by_role('combobox',name='Odredište',exact=True);field.fill('Zenica')
  picker=field.locator('xpath=ancestor::div[contains(@class,"street-picker")]');expect(picker.locator('.street-results [role=option]').first).to_have_text(h.re.compile('Zenica'))
  picker.locator('.street-results [role=option]').first.click();dialog=self.page.get_by_role('dialog',name='Potvrdi približnu lokaciju')
  confirm=dialog.get_by_role('button',name='Potvrdi ovaj pin',exact=True);expect(confirm).to_be_disabled()
  dialog.locator('.street-pin-map').click(position={'x':190,'y':140});expect(confirm).to_be_enabled(timeout=12000);confirm.click()
  expect(field).to_have_value('Pin na karti, Zenica')
if __name__=='__main__':unittest.main(defaultTest=['Intercity.test_two_cities_prefix_suffix_swap_and_independent_override','Intercity.test_city_only_requires_precise_pin_movement'],verbosity=2)
