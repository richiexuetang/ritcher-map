using Microsoft.EntityFrameworkCore.Migrations;

namespace AuthService.Migrations;

public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Users",
            columns: table => new
            {
                Id = table.Column<Guid>(nullable: false),
                Email = table.Column<string>(maxLength: 256, nullable: false),
                Username = table.Column<string>(maxLength: 50, nullable: false),
                PasswordHash = table.Column<string>(nullable: false),
                FirstName = table.Column<string>(maxLength: 100, nullable: true),
                LastName = table.Column<string>(maxLength: 100, nullable: true),
                AvatarUrl = table.Column<string>(nullable: true),
                IsEmailVerified = table.Column<bool>(nullable: false),
                EmailVerificationToken = table.Column<string>(nullable: true),
                EmailVerificationTokenExpiry = table.Column<DateTime>(nullable: true),
                PasswordResetToken = table.Column<string>(nullable: true),
                PasswordResetTokenExpiry = table.Column<DateTime>(nullable: true),
                Role = table.Column<string>(maxLength: 50, nullable: false, defaultValue: "User"),
                IsActive = table.Column<bool>(nullable: false, defaultValue: true),
                CreatedAt = table.Column<DateTime>(nullable: false),
                UpdatedAt = table.Column<DateTime>(nullable: false),
                LastLoginAt = table.Column<DateTime>(nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Users", x => x.Id);
            });
        
        migrationBuilder.CreateTable(
            name: "RefreshTokens",
            columns: table => new
            {
                Id = table.Column<Guid>(nullable: false),
                Token = table.Column<string>(nullable: false),
                ExpiresAt = table.Column<DateTime>(nullable: false),
                IsRevoked = table.Column<bool>(nullable: false),
                CreatedAt = table.Column<DateTime>(nullable: false),
                CreatedByIp = table.Column<string>(nullable: true),
                RevokedAt = table.Column<DateTime>(nullable: true),
                RevokedByIp = table.Column<string>(nullable: true),
                UserId = table.Column<Guid>(nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                table.ForeignKey(
                    name: "FK_RefreshTokens_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });
        
        migrationBuilder.CreateIndex(
            name: "IX_Users_Email",
            table: "Users",
            column: "Email",
            unique: true);
        
        migrationBuilder.CreateIndex(
            name: "IX_Users_Username",
            table: "Users",
            column: "Username",
            unique: true);
        
        migrationBuilder.CreateIndex(
            name: "IX_RefreshTokens_Token",
            table: "RefreshTokens",
            column: "Token",
            unique: true);
        
        migrationBuilder.CreateIndex(
            name: "IX_RefreshTokens_UserId",
            table: "RefreshTokens",
            column: "UserId");
    }
    
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "RefreshTokens");
        migrationBuilder.DropTable(name: "Users");
    }
}