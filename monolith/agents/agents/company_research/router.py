import logging

from fastapi import APIRouter, HTTPException

from agents.company_research.agent import research
from agents.company_research.schemas import CompanyResearchRequest, CompanyResearchResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents/company-research", tags=["company_research"])


@router.post("/research", response_model=CompanyResearchResponse)
async def run_research(request: CompanyResearchRequest):
    try:
        result = await research(request)
        return CompanyResearchResponse(result=result)
    except Exception as e:
        logger.exception("Company research failed")
        raise HTTPException(status_code=500, detail=f"Company research failed: {str(e)}")


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "company_research"}