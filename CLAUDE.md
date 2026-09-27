# Sockless Tower Defense

Premium Victorian-steampunk tower defense (Defense Grid–style) web game, installable as a PWA. The full specification lives in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — read it before starting any feature work, and keep it in sync when design decisions change.

## Standing rules

- **Backend is authoritative.** Accounts, profiles, progression, unlocks, research, achievements, save games, difficulty, campaign progress, level/wave definitions, statistics, events and challenges are owned by the server. Never trust client-supplied progression values; rewards are always computed server-side.
- **Client never owns progression.** The client does rendering, VFX, animation, audio, UI, input and local caching only. It runs the game simulation and submits an action log to the server for validation.
- **Vertical Slice Architecture** in the backend. Each feature lives in `src/TD.Application/Features/<Slice>/` with `Commands/`, `Queries/`, `Dtos/`, `Validators/`, `Endpoints/`, `Entities/`. No repository pattern — handlers use `AppDbContext` (EF Core) directly. Hand-rolled handlers, no MediatR; FluentValidation for validation; Minimal API endpoint modules.
- **Visual bar:** premium, modern, procedural high-fidelity art (brass, copper, gears, steam, Tesla electricity, dynamic lighting, particles, fog, weather). Never pixel art, retro graphics, placeholder assets or simplistic geometry.
- **Security:** JWT access tokens + rotating refresh tokens, validation on every input, rate limiting, anti-cheat plausibility checks on session completion, audit logging of auth, progression and suspicious activity.
- **Content is data.** Towers, enemies, maps, difficulty presets, research, achievements and commander rewards are JSON under `src/TD.Application/Content/`, seeded into the `ContentDocuments` table at startup and served via `GET /api/content`. Campaign (100) and challenge levels are generated deterministically by `CampaignGenerator`/`WaveGenerator` (Mulberry32 `SeededRandom`, never `System.Random`). `ContentValidator` runs at startup and in tests; startup fails on invalid content.
- **Slice conventions:** one namespace per slice (`TD.Application.Features.<Slice>`) regardless of subfolder; handlers implement `IHandler` and return `Result<T>`; endpoint modules implement `IEndpointModule`; both are auto-registered. Add entities as `DbSet`s on `AppDbContext` and run `scripts/add-migration.sh <Name>` to create migrations for both providers.

## Stack

- Backend: ASP.NET Core 10, C#, EF Core (PostgreSQL in production, SQLite for local dev), OpenTelemetry, SignalR.
- Frontend: TypeScript, React, Vite, PixiJS 8 (WebGPU preferred, WebGL fallback), service worker via vite-plugin-pwa.

## Layout

```
TD.slnx
src/TD.Application/          ASP.NET Core host
src/TD.Client/               Vite + React + PixiJS client
tests/TD.Application.Tests/  xUnit integration tests
docs/GAME_DESIGN.md          specification
```

## Client/server contract

- The simulation (`src/TD.Client/src/game/sim`) and the server validator (`Features/Sessions`) must agree on economy and rules. Cost formulas live in `sim/stats.ts` and `Sessions/Commands/RunEconomy.cs` (JS `Math.round` semantics). Changing either requires regenerating `tests/fixtures/client-run.json` (`npm run test` in the client) and passing `dotnet test`.
- The simulation must stay deterministic: no `Math.random`, no wall-clock time, iteration in insertion order. Rendering/audio may use `Math.random` freely.
- Visual review: `npm run dev` then `/dev/sandbox?map=<mapId>&tier=<1-4>` (add `&wait` to hold the first wave).

## Commands

- Backend build/test: `dotnet build TD.slnx`, `dotnet test TD.slnx`
- Backend run (SQLite): `dotnet run --project src/TD.Application`
- Client (in `src/TD.Client`): `npm install`, `npm run dev`, `npm run typecheck`, `npm run test`, `npm run build`
