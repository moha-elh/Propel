namespace CV_Generator.Dto;

public class ImageDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? ObjectKey { get; set; }
    public string? ContentType { get; set; }
    public long? SizeBytes { get; set; }
    public string Source { get; set; } = "upload";
    public DateTime CreatedAt { get; set; }
}

public class ImageListResponse
{
    public List<ImageDto> Items { get; set; } = [];
    public int Total { get; set; }
}

public class FromUrlImageDto
{
    public string Url { get; set; } = string.Empty;
    public string? Name { get; set; }
}