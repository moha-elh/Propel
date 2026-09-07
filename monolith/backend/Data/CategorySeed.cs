using System.Linq;
using CV_Generator.Models;
using Microsoft.EntityFrameworkCore;

namespace CV_Generator.Data;

/// <summary>
/// Idempotent seeder for the curated category taxonomy. Runs at startup:
/// fresh DBs get the full per-entity tree; existing installs get a projects-scope
/// drift refresh (tree replaced + curated tags re-assigned when the seed changes).
/// Trees are per entity-scope; the top-level node name doubles as the Domain.
/// </summary>
public static class CategorySeed
{
    private class SeedNode
    {
        public string Name { get; init; } = string.Empty;
        public List<string> Keywords { get; init; } = new();
        public List<SeedNode> Children { get; init; } = new();
    }

    public static async Task SeedAsync(AppDbContext db)
    {
        if (!await db.CategoryNodes.AnyAsync())
        {
            var all = new List<(string Scope, List<SeedNode> Roots)>
            {
                ("projects", Projects()),
                ("experiences", Experiences()),
                ("educations", Educations()),
                ("certifications", Certifications()),
                ("skills", Skills()),
                ("languages", Languages()),
                ("hackathons", Hackathons()),
                ("interests", Interests()),
                ("academicactivities", AcademicActivities()),
            };

            foreach (var (scope, roots) in all)
                Plant(db, scope, roots);

            await db.SaveChangesAsync();
            return;
        }

        // Existing install: keep tree fresh when the projects seed spec changes.
        await RefreshProjectsScopeAsync(db);
    }

    private static async Task RefreshProjectsScopeAsync(AppDbContext db)
    {
        var expectedRoots = Projects().Select(r => Slug(r.Name)).OrderBy(x => x).ToList();
        var existingRoots = (await db.CategoryNodes
                .Where(n => n.Scope == "projects" && n.Level == 0)
                .Select(n => n.Path)
                .ToListAsync())
            .Select(p => p.TrimStart('/'))
            .OrderBy(x => x)
            .ToList();

        if (expectedRoots.All(existingRoots.Contains))
            return;

        db.CategoryNodes.RemoveRange(await db.CategoryNodes.Where(n => n.Scope == "projects").ToListAsync());
        await db.SaveChangesAsync();

        Plant(db, "projects", Projects());
        await db.SaveChangesAsync();

        await AssignProjectTagsAsync(db);
    }

    /// <summary>
    /// Curated one-time tag re-assignment for existing projects whenever the projects
    /// taxonomy is rebuilt. Matched by title (rows under the blank user are skipped);
    /// tags are MANUAL so subsequent auto re-syncs preserve them.
    /// </summary>
    private static async Task AssignProjectTagsAsync(AppDbContext db)
    {
        var nodeIdByName = await db.CategoryNodes
            .Where(n => n.Scope == "projects")
            .ToDictionaryAsync(n => n.Name, n => n.Id);

        var assignments = new Dictionary<string, string[]>
        {
            ["Kooralik"] = new[]
            {
                "Web Development", "Backend / API Development",
                "Java", "Angular", "Spring / Spring Boot",
                "PostgreSQL", "Kafka", "gRPC",
                "Docker", "Microservices", "Event-Driven",
                "PoC / Experiment",
            },
            ["Snake Game"] = new[]
            {
                "Game Development", "Web Development",
                "JavaScript", "Coursework",
            },
        };

        foreach (var (title, tagNames) in assignments)
        {
            var project = await db.Projects.FirstOrDefaultAsync(
                p => p.Title == title && p.UserId != Guid.Empty);
            if (project == null)
                continue;

            foreach (var name in tagNames)
            {
                if (nodeIdByName.TryGetValue(name, out var nodeId))
                {
                    db.EntityCategoryTags.Add(new EntityCategoryTag
                    {
                        UserId = project.UserId,
                        SourceType = "projects",
                        SourceId = project.Id,
                        CategoryNodeId = nodeId,
                        AssignedBy = "MANUAL",
                    });
                }
            }
        }

        await db.SaveChangesAsync();
    }

