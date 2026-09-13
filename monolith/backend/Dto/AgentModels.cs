using System.Text.Json.Serialization;

namespace CV_Generator.Dto;

public class JobRequirements
{
    [JsonPropertyName("job_role")]
    public string? JobRole { get; set; }

    [JsonPropertyName("extracted_skills")]
    public List<string> ExtractedSkills { get; set; } = new();

    [JsonPropertyName("required_experience_years")]
    public int? RequiredExperienceYears { get; set; }

    [JsonPropertyName("keywords")]
    public List<string> Keywords { get; set; } = new();

    [JsonPropertyName("seniority_level")]
    public string? SeniorityLevel { get; set; }

    [JsonPropertyName("employment_type")]
    public string? EmploymentType { get; set; }

    [JsonPropertyName("location_type")]
    public string? LocationType { get; set; }

    [JsonPropertyName("responsibilities")]
    public List<string> Responsibilities { get; set; } = new();

    [JsonPropertyName("certifications")]
    public List<string> Certifications { get; set; } = new();
}

public class JobExtractorAgentRequest
{
    [JsonPropertyName("job_description")]
    public string? JobDescription { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("job_offer_id")]
    public string? JobOfferId { get; set; }

    [JsonPropertyName("language")]
    public string Language { get; set; } = "en";

    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }
}

public class ExtractorInput
{
    [JsonPropertyName("job_description")]
    public string JobDescription { get; set; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; set; } = "en";

    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }
}

public class ExtractorOutput : JobRequirements
{
    [JsonPropertyName("enterprise_name")]
    public string? EnterpriseName { get; set; }

    [JsonPropertyName("enterprise_description")]
    public string? EnterpriseDescription { get; set; }

    [JsonPropertyName("enterprise_logo_url")]
    public string? EnterpriseLogoUrl { get; set; }

    [JsonPropertyName("raw_description")]
    public string? RawDescription { get; set; }

    [JsonPropertyName("required_skills")]
    public List<string> RequiredSkills { get; set; } = new();

    [JsonPropertyName("soft_skills")]
    public List<string> SoftSkills { get; set; } = new();

    [JsonPropertyName("location")]
    public string? Location { get; set; }

    [JsonPropertyName("salary_range")]
    public string? SalaryRange { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("education_requirements")]
    public string? EducationRequirements { get; set; }

    [JsonPropertyName("benefits")]
    public List<string> Benefits { get; set; } = new();

    [JsonPropertyName("application_deadline")]
    public string? ApplicationDeadline { get; set; }

    [JsonPropertyName("contact_email")]
    public string? ContactEmail { get; set; }

    [JsonPropertyName("source_url")]
    public string? SourceUrl { get; set; }

    [JsonPropertyName("languages")]
    public List<string> Languages { get; set; } = new();

    [JsonPropertyName("overall_confidence")]
    public double OverallConfidence { get; set; }

    [JsonPropertyName("field_confidences")]
    public Dictionary<string, double>? FieldConfidences { get; set; }
}

public class SearchInput
{
    [JsonPropertyName("user_id")]
    public Guid UserId { get; set; }

    [JsonPropertyName("job_requirements")]
    public JobRequirements JobRequirements { get; set; } = new();
}

public class SearchOutput
{
    [JsonPropertyName("matched_skills")]
    public List<dynamic> MatchedSkills { get; set; } = new();

    [JsonPropertyName("matched_experiences")]
    public List<dynamic> MatchedExperiences { get; set; } = new();

    [JsonPropertyName("matched_projects")]
    public List<dynamic> MatchedProjects { get; set; } = new();

    [JsonPropertyName("gap_skills")]
    public List<string> GapSkills { get; set; } = new();

    [JsonPropertyName("match_score")]
    public double MatchScore { get; set; }
}

public class OptimizerInput
{
    [JsonPropertyName("job_data")]
    public string JobData { get; set; } = string.Empty;

    [JsonPropertyName("candidate_name")]
    public string CandidateName { get; set; } = string.Empty;

    [JsonPropertyName("session_id")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("user_focus")]
    public string? UserFocus { get; set; }

    [JsonPropertyName("cv_content")]
    public string? CvContent { get; set; }

    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }
}

public class OptimizerOutput
{
    [JsonPropertyName("ats_score_before")]
    public int AtsScoreBefore { get; set; }

