using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Models;

namespace CV_Generator.Services;

public class SearchSyncService : ISearchSyncService
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;

    public SearchSyncService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<int> SyncUserAsync(Guid userId, CancellationToken ct = default)
    {
        return await SyncUserEntitiesAsync(userId, [], ct);
    }

    public async Task<int> SyncUserEntitiesAsync(Guid userId, string[] sourceTypes, CancellationToken ct = default)
    {
        var types = sourceTypes.Length > 0
            ? sourceTypes
            : [
                "User", "CVProfile", "Experience", "Project", "Skill",
                "Education", "Certification", "Language", "Interest",
                "Hackathon", "AcademicActivity", "SocialLink",
                "Company", "Contact", "Application"
            ];

        var chunks = await BuildChunksAsync(userId, types, ct);
        if (chunks.Count == 0)
        {
            return 0;
        }

        var texts = chunks.Select(c => c.Content).ToList();
        var embeddings = await EmbedTextsAsync(texts, ct);
        if (embeddings.Count != chunks.Count)
        {
            return 0;
        }

        var existing = await _db.AgentDocumentChunks
            .Where(x => x.UserId == userId && types.Contains(x.SourceType))
            .ToListAsync(ct);

        _db.AgentDocumentChunks.RemoveRange(existing);

        var newChunks = chunks.Zip(embeddings, (c, e) => new AgentDocumentChunk
        {
            UserId = userId,
            SourceType = c.SourceType,
            SourceId = c.SourceId,
            Content = c.Content,
            Embedding = new Pgvector.Vector(e),
        });

        _db.AgentDocumentChunks.AddRange(newChunks);
        await _db.SaveChangesAsync(ct);

        return chunks.Count;
    }

    public async Task<SearchSyncStatus> GetStatusAsync(Guid userId, CancellationToken ct = default)
    {
        var chunks = await _db.AgentDocumentChunks
            .Where(x => x.UserId == userId)
            .GroupBy(x => x.SourceType)
            .Select(g => new { SourceType = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var total = chunks.Sum(c => c.Count);
        var counts = chunks.ToDictionary(c => c.SourceType, c => c.Count);

        return new SearchSyncStatus(total > 0, total, counts);
    }

    private async Task<List<SearchChunkDto>> BuildChunksAsync(Guid userId, string[] types, CancellationToken ct)
    {
        var chunks = new List<SearchChunkDto>();

        if (types.Contains("User"))
        {
            var user = await _db.Users.FindAsync(userId);
            if (user != null)
            {
                var text = $"Profile: {user.FirstName} {user.LastName}. " +
                    $"Headline: {user.Headline ?? "N/A"}. " +
                    $"Bio: {user.Bio ?? "N/A"}. " +
                    $"Desired job: {user.DesiredJobTitle ?? "N/A"}. " +
                    $"Location: {user.City ?? "N/A"}, {user.Country ?? "N/A"}. " +
                    $"Professional titles: {user.ProfessionalTitles ?? "N/A"}";
                chunks.Add(new("User", userId, text));
            }
        }

        if (types.Contains("CVProfile"))
        {
            var profiles = await _db.CVProfiles.Where(p => p.UserId == userId).ToListAsync(ct);
            foreach (var p in profiles)
            {
                var text = $"CV Profile: {p.Title}. Summary: {p.Summary}";
                chunks.Add(new("CVProfile", p.Id, text));
            }
        }

        if (types.Contains("Experience"))
        {
            var experiences = await _db.Experiences.Where(e => e.UserId == userId).ToListAsync(ct);
            foreach (var e in experiences)
            {
                var text = $"Experience: {e.Title} at {e.Company ?? "Unknown"}. " +
                    $"{e.Description ?? "N/A"}. Status: {e.Status}";
                chunks.Add(new("Experience", e.Id, text));
            }
        }

        if (types.Contains("Project"))
        {
            var projects = await _db.Projects.Where(p => p.UserId == userId).ToListAsync(ct);
            foreach (var p in projects)
            {
                var text = $"Project: {p.Title}. " +
                    $"{p.Description ?? "N/A"}. " +
                    $"Role: {p.Role ?? "N/A"}. " +
                    $"Achievements: {p.Achievements ?? "N/A"}. " +
                    $"Skills: {p.SkillsJson ?? "N/A"}";
                chunks.Add(new("Project", p.Id, text));
            }
        }

        if (types.Contains("Skill"))
        {
            var skills = await _db.Skills.Where(s => s.UserId == userId).ToListAsync(ct);
            foreach (var s in skills)
            {
                var text = $"Skill: {s.Name}. " +
                    $"Level: {s.Level ?? "N/A"}. " +
                    $"Category: {s.Category ?? "N/A"}. " +
                    $"Years of experience: {s.YearsOfExperience}";
                chunks.Add(new("Skill", s.Id, text));
            }
        }

        if (types.Contains("Education"))
        {
            var educations = await _db.Educations.Where(e => e.UserId == userId).ToListAsync(ct);
            foreach (var e in educations)
            {
                var text = $"Education: {e.DegreeType} in {e.FieldOfStudy} at {e.InstitutionName}. " +
                    $"Specialization: {e.Specialization ?? "N/A"}. Status: {e.Status}";
                chunks.Add(new("Education", e.Id, text));
            }
        }

        if (types.Contains("Certification"))
        {
            var certs = await _db.Certifications.Where(c => c.UserId == userId).ToListAsync(ct);
            foreach (var c in certs)
            {
                var text = $"Certification: {c.Name} by {c.IssuingOrganization ?? "Unknown"}. " +
                    $"Date: {c.IssueDate?.ToString("yyyy-MM-dd") ?? "N/A"}";
                chunks.Add(new("Certification", c.Id, text));
            }
        }

        if (types.Contains("Language"))
        {
            var languages = await _db.Languages.Where(l => l.UserId == userId).ToListAsync(ct);
            foreach (var l in languages)
            {
                var text = $"Language: {l.Name}. Proficiency: {l.Level}";
                chunks.Add(new("Language", l.Id, text));
            }
        }

        if (types.Contains("Interest"))
        {
            var interests = await _db.Interests.Where(i => i.UserId == userId).ToListAsync(ct);
            foreach (var i in interests)
            {
                var text = $"Interest: {i.Name}";
                chunks.Add(new("Interest", i.Id, text));
            }
        }

        if (types.Contains("Hackathon"))
        {
            var hackathons = await _db.Hackathons.Where(h => h.UserId == userId).ToListAsync(ct);
            foreach (var h in hackathons)
            {
                var text = $"Hackathon: {h.Name} at {h.Organization ?? "Unknown"}. " +
                    $"Role: {h.Role ?? "N/A"}. {h.Description ?? "N/A"}. Result: {h.Result ?? "N/A"}";
                chunks.Add(new("Hackathon", h.Id, text));
            }
        }

        if (types.Contains("AcademicActivity"))
        {
            var activities = await _db.AcademicActivities.Where(a => a.UserId == userId).ToListAsync(ct);
            foreach (var a in activities)
            {
                var text = $"Academic Activity: {a.Title} at {a.Organization ?? "Unknown"}. " +
                    $"{a.Description ?? "N/A"}";
                chunks.Add(new("AcademicActivity", a.Id, text));
            }
        }

        if (types.Contains("SocialLink"))
        {
            var links = await _db.SocialLinks.Where(s => s.UserId == userId).ToListAsync(ct);
            foreach (var l in links)
            {
                var text = $"{l.Platform}: {l.Url}";
                chunks.Add(new("SocialLink", l.Id, text));
            }
        }

        if (types.Contains("Company"))
        {
            var companies = await _db.Companies.Where(c => c.UserId == userId).ToListAsync(ct);
            foreach (var c in companies)
            {
                var text = $"Company: {c.Name}. Location: {c.Location ?? "N/A"}. " +
                    $"Country: {c.Country ?? "N/A"}. Note: {c.Note ?? "N/A"}";
                chunks.Add(new("Company", c.Id, text));
            }
        }

        if (types.Contains("Contact"))
        {
            var contacts = await _db.Contacts.Where(c => c.UserId == userId).ToListAsync(ct);
            foreach (var c in contacts)
            {
                var text = $"Contact: {c.Name} at {c.Company ?? "Unknown"}. " +
                    $"Position: {c.Position ?? "N/A"}. Email: {c.Email ?? "N/A"}";
                chunks.Add(new("Contact", c.Id, text));
            }
        }

        if (types.Contains("Application"))
        {
            var apps = await _db.Applications.Where(a => a.CandidateId == userId).ToListAsync(ct);
            foreach (var a in apps)
            {
                var text = $"Application: {a.PositionTitle} at {a.CompanyName}. " +
                    $"Status: {a.Status}. Notes: {a.Notes ?? "N/A"}";
                chunks.Add(new("Application", a.Id, text));
            }
        }

        return chunks;
    }

    private async Task<List<float[]>> EmbedTextsAsync(List<string> texts, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("agents");
        var payload = new { texts };

        var response = await client.PostAsJsonAsync("http://localhost:8000/api/embeddings/embed", payload, ct);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<EmbedResponse>(ct);
        return result?.Embeddings ?? [];
    }

    private record SearchChunkDto(string SourceType, Guid SourceId, string Content);

    private class EmbedResponse
    {
        public List<float[]> Embeddings { get; set; } = [];
        public string Model { get; set; } = "";
        public int Dimensions { get; set; }
    }
}
