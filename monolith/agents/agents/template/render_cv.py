"""CV section builder.

Turns raw, non-paste-ready inputs into a structured CvSections object:
- job extraction output (role, requirements, responsibilities)
- semantic search matches over the user's profile (raw content + scores)
- the user's profile fields from the backend

An LLM decides which sections content belongs to and rewrites bullets to fit
the target role. When no LLM is configured/reachable the builder falls back to
a deterministic fill so the render pipeline stays testable end to end.
"""
import json
import logging
import re
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from shared.backend_client import (
    get_user, get_user_experiences, get_user_projects, get_user_skills,
    get_user_educations, get_user_hackathons, get_user_interests,
    get_user_languages, get_user_certifications,
    get_user_academic_activities, get_user_social_links, get_user_cvprofiles,
)
from agents.template.schemas import (
    CvEducation, CvExperience, CvExtracurricular, CvHackathon, CvHeader,
    CvLanguage, CvProject, CvSections, CvSkillGroup,
)
from agents.template.placeholders import format_constraints_hint, KNOWN_KEYS, parse_placeholders
from shared.tools.json_utils import parse_llm_json

logger = logging.getLogger(__name__)

SECTION_SCHEMA_HINT = """\n
Return ONLY valid JSON (no markdown fences, no commentary) with exactly these keys:
{
  "header": {"name": string, "tagline": string, "location": string, "phone": string,
             "email": string, "github": string, "linkedin": string},
  "about": string,
  "experiences": [{"role", "company", "dates", "description", "bullets": [string]}],
  "educations": [{"title", "institution", "dates"}],
  "projects": [{"name", "dates", "bullets": [string]}],
  "skillGroups": [{"title", "items": [string]}],
  "hackathons": [{"name", "event", "description"}],
  "languages": [{"name", "level"}],
  "softSkills": [string],
  "extracurricular": [{"title", "role", "dates", "bullets": [string]}],
  "interests": [string]
}
"""

CV_SECTIONS_SYSTEM_PROMPT = (
    "You are a senior CV writer. Given a job's requirements and raw candidate "
    "material (profile entries and semantic-match snippets with similarity "
    "scores), you produce a tailored, ATS-friendly CV. Decide which material "
    "belongs in each section and REWRITE bullets so they emphasize what the "
    "job needs (use action verbs, quantify when possible). Keep every entry "
    "factual: never invent companies, dates, links or achievements. Keep the "
    "candidate's header contact details EXACTLY as provided. Remove or "
    "de-emphasize material that is irrelevant to the target role."
    + SECTION_SCHEMA_HINT
)


async def _collect_profile(user_id: str) -> dict[str, Any]:
    profile: dict[str, Any] = {}
    if not user_id:
        return profile
    try:
        user = await get_user(user_id)
        profile["header"] = {
            "name": f"{user.firstName or ''} {user.lastName or ''}".strip(),
            "email": user.email or "",
            "phone": "",
            "location": "",
            "github": "",
            "linkedin": "",
            "tagline": "",
        }
    except Exception as e:
        logger.warning("Failed to collect user header for %s: %s", user_id, e)
        profile["header"] = {
            "name": "", "email": "", "phone": "", "location": "",
            "github": "", "linkedin": "", "tagline": "",
        }

    async def _safe(fetcher, key: str):
        try:
            items = await fetcher(user_id)
        except Exception as e:
            logger.warning("Failed to collect %s for %s: %s", key, user_id, e)
            items = []
        profile[key] = _sorted_items(items)

    await _safe(get_user_experiences, "experiences")
    await _safe(get_user_projects, "projects")
    await _safe(get_user_skills, "skills")
    await _safe(get_user_educations, "educations")
    await _safe(get_user_hackathons, "hackathons")
    await _safe(get_user_interests, "interests")
    await _safe(get_user_languages, "languages")
    await _safe(get_user_certifications, "certifications")
    await _safe(get_user_academic_activities, "academicActivities")
    await _safe(get_user_social_links, "socialLinks")
    await _safe(get_user_cvprofiles, "cvProfiles")

    _enrich_header(profile)
    return profile


