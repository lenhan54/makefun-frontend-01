#!/usr/bin/env python3
"""Take the three V6 screenshots of the make.fun frontend on live data.

Why a relay: this VM reaches the internet through an egress proxy that
Chromium cannot speak to directly (CONNECT fails), while curl works fine.
So this script runs a tiny local CONNECT relay: Chromium talks to
127.0.0.1:8899, the relay re-issues the CONNECT to the egress proxy from
the environment with its credentials, then splices the sockets.

Each shot warms the cache first (board -> bounty -> board, or the same
shape for the other routes) so the header's traffic line shows real
cache hits instead of "0 from memory · 0 × 304", then waits for avatars
before shooting. Run from the repo root: python3 shots.py
"""

import base64
import os
import re
import socket
import socketserver
import subprocess
import threading
import time
import urllib.request
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
APP_PORT = 8091
RELAY_PORT = 8899
SHOT_LIMIT = 262144

FRAMES = [
    {"file": "1-board.jpg", "route": "#/", "width": 1280, "height": 800,
     "warm": ["#/bounty/makefun-frontend-01", "#/"]},
    {"file": "2-leaderboard.jpg", "route": "#/leaderboard/makefun-frontend-01",
     "width": 1280, "height": 800,
     "warm": ["#/bounty/makefun-frontend-01", "#/leaderboard/makefun-frontend-01"]},
    {"file": "3-profile.jpg", "route": "#/profile/icantcodefyi",
     "width": 360, "height": 640,
     "warm": ["#/", "#/profile/icantcodefyi"]},
]


def find_upstream():
    raw = os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY") or ""
    parsed = urlparse(raw)
    if not parsed.hostname or not parsed.port:
        raise SystemExit("no usable https_proxy in the environment")
    return parsed


UPSTREAM = find_upstream()


class RelayConn(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            self._forward()
        except Exception:
            pass

    def _forward(self):
        reader = self.request.makefile("rb")
        first = reader.readline().decode("latin-1").strip()
        if not first.startswith("CONNECT "):
            return
        target = first.split()[1]
        while True:
            line = reader.readline()
            if line in (b"\r\n", b"\n", b""):
                break
        user = unquote(UPSTREAM.username or "")
        secret = unquote(UPSTREAM.password or "")
        auth = base64.b64encode(f"{user}:{secret}".encode()).decode()
        up = socket.create_connection((UPSTREAM.hostname, UPSTREAM.port), timeout=25)
        up.sendall(
            f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n"
            f"Proxy-Authorization: Basic {auth}\r\n\r\n".encode()
        )
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = up.recv(4096)
            if not chunk:
                up.close()
                return
            head += chunk
        if b" 200 " not in head.split(b"\r\n", 1)[0]:
            self.request.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
            up.close()
            return
        self.request.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        self._join(self.request, up)

    @staticmethod
    def _join(a, b):
        def pump(src, dst):
            try:
                while True:
                    data = src.recv(65536)
                    if not data:
                        break
                    dst.sendall(data)
            except OSError:
                pass
            finally:
                try:
                    dst.shutdown(socket.SHUT_WR)
                except OSError:
                    pass

        one = threading.Thread(target=pump, args=(a, b), daemon=True)
        two = threading.Thread(target=pump, args=(b, a), daemon=True)
        one.start()
        two.start()
        one.join()
        two.join()
        for sock in (a, b):
            try:
                sock.close()
            except OSError:
                pass


class Relay(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def wait_up(url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def go_route(page, route):
    """Go to a hash route in the same page and wait until it rendered."""
    page.evaluate(f"location.hash = '{route}'")
    try:
        page.wait_for_function("window.__shotReady === false", timeout=5000)
    except Exception:
        pass
    page.wait_for_function("window.__shotReady === true", timeout=60000)


def traffic_counts(page):
    text = page.inner_text("#netline")
    found = re.search(r"(\d+) API requests · (\d+) from memory · (\d+) × 304", text)
    return tuple(int(x) for x in found.groups()) if found else (0, 0, 0)


def warm_up(page, frame):
    """Walk the warm-up routes twice at most until a 304 shows up."""
    for _ in range(2):
        for route in frame["warm"]:
            go_route(page, route)
        sent, mem, hits = traffic_counts(page)
        print(f"  warm traffic: {sent} requests · {mem} from memory · {hits} × 304", flush=True)
        if hits >= 1:
            return
        print("  no 304 yet (minute may have turned) — one more round", flush=True)
    print("  WARNING: still no 304 after warm-up", flush=True)


def wait_pictures(page):
    try:
        page.wait_for_function(
            "() => [...document.images].every(i => i.complete && i.naturalWidth > 0)",
            timeout=30000,
        )
        print("  avatars: all loaded", flush=True)
    except Exception:
        print("  avatars: some still pending after 30s — shooting anyway", flush=True)
    page.wait_for_timeout(1000)


def capture(page, frame, outdir):
    path = os.path.join(outdir, frame["file"])
    for quality in (80, 65, 50):
        page.screenshot(path=path, type="jpeg", quality=quality)
        size = os.path.getsize(path)
        print(f"  {frame['file']}: {size} bytes at quality {quality}", flush=True)
        if size <= SHOT_LIMIT:
            return size
    raise SystemExit(f"{frame['file']} still over {SHOT_LIMIT} bytes at quality 50")


def main():
    relay = Relay(("127.0.0.1", RELAY_PORT), RelayConn)
    threading.Thread(target=relay.serve_forever, daemon=True).start()
    server = subprocess.Popen(
        ["node", "serve.ts", "--port", str(APP_PORT)],
        cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        if not wait_up(f"http://localhost:{APP_PORT}/"):
            raise SystemExit("local server did not come up")
        from playwright.sync_api import sync_playwright

        outdir = os.path.join(HERE, "screenshots")
        os.makedirs(outdir, exist_ok=True)
        exe = os.path.expanduser(
            "~/.cache/ms-playwright/chromium_headless_shell-1148/"
            "chrome-linux/headless_shell"
        )
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=exe,
                proxy={"server": f"http://127.0.0.1:{RELAY_PORT}",
                       "bypass": "localhost,127.0.0.1"},
            )
            try:
                for frame in FRAMES:
                    print(f"shot {frame['file']} {frame['route']}", flush=True)
                    ctx = browser.new_context(
                        viewport={"width": frame["width"], "height": frame["height"]}
                    )
                    page = ctx.new_page()
                    page.goto(f"http://localhost:{APP_PORT}/{frame['route']}", timeout=60000)
                    page.wait_for_function("window.__shotReady === true", timeout=60000)
                    warm_up(page, frame)
                    wait_pictures(page)
                    capture(page, frame, outdir)
                    ctx.close()
            finally:
                browser.close()
        print("all three shots written", flush=True)
    finally:
        server.terminate()
        relay.shutdown()


if __name__ == "__main__":
    main()
