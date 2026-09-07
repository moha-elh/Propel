from pydantic import BaseModel, Field
from typing import Optional


class CompanyResearchRequest(BaseModel):
    name: str = Field(..., description="Company name")
    website_url: Optional[str] = Field(None, description="Company homepage URL")
    location: Optional[str] = Field(None, description="Known location/city of the company")
    provider: Optional[str] = None
    model: Optional[str] = None
    # Which data types to extract. If empty, all are extracted.
    data_types: Optional[list[str]] = Field(
        default_factory=list,
        description="Subset of: emails, phones, social, address, about, facts",
    )


class SocialLink(BaseModel):
    key: str = Field(..., description="Platform name, e.g. linkedin/twitter/facebook/instagram/github")
    url: str = Field(..., description="Full URL")


class CompanyResearchResult(BaseModel):
    name: str
    website_url: Optional[str] = None
    emails: list[str] = Field(default_factory=list)
    phones: list[str] = Field(default_factory=list)
    social: list[SocialLink] = Field(default_factory=list)
    address: Optional[str] = None
    about: Optional[str] = None
    facts: list[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    error: Optional[str] = None


class CompanyResearchResponse(BaseModel):
    result: CompanyResearchResult
