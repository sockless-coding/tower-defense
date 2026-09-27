using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TD.Application.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class Progression : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AchievementUnlocks",
                columns: table => new
                {
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AchievementId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    UnlockedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AchievementUnlocks", x => new { x.AccountId, x.AchievementId });
                });

            migrationBuilder.CreateTable(
                name: "CosmeticUnlocks",
                columns: table => new
                {
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CosmeticId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    UnlockedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CosmeticUnlocks", x => new { x.AccountId, x.CosmeticId });
                });

            migrationBuilder.CreateTable(
                name: "GameSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Mode = table.Column<int>(type: "INTEGER", nullable: false),
                    LevelId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    EventKey = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    PresetId = table.Column<string>(type: "TEXT", maxLength: 32, nullable: true),
                    Seed = table.Column<uint>(type: "INTEGER", nullable: false),
                    RewardMultiplier = table.Column<double>(type: "REAL", nullable: false),
                    ConfigJson = table.Column<string>(type: "TEXT", nullable: false),
                    ContentVersion = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Outcome = table.Column<string>(type: "TEXT", maxLength: 16, nullable: true),
                    Score = table.Column<long>(type: "INTEGER", nullable: false),
                    Stars = table.Column<int>(type: "INTEGER", nullable: false),
                    RejectionReason = table.Column<string>(type: "TEXT", maxLength: 256, nullable: true),
                    ResultJson = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LeaderboardEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BoardKey = table.Column<string>(type: "TEXT", maxLength: 96, nullable: false),
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Score = table.Column<long>(type: "INTEGER", nullable: false),
                    Waves = table.Column<int>(type: "INTEGER", nullable: false),
                    Stars = table.Column<int>(type: "INTEGER", nullable: false),
                    SessionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AchievedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LeaderboardEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LevelProgress",
                columns: table => new
                {
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LevelId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    BestStars = table.Column<int>(type: "INTEGER", nullable: false),
                    BestScore = table.Column<long>(type: "INTEGER", nullable: false),
                    Completions = table.Column<int>(type: "INTEGER", nullable: false),
                    PerfectCompletions = table.Column<int>(type: "INTEGER", nullable: false),
                    FirstCompletedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastCompletedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LevelProgress", x => new { x.AccountId, x.LevelId });
                });

            migrationBuilder.CreateTable(
                name: "ResearchUnlocks",
                columns: table => new
                {
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    NodeId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Cost = table.Column<int>(type: "INTEGER", nullable: false),
                    PurchasedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResearchUnlocks", x => new { x.AccountId, x.NodeId });
                });

            migrationBuilder.CreateTable(
                name: "SaveGames",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Slot = table.Column<int>(type: "INTEGER", nullable: false),
                    SessionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Tick = table.Column<int>(type: "INTEGER", nullable: false),
                    ActionsJson = table.Column<string>(type: "TEXT", nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SaveGames", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Statistics",
                columns: table => new
                {
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Key = table.Column<string>(type: "TEXT", maxLength: 96, nullable: false),
                    Value = table.Column<long>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Statistics", x => new { x.AccountId, x.Key });
                });

            migrationBuilder.CreateTable(
                name: "TowerPrestige",
                columns: table => new
                {
                    AccountId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TowerId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Rank = table.Column<int>(type: "INTEGER", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TowerPrestige", x => new { x.AccountId, x.TowerId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_AccountId_StartedAt",
                table: "GameSessions",
                columns: new[] { "AccountId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_AccountId_Status",
                table: "GameSessions",
                columns: new[] { "AccountId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_LeaderboardEntries_BoardKey_AccountId",
                table: "LeaderboardEntries",
                columns: new[] { "BoardKey", "AccountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LeaderboardEntries_BoardKey_Score",
                table: "LeaderboardEntries",
                columns: new[] { "BoardKey", "Score" });

            migrationBuilder.CreateIndex(
                name: "IX_SaveGames_AccountId_Slot",
                table: "SaveGames",
                columns: new[] { "AccountId", "Slot" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AchievementUnlocks");

            migrationBuilder.DropTable(
                name: "CosmeticUnlocks");

            migrationBuilder.DropTable(
                name: "GameSessions");

            migrationBuilder.DropTable(
                name: "LeaderboardEntries");

            migrationBuilder.DropTable(
                name: "LevelProgress");

            migrationBuilder.DropTable(
                name: "ResearchUnlocks");

            migrationBuilder.DropTable(
                name: "SaveGames");

            migrationBuilder.DropTable(
                name: "Statistics");

            migrationBuilder.DropTable(
                name: "TowerPrestige");
        }
    }
}