    [JsonPropertyName("ats_score_after")]
    public int AtsScoreAfter { get; set; }

    [JsonPropertyName("improvement")]
    public int Improvement { get; set; }

    [JsonPropertyName("file_path")]
    public string FilePath { get; set; } = string.Empty;
}

public class TemplateInput
{
    [JsonPropertyName("cv_draft")]
    public dynamic CvDraft { get; set; } = new Dictionary<string, object>();

    [JsonPropertyName("template_id")]
    public string TemplateId { get; set; } = "default";

    [JsonPropertyName("template_content")]
    public string? TemplateContent { get; set; }

    [JsonPropertyName("template_type")]
    public string TemplateType { get; set; } = "pdf";

    [JsonPropertyName("target_role")]
    public string TargetRole { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }
}

public class RenderedCV
{
    [JsonPropertyName("cv_code")]
    public string CvCode { get; set; } = string.Empty;

    [JsonPropertyName("template_id")]
    public string TemplateId { get; set; } = string.Empty;

    [JsonPropertyName("sections")]
    public object? Sections { get; set; }
}

public class PdfInput
{
    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;

    [JsonPropertyName("workflow_id")]
    public string? WorkflowId { get; set; }

    [JsonPropertyName("cv_data")]
    public string CvData { get; set; } = string.Empty;

    [JsonPropertyName("cv_data_format")]
    public string CvDataFormat { get; set; } = "tex";

    [JsonPropertyName("template_name")]
    public string? TemplateName { get; set; }

    [JsonPropertyName("template_id")]
    public string? TemplateId { get; set; }

    [JsonPropertyName("template_content")]
    public string? TemplateContent { get; set; }

    [JsonPropertyName("file_name")]
    public string FileName { get; set; } = "cv.pdf";

    [JsonPropertyName("language")]
    public string Language { get; set; } = "English";

    [JsonPropertyName("tone")]
    public string Tone { get; set; } = "professional";

    [JsonPropertyName("photo_key")]
    public string? PhotoKey { get; set; }

    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }
}

public class PdfOutput
{
    [JsonPropertyName("file_path")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("file_size")]
    public int FileSize { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}

// Matches the contact agent's ContactRequest (/generate-email): it only
// generates email copy; the actual send happens in the backend.
public class ContactInput
{
    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;

    [JsonPropertyName("company_name")]
    public string CompanyName { get; set; } = string.Empty;

    [JsonPropertyName("job_title")]
    public string? JobTitle { get; set; }

    [JsonPropertyName("job_description")]
    public string? JobDescription { get; set; }

    [JsonPropertyName("contact_type")]
    public string ContactType { get; set; } = "recruiter";

    [JsonPropertyName("language")]
    public string Language { get; set; } = "English";

    [JsonPropertyName("provider")]
    public string? Provider { get; set; }

    [JsonPropertyName("model")]
    public string? Model { get; set; }
}

public class ContactEmailResponse
{
    [JsonPropertyName("subject")]
    public string Subject { get; set; } = string.Empty;

    [JsonPropertyName("body")]
    public string Body { get; set; } = string.Empty;

    [JsonPropertyName("contact_type")]
    public string ContactType { get; set; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; set; } = string.Empty;
}

public class ContactOutput
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("delivery_id")]
    public string DeliveryId { get; set; } = string.Empty;

    [JsonPropertyName("sent_at")]
    public DateTime SentAt { get; set; }

    [JsonPropertyName("subject_used")]
    public string SubjectUsed { get; set; } = string.Empty;

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }
}

public class GenerateCvRequest
{
    [JsonPropertyName("user_id")]
    public Guid UserId { get; set; }

    [JsonPropertyName("job_description")]
    public string JobDescription { get; set; } = string.Empty;

    [JsonPropertyName("candidate_name")]
    public string? CandidateName { get; set; }

    [JsonPropertyName("recipient_email")]
    public string? RecipientEmail { get; set; }

    [JsonPropertyName("template_id")]
    public string? TemplateId { get; set; }

    [JsonPropertyName("language")]
    public string? Language { get; set; }

    [JsonPropertyName("tone")]
    public string? Tone { get; set; }

    [JsonPropertyName("email_subject")]
    public string? EmailSubject { get; set; }
}
