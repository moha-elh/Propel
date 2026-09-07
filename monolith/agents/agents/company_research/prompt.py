from typing import Optional, Set

from langchain_core.messages import SystemMessage, HumanMessage, BaseMessage

_KNOWN = {
    "emails": "list of contact email addresses found on the page (empty array if none)",
    "phones": "list of contact phone numbers found on the page (empty array if none)",
    "social": "list of social media links on the page, each as an object with `key` (platform lowercased: linkedin, twitter, facebook, instagram, github, youtube, tiktok) and `url`",
    "address": "the company's HQ / office address as a single string if stated, else null",
    "about": "a 2-4 sentence factual summary of what the company does (products/services/market), based only on the page; keep it neutral and concrete",
    "facts": "list of short factual statements (founded date, size, sector, notable products/customers/acquisitions) - 5-10 items max, each a single sentence",
}

_PROMPT = """You are a company research analyst. Given the visible text of a company's homepage
you extract structured facts. Rules:
- Only include information actually present on the page. If something is not stated, use null / empty array.
- Never invent facts, email addresses or phone numbers.
- email addresses: include mailto: targets and any emails shown in the text.
- social links: normalise to the full https:// URL; skip links that are just hashtags or anchors.
- Return a SINGLE JSON object, no commentary, matching exactly this shape:
{
  "emails": ["...", "..."],
  "phones": ["...", "..."],
  "social": [{"key": "linkedin", "url": "https://..."}],
  "address": "..." | null,
  "about": "..." | null,
  "facts": ["...", "..."]
}"""


def get_research_messages(
    name: str,
    website_url: Optional[str],
    location: Optional[str],
    page_text: str,
    data_types: set[str],
) -> list[BaseMessage]:
    instructions = []
    for dt in sorted(data_types):
        if dt in _KNOWN:
            instructions.append(f"- {dt}: {_KNOWN[dt]}")

    chunks = [page_text[i : i + 8000] for i in range(0, len(page_text), 8000)]
    human = (
        f"Company name: {name}\n"
        f"Website: {website_url or 'unknown'}\n"
        f"Location: {location or 'unknown'}\n\n"
        f"Extract the following fields:\n{chr(10).join(instructions)}\n\n"
        f"Page text:\n```\n{chunks[0]}\n```"
    )
    if len(chunks) > 1:
        human += f"\n\n(continued page text)\n```\n{chunks[1]}\n```"
    if len(chunks) > 2:
        human += "\n\n[page text truncated — use only the visible parts]"

    return [
        SystemMessage(content=_PROMPT),
        HumanMessage(content=human),
    ]