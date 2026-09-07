"""Robust JSON extraction + repair for LLM text output.

LLMs occasionally emit JSON that `json.loads` rejects out of the box:
- ```json fences, prose before/after the payload
- an unescaped double quote inside a string value
- a response truncated mid-string (max_tokens cut-off)

This module centralises the fence-stripping + a few cheap, lossless-ish
recoveries so agents don't 500 on a model slip. Returns an empty dict when
nothing can be salvaged (agents treat that as a best-effort failure signal).
"""
import json
import re
from typing import Any, Optional


def strip_json_fences(text: str) -> str:
    """Trim a model reply down to its JSON payload.

    Handles ```json fences and prose surrounding a { ... } object.
    """
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return text[start:end + 1]
    return text


def _repair_prose_quotes(text: str) -> str:
    """Escape double quotes that appear *inside* string values.

    Valid JSON delimiters only end a string when the next non-space character
    is `,`, `}`, `]` or `:` (or the end of the payload). A quote followed by
    anything else is prose and gets backslash-escaped.
    """
    out: list[str] = []
    n = len(text)
    i = 0
    in_string = False
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "\\":
                out.append(ch)
                if i + 1 < n:
                    out.append(text[i + 1])
                    i += 1
                i += 1
                continue
            if ch == '"':
                j = i + 1
                while j < n and text[j] in " \t\r\n":
                    j += 1
                if j >= n or text[j] in ",}]:":
                    out.append(ch)
                    in_string = False
                else:
                    out.append('\\"')
                i += 1
                continue
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _escape_string_controls(text: str) -> str:
    """Escape literal control characters inside string values.

    LLMs routinely copy multi-line source text straight into a string, leaving
    real newlines/tabs that JSON forbids. Escapes only inside strings (outside
    strings whitespace is legal). Run after `_repair_prose_quotes` so interior
    quotes are already escaped and any remaining `"` is a real delimiter.
    """
    out: list[str] = []
    n = len(text)
    i = 0
    in_string = False
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "\\":
                out.append(ch)
                if i + 1 < n:
                    out.append(text[i + 1])
                    i += 1
                i += 1
                continue
            if ch == "\n":
                out.append("\\n")
                i += 1
                continue
            if ch == "\r":
                out.append("\\r")
                i += 1
                continue
            if ch == "\t":
                out.append("\\t")
                i += 1
                continue
            if ch == '"':
                j = i + 1
                while j < n and text[j] in " \t\r\n":
                    j += 1
                if j >= n or text[j] in ",}]:":
                    out.append(ch)
                    in_string = False
                else:
                    out.append('\\"')
                i += 1
                continue
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


_TRAILING_COMMA = re.compile(r",(\s*[}\]])$")


def _fix_trailing_commas(text: str) -> str:
    """Drop a trailing comma before the closing bracket (`{"a": 1,}`)."""
    return _TRAILING_COMMA.sub(r"\1", text.rstrip())


def _try_parse(raw: str) -> Optional[dict]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else {}


# Closing tails tried in priority order when the payload looks truncated.
# A dict value cut mid-string needs `"}`; a list-of-strings value needs `"]}`;
# deeper nesting and plain-bracket truncations come after.
_CLOSE_TAILS = (
    '"}',
    '"]}',
    '"}}',
    '"]}}',
    '"',
    '}',
    '}}',
    ']}',
    ']]}',
)


def _try_close(raw: str) -> Optional[dict]:
    """Recover a payload truncated mid-value by appending the missing closing
    quote/brackets. Tries closing tails in priority order (deterministic) so the
    first success keeps the most data and never injects stray brackets.
    """
    base = raw.rstrip()
    for tail in _CLOSE_TAILS:
        data = _try_parse(base + tail)
        if data is not None:
            return data
    return None


def _try_trimmed(raw: str, max_trims: int = 120) -> Optional[dict]:
    """Chop from the tail until the payload parses (handles truncation).

    Bounded so a genuinely-broken payload can't trigger an unbounded loop.
    May return a value with a truncated last field when the model was cut off.
    """
    candidate = raw.rstrip()
    for _ in range(max_trims):
        if not candidate:
            return None
        data = _try_parse(candidate)
        if data is not None:
            return data
        candidate = candidate[:-1].rstrip()
    return None


def parse_llm_json(content: str) -> dict:
    """Best-effort parse of an LLM's JSON reply; `{}` when unsalvageable.

    Recovery order preserves maximum fidelity: direct parse first, then string
    repairs (prose quotes, literal control chars, trailing commas), then
    closing/trimming *on the repaired text* (those can drop or truncate data,
    so they only run on the raw text as a last resort).
    """
    raw = strip_json_fences(content)

    data = _try_parse(raw)
    if data is not None:
        return data

    repaired = _fix_trailing_commas(_escape_string_controls(_repair_prose_quotes(raw)))
    data = _try_parse(repaired)
    if data is not None:
        return data

    for base in (repaired, raw):
        base = _fix_trailing_commas(base)
        data = _try_close(base)
        if data is not None:
            return data
        data = _try_trimmed(base)
        if data is not None:
            return data
    return {}