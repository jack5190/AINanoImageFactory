import base64
import math
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import requests


def _xml_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


@dataclass
class ProviderConfig:
    api_key: str
    base_url: str
    model: str
    timeout: int
    use_mock: bool
    placeholder_on_error: bool


def _normalize_base_model_action(
    config: ProviderConfig,
    override_base_url: Optional[str],
    override_model: Optional[str],
) -> tuple[str, str, Optional[str]]:
    """Return base URL, model, and optional explicit action suffix."""
    base_url = (override_base_url or config.base_url).rstrip("/")
    model = override_model or config.model
    action: Optional[str] = None

    if "/models/" in base_url:
        prefix, _, tail = base_url.partition("/models/")
        tail_model_action = tail or ""
        tail_model, _, tail_action = tail_model_action.partition(":")
        if not override_model and tail_model:
            model = tail_model
        if tail_action:
            action = f":{tail_action.lstrip(':')}"
        base_url = prefix.rstrip("/")

    return base_url, model, action


def build_endpoint(
    config: ProviderConfig,
    override_base_url: Optional[str] = None,
    override_model: Optional[str] = None,
) -> str:
    base_url, model, explicit_action = _normalize_base_model_action(config, override_base_url, override_model)
    action = explicit_action
    raw_base = (override_base_url or config.base_url).lower()

    if not action:
        if "generatecontent" in raw_base or model.startswith("gemini-"):
            action = ":generateContent"
        elif "predict" in raw_base:
            action = ":predict"
        elif model.startswith(("imagen-", "imagegeneration")):
            action = ":predict"
        else:
            action = ":generateImages"

    return f"{base_url}/models/{model}{action}"


def build_status_endpoint(config: ProviderConfig, override_base_url: Optional[str] = None) -> str:
    base_url = (override_base_url or config.base_url).rstrip("/")
    if "/models/" in base_url:
        base_url = base_url.split("/models", 1)[0].rstrip("/")
    return f"{base_url}/models"


def _derive_aspect_ratio(size: Optional[str]) -> Optional[str]:
    """Convert size strings like 1600x900 into aspect ratio format expected by the API."""
    if not size:
        return None
    cleaned = size.lower().replace(" ", "")
    if "x" not in cleaned:
        return None
    try:
        width_str, height_str = cleaned.split("x", 1)
        width = int(width_str)
        height = int(height_str)
    except (ValueError, TypeError):
        return None
    if width <= 0 or height <= 0:
        return None
    divisor = math.gcd(width, height) or 1
    return f"{width // divisor}:{height // divisor}"


def make_placeholder_svg(prompt: str, width: int = 1024, height: int = 768) -> bytes:
    safe_prompt = _xml_escape(prompt[:120])
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    svg = f"""<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\">
<defs>
  <linearGradient id=\"bg\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\">
    <stop offset=\"0%\" stop-color=\"#0b1020\"/>
    <stop offset=\"100%\" stop-color=\"#0e6f70\"/>
  </linearGradient>
</defs>
<rect width=\"100%\" height=\"100%\" fill=\"url(#bg)\"/>
<rect x=\"60\" y=\"60\" width=\"{width - 120}\" height=\"{height - 120}\" rx=\"28\" fill=\"rgba(255,255,255,0.08)\" stroke=\"rgba(255,255,255,0.35)\"/>
<text x=\"90\" y=\"150\" fill=\"#f6f6f6\" font-size=\"36\" font-family=\"'Avenir Next', 'Helvetica Neue', sans-serif\">Nano Banana Proxy</text>
<text x=\"90\" y=\"210\" fill=\"#fbd38d\" font-size=\"20\" font-family=\"'Avenir Next', 'Helvetica Neue', sans-serif\">Prompt Preview</text>
<text x=\"90\" y=\"260\" fill=\"#f6f6f6\" font-size=\"18\" font-family=\"'Avenir Next', 'Helvetica Neue', sans-serif\">{safe_prompt}</text>
<text x=\"90\" y=\"{height - 110}\" fill=\"#9ae6b4\" font-size=\"14\" font-family=\"'Avenir Next', 'Helvetica Neue', sans-serif\">Generated locally at {timestamp}</text>
</svg>
"""
    return svg.encode("utf-8")


def encode_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def normalize_return_type(value: Optional[str]) -> str:
    if not value:
        return "base64"
    value = value.lower().strip()
    if value not in {"base64", "url"}:
        return "base64"
    return value


