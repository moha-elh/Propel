from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    username: Optional[str] = None
    isProfileComplete: bool = False


class ExperienceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: Optional[str] = None
    company: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    isCurrent: bool = False
    experienceDetails: list = []
    technologies: list = []
    location: Optional[str] = None
    achievementsJson: Optional[str] = None
    employmentType: Optional[str] = None
    sortOrder: int = 0


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: Optional[str] = None
    company: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    isCurrent: bool = False
    projectDetails: list = []
    technologies: list = []
    category: Optional[str] = None
    teamSize: Optional[int] = None
    sortOrder: int = 0


class SkillResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: Optional[str] = None
    proficiency: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    lastUsedYear: Optional[int] = None
    isCore: bool = False
    sortOrder: int = 0


class EducationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    institutionName: Optional[str] = None
    degreeType: Optional[str] = None
    fieldOfStudy: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    grade: Optional[str] = None
    country: Optional[str] = None
    sortOrder: int = 0


class HackathonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    organization: Optional[str] = None
    date: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    result: Optional[str] = None
    projectUrl: Optional[str] = None
    sortOrder: int = 0


class InterestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    sortOrder: int = 0


class LanguageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    level: Optional[str] = None
    sortOrder: int = 0


class CertificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    issuingOrganization: Optional[str] = None
    issueDate: Optional[str] = None
    credentialUrl: Optional[str] = None
    credentialId: Optional[str] = None
    expiryDate: Optional[str] = None
    sortOrder: int = 0


class AcademicActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    organization: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    sortOrder: int = 0


class SocialLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    platform: str
    url: Optional[str] = None
    sortOrder: int = 0


class CVProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: Optional[str] = None
    summary: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    linkedInUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    openToRelocate: bool = False


class CvSectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sectionType: str
    title: Optional[str] = None
    content: Optional[str] = None
    displayOrder: int = 0
    isVisible: bool = True
