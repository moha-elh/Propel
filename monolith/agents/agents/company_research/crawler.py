"""
Safe, minimal company homepage fetcher.

Security posture:
- Only http/https schemes are allowed.
- DNS resolution is checked: private / loopback / link-local / CGNAT ranges are refused.
- Redirects are followed with a hard cap, re-validating each hop's scheme + host.
- Response body is capped (~2 MB) and transfer uses a per-read timeout.
- The result is plain text (tags stripped) ready for LLM extraction.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 2 * 1024 * 1024  # ~2 MB
MAX_REDIRECTS = 5
CONNECT_TIMEOUT = 10.0
READ_TIMEOUT = 20.0
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 PropelCompanyResearch/1.0"
)

_PRIVATE_RANGES = (
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),  # CGNAT
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),  # benchmarking
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)

_TAG_STRIP_RE = re.compile(r"\s+")


def _is_private(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in _PRIVATE_RANGES)


def validate_url(url: str) -> str | None:
    """Return a normalized http(s) URL or None if it can't be used safely."""
    if not url:
        return None
    url = url.strip()
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:", url):
        # Already has a scheme — only http(s) is acceptable.
        scheme = url.split(":", 1)[0].lower()
        if scheme not in ("http", "https"):
            return None
    else:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.hostname:
        return None
    return url


def _resolve_safe(hostname: str) -> bool:
    """Resolve a hostname and refuse if any address is private / loopback."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError:
        # If it doesn't resolve at all, let httpx try (it may have its own resolver).
        return True
    for info in infos:
        ip = info[4][0]
        if _is_private(ip):
            logger.warning("Refusing to fetch private address %s for host %s", ip, hostname)
            return False
    return True


async def fetch_homepage(url: str) -> tuple[str | None, str | None]:
    """Fetch a company homepage and return (stripped_text, final_url)."""
    safe = validate_url(url)
    if safe is None:
        return None, None

    parsed = urlparse(safe)
    if not _resolve_safe(parsed.hostname):
        return None, None

    async with httpx.AsyncClient(
        follow_redirects=True,
        max_redirects=MAX_REDIRECTS,
        timeout=httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT),
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"},
    ) as client:
        try:
            response = await client.send(client.build_request("GET", safe), stream=True)
        except (httpx.HTTPError, OSError) as e:
            logger.warning("Fetch failed for %s: %s", safe, e)
            return None, None

        content = bytearray()
        try:
            if response.status_code >= 400:
                await response.aclose()
                return None, None
            content_length = response.headers.get("content-length")
            if content_length and content_length.isdigit() and int(content_length) > MAX_BODY_BYTES:
                await response.aclose()
                return None, None
            async for chunk in response.aiter_bytes():
                content.extend(chunk)
                if len(content) > MAX_BODY_BYTES:
                    await response.aclose()
                    return None, None
        except (httpx.HTTPError, OSError) as e:
            logger.warning("Read failed for %s: %s", safe, e)
            return None, None
        finally:
            try:
                await response.aclose()
            except Exception:
                pass

        final_url = str(response.url) if len(content) else safe

    if not content:
        return None, None

    text = _html_to_text(bytes(content))
    return text, final_url


def _html_to_text(raw: bytes, content_type: str = "") -> str:
    try:
        soup = BeautifulSoup(raw, "lxml")
        for tag in soup(["script", "style", "noscript", "svg", "nav", "footer"]):
            tag.decompose()
        text = soup.get_text(separator=" ")
    except Exception:
        try:
            text = raw.decode("utf-8", errors="ignore")
        except Exception:
            return ""
    text = _TAG_STRIP_RE.sub(" ", text).strip()
    # Cap the text we hand to the LLM to a sane size.
    return text[:60_000]
