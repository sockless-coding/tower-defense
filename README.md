# Sockless Tower Defense

A Victorian-steampunk tower defense game in the spirit of Defense Grid. It runs in the browser and installs on Android and iOS as a Progressive Web App. The client renders and simulates the battle. An authoritative ASP.NET Core server owns every account, all progression and all content, and it verifies each battle before it pays out any reward.

- **31 towers** in 7 categories. Each has tiered branch upgrades (II A/B → III A/B → Ultimate), synergies and five prestige ranks.
- **22 enemy archetypes**: flyers, cloaked units, burrowers, shield-bearers, healers, saboteurs, splitters and three multi-phase bosses.
- **25 maps**, each with its own mechanic (trains, floodgates, rotating walls, tides, lightning rods, conveyors…) and a player-triggered interaction.
- **100-level campaign** with a boss every tenth level, plus Survival, Challenge, Daily Challenge, Weekly Event and Endless Nightmare modes.
- **Progression**: a 75-node research tree, 100 commander levels with perks, features and cosmetics, 53 achievements, leaderboards and cloud saves.
- **8 difficulty presets and 9 custom modifiers.** The server computes the reward multiplier from the final modifier set.
- **Procedural art and audio**: every texture, tower, enemy, sound effect and piece of music is generated at runtime, with no placeholder assets. You can drop in recorded audio through a manifest.

The full specification is in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## Architecture

```
src/TD.Application   ASP.NET Core 10 · EF Core · SignalR · OpenTelemetry   (vertical slices under Features/)
src/TD.Client        React 19 · Vite · PixiJS 8 · Web Audio · vite-plugin-pwa
tests/               xUnit integration tests + a client/server contract fixture
```

**Server-authoritative play.** When you press *Deploy*, the server issues a session. The session freezes the level (elite groups and boss escorts are resolved from a server seed), the difficulty modifiers, the research and commander bonuses, the prestige ranks and the unlocked towers. It is signed with an HMAC token. The client runs a deterministic, fixed-tick simulation (a Mulberry32 random generator, bit-identical in C# and TypeScript) and records every player action. On completion the server's `RunValidator` does the following:

- Replays the economy and structure of the action log exactly: costs, refunds, tile legality, route-sealing checks, upgrade order and challenge rules.
- Bounds everything it cannot replay: total income, kills per enemy type, bosses, cores and wall-clock time against the maximum game speed.

Rewards (stars, XP, gears, research points, achievements and leaderboard scores) are computed only on the server. A rejected run is written to the audit log, and the client is never told which check it failed.

A save is just the session plus the action log up to a tick. Because the simulation is deterministic, you can resume on any device by replaying the log.

## Getting started

Requirements: .NET SDK 10, Node 22.

```bash
# API + game server (SQLite, no setup; applies migrations and seeds content on start)
dotnet run --project src/TD.Application          # http://localhost:5210

# Client with hot reload (proxies /api and /hubs to the server)
cd src/TD.Client && npm install && npm run dev   # http://localhost:5173
```

To serve the production client from the server, run `npm run build` in `src/TD.Client`. It writes the build to `src/TD.Application/wwwroot`.

A development-only visual test bench runs any map with every tower pre-built. It does not exist in production builds: `http://localhost:5173/dev/sandbox?map=volcanic-forge&tier=4`.

## Tests

```bash
dotnet test TD.slnx                     # accounts, content, sessions/anti-cheat, saves, contract
cd src/TD.Client && npm run test        # simulation: determinism, routing, combat, every tower path, every map
npm run typecheck && npm run lint
```

The client suite writes `tests/fixtures/client-run.json`, a real simulated run, and the server suite must accept it unchanged. If client and server ever disagree about costs, refunds, placement or rules, the build fails.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `Database:Provider` | `Sqlite` | `Postgres` for production |
| `Database:ConnectionString` | `Data Source=sockless-td.db` | |
| `Jwt:SigningKey` | *(required, 32+ bytes)* | Development key in `appsettings.Development.json` |
| `Sessions:SigningKey` | *(required, 32+ bytes)* | HMAC key for session tokens |
| `Cors:AllowedOrigins` | `[]` | Only needed when the client is hosted on another origin |
| `RateLimits:*` | see `RateLimitOptions` | Per-account/IP limits for auth, sessions and mutations |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(unset)* | Enables OTLP export of traces, metrics and logs |
| `Telemetry:ConsoleExporter` | `false` | Prints traces and metrics to the console |

## Deployment

`Dockerfile` builds the client into the server image. `docker-compose.yml` runs it against PostgreSQL. You must set `POSTGRES_PASSWORD`, `JWT_SIGNING_KEY` and `SESSION_SIGNING_KEY`. Put a TLS-terminating reverse proxy in front of it and configure forwarded-header trust for that proxy, because rate limiting uses the client IP.

The container files have not yet been exercised end to end: Docker was unavailable when they were written. Treat the first deployment as a verification step.

## Security

- Short-lived JWT access tokens.
- Rotating refresh tokens stored hashed, with family revocation when a used token is replayed.
- Login lockout.
- FluentValidation on every request.
- Per-account and per-IP rate limiting.
- A 2 MB request body cap.
- A strict Content-Security-Policy with no `eval`; Pixi's CSP-safe path is used.
- HSTS and HTTPS redirection outside development.
- Audit logging of authentication, progression and anti-cheat events.
