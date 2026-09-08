using Microsoft.AspNetCore.Mvc;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

public class EmployeesController : BaseApiController
{
    private readonly IEmployeeService _employees;

    public EmployeesController(ICurrentUserService currentUser, IEmployeeService employees)
        : base(currentUser)
    {
        _employees = employees;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? company, [FromQuery] string? search)
    {
        var userId = GetUserId();
        var items = await _employees.GetEmployeesAsync(userId, company, search);
        return Ok(ApiResponse<List<EmployeeDto>>.Ok(items));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = GetUserId();
        var result = await _employees.GetEmployeeAsync(id, userId);
        if (result is null) return NotFound(ApiResponse<EmployeeDto>.Error("Employee not found"));
        return Ok(ApiResponse<EmployeeDto>.Ok(result));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEmployeeDto dto)
    {
        var userId = GetUserId();
        try
        {
            var result = await _employees.CreateEmployeeAsync(userId, dto);
            return CreatedAtAction(nameof(Get), new { id = result.Id }, ApiResponse<EmployeeDto>.Created(result));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<EmployeeDto>.Error(ex.Message));
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEmployeeDto dto)
    {
        var userId = GetUserId();
        try
        {
            var result = await _employees.UpdateEmployeeAsync(id, userId, dto);
            if (result is null) return NotFound(ApiResponse<EmployeeDto>.Error("Employee not found"));
            return Ok(ApiResponse<EmployeeDto>.Ok(result));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<EmployeeDto>.Error(ex.Message));
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        var deleted = await _employees.DeleteEmployeeAsync(id, userId);
        if (!deleted) return NotFound(ApiResponse<object>.Error("Employee not found"));
        return NoContent();
    }

    [HttpPost("extract")]
    public async Task<IActionResult> Extract([FromBody] List<CreateEmployeeDto> rows)
    {
        var userId = GetUserId();
        if (rows is null || rows.Count == 0)
            return BadRequest(ApiResponse<EmployeeExtractResultDto>.Error("No employees provided"));
        var result = await _employees.ExtractEmployeesAsync(userId, rows);
        return Ok(ApiResponse<EmployeeExtractResultDto>.Ok(result, $"{result.Imported} imported, {result.Skipped} skipped"));
    }
}