def _sorted_items(items: list) -> list:
    """Order collections by the optional sortOrder attribute (stable, 0 first)."""
    try:
        return sorted(items, key=lambda i: getattr(i, "sortOrder", 0) or 0)
    except Exception:
        return items


def _enrich_header(profile: dict) -> None:
    """Merge contact details from the user's primary CV profile (and social
    links) into the header when the user record has no phone/location/linkedin."""
    header = profile.get("header") or {}
    for cvp in profile.get("cvProfiles", []) or []:
        for src_key, dst_key in (
            ("email", "email"), ("phone", "phone"), ("location", "location"),
            ("website", "github"), ("linkedInUrl", "linkedin"),
            ("githubUrl", "github"), ("title", "tagline"),
        ):
            if not header.get(dst_key) and getattr(cvp, src_key, None):
                header[dst_key] = str(getattr(cvp, src_key))
    if not header.get("linkedin"):
        for link in profile.get("socialLinks", []) or []:
            platform = str(getattr(link, "platform", "") or "").lower()
            url = getattr(link, "url", None)
            if url and "linkedin" in platform:
                header["linkedin"] = str(url)
                break
    if not header.get("github"):
        for link in profile.get("socialLinks", []) or []:
            platform = str(getattr(link, "platform", "") or "").lower()
            url = getattr(link, "url", None)
            if url and ("github" in platform or "gitlab" in platform or "bitbucket" in platform):
                header["github"] = str(url)
                break


def _example_collection(template_content: Optional[str], cap: int = 2500) -> dict[str, str]:
    """Extract each placeholder block's EXAMPLE as baseline CV content.

    Templates are converted from the user's own CV, so the EXAMPLEs carry the
    candidate's real education/experience/projects/hackathons. When the app's
    structured content tables are sparse, the LLM can draw those facts from this
    baseline instead of inventing or dropping sections.
    """
    if not template_content:
        return {}
    out: dict[str, str] = {}
    budget = 0
    for block in parse_placeholders(template_content):
        if not block.example or not block.key:
            continue
        example = block.example.strip()
        if budget + len(example) > cap:
            example = example[: cap - budget]
        out[block.key] = example
        budget += len(example)
        if budget >= cap:
            break
    return out


