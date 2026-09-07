using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Models;

namespace CV_Generator.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<CVProfile> CVProfiles => Set<CVProfile>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Skill> Skills => Set<Skill>();
    public DbSet<Experience> Experiences => Set<Experience>();
    public DbSet<Education> Educations => Set<Education>();
    public DbSet<Certification> Certifications => Set<Certification>();
    public DbSet<Language> Languages => Set<Language>();
    public DbSet<SocialLink> SocialLinks => Set<SocialLink>();
    public DbSet<Interest> Interests => Set<Interest>();
    public DbSet<Hackathon> Hackathons => Set<Hackathon>();
    public DbSet<AcademicActivity> AcademicActivities => Set<AcademicActivity>();
    public DbSet<Cv> Cvs => Set<Cv>();
    public DbSet<CvVersion> CvVersions => Set<CvVersion>();
    public DbSet<CvSection> CvSections => Set<CvSection>();
    public DbSet<Application> Applications => Set<Application>();
    public DbSet<ApplicationStatusHistory> ApplicationStatusHistories => Set<ApplicationStatusHistory>();
    public DbSet<ApplicationConfiguration> ApplicationConfigurations => Set<ApplicationConfiguration>();
    public DbSet<ApplicationAttempt> ApplicationAttempts => Set<ApplicationAttempt>();
    public DbSet<JobOffer> JobOffers => Set<JobOffer>();
    public DbSet<JobSkill> JobSkills => Set<JobSkill>();
    public DbSet<JobResponsibility> JobResponsibilities => Set<JobResponsibility>();
    public DbSet<JobBenefit> JobBenefits => Set<JobBenefit>();
    public DbSet<SearchCache> SearchCaches => Set<SearchCache>();
    public DbSet<UserQuota> UserQuotas => Set<UserQuota>();
    public DbSet<SearchJobMatch> SearchJobMatches => Set<SearchJobMatch>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Reminder> Reminders => Set<Reminder>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<GmailConnection> GmailConnections => Set<GmailConnection>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<EmailMessage> EmailMessages => Set<EmailMessage>();
    public DbSet<EmailSchedule> EmailSchedules => Set<EmailSchedule>();
    public DbSet<CategoryNode> CategoryNodes => Set<CategoryNode>();
    public DbSet<EntityCategoryTag> EntityCategoryTags => Set<EntityCategoryTag>();
    public DbSet<Workflow> Workflows => Set<Workflow>();
    public DbSet<AgentEntity> Agents => Set<AgentEntity>();
    public DbSet<AgentDocumentChunk> AgentDocumentChunks => Set<AgentDocumentChunk>();
    public DbSet<CvGenerationRun> CvGenerationRuns => Set<CvGenerationRun>();
    public DbSet<TemplateRenderRun> TemplateRenderRuns => Set<TemplateRenderRun>();
    public DbSet<JobExtractionEntity> JobExtractions => Set<JobExtractionEntity>();
    public DbSet<BimeConversation> BimeConversations => Set<BimeConversation>();
    public DbSet<BimeMessage> BimeMessages => Set<BimeMessage>();
    public DbSet<UserLlmSettings> UserLlmSettings => Set<UserLlmSettings>();
    public DbSet<AgentLlmSetting> AgentLlmSettings => Set<AgentLlmSetting>();
    public DbSet<CvTemplate> CvTemplates => Set<CvTemplate>();
    public DbSet<ScheduleTemplate> ScheduleTemplates => Set<ScheduleTemplate>();
    public DbSet<UserImage> UserImages => Set<UserImage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(e => e.Role).HasConversion<string>();
        });

        modelBuilder.Entity<Cv>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasMany(e => e.Versions).WithOne(e => e.Cv).HasForeignKey(e => e.CvId);
        });

        modelBuilder.Entity<CvVersion>(entity =>
        {
            entity.HasIndex(e => e.CvId);
            entity.HasMany(e => e.Sections).WithOne(e => e.Version).HasForeignKey(e => e.VersionId);
        });

        modelBuilder.Entity<Application>(entity =>
        {
            entity.Property(e => e.Status).HasConversion<string>();
            entity.Property(e => e.Origin).HasConversion<string>();
            entity.HasIndex(e => e.CandidateId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.AppliedAt);
            entity.HasIndex(e => e.Fingerprint);
            // Hard rule: one application per (candidate, job offer)
            entity.HasIndex(e => new { e.CandidateId, e.JobOfferId })
                .IsUnique()
                .HasFilter("\"JobOfferId\" IS NOT NULL");
        });

        modelBuilder.Entity<ApplicationStatusHistory>(entity =>
        {
            entity.Property(e => e.OldStatus).HasConversion<string>();
            entity.Property(e => e.NewStatus).HasConversion<string>();
        });

        modelBuilder.Entity<ApplicationAttempt>(entity =>
        {
            entity.Property(e => e.Channel).HasConversion<string>();
            entity.Property(e => e.InitiatedBy).HasConversion<string>();
            entity.Property(e => e.Status).HasConversion<string>();
            entity.HasOne(e => e.Application)
                .WithMany(a => a.Attempts)
                .HasForeignKey(e => e.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Contact)
                .WithMany()
                .HasForeignKey(e => e.ContactId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(e => new { e.ApplicationId, e.AttemptNumber }).IsUnique();
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.ContactId);
        });

        modelBuilder.Entity<ApplicationConfiguration>(entity =>
        {
            entity.HasIndex(e => e.UserId).IsUnique();
        });

        modelBuilder.Entity<JobOffer>(entity =>
        {
            entity.HasMany(j => j.Skills).WithOne(s => s.JobOffer).HasForeignKey(s => s.JobOfferId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(j => j.Responsibilities).WithOne(r => r.JobOffer).HasForeignKey(r => r.JobOfferId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(j => j.Benefits).WithOne(b => b.JobOffer).HasForeignKey(b => b.JobOfferId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(j => j.JobHash).IsUnique().HasFilter("\"JobHash\" IS NOT NULL");
        });

        modelBuilder.Entity<SearchCache>(entity =>
        {
            entity.HasKey(s => s.SearchId);
            entity.HasIndex(s => new { s.Keyword, s.CrawledDate });
        });

        modelBuilder.Entity<UserQuota>(entity =>
        {
            entity.HasKey(u => u.UserId);
        });

        modelBuilder.Entity<SearchJobMatch>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.HasIndex(m => m.SearchId);
            entity.HasIndex(m => m.JobId);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(e => e.Type).HasConversion<string>();
            entity.Property(e => e.Channel).HasConversion<string>();
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.CreatedAt);
        });

        modelBuilder.Entity<Reminder>(entity =>
        {
            entity.Property(e => e.Status).HasConversion<string>();
            entity.Property(e => e.ReminderOffset).HasConversion<string>();
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => new { e.ReminderAt, e.Status });
        });

        modelBuilder.Entity<NotificationPreference>(entity =>
        {
            entity.HasIndex(e => e.UserId).IsUnique();
        });

        modelBuilder.Entity<GmailConnection>(entity =>
        {
            entity.HasIndex(e => e.UserId).IsUnique();
        });

        modelBuilder.Entity<Contact>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.Email);
        });

        modelBuilder.Entity<Company>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            // One watchlist entry per company per user (case-insensitive name match enforced in service layer).
            entity.HasIndex(e => new { e.UserId, e.Name });
            entity.Property(e => e.Country)
                .IsRequired()
                .HasMaxLength(100)
                .HasDefaultValue("Morocco");
            entity.Property(e => e.EmailsJson).HasColumnType("jsonb");
            entity.Property(e => e.PhonesJson).HasColumnType("jsonb");
            entity.Property(e => e.SocialLinksJson).HasColumnType("jsonb");
            entity.Property(e => e.CompanyFactsJson).HasColumnType("jsonb");
        });

        modelBuilder.Entity<EmailMessage>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.ContactId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CreatedAt);
            entity.Property(e => e.AttachmentMetadataJson).HasColumnType("jsonb");
            entity.HasOne(e => e.Contact)
                .WithMany()
                .HasForeignKey(e => e.ContactId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<EmailSchedule>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => new { e.IsActive, e.NextRunAt });
            entity.Property(e => e.RecipientIds)
                .HasConversion(
                    v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                    v => JsonSerializer.Deserialize<List<Guid>>(v, (JsonSerializerOptions?)null) ?? new List<Guid>())
                .HasColumnType("jsonb");
        });

        modelBuilder.Entity<AgentDocumentChunk>(entity =>
        {
            entity.HasGeneratedTsVectorColumn(
                c => c.SearchVector,
                "english",
                c => new { c.Content })
                .HasIndex(c => c.SearchVector)
                .HasMethod("GIN");
        });

        modelBuilder.Entity<BimeConversation>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.UpdatedAt);
        });

        modelBuilder.Entity<BimeMessage>(entity =>
        {
            entity.HasIndex(e => e.ConversationId);
            entity.HasOne(e => e.Conversation)
                .WithMany()
                .HasForeignKey(e => e.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CategoryNode>(entity =>
        {
            entity.HasIndex(e => new { e.Scope, e.ParentId });
            entity.HasIndex(e => e.Path);
            entity.HasOne(e => e.Parent)
                .WithMany(e => e.Children)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EntityCategoryTag>(entity =>
        {
            entity.HasIndex(e => new { e.UserId, e.SourceType, e.SourceId, e.CategoryNodeId }).IsUnique();
            entity.HasOne(e => e.CategoryNode)
                .WithMany()
                .HasForeignKey(e => e.CategoryNodeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserLlmSettings>(entity =>
        {
            entity.HasIndex(e => e.UserId).IsUnique();
        });

        modelBuilder.Entity<AgentLlmSetting>(entity =>
        {
            entity.HasIndex(e => new { e.UserId, e.AgentId }).IsUnique();
        });

        modelBuilder.Entity<CvTemplate>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.IsSystem);
        });

        modelBuilder.Entity<AgentEntity>(entity =>
        {
            entity.HasIndex(e => e.AgentId).IsUnique();
        });

        modelBuilder.Entity<AgentEntity>().HasData(
            new AgentEntity { Id = Guid.Parse("10000000-0000-0000-0000-000000000001"), AgentId = "job-extractor", Name = "Job Extractor", Role = "Extracts structured data from job descriptions and URLs", BackgroundGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", SortOrder = 1 },
            new AgentEntity { Id = Guid.Parse("10000000-0000-0000-0000-000000000002"), AgentId = "search-agent", Name = "Search Agent", Role = "Finds similar CV content and matches your profile to job requirements", BackgroundGradient = "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", SortOrder = 2 },
            new AgentEntity { Id = Guid.Parse("10000000-0000-0000-0000-000000000003"), AgentId = "template-agent", Name = "Template Agent", Role = "Generates cover letters and formats CVs using templates", BackgroundGradient = "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", SortOrder = 3 },
            new AgentEntity { Id = Guid.Parse("10000000-0000-0000-0000-000000000004"), AgentId = "cv-optimizer", Name = "CV Optimizer", Role = "Optimizes your CV content for specific job applications using AI", BackgroundGradient = "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", SortOrder = 4 },
            new AgentEntity { Id = Guid.Parse("10000000-0000-0000-0000-000000000005"), AgentId = "contact-agent", Name = "Contact Agent", Role = "Drafts professional outreach emails to recruiters and hiring managers", BackgroundGradient = "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", SortOrder = 5 },
            new AgentEntity { Id = Guid.Parse("10000000-0000-0000-0000-000000000006"), AgentId = "job-crawler", Name = "Job Crawler", Role = "Searches and discovers new job opportunities matching your profile", BackgroundGradient = "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)", SortOrder = 6 }
        );
    }
}
