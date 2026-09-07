using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace CV_Generator.Migrations
{
    /// <inheritdoc />
    public partial class EnhanceCareerFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NameEmbedding",
                table: "skills");

            migrationBuilder.DropColumn(
                name: "AiSummaryJson",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "DescriptionEmbedding",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "AiSummaryJson",
                table: "experiences");

            migrationBuilder.DropColumn(
                name: "DescriptionEmbedding",
                table: "experiences");

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "social_links",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsCore",
                table: "skills",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "LastUsedYear",
                table: "skills",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "skills",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Subcategory",
                table: "skills",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "projects",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "projects",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TeamSize",
                table: "projects",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "languages",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "interests",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "EndDate",
                table: "hackathons",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProjectUrl",
                table: "hackathons",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "hackathons",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "StartDate",
                table: "hackathons",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AchievementsJson",
                table: "experiences",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmploymentType",
                table: "experiences",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "experiences",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "experiences",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "educations",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "educations",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Grade",
                table: "educations",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "educations",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "cv_profiles",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GithubUrl",
                table: "cv_profiles",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LinkedInUrl",
                table: "cv_profiles",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "cv_profiles",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "OpenToRelocate",
                table: "cv_profiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "cv_profiles",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Website",
                table: "cv_profiles",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CredentialId",
                table: "certifications",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiryDate",
                table: "certifications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "certifications",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Role",
                table: "academic_activities",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "academic_activities",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "social_links");

            migrationBuilder.DropColumn(
                name: "IsCore",
                table: "skills");

            migrationBuilder.DropColumn(
                name: "LastUsedYear",
                table: "skills");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "skills");

            migrationBuilder.DropColumn(
                name: "Subcategory",
                table: "skills");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "TeamSize",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "languages");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "interests");

            migrationBuilder.DropColumn(
                name: "EndDate",
                table: "hackathons");

            migrationBuilder.DropColumn(
                name: "ProjectUrl",
                table: "hackathons");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "hackathons");

            migrationBuilder.DropColumn(
                name: "StartDate",
                table: "hackathons");

            migrationBuilder.DropColumn(
                name: "AchievementsJson",
                table: "experiences");

            migrationBuilder.DropColumn(
                name: "EmploymentType",
                table: "experiences");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "experiences");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "experiences");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "educations");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "educations");

            migrationBuilder.DropColumn(
                name: "Grade",
                table: "educations");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "educations");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "GithubUrl",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "LinkedInUrl",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "OpenToRelocate",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "Website",
                table: "cv_profiles");

            migrationBuilder.DropColumn(
                name: "CredentialId",
                table: "certifications");

            migrationBuilder.DropColumn(
                name: "ExpiryDate",
                table: "certifications");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "certifications");

            migrationBuilder.DropColumn(
                name: "Role",
                table: "academic_activities");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "academic_activities");

            migrationBuilder.AddColumn<Vector>(
                name: "NameEmbedding",
                table: "skills",
                type: "vector(384)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AiSummaryJson",
                table: "projects",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Vector>(
                name: "DescriptionEmbedding",
                table: "projects",
                type: "vector(384)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AiSummaryJson",
                table: "experiences",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Vector>(
                name: "DescriptionEmbedding",
                table: "experiences",
                type: "vector(384)",
                nullable: true);
        }
    }
}