def _fallback_sections(
    cv_draft: Optional[dict],
    profile: dict[str, Any],
    target_role: str,
) -> CvSections:
    """Deterministic fill used when the LLM is unavailable."""
    draft = cv_draft or {}
    header = dict(profile.get("header") or {})
    header.update({k: v for k, v in draft.get("header", {}).items() if v})

    sections = CvSections(
        header=CvHeader(**{k: header.get(k, "") for k in CvHeader.model_fields}),
        about=str(draft.get("summary") or draft.get("about") or ""),
    )

    def _bullets(items: Any) -> list[str]:
        if isinstance(items, list):
            if items and isinstance(items[0], dict):
                out = []
                for d in items:
                    t = str(d.get("title", "") or "").strip()
                    desc = str(d.get("description", "") or "").strip()
                    out.append(f"{t}: {desc}" if t and desc else (t or desc))
                return [x for x in out if x]
            return [str(i) for i in items if str(i).strip()]
        if isinstance(items, str) and items.strip():
            return [items]
        return []

    for exp in profile.get("experiences", []):
        title = f"{exp.title or ''}".strip()
        if not title:
            continue
        dates = ""
        d1, d2 = exp.startDate or "", exp.endDate or ""
        if d1 or d2:
            dates = f"{d1[:10]} - {d2[:10]}" if d2 else d1[:10]
        if getattr(exp, "location", None):
            role = f"{title} · {exp.location}" if not title.endswith(f" {exp.location}") else title
        else:
            role = title
        bullets = _bullets(getattr(exp, "experienceDetails", []) or [])
        if getattr(exp, "achievementsJson", None):
            try:
                extra = _bullets(json.loads(exp.achievementsJson))
            except Exception:
                extra = []
            bullets.extend(x for x in extra if x not in bullets)
        description = exp.description or ""
        if getattr(exp, "employmentType", None):
            description = f"{description}\n{exp.employmentType}".strip()
        sections.experiences.append(CvExperience(
            role=role,
            company=exp.company or "",
            dates=dates,
            description=description,
            bullets=bullets,
        ))

    for edu in profile.get("educations", []):
        title = " ".join(p for p in (edu.degreeType or "", edu.fieldOfStudy or "") if p).strip()
        institution = edu.institutionName or ""
        if not title and not institution:
            continue
        dates = ""
        d1, d2 = edu.startDate or "", edu.endDate or ""
        if d1 or d2:
            dates = f"{d1[:10]} - {d2[:10]}" if d2 else d1[:10]
        if getattr(edu, "grade", None):
            institution = f"{institution} · {edu.grade}".strip(" ·")
        if getattr(edu, "country", None) and edu.country not in institution:
            institution = f"{institution} · {edu.country}".strip(" ·")
        sections.educations.append(CvEducation(
            title=title or institution,
            institution=institution,
            dates=dates,
        ))

    for proj in profile.get("projects", []):
        if not (proj.title or "").strip():
            continue
        dates = ""
        d1, d2 = proj.startDate or "", proj.endDate or ""
        if d1 or d2:
            dates = f"{d1[:10]} - {d2[:10]}" if d2 else d1[:10]
        name = proj.title.strip()
        if getattr(proj, "category", None):
            name = f"{name} · {proj.category}"
        sections.projects.append(CvProject(
            name=name,
            dates=dates,
            bullets=_bullets(getattr(proj, "projectDetails", []) or []),
        ))

    for h in profile.get("hackathons", []):
        if not (h.name or "").strip():
            continue
        dates = getattr(h, "startDate", None) or h.date or ""
        if getattr(h, "endDate", None):
            dates = f"{dates[:10]} - {h.endDate[:10]}" if dates else h.endDate[:10]
        event = " ".join(p for p in (h.organization or "", str(dates or "")) if p).strip()
        sections.hackathons.append(CvHackathon(
            name=h.name.strip(),
            event=event,
            description=h.description or "",
        ))

    for act in profile.get("academicActivities", []) or []:
        if not (act.title or "").strip():
            continue
        dates = ""
        d1, d2 = act.startDate or "", act.endDate or ""
        if d1 or d2:
            dates = f"{d1[:10]} - {d2[:10]}" if d2 else d1[:10]
        bullets = []
        if getattr(act, "description", None):
            bullets.append(act.description.strip())
        sections.extracurricular.append(CvExtracurricular(
            title=act.title.strip(),
            role=act.role or "",
            dates=dates,
            bullets=bullets,
        ))

    for lang in profile.get("languages", []):
        if not (lang.name or "").strip():
            continue
        sections.languages.append(CvLanguage(
            name=lang.name.strip(),
            level=lang.level or "",
        ))

    sections.interests.extend(
        str(i.name).strip() for i in profile.get("interests", []) if (i.name or "").strip()
    )

    skills = profile.get("skills", [])
    if skills:
        groups: dict[str, list[str]] = {}
        for s in skills:
            if not (s.name or "").strip():
                continue
            label = s.name.strip()
            if getattr(s, "proficiency", None):
                label += f" ({s.proficiency})"
            groups.setdefault(s.category or "Skills", []).append(label)
        sections.skillGroups.extend(
            CvSkillGroup(title=title, items=items) for title, items in groups.items()
        )

    matched = draft.get("matched_skills") or []
    if isinstance(matched, list) and matched:
        groups = sections.skillGroups[0] if sections.skillGroups else None
        if groups:
            existing = set(groups.items)
            groups.items.extend([str(m) for m in matched if str(m) not in existing])
    return sections


