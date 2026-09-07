from agents.job_extractor.router import router as job_extractor_router
from agents.search.router import router as search_router
from agents.template.router import router as template_router
from agents.cv_optimizer.router import router as cv_optimizer_router
from agents.contact.router import router as contact_router
from agents.crawler.router import router as crawler_router
from agents.apply_prep.router import router as apply_prep_router
from agents.bime.router import router as bime_router
from agents.embeddings.router import router as embeddings_router
from agents.llm.router import router as llm_router
from agents.pdf_thumbnails.router import router as pdf_thumbnails_router
from agents.categorize.router import router as categorize_router
from agents.autofill.router import router as autofill_router
from agents.direct.router import router as direct_router
from agents.company_research.router import router as company_research_router

all_routers = [
    job_extractor_router,
    search_router,
    template_router,
    cv_optimizer_router,
    contact_router,
    crawler_router,
    apply_prep_router,
    bime_router,
    embeddings_router,
    llm_router,
    pdf_thumbnails_router,
    categorize_router,
    autofill_router,
    direct_router,
    company_research_router,
]
