#!/usr/bin/env python3
"""Take the 3 screenshots in shots.json of the app on live make.fun data.

Chromium headless cannot reach the API directly from this VM, so a tiny
CONNECT relay on localhost tunnels its traffic out (the VM shell can reach
make.fun fine). Each shot gets a fresh browser context; we wait for
window.__shotReady before capturing. Serves app/ with node serve.ts.
Usage: python3 shots.py  (run from the repo root)
"""
import base64
import json
import os
import select
import socket
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse

REPO = os.path.dirname(os.path.abspath(__file__))
RELAY_PORT = 18080
APP_PORT = 8080

SHELL = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell"
)

# Outbound traffic from this VM goes through an egress proxy (see the
# HTTPS_PROXY environment variable); a raw socket to the internet is
# answered by the proxy with a plain-text refusal, which breaks TLS. So
# the relay's upstream hop for non-local hosts is itself a CONNECT through
# that proxy, using the credentials from the environment — never hardcoded.
_EGRESS = urllib.parse.urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
_NO_PROXY = set(
    h.strip().lower()
    for h in os.environ.get("NO_PROXY", "localhost,127.0.0.1").split(",")
    if h.strip()
)


def upstream_connect(host, port):
    """A socket to host:port, via the egress proxy when one is configured."""
    if not _EGRESS.hostname or host.lower() in _NO_PROXY or host.startswith("127."):
        return socket.create_connection((host, port), timeout=30)
    sock = socket.create_connection((_EGRESS.hostname, _EGRESS.port or 3128), timeout=30)
    req = f"CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n"
    if _EGRESS.username:
        cred = base64.b64encode(
            f"{urllib.parse.unquote(_EGRESS.username)}:{urllib.parse.unquote(_EGRESS.password or '')}".encode()
        ).decode()
        req += f"Proxy-Authorization: Basic {cred}\r\n"
    req += "\r\n"
    sock.sendall(req.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            raise OSError("egress proxy closed the CONNECT")
        buf += chunk
    if b" 200 " not in buf.split(b"\r\n", 1)[0]:
        raise OSError("egress proxy refused CONNECT: " + buf.split(b"\r\n", 1)[0].decode("latin1"))
    return sock


class Relay(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def shuttle(a, b):
    try:
        while True:
            r, _, _ = select.select([a, b], [], [], 30)
            if not r:
                return
            for s in r:
                data = s.recv(65536)
                if not data:
                    return
                (b if s is a else a).sendall(data)
    except OSError:
        return


def handle_conn(client):
    try:
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = client.recv(4096)
            if not chunk:
                client.close()
                return
            buf += chunk
        head, _, _ = buf.partition(b"\r\n\r\n")
        lines = head.split(b"\r\n")
        method, target, _ver = lines[0].decode("latin1").split(" ", 2)
        if method == "CONNECT":
            host, _, port = target.rpartition(":")
            upstream = upstream_connect(host, int(port))
            client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            shuttle(client, upstream)
            return
        # Plain HTTP proxy request: absolute-form target, e.g.
        # GET http://127.0.0.1:8080/ HTTP/1.1 — forward origin-form.
        if target.startswith("http://") or target.startswith("https://"):
            rest = target.split("://", 1)[1]
            hostport, _, path = rest.partition("/")
            path = "/" + path
            host, _, port = hostport.rpartition(":")
            port = int(port) if port else 80
        else:
            client.sendall(b"HTTP/1.1 400 Bad Request\r\n\r\n")
            client.close()
            return
        upstream = upstream_connect(host, port)
        out = [method.encode() + b" " + path.encode() + b" HTTP/1.1"]
        for ln in lines[1:]:
            if ln.lower().startswith(b"proxy-connection:"):
                continue
            out.append(ln)
        upstream.sendall(b"\r\n".join(out) + b"\r\n\r\n")
        shuttle(client, upstream)
    except OSError:
        pass
    finally:
        try:
            client.close()
        except OSError:
            pass


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        handle_conn(self.request)


def wait_port(port, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=2):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def main():
    shots = json.load(open(os.path.join(REPO, "shots.json")))
    relay = Relay(("127.0.0.1", RELAY_PORT), Handler)
    threading.Thread(target=relay.serve_forever, daemon=True).start()
    server = subprocess.Popen(
        ["node", "serve.ts", "--port", str(APP_PORT)],
        cwd=REPO,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        if not wait_port(APP_PORT):
            print("serve.ts did not come up", file=sys.stderr)
            return 1
        from playwright.sync_api import sync_playwright

        proxy = {"server": f"http://127.0.0.1:{RELAY_PORT}", "bypass": "*.invalid"}
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=SHELL, headless=True, args=["--no-sandbox"]
            )
            for shot in shots:
                vp = shot["viewport"]
                ctx = browser.new_context(
                    viewport={"width": vp["width"], "height": vp["height"]},
                    device_scale_factor=1,
                    proxy=proxy,
                )
                page = ctx.new_page()
                page.goto(f"http://127.0.0.1:{APP_PORT}/{shot['path']}", timeout=60000)
                page.wait_for_function("window.__shotReady === true", timeout=60000)
                page.wait_for_timeout(400)
                out = os.path.join(REPO, "screenshots", shot["file"])
                page.screenshot(path=out, type="jpeg", quality=82)
                print("shot", shot["file"], os.path.getsize(out), "bytes")
                ctx.close()
            browser.close()
    finally:
        server.terminate()
        relay.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
