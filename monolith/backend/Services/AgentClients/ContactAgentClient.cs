using CV_Generator.Dto;

namespace CV_Generator.Services.AgentClients;

public interface IContactAgentClient
{
    Task<ContactEmailResponse?> GenerateAsync(ContactInput input, CancellationToken cancellationToken = default);
    Task<bool> CheckHealthAsync(CancellationToken cancellationToken = default);
}

public class ContactAgentClient : IContactAgentClient
{
    private readonly HttpClient _client;

    public ContactAgentClient(HttpClient client)
    {
        _client = client;
    }

    public async Task<ContactEmailResponse?> GenerateAsync(ContactInput input, CancellationToken cancellationToken = default)
    {
        var response = await _client.PostAsJsonAsync("generate-email", input, cancellationToken: cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ContactEmailResponse>(cancellationToken: cancellationToken);
    }

    public async Task<bool> CheckHealthAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _client.GetAsync("health", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}
