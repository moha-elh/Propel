using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CV_Generator.Migrations
{
    /// <inheritdoc />
    public partial class AddSavedToolContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "saved_tool_content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Tool = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Title = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Text = table.Column<string>(type: "text", nullable: false),
                    Hashtags = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    OriginalText = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_tool_content", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_saved_tool_content_UserId",
                table: "saved_tool_content",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "saved_tool_content");
        }
    }
}
