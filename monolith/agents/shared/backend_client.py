"""
Async HTTP client for the ASP.NET backend.

Backend responses follow the envelope:
    { "success": bool, "message": str | None, "data": T | None, "errors": object | None }
"""
import httpx
import logging
from typing import TypeVar, List
from uuid import UUID

from shared.config import settings
from shared.models.user_model import (
    UserResponse, ExperienceResponse, ProjectResponse, SkillResponse,
    EducationResponse, HackathonResponse, InterestResponse,
    LanguageResponse, CertificationResponse,AcademicActivityResponse,
    SocialLinkResponse, CVProfileResponse,
)
from shared.models.workflow_model import WorkflowResponse

logger = logging.getLogger(__name__)
T = TypeVar("T")

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("Backend client not initialised.")
    return _client


def create_client() -> httpx.AsyncClient:
    global _client
    _client = httpx.AsyncClient(
        base_url=settings.BACKEND_BASE_URL,
        timeout=30.0,
        headers={"Content-Type": "application/json"},
    )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def _get(path: str) -> dict | list:
    client = get_client()
    try:
        response = await client.get(path)
        response.raise_for_status()
        body = response.json()
        if not body.get("success"):
            logger.warning(f"Backend error on GET {path}: {body.get('message')}")
            return {}
        return body.get("data") or {}
    except Exception as e:
        logger.error(f"Failed to GET {path}: {e}")
        return {}


async def _get_single(path: str) -> dict | None:
    client = get_client()
    try:
        response = await client.get(path)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        body = response.json()
        if not body.get("success"):
            return None
        return body.get("data") or None
    except Exception as e:
        logger.warning(f"Failed to GET {path}: {e}")
        return None


async def get_user(user_id: UUID) -> UserResponse:
    data = await _get(f"/api/users/{user_id}")
    return UserResponse.model_validate(data)


async def get_user_experiences(user_id: UUID) -> List[ExperienceResponse]:
    data = await _get(f"/api/experiences?userId={user_id}")
    if isinstance(data, list):
        return [ExperienceResponse.model_validate(item) for item in data]
    return []


async def get_user_projects(user_id: UUID) -> List[ProjectResponse]:
    data = await _get(f"/api/projects?userId={user_id}")
    if isinstance(data, list):
        return [ProjectResponse.model_validate(item) for item in data]
    return []


async def get_user_skills(user_id: UUID) -> List[SkillResponse]:
    data = await _get(f"/api/skills?userId={user_id}")
    if isinstance(data, list):
        return [SkillResponse.model_validate(item) for item in data]
    return []


def _typed(data, model, fallback=None):
    if isinstance(data, list):
        try:
            return [model.model_validate(item) for item in data]
        except Exception as e:
            logger.warning(f"Failed to map {model.__name__} list: {e}")
            return []
    return [] if fallback is None else fallback


async def get_user_educations(user_id: UUID) -> List[EducationResponse]:
    return _typed(await _get(f"/api/educations?userId={user_id}"), EducationResponse)


async def get_user_hackathons(user_id: UUID) -> List[HackathonResponse]:
    return _typed(await _get(f"/api/hackathons?userId={user_id}"), HackathonResponse)


async def get_user_interests(user_id: UUID) -> List[InterestResponse]:
    return _typed(await _get(f"/api/interests?userId={user_id}"), InterestResponse)


async def get_user_languages(user_id: UUID) -> List[LanguageResponse]:
    return _typed(await _get(f"/api/languages?userId={user_id}"), LanguageResponse)


async def get_user_certifications(user_id: UUID) -> List[CertificationResponse]:
    return _typed(await _get(f"/api/certifications?userId={user_id}"), CertificationResponse)


async def get_user_academic_activities(user_id: UUID) -> List[AcademicActivityResponse]:
    return _typed(await _get(f"/api/academicactivities?userId={user_id}"), AcademicActivityResponse)


async def get_user_social_links(user_id: UUID) -> List[SocialLinkResponse]:
    return _typed(await _get(f"/api/sociallinks?userId={user_id}"), SocialLinkResponse)


async def get_user_cvprofiles(user_id: UUID) -> List[CVProfileResponse]:
    return _typed(await _get(f"/api/cvprofiles?userId={user_id}"), CVProfileResponse)


async def get_experience(experience_id: UUID) -> ExperienceResponse | None:
    data = await _get_single(f"/api/experiences/{experience_id}")
    return ExperienceResponse.model_validate(data) if data else None


async def get_project(project_id: UUID) -> ProjectResponse | None:
    data = await _get_single(f"/api/projects/{project_id}")
    return ProjectResponse.model_validate(data) if data else None


async def get_workflow(workflow_id: UUID) -> WorkflowResponse:
    data = await _get(f"/api/workflows/{workflow_id}")
    return WorkflowResponse.model_validate(data)


async def check_vectors_status(user_id: UUID) -> bool:
    client = get_client()
    response = await client.get(f"/api/vectors/status/{user_id}")
    if response.status_code == 200:
        return response.json().get("data", False)
    return False


async def sync_vectors(user_id: UUID, chunks: list) -> bool:
    client = get_client()
    payload = {"userId": str(user_id), "chunks": chunks}
    response = await client.post("/api/vectors/sync", json=payload)
    return response.status_code == 200


async def search_vectors(user_id: UUID, query_text: str, query_vector: list, limit: int = 15) -> list:
    client = get_client()
    payload = {"userId": str(user_id), "queryText": query_text, "queryVector": query_vector, "limit": limit}
    response = await client.post("/api/vectors/search", json=payload)
    if response.status_code == 200:
        return response.json().get("data", [])
    return []
