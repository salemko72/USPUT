"""Help/privacy UI checks with disposable assets, accounts and a local API.

Exercises the real app and shared modal in Chromium. No production account,
public map provider, push provider or app/dist modification is needed.
"""

import mimetypes
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
from urllib.parse import unquote, urlparse
from urllib.request import urlopen
import uuid

from playwright.sync_api import expect, sync_playwright


APP = Path(__file__).resolve().parents[1]
LANGUAGES = [
    ("bhs", "Bosanski", "Upute za korištenje", "Putnik: od pretrage do dogovora",
     "Račun i prijava", "30 dana"),
    ("sr-Latn", "Srpski (latinica)", "Uputstvo za korišćenje", "Putnik: od pretrage do dogovora",
     "Nalog i prijava", "30 dana"),
    ("hr", "Hrvatski", "Upute za korištenje", "Putnik: od pretrage do dogovora",
     "Račun i prijava", "30 dana"),
    ("en", "English", "How to use USPUT", "Passenger: from search to agreement",
     "Account and sign-in", "30 days"),
]


class HelpPrivacyBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch = tempfile.TemporaryDirectory(prefix="usput-help-privacy-", dir="/tmp")
        cls.root = Path(cls.scratch.name)
        cls.assets = cls.root / "assets"
        cls.log = (cls.root / "server.log").open("w+")
        built = subprocess.run(
            ["node", str(APP / "node_modules/vite/bin/vite.js"), "build",
             "--outDir", str(cls.assets)],
            cwd=APP, capture_output=True, text=True, timeout=90,
        )
        if built.returncode:
            raise RuntimeError(built.stdout + built.stderr)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{port}"
        cls.data = cls.root / "api-data"
        cls.server = subprocess.Popen(
            ["node", "server/local.mjs"], cwd=APP,
            env={**os.environ, "PORT": str(port), "USPUT_DATA_DIR": str(cls.data),
                 "OSRM_URL": "", "OSRM_FOOT_URL": "", "GEOCODER_URL": "",
                 "PHOTON_URL": "", "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""},
            stdout=cls.log, stderr=subprocess.STDOUT,
        )
        for _ in range(100):
            try:
                urlopen(cls.base + "/api/places", timeout=.2).close()
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
        self.ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(6000)
        self.errors = []
        self.external_requests = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

        def serve_assets(route):
            path = unquote(urlparse(route.request.url).path)
            if path.startswith("/api/"):
                return route.continue_()
            asset = (self.assets / path.lstrip("/")).resolve()
            if not asset.is_relative_to(self.assets.resolve()) or not asset.is_file():
                asset = self.assets / "index.html"
            route.fulfill(path=str(asset), content_type=mimetypes.guess_type(asset)[0]
                          or "application/octet-stream")

        def block_external(route):
            if route.request.url.startswith(self.base + "/"):
                return route.fallback()
            self.external_requests.append(route.request.url)
            route.abort()

        self.page.route(self.base + "/**", serve_assets)
        self.page.route("**/*", block_external)

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors, [])
        self.assertEqual(self.external_requests, [])

    def register(self):
        started = time.time()
        response = self.ctx.request.post(
            self.base + "/api/auth/register", headers={"Origin": self.base},
            data={"name": "Help privacy tester", "email": uuid.uuid4().hex + "@example.test",
                  "password": "fixture-password-123", "city": "Sarajevo",
                  "adult": True, "terms": True},
        )
        self.assertTrue(response.ok, response.text())
        self.assertIn("Max-Age=2592000", response.headers.get("set-cookie", ""))
        cookie = next(c for c in self.ctx.cookies() if c["name"] == "usput_session")
        self.assertTrue(cookie["httpOnly"])
        self.assertEqual(cookie["sameSite"], "Lax")
        self.assertAlmostEqual(cookie["expires"] - started, 30 * 86400, delta=10)
        with sqlite3.connect(self.data / "usput.sqlite") as db:
            expiry = db.execute("SELECT expires FROM sessions WHERE user_id=?",
                                (response.json()["user"]["id"],)).fetchone()[0]
        self.assertAlmostEqual(expiry / 1000 - started, 30 * 86400, delta=10)

    def switch_language(self, language):
        self.page.get_by_role("button", name=language[1], exact=True).click()
        expect(self.page.locator("html")).to_have_attribute(
            "lang", "bs" if language[0] == "bhs" else language[0])

    def assert_privacy(self, dialog, language):
        content = dialog.locator(".information-content")
        expect(content.get_by_role("heading", name=language[4], exact=True)).to_be_visible()
        text = content.inner_text()
        self.assertIn(language[5], text)
        for provider in ["Cloudflare D1", "Cloudflare R2", "EU", "Photon", "Nominatim", "OSRM", "OpenFreeMap"]:
            self.assertIn(provider, text)
        for obsolete in ["14 dana", "14 days", "Mapa se učitava s OpenStreetMapa",
                         "čuva ih samo u ovom pregledniku", "stored only in this browser"]:
            self.assertNotIn(obsolete, text)
        self.assertLessEqual(dialog.evaluate("e => e.scrollWidth - e.clientWidth"), 1)
        return text

    def test_registration_and_profile_share_privacy_in_all_four_languages(self):
        self.page.goto(self.base)
        self.page.get_by_role("button", name="Krenimo zajedno", exact=True).click()
        self.page.get_by_role("button", name="Napravi račun", exact=True).click()
        registration = {}
        for language in LANGUAGES:
            self.switch_language(language)
            trigger = self.page.locator(".consent button")
            trigger.click()
            dialog = self.page.get_by_role("dialog")
            expect(dialog).to_be_visible()
            registration[language[0]] = self.assert_privacy(dialog, language)
            self.page.keyboard.press("Escape")
            expect(dialog).to_have_count(0)
            expect(trigger).to_be_focused()

        self.register()
        self.page.goto(self.base + "/#profile")
        # A fragment navigation keeps the logged-out React tree from the
        # registration screen; load the new API-created session explicitly.
        self.page.reload()
        for language in LANGUAGES:
            self.switch_language(language)
            trigger = self.page.locator(".settings-row").filter(
                has=self.page.locator(".lucide-shield-check"))
            trigger.click()
            dialog = self.page.get_by_role("dialog")
            self.assertEqual(self.assert_privacy(dialog, language), registration[language[0]])
            dialog.locator(".button").last.click()
            expect(dialog).to_have_count(0)
            expect(trigger).to_be_focused()

    def test_profile_help_is_readable_and_keyboard_accessible_at_phone_and_desktop_widths(self):
        self.register()
        self.page.goto(self.base + "/#profile")
        for width in [320, 390, 1440]:
            self.page.set_viewport_size({"width": width, "height": 900})
            for language in LANGUAGES:
                self.switch_language(language)
                trigger = self.page.get_by_role("button", name=language[2] + " " + (
                    "From your first search to your next ride" if language[0] == "en"
                    else "Od prve pretrage do ponovljene vožnje"), exact=True)
                trigger.click()
                dialog = self.page.get_by_role("dialog", name=language[2], exact=True)
                expect(dialog).to_be_visible()
                content = dialog.locator(".information-content")
                expect(content.locator("summary").first).to_have_text(language[3])
                expect(content.locator("details")).to_have_count(6)
                for detail in content.locator("details").all():
                    if detail.get_attribute("open") is None:
                        detail.locator("summary").click()
                    for paragraph in detail.locator("p").all():
                        paragraph.scroll_into_view_if_needed()
                        expect(paragraph).to_be_visible()
                self.assertIn("5, 10", content.inner_text())
                self.assertIn("15", content.inner_text())
                self.assertIn("iOS 16.4", content.inner_text())
                self.assertLessEqual(dialog.evaluate("e => e.scrollWidth - e.clientWidth"), 1)
                self.page.keyboard.press("Escape")
                expect(dialog).to_have_count(0)
                expect(trigger).to_be_focused()


if __name__ == "__main__":
    unittest.main(verbosity=2)
