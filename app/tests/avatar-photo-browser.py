"""Isolated browser coverage for recognition-photo reuse in owner avatars.

Runs against the actual React/photo components through Vite. Only the private
photo API is replaced, so account changes and delayed responses are repeatable.
"""

from io import BytesIO
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen

from PIL import Image
from playwright.sync_api import expect, sync_playwright


APP = Path(__file__).resolve().parents[1]
HARNESS = """
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Avatar } from '/src/ui.tsx';
import { OwnPhoto } from '/src/Photos.tsx';
import { savePhoto } from '/src/photo-client.ts';
const modules = import.meta.glob('/src/AvatarPhotoContext.tsx', { eager: true });
const Provider = modules['/src/AvatarPhotoContext.tsx']?.CurrentUserPhotoProvider
  || (({ children }) => children);
function Fixture() {
  const [userId, setUserId] = useState('alice');
  window.switchPhotoUser = (id) => flushSync(() => setUserId(id));
  window.saveDemoRecognition = () => savePhoto('avatar', new Blob(['demo']), true);
  return <Provider userId={userId}>
    <div id="owner"><Avatar name="Owner Test" userId={userId || undefined} /></div>
    <div id="counterpart"><Avatar name="Owner Test" userId="someone-else" /></div>
    <div id="unscoped"><Avatar name="Owner Test" /></div>
    <OwnPhoto key={userId} kind="avatar" demo={false} />
  </Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
"""


def photo(owner, suffix="1"):
    image_id = f"{owner}-{suffix}"
    return {"id": image_id, "url": f"/api/photos/{image_id}",
            "bytes": 100, "width": 64, "height": 64}


with socket.socket() as free_port:
    free_port.bind(("127.0.0.1", 0))
    port = free_port.getsockname()[1]

