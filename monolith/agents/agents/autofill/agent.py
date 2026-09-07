import datetime
import logging
import re
from typing import Any, Optional

from shared.llm import get_llm, ainvoke_with_fallback
from shared.tools.json_utils import parse_llm_json
from agents.autofill.prompt import get_autofill_messages
from agents.autofill.schemas import AutofillRequest, AutofillResponse, FieldDef

logger = logging.getLogger(__name__)


def _parse_json(content: str) -> dict:
    data = parse_llm_json(content)
    if not data:
        logger.warning("Autofill: model JSON unsalvageable; full content:\n%s", content)
        raise RuntimeError(
            f"Autofill: model returned unsalvageable JSON (snippet: {content[:200]!r})"
        )
    return data


_SKILL_ALIASES = ("skill", "technolog", "tool")

# Deterministic safety net: when the model leaves a skills-ish textarea empty, pull
# the technologies actually named in the description straight from the text. Order
# of appearance is preserved; duplicates collapsed; capped to keep the field sane.
# key = lowercase matcher, value = canonical display casing.
_TECH_LEXICON = {
    "java": "Java",
    "spring boot": "Spring Boot",
    "spring": "Spring",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "angular": "Angular",
    "react": "React",
    "vue": "Vue",
    "node.js": "Node.js",
    "node": "Node",
    "python": "Python",
    "django": "Django",
    "flask": "Flask",
    "fastapi": "FastAPI",
    "kotlin": "Kotlin",
    "golang": "Go",
    "rust": "Rust",
    "php": "PHP",
    "ruby": "Ruby",
    "swift": "Swift",
    "c#": "C#",
    "c++": "C++",
    ".net": ".NET",
    "asp.net": "ASP.NET",
    "sql": "SQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mariadb": "MariaDB",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "kafka": "Kafka",
    "rabbitmq": "RabbitMQ",
    "grpc": "gRPC",
    "graphql": "GraphQL",
    "docker": "Docker",
    "docker-compose": "Docker Compose",
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "nginx": "nginx",
    "terraform": "Terraform",
    "ansible": "Ansible",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "git": "Git",
    "github": "GitHub",
    "gitlab": "GitLab",
    "jenkins": "Jenkins",
    "github actions": "GitHub Actions",
    "ci/cd": "CI/CD",
    "html": "HTML",
    "css": "CSS",
    "sass": "Sass",
    "tailwind": "Tailwind",
    "bootstrap": "Bootstrap",
    "microservices": "Microservices",
    "mapstruct": "MapStruct",
    "maven": "Maven",
    "gradle": "Gradle",
    "hadoop": "Hadoop",
    "spark": "Spark",
    "tensorflow": "TensorFlow",
    "pytorch": "PyTorch",
    "numpy": "NumPy",
    "pandas": "pandas",
    "scikit-learn": "scikit-learn",
    "matplotlib": "Matplotlib",
    "keycloak": "Keycloak",
    "oauth2": "OAuth2",
    "oauth": "OAuth",
    "jwt": "JWT",
    "uvicorn": "uvicorn",
    "pydantic": "Pydantic",
    "sqlalchemy": "SQLAlchemy",
    "alembic": "Alembic",
    "celery": "Celery",
    "ssr": "SSR",
}


def _extract_skills(text: str) -> str:
    lower = text.lower()
    found: list[str] = []
    seen: set[str] = set()
    for matcher, canonical in _TECH_LEXICON.items():
        pattern = re.compile(r"(?<![a-z0-9])" + re.escape(matcher) + r"(?![a-z0-9])")
        if pattern.search(lower):
            key = matcher.lower()
            if any(key != fk and key in fk for fk in seen):
                continue  # subsumed by a longer match already found ("Spring" inside "Spring Boot")
            if key not in seen:
                seen.add(key)
                found.append(canonical)
    return ", ".join(found[:12])


def _is_skill_field(field: FieldDef) -> bool:
    name = (field.name or "").lower()
    label = (field.label or "").lower()
    return any(alias in name or alias in label for alias in _SKILL_ALIASES)


def _normalize_date(val: Any) -> str:
    s = str(val).strip()
    if not s:
        return ""
    # Already a clean date?
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    # yyyy/mm/dd or yyyy.mm.dd
    m = re.search(r"(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})", s)
    if m:
        y, mo, d = m.groups()
        try:
            return f"{y}-{int(mo):02d}-{int(d):02d}"
        except ValueError:
            return ""
    # A month name
    for fmt in ("%B %Y", "%b %Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Just a year -> Jan 1
    m = re.fullmatch(r"(\d{4})", s)
    if m:
        return f"{m.group(1)}-01-01"
    return s


def _coerce(field: FieldDef, val: Any) -> Any:
    ft = (field.type or "text").lower()
    # Missing / empty marker -> leave blank
    if val is None:
        return None if ft == "number" else ""
    if isinstance(val, str) and not val.strip():
        return None if ft == "number" else ""

    if ft == "number":
        if isinstance(val, (int, float)):
            return val
        m = re.search(r"-?\d+(?:\.\d+)?", str(val).replace(",", "."))
        if not m:
            return None
        try:
            return float(m.group(0))
        except ValueError:
            return None

    if ft == "date":
        return _normalize_date(val)

    s = str(val).strip()

    if ft in ("select", "choice") and field.options:
        low = {str(o).strip().lower(): o for o in field.options}
        exact = low.get(s.lower())
        if exact is not None:
            return exact
        # fuzzy match
        best = None
        for token, original in low.items():
            if token in s.lower() or s.lower() in token:
                best = original
                break
        return best if best is not None else s

    # bool-ish
    if ft == "checkbox" or ft == "boolean":
        low = s.lower()
        if low in ("yes", "true", "1", "on"):
            return True
        if low in ("no", "false", "0", "off"):
            return False
        return s

    # list -> join into a readable string for textarea fields
    if isinstance(val, list):
        return ", ".join(str(v).strip() for v in val if str(v).strip())

    return s


async def autofill(req: AutofillRequest) -> AutofillResponse:
    messages = get_autofill_messages(req.text, req.entity_type, req.fields)
    _, content = await ainvoke_with_fallback(
        messages,
        preferred_provider=req.provider,
        model=req.model,
        temperature=0.2,
        max_tokens=1024,
    )
    data = _parse_json(content)

    values: dict[str, Any] = {}
    for field in req.fields:
        if field.name in data:
            values[field.name] = _coerce(field, data[field.name])

    for field in req.fields:
        if _is_skill_field(field) and not values.get(field.name):
            values[field.name] = _extract_skills(req.text)

    return AutofillResponse(values=values)
