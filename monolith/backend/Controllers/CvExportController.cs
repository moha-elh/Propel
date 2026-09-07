using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cv/{cvId}/export")]
public class CvExportController : ControllerBase
{
    [HttpPost("pdf")]
    public async Task<IActionResult> ExportPdf(Guid cvId, [FromQuery] Guid? versionId)
    {
        return Ok(new { message = "PDF export endpoint - implementation pending" });
    }

    [HttpPost("docx")]
    public async Task<IActionResult> ExportDocx(Guid cvId, [FromQuery] Guid? versionId)
    {
        return Ok(new { message = "DOCX export endpoint - implementation pending" });
    }
}
