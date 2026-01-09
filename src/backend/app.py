import logging
import os
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from .nano_banana import (
        encode_base64,
        generate_images,
        load_config,
        make_placeholder_svg,
        validate_key,
    )
except ImportError:
    from nano_banana import (
        encode_base64,
        generate_images,
        load_config,
        make_placeholder_svg,
        validate_key,
    )


class RateLimiter:
    def __init__(self, max_per_minute: int) -> None:
        self.max_per_minute = max_per_minute
        self.hits: Dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        window = 60
        queue = self.hits[key]
        while queue and now - queue[0] > window:
            queue.popleft()
        if len(queue) >= self.max_per_minute:
            return False
        queue.append(now)
        return True


class KeyStatusRequest(BaseModel):
    api_key: Optional[str] = Field(default=None, description="Override API key")
    base_url: Optional[str] = Field(default=None, description="Override base URL")


class GenerateRequest(BaseModel):
    prompt: Optional[str] = None
    prompts: Optional[List[str]] = None
    negative_prompt: Optional[str] = None
    size: Optional[str] = None
    style: Optional[str] = None
    language: Optional[str] = None
    count: int = 1
    return_type: Optional[str] = None


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("nano-proxy")

config = load_config()
rate_limit = int(os.getenv("RATE_LIMIT_PER_MIN", "90"))
limiter = RateLimiter(rate_limit)

app = FastAPI(title="Nano Banana Proxy", version="0.1.0")

allowed_origins = [origin.strip() for origin in os.getenv("ALLOW_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    start = time.time()
    if request.url.path.startswith("/api/"):
        client_ip = request.client.host if request.client else "unknown"
        if not limiter.allow(client_ip):
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
    response = await call_next(request)
    duration = (time.time() - start) * 1000
    if request.url.path.startswith("/api/"):
        logger.info("%s %s %s %.1fms", request.method, request.url.path, response.status_code, duration)
    return response


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "provider": "nano-banana",
        "mock": config.use_mock,
    }


@app.post("/api/key/status")
async def key_status(
    payload: KeyStatusRequest,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_base_url: Optional[str] = Header(default=None, alias="X-Base-Url"),
) -> Dict[str, Any]:
    api_key = payload.api_key or x_api_key
    base_url = payload.base_url or x_base_url

    try:
        status = validate_key(config, override_api_key=api_key, override_base_url=base_url)
        return status
    except Exception as exc:
        logger.exception("Key status error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/generate")
async def generate(
    payload: GenerateRequest,
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    x_base_url: Optional[str] = Header(default=None, alias="X-Base-Url"),
    x_model: Optional[str] = Header(default=None, alias="X-Model"),
    x_return_type: Optional[str] = Header(default=None, alias="X-Return-Type"),
) -> Dict[str, Any]:
    api_key = x_api_key
    base_url = x_base_url
    model = x_model
    return_type = payload.return_type or x_return_type
    if not payload.prompt and not payload.prompts:
        raise HTTPException(status_code=400, detail="prompt or prompts is required")
    count = max(1, min(payload.count, 8))
    prompts = payload.prompts or [payload.prompt]
    results = []
    for prompt in prompts:
        if not prompt:
            continue
        try:
            images = generate_images(
                prompt=prompt,
                negative_prompt=payload.negative_prompt,
                count=count,
                config=config,
                return_type=return_type,
                size=payload.size,
                override_api_key=api_key,
                override_base_url=base_url,
                override_model=model,
            )
        except Exception as exc:  # provider error
            logger.warning("Provider error: %s", exc)
            if config.placeholder_on_error:
                images = []
                for index in range(count):
                    svg_bytes = make_placeholder_svg(prompt)
                    b64 = encode_base64(svg_bytes)
                    if (return_type or "").lower() == "url":
                        images.append(
                            {
                                "index": index,
                                "type": "url",
                                "mime": "image/svg+xml",
                                "url": f"data:image/svg+xml;base64,{b64}",
                            }
                        )
                    else:
                        images.append(
                            {
                                "index": index,
                                "type": "base64",
                                "mime": "image/svg+xml",
                                "data": b64,
                            }
                        )
            else:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
        results.append(
            {
                "prompt": prompt,
                "count": count,
                "images": images,
            }
        )

    return {
        "status": "ok",
        "provider": "nano-banana",
        "request_id": request.headers.get("X-Request-Id", ""),
        "results": results,
    }
