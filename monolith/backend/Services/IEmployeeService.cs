using CV_Generator.Dto;

namespace CV_Generator.Services;

public interface IEmployeeService
{
    Task<List<EmployeeDto>> GetEmployeesAsync(Guid userId, string? company, string? search);
    Task<EmployeeDto?> GetEmployeeAsync(Guid id, Guid userId);
    Task<EmployeeDto> CreateEmployeeAsync(Guid userId, CreateEmployeeDto dto);
    Task<EmployeeDto?> UpdateEmployeeAsync(Guid id, Guid userId, UpdateEmployeeDto dto);
    Task<bool> DeleteEmployeeAsync(Guid id, Guid userId);
    Task<EmployeeExtractResultDto> ExtractEmployeesAsync(Guid userId, List<CreateEmployeeDto> rows);
    Task<List<EmployeeDto>> GetByCompanyAsync(Guid userId, string companyName);
}