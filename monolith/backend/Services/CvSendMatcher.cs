using System.Text.RegularExpressions;
using CV_Generator.Models;

namespace CV_Generator.Services;

/// <summary>
/// Tolerant matching between email attachment filenames and the user's CV versions.
/// The frontend names CV attachments "<title> — v&lt;N&gt;[ · label].pdf"; we also accept
/// plain "&lt;title&gt;.pdf" (earliest version), bare "v1[/ · label]" forms and any
/// title-prefixed name carrying a matching v&lt;N&gt; token.
/// </summary>
public static class CvSendMatcher
{
    private static readonly Regex WholeVersionPattern = new(@"^v\d+(\s+·\s+.+)?$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static CvVersion? Match(string fileName, IReadOnlyList<Cv> cvs)
    {
        foreach (var cv in cvs)
        {
            var version = Match(fileName, cv);
            if (version is not null) return version;
        }
        return null;
    }

    public static CvVersion? Match(string fileName, Cv cv)
    {
        var name = StripExtension(fileName.Trim().ToLowerInvariant());
        if (name.Length == 0) return null;

        var title = cv.Title.Trim().ToLowerInvariant();
        if (title.Length == 0) return null;

        var versions = cv.Versions
            .Where(v => !string.IsNullOrWhiteSpace(v.PdfUrl) || !string.IsNullOrWhiteSpace(v.FileUrl))
            .OrderBy(v => v.VersionNumber)
            .ToList();
        if (versions.Count == 0) return null;

        // Plain "<title>.pdf" → the earliest version.
        if (name == title) return versions[0];

        foreach (var v in versions)
        {
            var token = $"v{v.VersionNumber}";

            // Strict whole-name form: "v1" or "v1 · label".
            if (WholeVersionPattern.IsMatch(name))
            {
                if (name == token || name.StartsWith(token + " \u00b7 ", StringComparison.Ordinal))
                    return v;
                continue;
            }

            // Title-prefixed with a matching v<N> token: "<title> — v2 · label.pdf", "<title> v2 final.pdf".
            if (name.Length > title.Length && name.StartsWith(title, StringComparison.Ordinal))
            {
                var after = name[title.Length];
                if ((after is ' ' or '-' or '\u2014' or '\u00b7') && NameContainsVersion(name, v.VersionNumber))
                    return v;
            }
        }

        return null;
    }

    private static bool NameContainsVersion(string name, int versionNumber)
        => Regex.IsMatch(name, $@"\bv{versionNumber}\b", RegexOptions.IgnoreCase);

    private static string StripExtension(string fileName)
    {
        var dot = fileName.LastIndexOf('.');
        return dot > 0 ? fileName[..dot] : fileName;
    }
}