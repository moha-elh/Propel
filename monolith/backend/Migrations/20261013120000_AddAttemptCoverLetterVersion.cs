using System;
using CV_Generator.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CV_Generator.Migrations
{
    /// <summary>
    /// Upstream added this column inside its own AddCoverLetters migration, which this fork
    /// replaced with a different one; the model snapshot already has it.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261013120000_AddAttemptCoverLetterVersion")]
    public partial class AddAttemptCoverLetterVersion : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE application_attempts ADD COLUMN IF NOT EXISTS "CoverLetterVersionId" uuid NULL;""");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CoverLetterVersionId", table: "application_attempts");
        }
    }
}