    private static void Plant(AppDbContext db, string scope, List<SeedNode> roots, Guid? parentId = null, string? domain = null, int level = 0, string path = "")
    {
        foreach (var node in roots)
        {
            var nodeDomain = level == 0 ? node.Name : domain!;
            var nodePath = string.IsNullOrEmpty(path) ? "/" + Slug(node.Name) : path + "/" + Slug(node.Name);
            var entity = new CategoryNode
            {
                Id = Guid.NewGuid(),
                Scope = scope,
                ParentId = parentId,
                Name = node.Name,
                Domain = nodeDomain,
                Level = level,
                Path = nodePath,
                KeywordsJson = System.Text.Json.JsonSerializer.Serialize(node.Keywords),
                IsSystem = true,
                UserId = null,
            };
            db.CategoryNodes.Add(entity);
            if (node.Children.Count > 0)
                Plant(db, scope, node.Children, entity.Id, nodeDomain, level + 1, nodePath);
        }
    }

    private static string Slug(string s) => s.ToLowerInvariant().Replace("/", " ").Replace(" ", "-").Replace("&", "and");

    // ── Projects ──────────────────────────────────────────────────────────────
    private static List<SeedNode> Projects() => new()
    {
        new SeedNode { Name = "Domain", Children = new()
        {
            new SeedNode { Name = "Web Development", Keywords = new(){ "web", "website" } },
            new SeedNode { Name = "Mobile Development", Keywords = new(){ "mobile", "android", "ios" } },
            new SeedNode { Name = "Desktop Development", Keywords = new(){ "desktop" } },
            new SeedNode { Name = "Backend / API Development", Keywords = new(){ "backend", "back-end", "api", "server" } },
            new SeedNode { Name = "Machine Learning / AI", Keywords = new(){ "machine learning", "ai" } },
            new SeedNode { Name = "Data Science", Keywords = new(){ "data science" } },
            new SeedNode { Name = "Data Engineering", Keywords = new(){ "etl", "data pipeline" } },
            new SeedNode { Name = "DevOps / Cloud", Keywords = new(){ "devops", "cloud" } },
            new SeedNode { Name = "Networking", Keywords = new(){ "network", "protocol" } },
            new SeedNode { Name = "Cybersecurity", Keywords = new(){ "cybersecurity", "pentest" } },
            new SeedNode { Name = "Automation", Keywords = new(){ "automation", "scripting" } },
            new SeedNode { Name = "Game Development", Keywords = new(){ "game", "gamedev" } },
            new SeedNode { Name = "Embedded / IoT", Keywords = new(){ "embedded", "iot" } },
            new SeedNode { Name = "CLI / Terminal Tooling", Keywords = new(){ "cli", "terminal" } },
        }},
        new SeedNode { Name = "Programming Languages", Children = new()
        {
            new SeedNode { Name = "JavaScript", Keywords = new(){ "js" } },
            new SeedNode { Name = "TypeScript", Keywords = new(){ "ts" } },
            new SeedNode { Name = "Java", Keywords = new(){ "java", "jvm" } },
            new SeedNode { Name = "C++", Keywords = new(){ "cpp" } },
            new SeedNode { Name = "C#", Keywords = new(){ "csharp", ".net" } },
            new SeedNode { Name = "Python", Keywords = new(){ "python" } },
            new SeedNode { Name = "Rust", Keywords = new(){ "rust" } },
            new SeedNode { Name = "Go", Keywords = new(){ "golang", "go" } },
            new SeedNode { Name = "Kotlin", Keywords = new(){ "kotlin" } },
            new SeedNode { Name = "Swift", Keywords = new(){ "swift" } },
            new SeedNode { Name = "PHP", Keywords = new(){ "php" } },
            new SeedNode { Name = "Ruby", Keywords = new(){ "ruby" } },
            new SeedNode { Name = "Dart", Keywords = new(){ "dart" } },
            new SeedNode { Name = "SQL", Keywords = new(){ "sql" } },
            new SeedNode { Name = "Shell / Bash", Keywords = new(){ "bash", "shell" } },
        }},
        new SeedNode { Name = "Frameworks & Libraries", Children = new()
        {
            new SeedNode { Name = "Frontend", Children = new()
            {
                new SeedNode { Name = "Angular", Keywords = new(){ "angular" } },
                new SeedNode { Name = "React", Keywords = new(){ "react" } },
                new SeedNode { Name = "Vue.js", Keywords = new(){ "vue" } },
                new SeedNode { Name = "Svelte", Keywords = new(){ "svelte" } },
                new SeedNode { Name = "Next.js", Keywords = new(){ "next.js", "nextjs" } },
                new SeedNode { Name = "Tailwind CSS", Keywords = new(){ "tailwind" } },
            }},
            new SeedNode { Name = "Backend", Children = new()
            {
                new SeedNode { Name = "Spring / Spring Boot", Keywords = new(){ "spring", "spring boot" } },
                new SeedNode { Name = "ASP.NET Core", Keywords = new(){ "asp.net", ".net core" } },
                new SeedNode { Name = "Django", Keywords = new(){ "django" } },
                new SeedNode { Name = "Flask", Keywords = new(){ "flask" } },
                new SeedNode { Name = "FastAPI", Keywords = new(){ "fastapi" } },
                new SeedNode { Name = "Express.js", Keywords = new(){ "express", "node" } },
                new SeedNode { Name = "NestJS", Keywords = new(){ "nestjs" } },
                new SeedNode { Name = "Laravel", Keywords = new(){ "laravel" } },
            }},
            new SeedNode { Name = "Mobile / Desktop", Children = new()
            {
                new SeedNode { Name = "Flutter", Keywords = new(){ "flutter" } },
                new SeedNode { Name = "React Native", Keywords = new(){ "react native" } },
                new SeedNode { Name = "Android SDK", Keywords = new(){ "android sdk" } },
                new SeedNode { Name = "Electron", Keywords = new(){ "electron" } },
            }},
            new SeedNode { Name = "Data Access", Children = new()
            {
                new SeedNode { Name = "Hibernate / JPA", Keywords = new(){ "hibernate", "jpa" } },
                new SeedNode { Name = "Entity Framework", Keywords = new(){ "entity framework", "ef core" } },
                new SeedNode { Name = "SQLAlchemy", Keywords = new(){ "sqlalchemy" } },
                new SeedNode { Name = "Prisma", Keywords = new(){ "prisma" } },
            }},
        }},
        new SeedNode { Name = "Databases & Storage", Children = new()
        {
            new SeedNode { Name = "PostgreSQL", Keywords = new(){ "postgresql", "postgres" } },
            new SeedNode { Name = "MySQL", Keywords = new(){ "mysql" } },
            new SeedNode { Name = "SQLite", Keywords = new(){ "sqlite" } },
            new SeedNode { Name = "MongoDB", Keywords = new(){ "mongodb", "mongo" } },
            new SeedNode { Name = "Redis", Keywords = new(){ "redis" } },
            new SeedNode { Name = "Elasticsearch", Keywords = new(){ "elasticsearch" } },
            new SeedNode { Name = "Cassandra", Keywords = new(){ "cassandra" } },
            new SeedNode { Name = "S3 / MinIO", Keywords = new(){ "s3", "minio", "object storage" } },
        }},
        new SeedNode { Name = "Messaging & APIs", Children = new()
        {
            new SeedNode { Name = "Kafka", Keywords = new(){ "kafka" } },
            new SeedNode { Name = "RabbitMQ", Keywords = new(){ "rabbitmq" } },
            new SeedNode { Name = "gRPC", Keywords = new(){ "grpc" } },
            new SeedNode { Name = "GraphQL", Keywords = new(){ "graphql" } },
            new SeedNode { Name = "REST APIs", Keywords = new(){ "rest", "restful" } },
            new SeedNode { Name = "WebSockets", Keywords = new(){ "websocket", "socket" } },
            new SeedNode { Name = "MQTT", Keywords = new(){ "mqtt" } },
        }},
        new SeedNode { Name = "Cloud & Infrastructure", Children = new()
        {
            new SeedNode { Name = "AWS", Keywords = new(){ "aws" } },
            new SeedNode { Name = "GCP", Keywords = new(){ "gcp", "google cloud" } },
            new SeedNode { Name = "Azure", Keywords = new(){ "azure" } },
            new SeedNode { Name = "Docker", Keywords = new(){ "docker", "container" } },
            new SeedNode { Name = "Kubernetes", Keywords = new(){ "kubernetes", "k8s" } },
            new SeedNode { Name = "Docker Compose", Keywords = new(){ "docker-compose" } },
            new SeedNode { Name = "Nginx", Keywords = new(){ "nginx" } },
            new SeedNode { Name = "Linux", Keywords = new(){ "linux" } },
        }},
        new SeedNode { Name = "DevOps & Automation", Children = new()
        {
            new SeedNode { Name = "CI/CD", Children = new()
            {
                new SeedNode { Name = "GitHub Actions", Keywords = new(){ "github actions" } },
                new SeedNode { Name = "GitLab CI/CD", Keywords = new(){ "gitlab ci" } },
                new SeedNode { Name = "Jenkins", Keywords = new(){ "jenkins" } },
                new SeedNode { Name = "Azure DevOps", Keywords = new(){ "azure devops", "pipeline" } },
            }},
            new SeedNode { Name = "Automation (IaC)", Children = new()
            {
                new SeedNode { Name = "Ansible", Keywords = new(){ "ansible" } },
                new SeedNode { Name = "Terraform", Keywords = new(){ "terraform" } },
                new SeedNode { Name = "Helm", Keywords = new(){ "helm" } },
                new SeedNode { Name = "Cron / Scripting", Keywords = new(){ "cron", "scripting" } },
            }},
            new SeedNode { Name = "Monitoring", Children = new()
            {
                new SeedNode { Name = "Prometheus", Keywords = new(){ "prometheus" } },
                new SeedNode { Name = "Grafana", Keywords = new(){ "grafana" } },
                new SeedNode { Name = "ELK Stack", Keywords = new(){ "elasticsearch", "kibana" } },
            }},
        }},
        new SeedNode { Name = "Data, AI & ML", Children = new()
        {
            new SeedNode { Name = "Machine Learning", Keywords = new(){ "ml" } },
            new SeedNode { Name = "Deep Learning", Keywords = new(){ "deep learning" } },
            new SeedNode { Name = "NLP", Keywords = new(){ "nlp", "natural language" } },
            new SeedNode { Name = "Computer Vision", Keywords = new(){ "computer vision" } },
            new SeedNode { Name = "LLM / RAG", Keywords = new(){ "llm", "rag", "gpt", "retrieval" } },
            new SeedNode { Name = "AI Agents", Keywords = new(){ "agent" } },
            new SeedNode { Name = "Data Pipelines", Keywords = new(){ "pipeline", "etl" } },
            new SeedNode { Name = "Data Visualization", Keywords = new(){ "visualization", "dashboard" } },
            new SeedNode { Name = "ML Frameworks", Children = new()
            {
                new SeedNode { Name = "TensorFlow", Keywords = new(){ "tensorflow" } },
                new SeedNode { Name = "PyTorch", Keywords = new(){ "pytorch" } },
                new SeedNode { Name = "scikit-learn", Keywords = new(){ "scikit-learn", "sklearn" } },
                new SeedNode { Name = "Hugging Face", Keywords = new(){ "huggingface", "transformers" } },
                new SeedNode { Name = "LangChain", Keywords = new(){ "langchain" } },
            }},
        }},
        new SeedNode { Name = "Testing & Quality", Children = new()
        {
            new SeedNode { Name = "Unit Tests", Keywords = new(){ "junit", "pytest", "xunit" } },
            new SeedNode { Name = "Integration Tests", Keywords = new(){ "integration test" } },
            new SeedNode { Name = "E2E Tests", Keywords = new(){ "e2e", "playwright", "cypress" } },
            new SeedNode { Name = "Code Quality / Linting", Keywords = new(){ "lint", "coverage", "sonarqube" } },
            new SeedNode { Name = "Observability", Keywords = new(){ "observability", "tracing" } },
        }},
        new SeedNode { Name = "Security", Children = new()
        {
            new SeedNode { Name = "Auth / SSO", Keywords = new(){ "oauth", "jwt", "keycloak", "sso" } },
            new SeedNode { Name = "Encryption", Keywords = new(){ "encryption", "crypto" } },
            new SeedNode { Name = "Vulnerability Scanning", Keywords = new(){ "vulnerability scan" } },
            new SeedNode { Name = "Penetration Testing", Keywords = new(){ "pentest", "penetration" } },
        }},
        new SeedNode { Name = "Architecture", Children = new()
        {
            new SeedNode { Name = "Microservices", Keywords = new(){ "microservice" } },
            new SeedNode { Name = "Monolith", Keywords = new(){ "monolith" } },
            new SeedNode { Name = "Event-Driven", Keywords = new(){ "event-driven", "event driven" } },
            new SeedNode { Name = "MVC", Keywords = new(){ "mvc" } },
            new SeedNode { Name = "Hexagonal / Clean Architecture", Keywords = new(){ "hexagonal", "clean architecture" } },
            new SeedNode { Name = "Design Patterns", Keywords = new(){ "design pattern" } },
        }},
        new SeedNode { Name = "Project Type", Children = new()
        {
            new SeedNode { Name = "PFE", Keywords = new(){ "pfe", "final year" } },
            new SeedNode { Name = "PFA", Keywords = new(){ "pfa" } },
            new SeedNode { Name = "Hackathon", Keywords = new(){ "hackathon" } },
            new SeedNode { Name = "Coursework", Keywords = new(){ "course", "school", "assignment" } },
            new SeedNode { Name = "Open Source", Keywords = new(){ "open source" } },
            new SeedNode { Name = "Internal Tool" },
            new SeedNode { Name = "PoC / Experiment", Keywords = new(){ "poc", "prototype", "experiment" } },
            new SeedNode { Name = "Portfolio / Showcase" },
        }},
    };

