using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Models;
using CV_Generator.Data;
using CV_Generator.Services;
using CV_Generator.Dto;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEventBus _eventBus;
    private readonly ILogger<UsersController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ICurrentUserService _currentUser;

    public UsersController(AppDbContext db, IEventBus eventBus, ILogger<UsersController> logger, IServiceScopeFactory scopeFactory, ICurrentUserService currentUser)
    {
        _db = db;
        _eventBus = eventBus;
        _logger = logger;
        _scopeFactory = scopeFactory;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var users = await _db.Users.ToListAsync();
        return Ok(ApiResponse<List<UserResponseDto>>.Ok(users.Select(ToDto).ToList()));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound(ApiResponse<UserResponseDto>.Error("User not found"));
        return Ok(ApiResponse<UserResponseDto>.Ok(ToDto(user)));
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var user = await _db.Users.FindAsync(_currentUser.UserId);
        if (user == null) return NotFound(ApiResponse<UserResponseDto>.Error("User not found"));
        return Ok(ApiResponse<UserResponseDto>.Ok(ToDto(user)));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserDto dto)
    {
        var existing = await _db.Users.AnyAsync(u => u.Email == dto.Email);
        if (existing)
            return Conflict(ApiResponse<UserResponseDto>.Error("Email already exists"));

        var user = new User
        {
            KeycloakId = dto.KeycloakId,
            FirstName = dto.FirstName,
            LastName = dto.LastName,
            Email = dto.Email,
            Role = Enum.Parse<Role>(dto.Role),
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, user.Id, _logger, "User.Create");

        _logger.LogInformation("Created user {Id}", user.Id);

        await _eventBus.PublishAsync(new UserCreatedEvent(user.Id, user.Email, user.FirstName, user.LastName));

        return Created($"/api/users/{user.Id}", ApiResponse<UserResponseDto>.Created(ToDto(user)));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserDto dto)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound(ApiResponse<UserResponseDto>.Error("User not found"));

        user.FirstName = dto.FirstName;
        user.LastName = dto.LastName;
        user.PhoneNumber = dto.PhoneNumber;
        if (dto.BirthDate != null && DateTime.TryParse(dto.BirthDate, null, System.Globalization.DateTimeStyles.AssumeUniversal, out var birthDate))
            user.BirthDate = DateTime.SpecifyKind(birthDate, DateTimeKind.Utc);
        user.AvatarUrl = dto.AvatarUrl;
        user.PreferencesJson = dto.PreferencesJson;
        user.Headline = dto.Headline;
        user.Bio = dto.Bio;
        user.City = dto.City;
        user.Country = dto.Country;
        user.AuthorizedCountry = dto.AuthorizedCountry;
        user.RequiresVisaSponsorship = dto.RequiresVisaSponsorship;
        user.NoticePeriod = dto.NoticePeriod;
        user.EmploymentTypes = dto.EmploymentTypes;
        user.RemotePreference = dto.RemotePreference;
        user.WillingToRelocate = dto.WillingToRelocate;
        user.DesiredJobTitle = dto.DesiredJobTitle;
        user.DesiredSalaryMin = dto.DesiredSalaryMin;
        user.DesiredSalaryMax = dto.DesiredSalaryMax;
        user.ProfessionalTitles = dto.ProfessionalTitles;
        if (dto.ProfilePhotoKey != null) user.ProfilePhotoKey = string.IsNullOrWhiteSpace(dto.ProfilePhotoKey) ? null : dto.ProfilePhotoKey.Trim();

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, user.Id, _logger, "User.Update");
        return Ok(ApiResponse<UserResponseDto>.Ok(ToDto(user)));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound(ApiResponse<object>.Error("User not found"));

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, user.Id, _logger, "User.Delete");
        return NoContent();
    }

    private static UserResponseDto ToDto(User u) => new(
        u.Id, u.KeycloakId, u.FirstName, u.LastName, u.Email,
        u.PhoneNumber, u.BirthDate?.ToString("O"), u.Role.ToString(),
        u.AvatarUrl, u.CreatedAt, u.LastLogin, u.IsActive,
        u.AiProfileDataJson, u.PreferencesJson,
        u.Headline, u.Bio, u.City, u.Country, u.AuthorizedCountry,
        u.RequiresVisaSponsorship, u.NoticePeriod, u.EmploymentTypes,
        u.RemotePreference, u.WillingToRelocate, u.DesiredJobTitle,
        u.DesiredSalaryMin, u.DesiredSalaryMax, u.ProfessionalTitles,
        u.ProfilePhotoKey
    );
}
