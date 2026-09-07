using System.Text;
using System.Text.Json;
using CV_Generator.Dto;
using CV_Generator.Models;

namespace CV_Generator.Services.AgentClients;

public interface ICompanyResearchClient
{
    /// <summary>Crawl a company homepage and extract structured facts. Returns null on transport failure.</summary>
    Task<CompanyResearchResultDto?> ResearchAsync(Company company, List<string> dataTypes, string? provider, string? model, CancellationToken cancellationToken = default);
}

public class CompanyResearchClient : ICompanyResearchClient
{
    private static readonly JsonSerializerOptions SnakeCaseOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _client;

    public CompanyResearchClient(HttpClient client)
    {
        _client = client;
    }

    public async Task<CompanyResearchResultDto?> ResearchAsync(
        Company company,
        List<string> dataTypes,
        string? provider,
        string? model,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            name = company.Name,
            website_url = company.WebsiteUrl,
            location = company.Location,
            provider,
            model,
            data_types = dataTypes
        };

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync("research", content, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new HttpRequestException($"company-research returned {(int)response.StatusCode}: {errorBody}");
            }
            var wrapper = await response.Content.ReadFromJsonAsync<CompanyResearchWrapperDto>(SnakeCaseOptions, cancellationToken: cancellationToken);
            return wrapper?.Result;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception e)
        {
            throw new HttpRequestException($"company-research call failed: {e.Message}");
        }
    }
}

public class CompanyResearchWrapperDto
{
    public CompanyResearchResultDto? Result { get; set; }
}