def generate_images(
    prompt: str,
    negative_prompt: Optional[str],
    count: int,
    config: ProviderConfig,
    return_type: Optional[str] = None,
    size: Optional[str] = None,
    override_api_key: Optional[str] = None,
    override_base_url: Optional[str] = None,
    override_model: Optional[str] = None,
) -> List[Dict[str, Any]]:
    return_type = normalize_return_type(return_type)
    api_key = override_api_key or config.api_key
    aspect_ratio = _derive_aspect_ratio(size)

    if config.use_mock or not api_key:
        images = []
        for index in range(count):
            svg_bytes = make_placeholder_svg(prompt)
            b64 = encode_base64(svg_bytes)
            if return_type == "url":
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
        return images

    endpoint = build_endpoint(config, override_base_url, override_model)
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }

    use_generate_content = ":generateContent" in endpoint
    use_predict = ":predict" in endpoint

    if use_generate_content:
        merged_prompt = prompt
        if negative_prompt:
            merged_prompt = f"{prompt}\nAvoid: {negative_prompt}"
        generation_config: Dict[str, Any] = {"candidateCount": max(1, min(count, 8))}
        response_mime = os.getenv("GOOGLE_AI_STUDIO_RESPONSE_MIME", "image/png").strip()
        if response_mime:
            generation_config["responseMimeType"] = response_mime
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": merged_prompt},
                    ],
                }
            ],
            "generationConfig": generation_config,
        }
    elif use_predict:
        merged_prompt = prompt
        if negative_prompt:
            merged_prompt = f"{prompt}\nAvoid: {negative_prompt}"
        parameters: Dict[str, Any] = {"sampleCount": max(1, min(count, 8))}
        if aspect_ratio:
            parameters["aspectRatio"] = aspect_ratio
        payload = {
            "instances": [{"prompt": merged_prompt}],
            "parameters": parameters,
        }
    else:
        payload = {
            "prompt": {"text": prompt},
            "generationConfig": {"numberOfImages": max(1, min(count, 8))},
        }
        if negative_prompt:
            payload["negativePrompt"] = {"text": negative_prompt}

    response = requests.post(endpoint, headers=headers, json=payload, timeout=config.timeout)
    response.raise_for_status()
    data = response.json()

    images = []
    if use_generate_content:
        candidates = data.get("candidates") or []
        for index, candidate in enumerate(candidates):
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                inline = part.get("inlineData") or {}
                b64 = inline.get("data")
                if not b64:
                    continue
                mime = inline.get("mimeType") or "image/png"
                if return_type == "url":
                    images.append(
                        {
                            "index": index,
                            "type": "url",
                            "mime": mime,
                            "url": f"data:{mime};base64,{b64}",
                        }
                    )
                else:
                    images.append(
                        {
                            "index": index,
                            "type": "base64",
                            "mime": mime,
                            "data": b64,
                        }
                    )
    elif use_predict:
        predictions = data.get("predictions") or []
        for index, prediction in enumerate(predictions):
            b64 = (
                prediction.get("bytesBase64Encoded")
                or prediction.get("base64")
                or prediction.get("data")
                or (prediction.get("image") or {}).get("bytesBase64Encoded")
            )
            if not b64:
                continue
            mime = prediction.get("mimeType") or prediction.get("mime_type") or "image/png"
            if return_type == "url":
                images.append(
                    {
                        "index": index,
                        "type": "url",
                        "mime": mime,
                        "url": f"data:{mime};base64,{b64}",
                    }
                )
            else:
                images.append(
                    {
                        "index": index,
                        "type": "base64",
                        "mime": mime,
                        "data": b64,
                    }
                )
    else:
        generated = data.get("generatedImages") or data.get("images") or []
        for index, item in enumerate(generated):
            b64 = (
                item.get("bytesBase64Encoded")
                or item.get("base64")
                or item.get("data")
            )
            if not b64:
                continue
            if return_type == "url":
                images.append(
                    {
                        "index": index,
                        "type": "url",
                        "mime": "image/png",
                        "url": f"data:image/png;base64,{b64}",
                    }
                )
            else:
                images.append(
                    {
                        "index": index,
                        "type": "base64",
                        "mime": "image/png",
                        "data": b64,
                    }
                )

    if not images:
        if not config.placeholder_on_error:
            raise RuntimeError("Provider returned no images")
        # Graceful placeholder if provider returns no inline data and placeholder mode is allowed
        for index in range(count):
            svg_bytes = make_placeholder_svg(prompt)
            b64 = encode_base64(svg_bytes)
            if return_type == "url":
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

    return images


def validate_key(
    config: ProviderConfig,
    override_api_key: Optional[str] = None,
    override_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    api_key = override_api_key or config.api_key
    if config.use_mock:
        return {"ok": True, "mode": "mock", "message": "Mock mode enabled"}
    if not api_key:
        return {"ok": False, "message": "API key missing"}

    endpoint = build_status_endpoint(config, override_base_url)
    params = {"key": api_key}
    headers = {"x-goog-api-key": api_key}

    response = requests.get(f"{endpoint}?{urlencode(params)}", headers=headers, timeout=config.timeout)
    if response.status_code != 200:
        return {
            "ok": False,
            "status": response.status_code,
            "message": response.text[:300],
        }

    payload = response.json()
    models = payload.get("models") or []
    return {
        "ok": True,
        "status": response.status_code,
        "models": [model.get("name") for model in models if isinstance(model, dict)],
    }


def load_config() -> ProviderConfig:
    return ProviderConfig(
        api_key=os.getenv("GOOGLE_AI_STUDIO_API_KEY", "").strip(),
        base_url=os.getenv(
            "GOOGLE_AI_STUDIO_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta",
        ),
        model=os.getenv("GOOGLE_AI_STUDIO_MODEL", "imagen-4.0-fast-generate-001"),
        timeout=int(os.getenv("GOOGLE_AI_STUDIO_TIMEOUT", "30")),
        use_mock=os.getenv("USE_MOCK", "false").lower() in {"1", "true", "yes"},
        placeholder_on_error=os.getenv("USE_PLACEHOLDER_ON_ERROR", "false").lower() in {"1", "true", "yes"},
    )