    // ── Experiences ───────────────────────────────────────────────────────────
    private static List<SeedNode> Experiences() => new()
    {
        new SeedNode { Name = "Industry", Children = new()
        {
            new SeedNode { Name = "Web" },
            new SeedNode { Name = "AI / ML" },
            new SeedNode { Name = "Data" },
            new SeedNode { Name = "DevOps" },
            new SeedNode { Name = "Distributed Systems" },
            new SeedNode { Name = "Finance" },
            new SeedNode { Name = "Healthcare" },
            new SeedNode { Name = "E-commerce" },
            new SeedNode { Name = "Education" },
        }},
        new SeedNode { Name = "Role", Children = new()
        {
            new SeedNode { Name = "Software Engineer" },
            new SeedNode { Name = "Backend Engineer" },
            new SeedNode { Name = "Frontend Engineer" },
            new SeedNode { Name = "Full Stack Engineer" },
            new SeedNode { Name = "Data Engineer" },
            new SeedNode { Name = "ML Engineer" },
            new SeedNode { Name = "DevOps Engineer" },
            new SeedNode { Name = "Intern" },
        }},
        new SeedNode { Name = "Level", Children = new()
        {
            new SeedNode { Name = "Intern" },
            new SeedNode { Name = "Junior" },
            new SeedNode { Name = "Mid" },
            new SeedNode { Name = "Senior" },
            new SeedNode { Name = "Lead" },
        }},
    };

