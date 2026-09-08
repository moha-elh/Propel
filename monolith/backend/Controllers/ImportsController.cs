using System.Globalization;
using System.Reflection;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

public class CompanyImportRow
{
    public string? Name { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public string? Country { get; set; }
    public string? LocationUrl { get; set; }
    public string? Region { get; set; }
    public string? Sector { get; set; }
    public int? FoundedYear { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Size { get; set; }
    public string? Note { get; set; }
}

public class ContactImportRow
{
    public string? Company { get; set; }
    public string? Name { get; set; }
    public string? Role { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? LinkedInUrl { get; set; }
}

public class ApplicationImportRow
{
    public string? ExternalId { get; set; }      // e.g. APP-001 from the sheet
    public string? Company { get; set; }
    public string? Position { get; set; }
    public string? InternshipType { get; set; }
    public string? SourceType { get; set; }
    public string? SourceName { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public string? ApplyDate { get; set; }       // DD/MM/YYYY (day-first)
    public string? CvUrl { get; set; }
    public bool MotivationLetterSent { get; set; }
    public bool PortfolioSent { get; set; }
    public string? ShouldApplyAgain { get; set; }
    public string? Notes { get; set; }
}

public class ImportResultDto
{
    public int Imported { get; set; }
    public int Skipped { get; set; }
    public List<string> Errors { get; set; } = [];
}

[Route("api/imports")]
public class ImportsController : BaseApiController
{
    private readonly AppDbContext _db;
    private readonly ILogger<ImportsController> _logger;

    public ImportsController(ICurrentUserService currentUser, AppDbContext db, ILogger<ImportsController> logger)
        : base(currentUser)
    {
        _db = db;
        _logger = logger;
    }

    // ── Companies ────────────────────────────────────────────────────────────
    [HttpPost("companies")]
    public async Task<IActionResult> ImportCompanies([FromBody] List<CompanyImportRow> rows)
    {
        var userId = GetUserId();
        if (rows is null || rows.Count == 0)
            return BadRequest(ApiResponse<ImportResultDto>.Error("No rows provided"));

        var result = new ImportResultDto();
        var existing = await _db.Companies.Where(c => c.UserId == userId).ToListAsync();
        var byName = existing.ToDictionary(c => Normalize(c.Name), c => c);

        foreach (var (row, idx) in rows.Select((r, i) => (r, i)))
        {
            try
            {
                var name = row.Name?.Trim() ?? "";
                if (name.Length == 0) { result.Skipped++; continue; }

                var key = Normalize(name);
                if (byName.TryGetValue(key, out var dup))
                {
                    // Enrich the existing entry with any new info.
                    dup.WebsiteUrl ??= ToUrl(row.WebsiteUrl);
                    dup.Location ??= row.Location?.Trim();
                    dup.LocationUrl ??= ToUrl(row.LocationUrl);
                    dup.Region ??= row.Region?.Trim();
                    dup.Sector ??= row.Sector?.Trim();
                    dup.LinkedInUrl ??= ToUrl(row.LinkedInUrl);
                    if (dup.FoundedYear is null && row.FoundedYear is > 1800 and < 2100) dup.FoundedYear = row.FoundedYear;
                    if (string.IsNullOrWhiteSpace(dup.Size)) dup.Size = DecodeEmployeeSize(row.Size);
                    if (string.IsNullOrWhiteSpace(dup.Country)) dup.Country = string.IsNullOrWhiteSpace(row.Country) ? "Morocco" : row.Country.Trim();
                    dup.Note ??= row.Note;
                    result.Skipped++;
                    continue;
                }

                var company = new Company
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Name = name,
                    WebsiteUrl = ToUrl(row.WebsiteUrl),
                    Location = row.Location?.Trim(),
                    Country = string.IsNullOrWhiteSpace(row.Country) ? "Morocco" : row.Country.Trim(),
                    LocationUrl = ToUrl(row.LocationUrl),
                    Region = row.Region?.Trim(),
                    Sector = row.Sector?.Trim(),
                    FoundedYear = row.FoundedYear is > 1800 and < 2100 ? row.FoundedYear : null,
                    LinkedInUrl = ToUrl(row.LinkedInUrl),
                    Size = DecodeEmployeeSize(row.Size),
                    Note = row.Note
                };
                _db.Companies.Add(company);
                byName[key] = company;
                result.Imported++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Company import row {Index} failed", idx);
                result.Errors.Add($"Row {idx + 1}: {ex.Message}");
            }
        }

        await _db.SaveChangesAsync();
        return Ok(ApiResponse<ImportResultDto>.Ok(result, $"{result.Imported} imported, {result.Skipped} skipped"));
    }

    // ── Contacts ─────────────────────────────────────────────────────────────
    [HttpPost("contacts")]
    public async Task<IActionResult> ImportContacts([FromBody] List<ContactImportRow> rows)
    {
        var userId = GetUserId();
        if (rows is null || rows.Count == 0)
            return BadRequest(ApiResponse<ImportResultDto>.Error("No rows provided"));

        var result = new ImportResultDto();
        var existing = await _db.Contacts.Where(c => c.UserId == userId).ToListAsync();
        var seenKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var c in existing)
        {
            if (!string.IsNullOrWhiteSpace(c.Email))
                seenKeys.Add("email:" + Normalize(c.Email));
            else if (!string.IsNullOrWhiteSpace(c.Company) || !string.IsNullOrWhiteSpace(c.Name))
                seenKeys.Add("by:" + Normalize(c.Company ?? "") + "|" + Normalize(c.Name) + "|" + (c.Phone ?? ""));
            if (!string.IsNullOrWhiteSpace(c.LinkedInUrl))
                seenKeys.Add("li:" + Normalize(c.LinkedInUrl));
        }

        foreach (var (row, idx) in rows.Select((r, i) => (r, i)))
        {
            try
            {
                var name = row.Name?.Trim() ?? "";
                var email = row.Email?.Trim().ToLower() ?? "";
                var phone = row.Phone?.Trim() ?? "";
                var linkedin = row.LinkedInUrl?.Trim() ?? "";
                if (name.Length == 0) { result.Skipped++; continue; }
                if (email.Length == 0 && phone.Length == 0 && linkedin.Length == 0) { result.Skipped++; continue; }
                if (email.Length > 0 && !IsValidEmail(email))
                {
                    result.Errors.Add($"Row {idx + 1}: invalid email '{email}' for '{name}'");
                    result.Skipped++;
                    continue;
                }

                var key = email.Length > 0
                    ? "email:" + email
                    : linkedin.Length > 0
                        ? "li:" + Normalize(linkedin)
                        : "by:" + Normalize(row.Company ?? "") + "|" + Normalize(name) + "|" + phone;
                if (!seenKeys.Add(key)) { result.Skipped++; continue; }

                _db.Contacts.Add(new Contact
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    Name = name,
                    Email = email,
                    Phone = phone.Length > 0 ? phone : null,
                    Mobile = row.Mobile?.Trim(),
                    Fax = row.Fax?.Trim(),
                    Address = row.Address?.Trim(),
                    Company = row.Company?.Trim(),
                    Position = row.Role?.Trim(),
                    LinkedInUrl = linkedin.Length > 0 ? linkedin : null,
                    Source = "import"
                });
                result.Imported++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Contact import row {Index} failed", idx);
                result.Errors.Add($"Row {idx + 1}: {ex.Message}");
            }
        }

        await _db.SaveChangesAsync();
        return Ok(ApiResponse<ImportResultDto>.Ok(result, $"{result.Imported} imported, {result.Skipped} skipped"));
    }

    // ── Applications ─────────────────────────────────────────────────────────
    [HttpPost("applications")]
    public async Task<IActionResult> ImportApplications([FromBody] List<ApplicationImportRow> rows)
    {
        var userId = GetUserId();
        if (rows is null || rows.Count == 0)
            return BadRequest(ApiResponse<ImportResultDto>.Error("No rows provided"));

        var result = new ImportResultDto();
        var contacts = await _db.Contacts.AsNoTracking().Where(c => c.UserId == userId).ToListAsync();

        foreach (var (row, idx) in rows.Select((r, i) => (r, i)))
        {
            try
            {
                var company = row.Company?.Trim() ?? "";
                var position = row.Position?.Trim() ?? "";
                if (company.Length == 0)
                {
                    result.Skipped++;
                    continue;
                }

                var appliedAt = ParseDate(row.ApplyDate);
                var status = ApplicationStatus.SAVED;
                if (appliedAt.HasValue && !string.IsNullOrWhiteSpace(row.Status))
                {
                    status = ParseStatus(row.Status);
                }
                else if (appliedAt.HasValue)
                {
                    status = ApplicationStatus.APPLIED;
                }
                else if (!string.IsNullOrWhiteSpace(row.Status) &&
                         Enum.TryParse<ApplicationStatus>(NormalizeEnum(row.Status), out var parsed))
                {
                    status = parsed;
                }

                var priority = ApplicationPriority.MEDIUM;
                if (!string.IsNullOrWhiteSpace(row.Priority) &&
                    Enum.TryParse<ApplicationPriority>(NormalizeEnum(row.Priority), out var p))
                {
                    priority = p;
                }

                var contactId = FindContact(contacts, company, row.SourceName);
                var composedNotes = ComposeNotes(row);

                // Intentionally bypasses the fingerprint dedup: sheet rows are distinct outreach even when
                // company+position repeat. ExternalId goes into notes for traceability.
                var app = new Application
                {
                    Id = Guid.NewGuid(),
                    CandidateId = userId,
                    CompanyName = company,
                    PositionTitle = position.Length == 0 ? "—" : position,
                    OfferSource = BuildOfferSource(row.SourceType),
                    Notes = composedNotes,
                    Status = status,
                    AppliedAt = appliedAt,
                    Priority = priority,
                    InternshipType = Truncate(row.InternshipType?.Trim(), 50)
                };
                app.Fingerprint = FingerprintHelper.Compute(company, app.PositionTitle);
                _db.Applications.Add(app);

                if (status != ApplicationStatus.SAVED)
                {
                    _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
                    {
                        ApplicationId = app.Id,
                        OldStatus = null,
                        NewStatus = status,
                        Comment = "Imported from tracking sheet",
                        ChangedAt = appliedAt ?? DateTime.UtcNow
                    });
                }

                await _db.SaveChangesAsync();
                result.Imported++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Application import row {Index} failed", idx);
                result.Errors.Add($"{row.ExternalId ?? $"Row {idx + 1}"}: {ex.Message}");
            }
        }

        return Ok(ApiResponse<ImportResultDto>.Ok(result, $"{result.Imported} imported, {result.Skipped} skipped"));
    }

