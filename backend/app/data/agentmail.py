"""AgentMail client — sends the trade-action alert emails.

Docs: https://docs.agentmail.to  · base https://api.agentmail.to/v0
Auth: Bearer AGENTMAIL_API_KEY. We send from an inbox: set AGENTMAIL_INBOX to a
known inbox_id, otherwise one is created on first use and cached for the process
(the address is logged so you can pin it via env). Everything is best-effort.
"""

from __future__ import annotations

import re
import threading

from app.config import settings
from app.core.http import post_json
from app.core.logging import get_logger

log = get_logger("agentmail")

BASE = "https://api.agentmail.to/v0"
_lock = threading.Lock()
_inbox_cache: str | None = None


def configured() -> bool:
    return bool(settings.agentmail_api_key)


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.agentmail_api_key}",
            "Content-Type": "application/json"}


def ensure_inbox() -> str | None:
    """Return an inbox_id to send from — env-pinned, cached, or freshly created."""
    global _inbox_cache
    if settings.agentmail_inbox:
        return settings.agentmail_inbox
    if _inbox_cache:
        return _inbox_cache
    if not configured():
        return None
    with _lock:
        if _inbox_cache:
            return _inbox_cache
        try:
            data = post_json(f"{BASE}/inboxes",
                             json={"display_name": settings.agentmail_from_name},
                             headers=_headers(), timeout=20)
        except Exception as exc:  # noqa: BLE001
            log.warning("agentmail create inbox failed", extra={"err": str(exc)})
            return None
        inbox_id = (data or {}).get("inbox_id") if isinstance(data, dict) else None
        email = (data or {}).get("email") if isinstance(data, dict) else None
        if inbox_id:
            _inbox_cache = inbox_id
            log.info("agentmail inbox ready — pin AGENTMAIL_INBOX to reuse",
                     extra={"inbox_id": inbox_id, "email": email})
        return _inbox_cache


def parse_recipients(to: str | list[str] | None) -> list[str]:
    """Split a recipient field into clean, de-duped addresses.

    Accepts a list, or a single string with addresses separated by commas,
    semicolons, or whitespace/newlines — so 'a@x.com, b@y.com' works in one field.
    Order is preserved; obviously-not-an-address entries (no '@') are dropped.
    """
    if not to:
        return []
    raw = to if isinstance(to, list) else re.split(r"[,;\s]+", to)
    seen: set[str] = set()
    out: list[str] = []
    for a in raw:
        a = (a or "").strip()
        if a and "@" in a and a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return out


def _send_one(inbox: str, to: str, subject: str, text: str, html: str | None) -> tuple[bool, str | None]:
    body = {"to": to, "subject": subject, "text": text}
    if html:
        body["html"] = html
    try:
        data = post_json(f"{BASE}/inboxes/{inbox}/messages/send",
                         json=body, headers=_headers(), timeout=20)
    except Exception as exc:  # noqa: BLE001
        log.warning("agentmail send failed", extra={"to": to, "err": str(exc)})
        return False, str(exc)
    mid = (data or {}).get("message_id") if isinstance(data, dict) else None
    return True, mid


def send_email(to: str | list[str], subject: str, text: str,
               html: str | None = None) -> tuple[bool, str | None]:
    """Send to one OR MANY recipients (comma/space/semicolon separated, or a list).

    Each address gets its own copy, so one bad address can't drop the rest.
    Returns (ok, info): on success info is the first message_id; on failure info is
    the last error string (surfaced by the /alerts/test endpoint so you can see why).
    ok is True if at least one recipient was accepted.
    """
    recips = parse_recipients(to)
    if not configured() or not recips:
        return False, None
    inbox = ensure_inbox()
    if not inbox:
        return False, "no sending inbox — check AGENTMAIL_API_KEY on the backend"
    any_ok = False
    first_id: str | None = None
    last_err: str | None = None
    for addr in recips:
        ok, info = _send_one(inbox, addr, subject, text, html)
        if ok:
            any_ok = True
            if first_id is None:
                first_id = info
        else:
            last_err = info
    return (True, first_id) if any_ok else (False, last_err)