    // ── Educations ────────────────────────────────────────────────────────────
    private static List<SeedNode> Educations() => new()
    {
        new SeedNode { Name = "Level", Children = new()
        {
            new SeedNode { Name = "Bachelor" },
            new SeedNode { Name = "Master" },
            new SeedNode { Name = "PhD" },
            new SeedNode { Name = "Engineering Degree" },
        }},
        new SeedNode { Name = "Field", Children = new()
        {
            new SeedNode { Name = "Computer Science" },
            new SeedNode { Name = "Software Engineering" },
            new SeedNode { Name = "Data Science" },
            new SeedNode { Name = "Artificial Intelligence" },
            new SeedNode { Name = "Mathematics" },
            new SeedNode { Name = "Networking" },
        }},
    };

    // ── Certifications ────────────────────────────────────────────────────────
    private static List<SeedNode> Certifications() => new()
    {
        new SeedNode { Name = "Vendor", Children = new()
        {
            new SeedNode { Name = "AWS", Keywords = new(){"amazon web services"} },
            new SeedNode { Name = "Microsoft" },
            new SeedNode { Name = "Google" },
            new SeedNode { Name = "Oracle" },
            new SeedNode { Name = "Cisco" },
            new SeedNode { Name = "HashiCorp" },
            new SeedNode { Name = "Other" },
        }},
        new SeedNode { Name = "Domain", Children = new()
        {
            new SeedNode { Name = "Cloud" },
            new SeedNode { Name = "Security" },
            new SeedNode { Name = "Data" },
            new SeedNode { Name = "DevOps" },
            new SeedNode { Name = "Networking" },
        }},
    };

