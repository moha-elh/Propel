import logging
import re
from html import unescape
from typing import Optional

from langchain_core.messages import SystemMessage, HumanMessage

from shared.llm.fallback import ainvoke_with_fallback
from shared.tools.json_utils import parse_llm_json
from agents.company_research.crawler import fetch_homepage, validate_url
from agents.company_research.schemas import (
    CompanyResearchRequest,
    CompanyResearchResult,
    SocialLink,
)

logger = logging.getLogger(__name__)

ALL_DATA_TYPES = {"emails", "phones", "social", "address", "about", "facts"}

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\+?\d{1,3}[ \-\(\.]?\d{2,4}[ \-\(\.]?\d{2,4}[ \-\.]?\d{2,6}")


def _selected(types: list[str]) -> set[str]:
    chosen = {t.strip().lower() for t in (types or []) if t and t.strip()}
    return chosen if chosen else ALL_DATA_TYPES


def _simple_extract(text: str, types: set[str]) -> dict:
    """Deterministic fallback used when the LLM call fails or returns nothing."""
    out: dict = {"emails": [], "phones": []}
    if "emails" in types:
        out["emails"] = sorted({unescape(m) for m in _EMAIL_RE.findall(text)})
    if "phones" in types:
        seen: list[str] = []
        for m in _PHONE_RE.findall(text):
            norm = m.strip()
            if norm and norm not in seen:
                seen.append(norm)
        out["phones"] = seen[:20]
    return out


async def research(req: CompanyResearchRequest) -> CompanyResearchResult:
    types = _selected(req.data_types)
    safe_url = validate_url(req.website_url)
    page_text, final_url = None, None
    if safe_url:
        page_text, final_url = await fetch_homepage(safe_url)

    if not page_text:
        fallback = _simple_extract(req.website_url or "", types)
        return CompanyResearchResult(
            name=req.name,
            website_url=safe_url or req.website_url,
            source_url=final_url,
            error="Could not fetch the company homepage",
            emails=fallback["emails"],
            phones=fallback["phones"],
        )

    from agents.company_research.prompt import get_research_messages

    messages = get_research_messages(req.name, req.website_url, req.location, page_text, types)
    content = ""
    try:
        _, content = await ainvoke_with_fallback(
            messages,
            preferred_provider=req.provider,
            model=req.model,
            temperature=0.2,
            max_tokens=1400,
        )
    except Exception as e:
        logger.warning("LLM research extraction failed for %s: %s", req.name, e)

    suggested = {}
    if content:
        suggested = _parse_json(content)

    result = _merge(req, types, suggested, page_text, final_url)
    return result


def _parse_json(content: str) -> dict:
    return parse_llm_json(content)


def _clean_list(val) -> list[str]:
    if isinstance(val, str):
        val = [val]
    if not isinstance(val, list):
        return []
    out = []
    for item in val:
        if isinstance(item, dict):
            item = " ".join(str(v) for k, v in item.items() if k in ("url", "value", "email", "phone", "name"))
        s = str(item).strip()
        if s and s not in out:
            out.append(s)
    return out


def _clean_social(val) -> list[SocialLink]:
    if not isinstance(val, list):
        return []
    out: list[SocialLink] = []
    seen: set[str] = set()
    for item in val:
        if isinstance(item, dict):
            key = str(item.get("key") or item.get("platform") or item.get("name") or "").strip().lower()
            url = str(item.get("url") or item.get("link") or item.get("value") or "").strip()
        else:
            continue
        if not key or not url:
            continue
        if not re.match(r"^https?://", url, re.IGNORECASE):
            continue
        if key not in seen:
            seen.add(key)
            out.append(SocialLink(key=key, url=url))
    return out


def _merge(
    req: CompanyResearchRequest,
    types: set[str],
    sugg: dict,
    page_text: str,
    final_url: Optional[str],
) -> CompanyResearchResult:
    fallback = _simple_extract(page_text, types)

    emails = _clean_list(sugg.get("emails")) if "emails" in types else []
    if not emails:
        emails = fallback["emails"]

    phones = _clean_list(sugg.get("phones")) if "phones" in types else []
    if not phones:
        phones = fallback["phones"]

    social = _clean_social(sugg.get("social")) if "social" in types else []

    address = None
    if "address" in types:
        raw = sugg.get("address")
        if isinstance(raw, str) and raw.strip():
            address = raw.strip()

    about = None
    if "about" in types:
        raw = sugg.get("about") or sugg.get("description")
        if isinstance(raw, str) and raw.strip():
            about = raw.strip()[:2000]

    facts = []
    if "facts" in types:
        facts = _clean_list(sugg.get("facts") or sugg.get("company_facts"))[:30]

    return CompanyResearchResult(
        name=req.name,
        website_url=safe_url_or(req.website_url),
        emails=emails[:30],
        phones=phones[:20],
        social=social[:20],
        address=address,
        about=about,
        facts=facts,
        source_url=final_url,
    )


def safe_url_or(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    return validate_url(url) or url
