using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CV_Generator.Migrations
{
    /// <inheritdoc />
    public partial class AddCvTagsAndSendTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TagsJson",
                table: "Cvs",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CvVersionSends",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CvVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CvId = table.Column<Guid>(type: "uuid", nullable: false),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CvVersionSends", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CvVersionSends_applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "applications",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_CvVersionSends_ApplicationId",
                table: "CvVersionSends",
                column: "ApplicationId");

            migrationBuilder.CreateIndex(
                name: "IX_CvVersionSends_CvVersionId_SentAt",
                table: "CvVersionSends",
                columns: new[] { "CvVersionId", "SentAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CvVersionSends_UserId",
                table: "CvVersionSends",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CvVersionSends");

            migrationBuilder.DropColumn(
                name: "TagsJson",
                table: "Cvs");
        }
    }
}
