"""Single-user auth: validate the one bearer token."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import require_auth
from app.core.security import token_is_valid

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    token: str


@router.post("/login")
async def login(body: LoginBody) -> dict:
    """Validate a token so the frontend can store it. No sessions/JWT — the token IS the credential."""
    if not token_is_valid(body.token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return {"ok": True}


@router.get("/me", dependencies=[Depends(require_auth)])
async def me() -> dict:
    return {"authenticated": True}
