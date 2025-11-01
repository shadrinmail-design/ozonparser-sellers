from pathlib import Path
import os
from typing import Optional

from playwright.sync_api import sync_playwright


DEFAULT_URL = "https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true"


def cookie_header_from_context(context) -> str:
    cookies = context.cookies()
    parts = []
    for c in cookies:
        name = c.get("name")
        value = c.get("value")
        if name and value is not None:
            parts.append(f"{name}={value}")
    return "; ".join(parts)


def collect(save_to: Path, url: str = DEFAULT_URL, headless: bool = True) -> str:
    proxy = None
    # Prefer SOCKS/ALL_PROXY if provided, then HTTPS/HTTP
    socks = os.getenv("ALL_PROXY") or os.getenv("SOCKS_PROXY")
    https_proxy = os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")
    http_proxy = os.getenv("HTTP_PROXY") or os.getenv("http_proxy")
    server = socks or https_proxy or http_proxy
    if server:
        proxy = {"server": server}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(locale="ru-RU", proxy=proxy)
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded")
        # Try to accept cookie banner if present (best effort)
        try:
            page.get_by_role("button", name=("Принять" or "Принять все")).click(timeout=2000)
        except Exception:
            pass
        # Let network settle
        page.wait_for_load_state("networkidle", timeout=15000)

        cookie_header = cookie_header_from_context(context)
        save_to.parent.mkdir(parents=True, exist_ok=True)
        save_to.write_text(cookie_header, encoding="utf-8")

        context.close()
        browser.close()
        return cookie_header


def main():
    out_path = Path(os.getenv("OZON_COOKIES_FILE", "./ozon_cookies.txt")).resolve()
    url = os.getenv("OZON_START_PAGE", DEFAULT_URL)
    headless = os.getenv("HEADLESS", "1") != "0"
    cookie = collect(out_path, url=url, headless=headless)
    print(str(out_path))
    print(f"saved_cookie_length={len(cookie)}")


if __name__ == "__main__":
    main()