    // ── Generic user-content (My Career) ─────────────────────────────────────
    private static readonly Dictionary<string, Type> UserContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["cvprofiles"] = typeof(CVProfile),
        ["projects"] = typeof(Project),
        ["skills"] = typeof(Skill),
        ["experiences"] = typeof(Experience),
        ["educations"] = typeof(Education),
        ["certifications"] = typeof(Certification),
        ["languages"] = typeof(Language),
        ["interests"] = typeof(Interest),
        ["sociallinks"] = typeof(SocialLink),
        ["academicactivities"] = typeof(AcademicActivity),
        ["hackathons"] = typeof(Hackathon),
    };

    [HttpPost("{entity}")]
    public async Task<IActionResult> ImportUserContent(string entity, [FromBody] List<Dictionary<string, string>> rows)
    {
        var userId = GetUserId();
        if (rows is null || rows.Count == 0)
            return BadRequest(ApiResponse<ImportResultDto>.Error("No rows provided"));

        if (!UserContentTypes.TryGetValue(entity, out var type))
            return BadRequest(ApiResponse<ImportResultDto>.Error($"Unknown import type '{entity}'"));

        var props = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanWrite)
            .ToDictionary(p => p.Name.ToLowerInvariant(), p => p);

        var result = new ImportResultDto();
        foreach (var (row, idx) in rows.Select((r, i) => (r, i)))
        {
            try
            {
                var instance = Activator.CreateInstance(type)!;
                foreach (var kv in row)
                {
                    if (string.IsNullOrWhiteSpace(kv.Value)) continue;
                    var key = kv.Key.ToLowerInvariant();
                    if (key is "id" or "userid") continue;
                    if (!props.TryGetValue(key, out var prop)) continue;
                    var val = ConvertValue(prop.PropertyType, kv.Value!);
                    if (val is not null) prop.SetValue(instance, val);
                }

                type.GetProperty("Id")!.SetValue(instance, Guid.NewGuid());
                type.GetProperty("UserId")!.SetValue(instance, userId);
                _db.Add(instance);
                await _db.SaveChangesAsync();
                result.Imported++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "User-content import row {Index} failed", idx);
                result.Errors.Add($"Row {idx + 1}: {ex.Message}");
            }
        }

        return Ok(ApiResponse<ImportResultDto>.Ok(result, $"{result.Imported} imported, {result.Skipped} skipped"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string Normalize(string s) => s.Trim().ToLowerInvariant();

    private static string NormalizeEnum(string s) =>
        s.Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "_");

    private static bool IsValidEmail(string email) =>
        email.Contains('@') && email.Contains('.') && !email.Contains(' ') && email.Length >= 5;

    /// <summary>Adds a scheme to bare URLs (e.g. 'serviclic.net' → 'https://serviclic.net').</summary>
    private static string? ToUrl(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var v = raw.Trim();
        if (v.Length == 0 || v.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            v.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return v;
        return "https://" + v;
    }

    /// <summary>Decodes compact employee-size codes seen in scraper exports (e.g. '01-Oct' → '1-10', 'Nov-50' → '11-50'); passthrough otherwise.</summary>
    private static string? DecodeEmployeeSize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var value = raw.Trim();
        if (value.Length > 12) return value;

        var months = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["jan"] = "1", ["feb"] = "2", ["mar"] = "3", ["apr"] = "4", ["may"] = "5", ["jun"] = "6",
            ["jul"] = "7", ["aug"] = "8", ["sep"] = "9", ["oct"] = "10", ["nov"] = "11", ["dec"] = "12"
        };

        var parts = value.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return value;

        var numbers = new List<string>();
        foreach (var p in parts)
        {
            if (months.TryGetValue(p, out var m)) numbers.Add(m);
            else if (int.TryParse(p, out var n)) numbers.Add(n.ToString());
            else return value;
        }
        return string.Join("-", numbers);
    }

    private static string Truncate(string? s, int max) =>
        string.IsNullOrEmpty(s) ? s! : (s.Length <= max ? s : s[..max]);

    /// Coerces a raw sheet cell into the target property type (strings pass through; numbers/dates/enums parsed).
    private static object? ConvertValue(Type target, string raw)
    {
        var underlying = Nullable.GetUnderlyingType(target) ?? target;
        if (underlying == typeof(string)) return raw;
        if (underlying == typeof(Guid)) return null; // ids are generated server-side
        if (underlying == typeof(int)) return int.TryParse(raw, out var i) ? i : null;
        if (underlying == typeof(double)) return double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : null;
        if (underlying == typeof(bool)) return bool.TryParse(raw, out var b) ? b : null;
        if (underlying == typeof(DateTime)) return ParseDate(raw);
        if (underlying.IsEnum) return Enum.TryParse(underlying, raw, true, out var e) ? e : null;
        return raw;
    }

    /// Parses day-first dates as used in the tracking sheets (e.g. 04/05/2026 = May 4th).
    private static DateTime? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var formats = new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd/MM/yyyy HH:mm" };
        if (DateTime.TryParseExact(value.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return d.ToUniversalTime();
        return null;
    }

    private static ApplicationStatus ParseStatus(string s) => s.Trim().ToLowerInvariant() switch
    {
        "saved" or "to apply" or "should i apply again" or "yes" => ApplicationStatus.SAVED,
        "applied" or "application sent" or "sent" => ApplicationStatus.APPLIED,
        "screening" or "hr screen" or "phone screen" => ApplicationStatus.SCREENING,
        "interview" or "interviewing" => ApplicationStatus.INTERVIEW,
        "offer" => ApplicationStatus.OFFER,
        "accepted" or "hired" => ApplicationStatus.ACCEPTED,
        "rejected" or "refused" => ApplicationStatus.REJECTED,
        "withdrawn" => ApplicationStatus.WITHDRAWN,
        _ => ApplicationStatus.SAVED
    };

    private static string? BuildOfferSource(string? sourceType)
    {
        if (string.IsNullOrWhiteSpace(sourceType)) return null;
        return sourceType.Trim().ToLowerInvariant() switch
        {
            "person" => "Referral",
            "linkedin" => "LinkedIn",
            "website" or "site" => "Company website",
            _ => sourceType.Trim()
        };
    }

    private static Guid? FindContact(List<Contact> contacts, string company, string? contactName)
    {
        if (string.IsNullOrWhiteSpace(contactName)) return null;
        var nameKey = Normalize(contactName);
        var companyKey = Normalize(company);

        var exact = contacts.FirstOrDefault(c =>
            Normalize(c.Name) == nameKey && c.Company != null && Normalize(c.Company) == companyKey);
        if (exact != null) return exact.Id;

        var fuzzy = contacts.FirstOrDefault(c =>
            Normalize(c.Name) == nameKey ||
            (c.Company != null && Normalize(c.Company) == companyKey && Normalize(c.Name).Contains(nameKey)));
        return fuzzy?.Id;
    }

    private static string? ComposeNotes(ApplicationImportRow row)
    {
        var sb = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(row.ExternalId)) sb.AppendLine($"Sheet ref: {row.ExternalId.Trim()}");
        if (!string.IsNullOrWhiteSpace(row.Notes)) sb.AppendLine(row.Notes.Trim());
        if (!string.IsNullOrWhiteSpace(row.CvUrl)) sb.AppendLine($"CV: {row.CvUrl.Trim()}");
        if (row.MotivationLetterSent) sb.AppendLine("Motivation letter: sent");
        if (row.PortfolioSent) sb.AppendLine("Portfolio: sent");
        if (!string.IsNullOrWhiteSpace(row.ShouldApplyAgain) && !row.ShouldApplyAgain.Equals("No", StringComparison.OrdinalIgnoreCase))
            sb.AppendLine($"Should apply again: {row.ShouldApplyAgain.Trim()}");
        var text = sb.ToString().TrimEnd();
        return text.Length == 0 ? null : text;
    }
}
