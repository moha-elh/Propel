using System.Text;
using System.Text.Json;

namespace CV_Generator.Services;

public interface ITextPdfService
{
    Task<byte[]?> RenderTextAsync(string text, string? title = null, CancellationToken ct = default);
}

public class TextPdfService : ITextPdfService
{
    private readonly HttpClient _http;

    public TextPdfService(HttpClient http) => _http = http;

    public async Task<byte[]?> RenderTextAsync(string text, string? title = null, CancellationToken ct = default)
    {
        try
        {
            var json = JsonSerializer.Serialize(new { text, title });
            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            using var response = await _http.PostAsync("text", content, ct);
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadAsByteArrayAsync(ct);
        }
        catch (Exception)
        {
            // The PDF sidecar may be down: return null so callers can degrade gracefully.
            return null;
        }
    }
}