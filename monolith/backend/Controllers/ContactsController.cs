using Microsoft.AspNetCore.Mvc;
using CV_Generator;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

public class ContactsController : BaseApiController
{
    private readonly IContactService _contactSvc;
    private readonly IApplicationService _applicationSvc;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ContactsController> _logger;

    public ContactsController(
        ICurrentUserService currentUser,
        IContactService contactSvc,
        IApplicationService applicationSvc,
        IServiceScopeFactory scopeFactory,
        ILogger<ContactsController> logger)
        : base(currentUser)
    {
        _contactSvc = contactSvc;
        _applicationSvc = applicationSvc;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search,
        [FromQuery] string? source,
        [FromQuery] bool? favorite,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = GetUserId();
        var result = await _contactSvc.GetContactsAsync(userId, search, source, favorite, page, pageSize);
        return Ok(ApiResponse<ContactListResponse>.Ok(result));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = GetUserId();
        var result = await _contactSvc.GetContactAsync(id, userId);
        if (result is null) return NotFound(ApiResponse<ContactDto>.Error("Contact not found"));
        return Ok(ApiResponse<ContactDto>.Ok(result));
    }

    /// GET /contacts/{id}/applications — applications reached through this contact
    [HttpGet("{id}/applications")]
    public async Task<IActionResult> GetApplications(Guid id)
    {
        var userId = GetUserId();
        var result = await _applicationSvc.GetApplicationsForContactAsync(id, userId);
        if (result is null) return NotFound(ApiResponse<List<ApplicationResponseDto>>.Error("Contact not found"));
        return Ok(ApiResponse<List<ApplicationResponseDto>>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateContactDto dto)
    {
        var userId = GetUserId();
        try
        {
            var result = await _contactSvc.CreateContactAsync(userId, dto);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, ApiResponse<ContactDto>.Created(result));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ContactDto>.Error(ex.Message));
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateContactDto dto)
    {
        var userId = GetUserId();
        try
        {
            var result = await _contactSvc.UpdateContactAsync(id, userId, dto);
            if (result is null) return NotFound(ApiResponse<ContactDto>.Error("Contact not found"));
            return Ok(ApiResponse<ContactDto>.Ok(result));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ContactDto>.Error(ex.Message));
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        var deleted = await _contactSvc.DeleteContactAsync(id, userId);
        if (!deleted) return NotFound(ApiResponse<object>.Error("Contact not found"));
        return NoContent();
    }

    [HttpPost("extract")]
    public async Task<IActionResult> Extract([FromBody] List<CreateContactDto> rows)
    {
        var userId = GetUserId();
        if (rows is null || rows.Count == 0)
            return BadRequest(ApiResponse<ContactExtractResultDto>.Error("No contacts provided"));
        var result = await _contactSvc.ExtractContactsAsync(userId, rows);
        if (result.Imported > 0)
            SearchSyncHelper.TriggerSync(_scopeFactory, userId, _logger, "Contact.Create");
        return Ok(ApiResponse<ContactExtractResultDto>.Ok(result, $"{result.Imported} imported, {result.Skipped} skipped"));
    }

    [HttpPost("import-csv")]
    public async Task<IActionResult> ImportCsv([FromBody] ImportCsvDto dto)
    {
        var userId = GetUserId();
        var count = await _contactSvc.ImportCsvAsync(userId, dto.CsvContent);
        return Ok(ApiResponse<object>.Ok(new { imported = count }));
    }

    [HttpPost("import-from-offers")]
    public async Task<IActionResult> ImportFromOffers()
    {
        var userId = GetUserId();
        var count = await _contactSvc.ImportFromJobOffersAsync(userId);
        return Ok(ApiResponse<object>.Ok(new { imported = count }));
    }

    [HttpPatch("{id}/favorite")]
    public async Task<IActionResult> ToggleFavorite(Guid id)
    {
        var userId = GetUserId();
        var result = await _contactSvc.ToggleFavoriteAsync(id, userId);
        if (result is null) return NotFound(ApiResponse<ContactDto>.Error("Contact not found"));
        return Ok(ApiResponse<ContactDto>.Ok(result));
    }
}
