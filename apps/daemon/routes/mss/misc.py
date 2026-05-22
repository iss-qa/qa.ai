import logging
from typing import List

from fastapi import APIRouter, Response
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("mss.misc")


class _MSSFormatReq(BaseModel):
    commands: List[str]


@router.get("/mss/api/auth")
async def mss_auth():
    return {"authToken": None, "openAiToken": None}


@router.get("/mss/api/auth-token")
async def mss_auth_token():
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="No auth token")


@router.post("/mss/api/auth/openai-token")
async def mss_save_openai_token(body: dict):
    return Response(status_code=200)


@router.delete("/mss/api/auth/openai-token")
async def mss_delete_openai_token():
    return Response(status_code=200)


@router.get("/mss/api/banner-message")
async def mss_banner():
    return {"message": "QAMind Embedded Maestro Studio", "level": "none"}


@router.post("/mss/api/format-flow")
async def mss_format_flow(req: _MSSFormatReq):
    return {"config": "", "commands": "\n".join(req.commands)}


@router.get("/mss/api/mock-server/data")
async def mss_mock_data():
    return {"projectId": None, "events": []}


@router.get("/mss/")
async def mss_root():
    return Response(
        content="QAMind Maestro Studio Server",
        media_type="text/plain",
        headers={"Access-Control-Allow-Origin": "*"},
    )
