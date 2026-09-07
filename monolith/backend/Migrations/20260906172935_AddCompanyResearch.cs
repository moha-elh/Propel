using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CV_Generator.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyResearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "companies",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompanyFactsJson",
                table: "companies",
                type: "jsonb",
                maxLength: 6000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmailsJson",
                table: "companies",
                type: "jsonb",
                maxLength: 3000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PhonesJson",
                table: "companies",
                type: "jsonb",
                maxLength: 3000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResearchLink",
                table: "companies",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResearchSource",
                table: "companies",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResearchUpdatedAt",
                table: "companies",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SocialLinksJson",
                table: "companies",
                type: "jsonb",
                maxLength: 6000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Address",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "CompanyFactsJson",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "EmailsJson",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "PhonesJson",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "ResearchLink",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "ResearchSource",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "ResearchUpdatedAt",
                table: "companies");

            migrationBuilder.DropColumn(
                name: "SocialLinksJson",
                table: "companies");
        }
    }
}