    // ── Skills ────────────────────────────────────────────────────────────────
    private static List<SeedNode> Skills() => new()
    {
        new SeedNode { Name = "Type", Children = new()
        {
            new SeedNode { Name = "Programming Language" },
            new SeedNode { Name = "Framework" },
            new SeedNode { Name = "Library" },
            new SeedNode { Name = "Tool" },
            new SeedNode { Name = "Database" },
            new SeedNode { Name = "Soft Skill" },
            new SeedNode { Name = "Methodology" },
        }},
        new SeedNode { Name = "Technical", Children = new()
        {
            new SeedNode { Name = "Frontend" },
            new SeedNode { Name = "Backend" },
            new SeedNode { Name = "DevOps" },
            new SeedNode { Name = "Data" },
            new SeedNode { Name = "AI / ML" },
        }},
    };

    // ── Languages ─────────────────────────────────────────────────────────────
    private static List<SeedNode> Languages() => new()
    {
        new SeedNode { Name = "Proficiency", Children = new()
        {
            new SeedNode { Name = "Native" },
            new SeedNode { Name = "Fluent" },
            new SeedNode { Name = "Intermediate" },
            new SeedNode { Name = "Beginner" },
        }},
    };

    // ── Hackathons ────────────────────────────────────────────────────────────
    private static List<SeedNode> Hackathons() => new()
    {
        new SeedNode { Name = "Theme", Children = new()
        {
            new SeedNode { Name = "AI" },
            new SeedNode { Name = "Web" },
            new SeedNode { Name = "Data" },
            new SeedNode { Name = "Other" },
        }},
    };

    // ── Interests ─────────────────────────────────────────────────────────────
    private static List<SeedNode> Interests() => new()
    {
        new SeedNode { Name = "Theme", Children = new()
        {
            new SeedNode { Name = "Technology" },
            new SeedNode { Name = "Sports" },
            new SeedNode { Name = "Arts" },
            new SeedNode { Name = "Science" },
            new SeedNode { Name = "Other" },
        }},
    };

    // ── Academic Activities ───────────────────────────────────────────────────
    private static List<SeedNode> AcademicActivities() => new()
    {
        new SeedNode { Name = "Type", Children = new()
        {
            new SeedNode { Name = "Research" },
            new SeedNode { Name = "PFA" },
            new SeedNode { Name = "PFE" },
            new SeedNode { Name = "Coursework" },
        }},
    };
}
