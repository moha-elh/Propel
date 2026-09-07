from typing import List

from langchain_core.messages import SystemMessage

from agents.autofill.schemas import FieldDef

_SYSTEM_HEADER = """You are a precise form auto-fill assistant. Given a block of natural-language
description text, you extract the specific pieces of information the caller asked for and
return them as a single JSON object whose keys are the exact field names provided.

Rules:
1. Each JSON key must be EXACTLY the field name you are given — do not rename, pluralize,
   or guess new keys.
2. Extract the value from the text. If a value is not present or cannot be determined, use:
     - For text/textarea/url fields: an empty string ""
     - For date fields: "" (the caller will drop blanks)
     - For number fields: null
     - Never invent facts that are not in the text.
3. Select/choice fields MUST return one of the listed allowed options verbatim; if nothing
   matches, return the closest option or "" if asked (string) — prefer the exact option token.
4. For list-ish textareas (e.g. skills, responsibilities), join the items into a single
   human-friendly string, unless the field type allows an array.
5. Return ONLY the JSON object — no markdown fences, no commentary, no prose."""


def _escape(v: str) -> str:
    return v.replace("\\", "\\\\").replace('"', '\\"')


def _field_spec(field: FieldDef) -> str:
    parts = [f'"{_escape(field.name)}"']
    if field.label:
        parts.append(f" // {field.label}")
    if field.help:
        parts.append(f" ({field.help})")
    if field.options:
        # Build the quoted list outside the f-string (a literal " inside an
        # f-string expression is a SyntaxError before Python 3.12).
        allowed = ", ".join('"' + _escape(o) + '"' for o in field.options)
        parts.append(f" — allowed: {allowed}")
    return "".join(parts)


def _build_field_block(fields: List[FieldDef]) -> str:
    if not fields:
        return "{}"
    lines = ",\n    ".join(_field_spec(f) for f in fields)
    return "{\n    " + lines + "\n}"


def _build_rules(fields: List[FieldDef]) -> str:
    rules = []
    for f in fields:
        ft = (f.type or "text").lower()
        if ft in ("select", "choice"):
            allowed = ", ".join(f'"{_escape(o)}"' for o in f.options) if f.options else ""
            rules.append(
                f'- "{f.name}" must be one of {allowed}.'
            )
        elif ft == "date":
            rules.append(
                f'- "{f.name}" a date; if present return it as YYYY-MM-DD, otherwise ""'
            )
        elif ft == "number":
            rules.append(
                f'- "{f.name}" a bare JSON number (no % or units) or null when unknown'
            )
        elif ft == "url":
            rules.append(
                f'- "{f.name}" a full URL or "" when unknown'
            )
    if not rules:
        return ""
    return "\n".join(rules)


def get_autofill_messages(text: str, entity_type: str, fields: List[FieldDef]) -> List[SystemMessage]:
    if not text or not text.strip():
        raise ValueError("Empty description text")
    field_block = _build_field_block(fields)
    rules = _build_rules(fields)
    schema_hint = (
        f"\nThe form you are filling is for: **{entity_type}**."
        if entity_type and entity_type != "generic"
        else ""
    )
    # Built outside the f-string: a backslash inside an f-string expression is a
    # SyntaxError before Python 3.12.
    rules_block = f"\n\nField-specific rules:\n{rules}" if rules else ""
    prompt = (
        f"{_SYSTEM_HEADER}\n"
        f"{schema_hint}\n\n"
        f"Return a JSON object with these keys:\n{field_block}"
        f"{rules_block}\n\n"
        f"Now extract from this description:\n{text}"
    )
    return [SystemMessage(content=prompt)]
