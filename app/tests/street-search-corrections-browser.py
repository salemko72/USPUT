"""StreetPicker regressions with local Vite modules and synthetic API/map data."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

APP = Path(__file__).resolve().parents[1]
PIN = {
    "id": "pin_43.85103_18.38360", "lat": 43.85103, "lng": 18.38360,
    "name": "Aleja lipa, Sarajevo", "detail": "Aleja lipa, Sarajevo, Bosna i Hercegovina",
    "city": "Sarajevo", "countryCode": "BA",
}


class StreetSearchCorrections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch = tempfile.TemporaryDirectory(prefix="usput-street-search-", dir="/tmp")
        root = Path(cls.scratch.name)
        (root / "node_modules").symlink_to(APP / "node_modules", target_is_directory=True)
        (root / "index.html").write_text('<div id="root"></div><script type="module" src="/main.tsx"></script>')
        (root / "main.tsx").write_text('''
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { StreetPicker } from %s;
function Harness() {
  const [value, setValue] = useState(null), [city, setCity] = useState("Sarajevo");
  return <><label>Search city<input aria-label="Search city" value={city} onChange={e => setCity(e.target.value)} /></label>
    <StreetPicker label="Polazište" scope={{city}} value={value} onChange={setValue} />
    <output data-testid="confirmed">{JSON.stringify(value)}</output></>;
}
createRoot(document.getElementById("root")).render(<Harness />);
''' % json.dumps(str(APP / "src/StreetPicker.tsx")))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{port}"
        (root / "vite.config.mjs").write_text("export default " + json.dumps({
            "root": str(root), "server": {"host": "127.0.0.1", "port": port, "strictPort": True,
                "fs": {"allow": [str(root), str(APP)]}},
        }))
        cls.log = (root / "vite.log").open("w+")
        cls.server = subprocess.Popen(["node", str(APP / "node_modules/vite/bin/vite.js"),
            "--config", str(root / "vite.config.mjs")], cwd=root, stdout=cls.log, stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                urlopen(cls.base, timeout=.2).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            cls.log.seek(0)
            raise RuntimeError(cls.log.read())
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, executable_path="/usr/bin/chromium")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.log.close()
        cls.scratch.cleanup()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 600, "height": 900})
        self.page = self.context.new_page()
        self.page.set_default_timeout(5000)
        self.errors = []
        self.requests = []
        self.pending = []
        self.defer = False
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.route("**/tile.openstreetmap.org/**", lambda r: r.fulfill(content_type="image/svg+xml",
            body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee"/></svg>'))
        self.page.route("**/api/locations/search", self.search_response)
        self.page.goto(self.base)
        self.query = self.page.get_by_role("textbox", name="Polazište", exact=True)
        self.search = self.page.get_by_role("button", name="Pretraži adresu — Polazište", exact=True)
        expect(self.query).to_be_visible()

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def search_response(self, route):
        self.requests.append(route.request.post_data_json)
        if self.defer:
            self.pending.append(route)
        else:
            route.fulfill(json={"locations": [PIN]})

    def find_pin(self):
        self.query.fill("Aleja")
        self.search.click()
        self.page.locator(".street-results button").click()
        return self.page.get_by_role("dialog", name="Potvrdi približnu lokaciju")

    def test_confirmed_suggestion_reopens_the_same_pin_without_exact_name_lookup(self):
        dialog = self.find_pin()
        dialog.get_by_role("button", name="Potvrdi ovaj pin", exact=True).click()
        expect(self.query).to_have_value(PIN["name"])
        expect(self.page.get_by_test_id("confirmed")).to_have_text(json.dumps(PIN, separators=(",", ":")))
        self.query.press("Enter")
        expect(dialog).to_be_visible()
        self.assertEqual(len(self.requests), 1, "the provider pin already resolves the selected address")
        expect(dialog.locator("small").last).to_contain_text("43.85103, 18.38360")
        dialog.get_by_role("button", name="Potvrdi ovaj pin", exact=True).click()
        self.search.click()
        expect(dialog).to_be_visible()
        self.assertEqual(len(self.requests), 1)
        expect(self.page.get_by_test_id("confirmed")).to_have_text(json.dumps(PIN, separators=(",", ":")))

    def test_a_suggestion_after_manual_cancel_does_not_inherit_manual_pin_requirements(self):
        self.query.fill("Aleja")
        self.page.get_by_role("button", name="Postavi pin ručno na karti", exact=True).click()
        self.page.get_by_role("dialog").get_by_role("button", name="Zatvori", exact=True).click()
        dialog = self.find_pin()
        expect(dialog.get_by_role("button", name="Potvrdi ovaj pin", exact=True)).to_be_enabled()

    def test_query_and_city_changes_ignore_late_search_responses(self):
        self.defer = True
        self.query.fill("Aleja")
        self.search.click()
        self.page.wait_for_function("document.querySelector('.fine-print')?.textContent.includes('Tražimo adresu')")
        self.query.fill("Obala Kulina bana")
        with self.page.expect_response("**/api/locations/search"):
            self.pending.pop().fulfill(json={"locations": [PIN]})
        expect(self.page.locator(".street-results")).to_have_count(0)
        self.search.click()
        self.page.get_by_role("textbox", name="Search city", exact=True).fill("Zagreb")
        with self.page.expect_response("**/api/locations/search"):
            self.pending.pop().fulfill(json={"locations": [PIN]})
        expect(self.page.locator(".street-results")).to_have_count(0)
        self.defer = False
        self.search.click()
        expect(self.page.locator(".street-results button")).to_have_count(1)
        self.page.get_by_role("textbox", name="Search city", exact=True).fill("Sarajevo")
        expect(self.page.locator(".street-results")).to_have_count(0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