def _fill_header(cv_draft: Optional[dict], profile: dict[str, Any], sections: CvSections) -> None:
    """Ensure the header always carries the candidate's contact details."""
    src = {}
    src.update(profile.get("header") or {})
    src.update((cv_draft or {}).get("profile") or {})
    h = sections.header
    for field in CvHeader.model_fields:
        if not getattr(h, field) and src.get(field):
            setattr(h, field, str(src.get(field) or ""))


async def generate_cv_sections(
    user_id: str,
    cv_draft: Optional[dict] = None,
    target_role: str = "",
    language: str = "English",
    tone: str = "professional",
    provider: Optional[str] = None,
    model: Optional[str] = None,
    template_content: Optional[str] = None,
) -> CvSections:
    cv_draft = cv_draft or {}
    profile = await _collect_profile(user_id)

    try:
        from shared.llm import get_llm
        llm = get_llm(preferred_provider=provider, model=model)

        material: dict[str, Any] = {"profile": profile}
        for key in ("summary", "about", "target_role", "job_data", "profile"):
            if cv_draft.get(key):
                material[key] = cv_draft[key]
        for key in ("matched_skills", "matched_experiences", "matched_projects",
                    "matched_education", "gap_skills"):
            if cv_draft.get(key):
                material[key] = cv_draft[key]
        material["target_role"] = material.get("target_role") or target_role
        material["language"] = language
        material["tone"] = tone

        example_blocks = _example_collection(template_content)
        if example_blocks:
            material["baseline_cv_examples"] = example_blocks

        system_prompt = CV_SECTIONS_SYSTEM_PROMPT
        if example_blocks:
            system_prompt += (
                "\n\nThe candidate's conversion template declared EXAMPLES that "
                "reproduce their actual CV content (education, experience, "
                "projects, hackathons, extracurricular...). Treat those as "
                "authentic baseline FACTS: use them to fill sections the "
                "structured profile does not cover, reuse their real bullet "
                "points (rewritten to fit the role where useful), and keep the "
                "header contact details exactly as given. Never invent facts "
                "not present in the structured profile or the baseline examples."
            )
        constraints = format_constraints_hint(template_content or "")
        if constraints:
            system_prompt += "\n\n" + constraints

        human = (
            "Target role: {role}\n\nRaw candidate material:\n{payload}\n\n"
            "Build the tailored CV JSON now.".format(
                role=material.get("target_role") or "N/A",
                payload=json.dumps(material, ensure_ascii=False)[:30000],
            )
        )
        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=human),
        ])
        text = response.content if hasattr(response, "content") else str(response)
        try:
            sections = CvSections.model_validate(parse_llm_json(str(text)))
            _fill_header(cv_draft, profile, sections)
            return sections
        except Exception as e:
            logger.warning("CV sections JSON invalid, retrying once: %s", e)
            retry = await llm.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(
                    content=(
                        "Your previous answer was not valid JSON:\n%s\n\n"
                        "Reply ONLY with the strict JSON object." % str(e)
                    )
                ),
            ])
            retry_text = retry.content if hasattr(retry, "content") else str(retry)
            sections = CvSections.model_validate(parse_llm_json(str(retry_text)))
            _fill_header(cv_draft, profile, sections)
            return sections
    except Exception as e:
        logger.warning("LLM CV section build failed (%s); using deterministic fill", e)
        sections = _fallback_sections(cv_draft, profile, target_role)
        _fill_header(cv_draft, profile, sections)
        return sections


