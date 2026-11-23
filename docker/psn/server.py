"""PlayStation Family bridge for api/playstation.js (the `kids-psn` container).

Sony has no public parental-controls API. This wraps the unofficial `psnfamily` library (pinned in
requirements.txt), which talks to the cloud API behind Sony's PS Family app. It runs only on the
kids-prod Docker network, with no published port: kids-web is its only caller and does all the
checks of who may do what.

The PSN login (an OAuth token pair minted from the Family Manager's npsso cookie) lives in a file on
the `kids-playstation` volume, never in the database or the browser. The refresh token lasts about
60 days and is renewed as it's used.

Endpoints (JSON):
  GET  /status                     connected?, children [{memberId, accountId, name}]
  POST /connect     {npsso}        sign in as the Family Manager, save the tokens; returns /status
  POST /disconnect                 forget the tokens
  GET  /playtime?accountId=        today's limit and use, in minutes
  POST /today-limit {memberId, minutes}       set today's limit outright (0 clears the override)
  POST /on-limit    {memberId, action}        NOTIFY_ONLY | FORCE_LOGOUT
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from aiohttp import web
from psnfamily import (
    FamilyMember,
    Identity,
    OhanaClient,
    PsnFamilyAuthError,
    PsnFamilyError,
    PsnFamilyScopeError,
    TokenSet,
)

DATA_DIR = Path(os.environ.get("PSN_DATA_DIR", "/data"))
TOKEN_FILE = DATA_DIR / "tokens.json"
PORT = int(os.environ.get("PORT", "8090"))
ON_LIMIT_ACTIONS = ("NOTIFY_ONLY", "FORCE_LOGOUT")

log = logging.getLogger("kids-psn")

# One client for the process: the library serializes requests and keeps to 1 request / 3 s.
_client: OhanaClient | None = None
_lock = asyncio.Lock()


class NotConnected(Exception):
    pass


def _load_tokens() -> TokenSet | None:
    try:
        return TokenSet.from_dict(json.loads(TOKEN_FILE.read_text()))
    except FileNotFoundError:
        return None


def _save_tokens(tokens: TokenSet | None) -> None:
    if tokens is None:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = TOKEN_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(tokens.to_dict()))
    tmp.chmod(0o600)
    tmp.replace(TOKEN_FILE)


async def _get_client() -> OhanaClient:
    global _client
    if _client is None:
        tokens = _load_tokens()
        if tokens is None or not tokens.refresh_valid:
            raise NotConnected("PlayStation is not connected")
        _client = OhanaClient(tokens=tokens)
    return _client


async def _reset_client() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def _call(fn):
    """Runs fn(client) and saves the tokens afterwards (they rotate on refresh)."""
    async with _lock:
        client = await _get_client()
        try:
            return await fn(client)
        finally:
            _save_tokens(client.tokens)


def _describe(e: Exception) -> str:
    if isinstance(e, NotConnected):
        return str(e)
    if isinstance(e, PsnFamilyScopeError):
        return "Sony accepted the login but refused the family controls. Is this the Family Manager account?"
    if isinstance(e, PsnFamilyAuthError):
        return "PlayStation login expired. Reconnect PlayStation in Settings."
    if isinstance(e, PsnFamilyError):
        return f"PlayStation: {e}"
    return str(e)


def _error(e: Exception) -> web.Response:
    status = 409 if isinstance(e, NotConnected) else 401 if isinstance(e, PsnFamilyAuthError) else 502
    if not isinstance(e, (NotConnected, PsnFamilyError)):
        log.exception("unexpected error")
    return web.json_response({"error": _describe(e)}, status=status)


def _child(m: FamilyMember) -> dict:
    return {
        "memberId": m.member_id,
        "accountId": m.identity.account_id,
        "name": m.identity.display_name or m.identity.online_id or "Child",
    }


def _member(member_id: str) -> FamilyMember:
    # set_today_limit only reads member.member_id.
    return FamilyMember(member_id=member_id, identity=Identity(account_id=""))


async def status(_req: web.Request) -> web.Response:
    if _load_tokens() is None:
        return web.json_response({"connected": False, "children": []})
    try:
        children = await _call(lambda c: c.get_children())
        return web.json_response({"connected": True, "children": [_child(m) for m in children]})
    except Exception as e:  # noqa: BLE001 - reported to the parent as is
        if isinstance(e, NotConnected):
            return web.json_response({"connected": False, "children": []})
        return web.json_response({"connected": True, "children": [], "error": _describe(e)})


async def connect(req: web.Request) -> web.Response:
    body = await req.json()
    npsso = str(body.get("npsso") or "").strip()
    if len(npsso) != 64 or not npsso.isalnum():
        return web.json_response({"error": "That isn't an npsso code (it should be 64 letters and numbers)."}, status=400)
    async with _lock:
        await _reset_client()
        client = OhanaClient()
        try:
            await client.authenticate(npsso)
            await client.validate_connection()  # proves the family controls are reachable
            _save_tokens(client.tokens)
        except PsnFamilyAuthError:
            await client.close()
            return web.json_response(
                {"error": "Sony didn't accept that npsso code. Sign in at playstation.com again and copy a fresh one."},
                status=401,
            )
        except Exception as e:  # noqa: BLE001
            await client.close()
            return _error(e)
        await client.close()
    return await status(req)


async def disconnect(_req: web.Request) -> web.Response:
    async with _lock:
        await _reset_client()
        TOKEN_FILE.unlink(missing_ok=True)
    return web.json_response({"success": True})


async def playtime(req: web.Request) -> web.Response:
    account_id = req.query.get("accountId", "")
    if not account_id:
        return web.json_response({"error": "accountId is required"}, status=400)
    try:
        pt = await _call(lambda c: c.get_playtime(account_id))
    except Exception as e:  # noqa: BLE001
        return _error(e)
    limit = pt.today_limit_seconds
    return web.json_response({
        # None: no limit at all (unrestricted). 0: blocked today.
        "todayLimitMinutes": None if limit is None else limit // 60,
        "usedTodayMinutes": pt.used_today_seconds // 60,
        "onLimitReached": pt.on_limit_reached,
        "timezone": pt.timezone_id,
    })


async def today_limit(req: web.Request) -> web.Response:
    body = await req.json()
    member_id = str(body.get("memberId") or "")
    minutes = body.get("minutes")
    if not member_id or not isinstance(minutes, int) or not 0 <= minutes <= 1440 or minutes % 15:
        return web.json_response({"error": "memberId and minutes (0-1440, in 15-minute steps) are required"}, status=400)
    try:
        ok = await _call(lambda c: c.set_today_limit(_member(member_id), minutes * 60))
    except Exception as e:  # noqa: BLE001
        return _error(e)
    if not ok:
        return web.json_response({"error": "Sony refused the new limit."}, status=502)
    return web.json_response({"success": True})


async def on_limit(req: web.Request) -> web.Response:
    body = await req.json()
    member_id = str(body.get("memberId") or "")
    action = body.get("action")
    if not member_id or action not in ON_LIMIT_ACTIONS:
        return web.json_response({"error": f"memberId and action ({' | '.join(ON_LIMIT_ACTIONS)}) are required"}, status=400)
    try:
        ok = await _call(lambda c: c.set_on_limit_action(member_id, action))
    except Exception as e:  # noqa: BLE001
        return _error(e)
    if not ok:
        return web.json_response({"error": "Sony refused the change."}, status=502)
    return web.json_response({"success": True})


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = web.Application()
    app.add_routes([
        web.get("/status", status),
        web.post("/connect", connect),
        web.post("/disconnect", disconnect),
        web.get("/playtime", playtime),
        web.post("/today-limit", today_limit),
        web.post("/on-limit", on_limit),
    ])
    web.run_app(app, host="0.0.0.0", port=PORT, access_log=None)


if __name__ == "__main__":
    main()
