using Minio;
using Minio.DataModel.Args;

namespace CV_Generator.Services;

public interface IMinioStorageService
{
    Task EnsureBucketAsync(string bucket, CancellationToken ct = default);
    Task<string> UploadAsync(string bucket, string objectKey, Stream stream, string contentType, long size, CancellationToken ct = default);
    Task<byte[]> GetObjectAsync(string bucket, string objectKey, CancellationToken ct = default);
    Task DeleteAsync(string bucket, string objectKey, CancellationToken ct = default);
}

public class MinioStorageService : IMinioStorageService
{
    private readonly IMinioClient _client;
    private readonly string _publicBaseUrl;

    public MinioStorageService(IConfiguration config)
    {
        var endpoint = Environment.GetEnvironmentVariable("MINIO_ENDPOINT")
            ?? config["Minio:Endpoint"]
            ?? "localhost:9000";
        var accessKey = Environment.GetEnvironmentVariable("MINIO_ROOT_USER")
            ?? config["Minio:AccessKey"]
            ?? "minioadmin";
        var secretKey = Environment.GetEnvironmentVariable("MINIO_ROOT_PASSWORD")
            ?? config["Minio:SecretKey"]
            ?? "minioadmin";
        var secure = bool.TryParse(Environment.GetEnvironmentVariable("MINIO_SECURE") ?? config["Minio:Secure"], out var s) && s;
        var publicBaseUrl = Environment.GetEnvironmentVariable("MINIO_PUBLIC_URL") ?? $"{(secure ? "https" : "http")}://{endpoint}";

        var host = endpoint;
        var port = 9000;
        if (endpoint.Contains(':'))
        {
            var parts = endpoint.Split(':');
            host = parts[0];
            if (int.TryParse(parts[^1], out var p)) port = p;
        }

        _client = new MinioClient()
            .WithEndpoint(host, port)
            .WithCredentials(accessKey, secretKey)
            .WithSSL(secure)
            .Build();
        _publicBaseUrl = publicBaseUrl;
    }

    public async Task EnsureBucketAsync(string bucket, CancellationToken ct = default)
    {
        var exists = await _client.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket), ct);
        if (!exists)
        {
            await _client.MakeBucketAsync(new MakeBucketArgs().WithBucket(bucket), ct);
        }
        // Objects are served to the browser via their public URL (PDF preview iframes, downloads).
        await _client.SetPolicyAsync(new SetPolicyArgs().WithBucket(bucket).WithPolicy(PublicReadPolicy(bucket)), ct);
    }

    private static string PublicReadPolicy(string bucket) =>
        $$"""{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{{bucket}}/*"]}]}""";

    public async Task<string> UploadAsync(string bucket, string objectKey, Stream stream, string contentType, long size, CancellationToken ct = default)
    {
        await EnsureBucketAsync(bucket, ct);
        await _client.PutObjectAsync(new PutObjectArgs()
            .WithBucket(bucket)
            .WithObject(objectKey)
            .WithStreamData(stream)
            .WithObjectSize(size)
            .WithContentType(contentType), ct);
        return $"{_publicBaseUrl}/{bucket}/{objectKey}";
    }

    public async Task<byte[]> GetObjectAsync(string bucket, string objectKey, CancellationToken ct = default)
    {
        await EnsureBucketAsync(bucket, ct);
        var result = Array.Empty<byte>();
        var getArgs = new GetObjectArgs()
            .WithBucket(bucket)
            .WithObject(objectKey)
            .WithCallbackStream(stream =>
            {
                using var ms = new MemoryStream();
                stream.CopyTo(ms);
                result = ms.ToArray();
            });
        await _client.GetObjectAsync(getArgs, ct);
        return result;
    }

    public async Task DeleteAsync(string bucket, string objectKey, CancellationToken ct = default)
    {
        await EnsureBucketAsync(bucket, ct);
        await _client.RemoveObjectAsync(new RemoveObjectArgs().WithBucket(bucket).WithObject(objectKey), ct);
    }
}