with tempfile.TemporaryDirectory(prefix="avatar-photo-", dir=APP / "tests") as fixture_dir:
    fixture = Path(fixture_dir)
    (fixture / "index.html").write_text(
        '<div id="root"></div><script type="module" src="./harness.tsx"></script>'
    )
    (fixture / "harness.tsx").write_text(HARNESS)
    Image.new("RGB", (256, 256), "#569f84").save(fixture / "face.jpg")
    image = BytesIO()
    Image.new("RGB", (64, 64), "#569f84").save(image, format="WEBP")
    with tempfile.TemporaryFile(mode="w+") as server_log:
        server = subprocess.Popen(
            ["node", "node_modules/vite/bin/vite.js", "--host", "127.0.0.1",
             "--port", str(port), "--strictPort"],
            cwd=APP, stdout=server_log, stderr=subprocess.STDOUT,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for attempt in range(100):
                try:
                    urlopen(base, timeout=0.2).close()
                    break
                except OSError:
                    if server.poll() is not None:
                        server_log.seek(0)
                        raise RuntimeError(server_log.read())
                    time.sleep(0.1)
            else:
                raise RuntimeError("Photo browser fixture server did not start")

            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    headless=True, executable_path="/usr/bin/chromium"
                )
                page = browser.new_page(viewport={"width": 390, "height": 844})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                state = {"user": "alice", "photos": {"alice": None, "bob": photo("bob")},
                         "uploads": 0, "defer": False, "pending": [], "fail": False}

                def photos_api(route):
                    path = route.request.url.removeprefix(base + "/api/photos/")
                    if path == "me":
                        data = {"avatar": state["photos"].get(state["user"]),
                                "vehicle": None, "available": True}
                        if state["fail"]:
                            route.fulfill(status=503, json={"error": "Unavailable"})
                        elif state["defer"]:
                            state["pending"].append((route, data))
                        else:
                            route.fulfill(json=data)
                    elif path == "avatar":
                        state["uploads"] += 1
                        state["photos"][state["user"]] = photo(state["user"], str(state["uploads"]))
                        route.fulfill(json={"photo": state["photos"][state["user"]]})
                    elif path == "avatar/remove":
                        state["photos"][state["user"]] = None
                        route.fulfill(json={"ok": True})
                    elif path.endswith("broken"):
                        route.fulfill(status=404, body="Missing")
                    else:
                        route.fulfill(content_type="image/webp", body=image.getvalue())

                page.route("**/api/photos/**", photos_api)
                url = base + "/" + fixture.relative_to(APP).as_posix() + "/index.html"
                page.goto(url)
                expect(page.locator("#owner")).to_have_text("OT")
                page.get_by_label("Odaberi profilnu fotografiju", exact=True).set_input_files(
                    str(fixture / "face.jpg")
                )
                expect(page.get_by_alt_text("Pregled kompresovane fotografije")).to_be_visible()
                page.get_by_role("button", name="Sačuvaj fotografiju", exact=True).click()
                own_image = page.locator("#owner img")
                expect(own_image).to_have_attribute("src", "/api/photos/alice-1")
                expect(own_image).to_have_js_property("complete", True)
                assert own_image.evaluate("image => image.naturalWidth") > 0
                expect(page.locator("#counterpart")).to_have_text("OT")
                expect(page.locator("#unscoped")).to_have_text("OT")
                assert state["uploads"] == 1, "Avatar reuse uploaded an extra copy"

                page.reload()
                expect(page.locator("#owner img")).to_have_attribute("src", "/api/photos/alice-1")
                page.get_by_role("button", name="Ukloni profilnu fotografiju", exact=True).click()
                page.get_by_role("button", name="Da, ukloni fotografiju", exact=True).click()
                expect(page.locator("#owner")).to_have_text("OT")
                expect(page.locator("#owner img")).to_have_count(0)

                # A broken private image falls back to initials.
                state["photos"]["alice"] = photo("alice", "broken")
                page.reload()
                expect(page.locator("#owner")).to_have_text("OT")
                expect(page.locator("#owner img")).to_have_count(0)

                # No previous owner's image may remain for even one render.
                state["photos"]["alice"] = photo("alice", "fresh")
                page.reload()
                expect(page.locator("#owner img")).to_have_attribute("src", "/api/photos/alice-fresh")
                state["user"] = "bob"
                rendered = page.evaluate("""() => {
                    window.switchPhotoUser('bob');
                    return document.querySelector('#owner').innerHTML;
                }""")
                assert "alice-fresh" not in rendered, rendered
                expect(page.locator("#owner img")).to_have_attribute("src", "/api/photos/bob-1")

                # Late reads for the departed account cannot replace Bob's image.
                state["user"] = "alice"
                state["defer"] = True
                page.reload()
                for attempt in range(100):
                    if len(state["pending"]) >= 2:
                        break
                    page.wait_for_timeout(10)
                assert len(state["pending"]) >= 2, "Owner photo reads were not started"
                state["user"] = "bob"
                state["defer"] = False
                page.evaluate("window.switchPhotoUser('bob')")
                expect(page.locator("#owner img")).to_have_attribute("src", "/api/photos/bob-1")
                for pending_route, data in state["pending"]:
                    pending_route.fulfill(json=data)
                page.wait_for_timeout(50)
                expect(page.locator("#owner img")).to_have_attribute("src", "/api/photos/bob-1")

                # Demo storage changes cannot replace the signed-in user's photo.
                page.evaluate("window.saveDemoRecognition()")
                expect(page.locator("#owner img")).to_have_attribute("src", "/api/photos/bob-1")
                page.evaluate("window.switchPhotoUser(null)")
                expect(page.locator("#owner")).to_have_text("OT")
                expect(page.locator("#owner img")).to_have_count(0)

                state["fail"] = True
                page.evaluate("window.switchPhotoUser('bob')")
                expect(page.locator("#owner")).to_have_text("OT")
                expect(page.locator("#owner img")).to_have_count(0)
                assert not errors, errors
                browser.close()
                print("PASS: recognition photo reused after save/reload/remove; owner IDs, "
                      "errors, demo isolation, logout and delayed account reads are safe; one upload")
        finally:
            server.terminate()
            server.wait(timeout=10)
