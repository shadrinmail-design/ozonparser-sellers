import logging
import os
import random
from typing import Dict, Optional


def setup_logger() -> logging.Logger:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=getattr(logging, level, logging.INFO),
    )
    return logging.getLogger("ozon-parser")


UA_LIST = [
    # A small, curated set of modern desktop UAs
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]


def choose_user_agent(seed: Optional[int] = None) -> str:
    rnd = random.Random(seed)
    return rnd.choice(UA_LIST)


def build_default_headers(user_agent: Optional[str] = None) -> Dict[str, str]:
    ua = user_agent or choose_user_agent()
    headers = {
        "user-agent": ua,
        "accept": "application/json, text/plain, */*",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        # Emulate Ozon app headers commonly used by composer API
        "x-o3-app-name": "d-web-desktop",
        "x-o3-app-version": "release",
        "x-o3-language": "ru",
        "x-o3-os": "web",
        "origin": "https://www.ozon.ru",
        "referer": "https://www.ozon.ru/",
    }
    # Optional cookie header via env var
    # Prefer explicit cookie string, or load from file if provided
    cookie = os.getenv("OZON_COOKIES")
    if not cookie:
        cookie_file = os.getenv("OZON_COOKIES_FILE")
        if cookie_file and os.path.exists(cookie_file):
            try:
                with open(cookie_file, "r", encoding="utf-8") as f:
                    cookie = f.read().strip()
            except Exception:
                cookie = None
    if cookie:
        headers["cookie"] = cookie
    return headers