_FREEFORM_SYSTEM_PROMPT = (
    "You are a LaTeX CV section writer. The candidate's tailored CV data has "
    "already been produced; your job is to emit specific CV sections the fixed "
    "renderer cannot handle, as RAW LaTeX that will be spliced into the user's "
    "template. For each requested section:\n"
    "- Reproduce the given EXAMPLE's structure and style EXACTLY (same custom "
    "macros, same itemize/tabularx structures, same voice). Those macros are "
    "defined in the template preamble, so use them as-is.\n"
    "- Replace the example's literal facts with the candidate's own data drawn "
    "from the material (roles, companies, dates, certificates, events...). "
    "NEVER invent facts that are not in the material. If the candidate lacks "
    "data for a slot, omit the slot or the whole entry.\n"
    "- Respect the declared constraints (item counts, per-item lengths): hard "
    "limits will be enforced deterministically after you, so stay within them.\n"
    "- Output ONLY the LaTeX for each section, delimited exactly like:\n"
    "  %=== SECTION 1 ===\n"
    "  <your latex for section 1>\n"
    "  %=== END SECTION 1 ===\n"
    "Use the index given for each section. No commentary, no markdown fences."
)

_SECTION_OUT_RE = re.compile(
    r"%=== SECTION\s+(\d+)\s*===(.*?)%=== END SECTION\s+\1\s*===",
    re.DOTALL,
)
_FREEFORM_MAX = 4000


async def generate_freeform_sections(
    template_content: Optional[str],
    cv_draft: Optional[dict],
    target_role: str,
    provider: Optional[str],
    model: Optional[str],
    sections: CvSections,
) -> dict[int, str]:
    """Render free-form placeholder blocks (no deterministic renderer) to LaTeX.

    Each such block's EXAMPLE + constraints guide a raw-LaTeX section written
    from the candidate material. Returns {block.start_offset: latex}, keyed so
    the stitcher can splice it in place; empty when there are no free-form
    blocks or the LLM is unavailable (those sections are then skipped).
    """
    if not template_content:
        return {}
    blocks = [b for b in parse_placeholders(template_content)
              if (b.key or "").strip().lower() not in KNOWN_KEYS]
    if not blocks:
        return {}
    try:
        from shared.llm import get_llm
        llm = get_llm(preferred_provider=provider, model=model)

        material = {
            "sections": sections.model_dump(),
            "target_role": target_role,
        }
        if isinstance(cv_draft, dict):
            for key in ("summary", "about", "job_data", "matched_skills"):
                if cv_draft.get(key):
                    material[key] = cv_draft[key]

        block_lines = []
        for i, b in enumerate(blocks, start=1):
            block_lines.append(
                f"Section {i} — key \"{b.key or '?'}\", title \"{b.title or b.key or '?'}\""
            )
            if b.conditions:
                block_lines.append("Constraints: " + "; ".join(b.conditions))
            if b.example:
                block_lines.append("Example to follow:\n" + b.example.strip()[:1200])
            else:
                block_lines.append(
                    "No example given — write a concise, standard LaTeX section "
                    "for this title following the candidate's data."
                )
        human = (
            "Sections requested: {count}\n\n{blocks}\n\n"
            "Candidate material:\n{payload}\n\n"
            "Emit each requested section's LaTeX now.".format(
                count=len(blocks),
                blocks="\n\n".join(block_lines),
                payload=json.dumps(material, ensure_ascii=False)[:25000],
            )
        )
        response = await llm.ainvoke([
            SystemMessage(content=_FREEFORM_SYSTEM_PROMPT),
            HumanMessage(content=human),
        ])
        text = str(response.content if hasattr(response, "content") else response)
        parsed = {int(m.group(1)): m.group(2).strip() for m in _SECTION_OUT_RE.finditer(text)}
        if not parsed:
            logger.warning("Free-form sections: no delimited blocks in LLM output")
            return {}
        return {
            blocks[i - 1].start: tex[:_FREEFORM_MAX]
            for i, tex in parsed.items()
            if 1 <= i <= len(blocks) and tex.strip()
        }
    except Exception as e:
        logger.warning("Free-form section LLM failed (%s); skipping free-form blocks", e)
        return {}