namespace CV_Generator.Models;

public enum ApplicationStatus
{
    SAVED,
    APPLIED,
    SCREENING,
    ASSESSMENT,
    INTERVIEW,
    OFFER,
    ACCEPTED,
    REJECTED,
    WITHDRAWN
}

public enum ApplicationOrigin
{
    MANUAL,
    FROM_JOB_OFFER,
    AI_AGENT_AUTO_APPLY,
    IMPORT
}

public enum ApplicationPriority
{
    LOW,
    MEDIUM,
    HIGH
}
