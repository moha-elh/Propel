using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;

namespace CV_Generator.Services;

public class EmployeeService : IEmployeeService
{
    private readonly AppDbContext _db;

    public EmployeeService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<EmployeeDto>> GetEmployeesAsync(Guid userId, string? company, string? search)
    {
        var query = _db.Set<Employee>().Where(e => e.UserId == userId);

        if (!string.IsNullOrWhiteSpace(company))
        {
            var key = company.Trim().ToLower();
            query = query.Where(e => e.Company != null && e.Company.Trim().ToLower() == key);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLower();
            query = query.Where(e =>
                e.Name.ToLower().Contains(term) ||
                (e.Position != null && e.Position.ToLower().Contains(term)));
        }

        return await query
            .OrderBy(e => e.Name)
            .Select(e => new EmployeeDto
            {
                Id = e.Id,
                UserId = e.UserId,
                Name = e.Name,
                Position = e.Position,
                Company = e.Company,
                Email = e.Email,
                Phone = e.Phone,
                LinkedInUrl = e.LinkedInUrl,
                Notes = e.Notes,
                Source = e.Source,
                CreatedAt = e.CreatedAt,
                UpdatedAt = e.UpdatedAt
            })
            .ToListAsync();
    }

    public async Task<EmployeeDto?> GetEmployeeAsync(Guid id, Guid userId)
    {
        var e = await _db.Set<Employee>().FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        return e is null ? null : Map(e);
    }

    public async Task<EmployeeDto> CreateEmployeeAsync(Guid userId, CreateEmployeeDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Employee name is required");

        var employee = new Employee
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = dto.Name.Trim(),
            Position = NormalizeNull(dto.Position),
            Company = NormalizeNull(dto.Company),
            Email = NormalizeNull(dto.Email),
            Phone = NormalizeNull(dto.Phone),
            LinkedInUrl = NormalizeNull(dto.LinkedInUrl),
            Notes = NormalizeNull(dto.Notes),
            Source = dto.Source ?? "manual"
        };
        _db.Set<Employee>().Add(employee);
        await _db.SaveChangesAsync();
        return Map(employee);
    }

    public async Task<EmployeeDto?> UpdateEmployeeAsync(Guid id, Guid userId, UpdateEmployeeDto dto)
    {
        var e = await _db.Set<Employee>().FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        if (e is null) return null;

        if (dto.Name is not null)
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) throw new ArgumentException("Employee name cannot be empty");
            e.Name = dto.Name.Trim();
        }
        if (dto.Position is not null) e.Position = NormalizeNull(dto.Position);
        if (dto.Company is not null) e.Company = NormalizeNull(dto.Company);
        if (dto.Email is not null) e.Email = NormalizeNull(dto.Email);
        if (dto.Phone is not null) e.Phone = NormalizeNull(dto.Phone);
        if (dto.LinkedInUrl is not null) e.LinkedInUrl = NormalizeNull(dto.LinkedInUrl);
        if (dto.Notes is not null) e.Notes = NormalizeNull(dto.Notes);
        e.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Map(e);
    }

    public async Task<bool> DeleteEmployeeAsync(Guid id, Guid userId)
    {
        var e = await _db.Set<Employee>().FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
        if (e is null) return false;
        _db.Set<Employee>().Remove(e);
        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>Employees whose company matches (normalized) the given name.</summary>
    public async Task<List<EmployeeDto>> GetByCompanyAsync(Guid userId, string companyName)
    {
        var key = companyName.Trim().ToLower();
        return await _db.Set<Employee>().AsNoTracking()
            .Where(e => e.UserId == userId && e.Company != null && e.Company.Trim().ToLower() == key)
            .OrderBy(e => e.Name)
            .Select(e => new EmployeeDto
            {
                Id = e.Id,
                UserId = e.UserId,
                Name = e.Name,
                Position = e.Position,
                Company = e.Company,
                Email = e.Email,
                Phone = e.Phone,
                LinkedInUrl = e.LinkedInUrl,
                Notes = e.Notes,
                Source = e.Source,
                CreatedAt = e.CreatedAt,
                UpdatedAt = e.UpdatedAt
            })
            .ToListAsync();
    }

    /// <summary>
    /// Batch-create employees parsed from an AI response after user review.
    /// Requires only a name (role optional) — employees with no reachable channel
    /// are fine, they exist for org-chart/people purposes.
    /// Dedups against the user's existing employees by company|name.
    /// </summary>
    public async Task<EmployeeExtractResultDto> ExtractEmployeesAsync(Guid userId, List<CreateEmployeeDto> rows)
    {
        var result = new EmployeeExtractResultDto();
        if (rows is null || rows.Count == 0) return result;

        var existing = await _db.Set<Employee>().Where(e => e.UserId == userId).ToListAsync();
        var seenKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var e in existing)
            seenKeys.Add("n:" + (e.Company ?? "").Trim().ToLower() + "|" + e.Name.Trim().ToLower());

        void Skip(string reason)
        {
            result.Skipped++;
            result.Errors.Add(reason);
        }

        var employees = new List<Employee>();
        foreach (var (row, idx) in rows.Select((r, i) => (r, i)))
        {
            var name = row.Name?.Trim() ?? "";
            if (name.Length == 0)
            {
                Skip($"Row {idx + 1}: employee name is required");
                continue;
            }

            var key = "n:" + (row.Company ?? "").Trim().ToLower() + "|" + name.ToLower();
            if (!seenKeys.Add(key))
            {
                Skip($"Row {idx + 1}: '{name}' is already saved for this company");
                continue;
            }

            employees.Add(new Employee
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = name,
                Position = NormalizeNull(row.Position),
                Company = NormalizeNull(row.Company),
                Email = NormalizeNull(row.Email),
                Phone = NormalizeNull(row.Phone),
                LinkedInUrl = NormalizeNull(row.LinkedInUrl),
                Notes = NormalizeNull(row.Notes),
                Source = "extract"
            });
        }

        if (employees.Count > 0)
        {
            _db.Set<Employee>().AddRange(employees);
            await _db.SaveChangesAsync();
        }

        result.Imported = employees.Count;
        return result;
    }

    private static EmployeeDto Map(Employee e) => new()
    {
        Id = e.Id, UserId = e.UserId, Name = e.Name, Position = e.Position,
        Company = e.Company, Email = e.Email, Phone = e.Phone,
        LinkedInUrl = e.LinkedInUrl, Notes = e.Notes,
        Source = e.Source, CreatedAt = e.CreatedAt, UpdatedAt = e.UpdatedAt
    };

    private static string? NormalizeNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}