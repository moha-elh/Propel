using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace CV_Generator.Migrations
{
    /// <inheritdoc />
    public partial class MakeEmbeddingDimensionless : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Vector>(
                name: "Embedding",
                table: "AgentDocumentChunks",
                type: "vector",
                nullable: true,
                oldClrType: typeof(Vector),
                oldType: "vector(384)",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Vector>(
                name: "Embedding",
                table: "AgentDocumentChunks",
                type: "vector(384)",
                nullable: true,
                oldClrType: typeof(Vector),
                oldType: "vector",
                oldNullable: true);
        }
    }
}
