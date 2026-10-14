#!/usr/bin/env python3
"""Uji profil cs lewat API server lokal. Kunci dibaca dari .env profil, tidak pernah dicetak."""
import json, sys, time, urllib.request
ENV = "/home/suka-automation/.hermes/profiles/cs/.env"
KEY = next(l.split("=", 1)[1].strip() for l in open(ENV) if l.startswith("API_SERVER_KEY="))
URL = "http://127.0.0.1:8644/p/cs/v1/chat/completions"

def ask(messages, session=None, timeout=120):
    headers = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if session:
        headers["X-Hermes-Session-Id"] = session
    req = urllib.request.Request(URL, json.dumps({"model": "hermes", "stream": False, "messages": messages}).encode(), headers)
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r); code = r.status; hdr = r.headers.get("X-Hermes-Session-Id")
    except urllib.error.HTTPError as e:
        return e.code, time.perf_counter() - t, {}, e.read().decode()[:300], None
    u = d.get("usage", {})
    return code, time.perf_counter() - t, u, d["choices"][0]["message"]["content"], hdr

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "bench":      # bench <label> <n> <pesan...>
        label, n, msgs = sys.argv[2], int(sys.argv[3]), sys.argv[4:]
        ts = []
        for m in msgs:
            for _ in range(n):
                code, dt, u, c, _h = ask([{"role": "user", "content": m}])
                ts.append(dt)
        ts.sort()
        print(f"{label}: n={len(ts)} min={ts[0]:.2f}s median={ts[len(ts)//2]:.2f}s max={ts[-1]:.2f}s")
    elif mode == "say":      # say <label> <pesan> [session]
        code, dt, u, c, h = ask([{"role": "user", "content": sys.argv[3]}], sys.argv[4] if len(sys.argv) > 4 else None)
        print(f"\n### {sys.argv[2]} | {code} {dt:.2f}s | prompt={u.get('prompt_tokens')} out={u.get('completion_tokens')} | sess_hdr={'ya' if h else 'tidak'}\n{c[:600]}")
