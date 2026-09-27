# Sockless Tower Defense — Game Design & Project Specification

This document is the authoritative product specification. Part 1 is the original brief, kept verbatim. Part 2 records the decisions made when the brief was turned into an implementation plan. Part 3 expands the content catalogue. When the code and this document disagree, fix one of them — never leave them diverged silently.

---

## Part 1 — Original brief (verbatim)

You are a senior game architect, senior ASP.NET Core developer, senior TypeScript game developer, senior UI/UX designer, and senior game systems designer.

Build a complete production-grade tower defense game inspired by Defense Grid.

### Project Vision

Create a premium AAA-quality steampunk tower defense game that runs primarily as a web application and can be installed on Android and iOS as a Progressive Web App (PWA).

The game should be called: Sockless Tower Defense

The game should feel inspired by:

- Defense Grid
- Kingdom Rush
- Bloons TD
- Orcs Must Die
- Factorio aesthetics
- Dishonored-inspired steampunk themes

The game must look visually stunning and modern.

Do NOT use:
- Pixel art
- Retro graphics
- Placeholder assets
- Simplistic geometry

Art direction:

- Victorian steampunk
- Brass machinery
- Copper piping
- Pressure gauges
- Animated gears
- Steam vents
- Tesla electricity
- Industrial architecture
- High quality visual effects
- Dynamic lighting
- Particle systems
- Smoke
- Sparks
- Weather effects
- Volumetric fog

### Technical Requirements

#### Frontend

Use:

- TypeScript
- React
- Vite
- PixiJS 8
- Service Workers
- PWA support
- WebGL/WebGPU rendering

Frontend responsibilities:

- Rendering
- Visual effects
- Animations
- Audio
- User interface
- User input
- Local caching

The frontend must not own progression data.

#### Backend

Use:

- ASP.NET Core 10
- C#
- Vertical Slice Architecture
- Entity Framework Core
- OpenTelemetry
- SignalR where beneficial

Backend must be authoritative and own:

- Player profiles
- Accounts
- Progression
- Unlocks
- Achievements
- Save games
- Research tree
- Difficulty settings
- Campaign progress
- Level definitions
- Wave definitions
- Statistics
- Events and challenges

Never trust client supplied progression values.

### Architecture

Use Vertical Slice Architecture throughout the backend.

Structure:

```
src/

Features/
├── Campaign/
├── Towers/
├── Enemies/
├── Waves/
├── Profiles/
├── Progression/
├── Research/
├── Difficulty/
├── DailyChallenges/
├── Achievements/
├── Leaderboards/
└── SaveGames/
```

Each slice should contain:

- Commands
- Queries
- DTOs
- Validators
- Endpoints
- Entities

Avoid Repository Pattern.

Use EF Core directly.

### Gameplay

Create a path-based tower defense game similar to Defense Grid.

Features:

- Build pads
- Multiple enemy lanes
- Branching paths
- Converging paths
- Dynamic routes
- Unique map mechanics

### Enemy System

Create at least 20 unique enemy archetypes.

Examples:

- Automaton Scout
- Steam Golem
- Tesla Wraith
- Brass Juggernaut
- Smog Phantom
- Clockwork Swarm

Enemies support:

- Armour
- Health
- Speed
- Resistances
- Special abilities
- Status effects
- Flying units
- Cloaked units
- Boss mechanics

### Tower System

Create at least 30 unique towers.

Categories:

- **Ballistic:** Rivet Cannon, Gatling Nest, Railgun Turret, Mortar Tower
- **Electrical:** Tesla Coil, Arc Tower, Storm Generator
- **Flame:** Incinerator, Furnace Tower, Napalm Projector
- **Chemical:** Acid Sprayer, Corrosion Pump, Toxic Diffuser
- **Support:** Amplifier Beacon, Spotter Tower, Steam Pressure Booster
- **Experimental:** Time Distortion Tower, Gravity Manipulator, Singularium Engine

Every tower needs:

- Upgrade trees
- Branch upgrades
- Levels
- Synergies
- Prestige upgrades

### Upgrade Philosophy

Every tower must evolve significantly.

Example — Tesla Coil:

- Tier 1: Basic chain lightning
- Tier 2: Choice A: Longer chains / Choice B: Higher damage
- Tier 3: Choice A: Overload mode / Choice B: EMP bursts
- Ultimate: Thunder God Protocol — map-wide lightning strikes.

Provide similarly deep upgrade trees for all towers.

### Progression

Create deep long-term progression.

- **Campaign:** 100+ levels, increasing complexity, boss battles.
- **Research Tree:** Large interconnected research system. Categories: Steam Power, Engineering, Electricity, Chemistry, Military Science.
- **Commander Progression:** Player level system providing permanent bonuses, unlocks, cosmetics, new gameplay options.

### Difficulty

Presets: Recruit, Engineer, Veteran, Inventor, Master Artificer, Grand Mechanist, Nightmare, Impossible.

Custom modifiers: enemy speed, enemy health, enemy armour, tower costs, tower damage, economy, fog, elite spawns, boss frequency.

Higher difficulty should increase rewards.

### Maps

Create at least 25 map concepts. Examples: Industrial City, Steam Foundry, Airship Dockyard, Underground Tunnels, Flooded Factory, Clockwork Citadel, Arctic Generator Station, Magnetic Research Facility.

Each map must include unique visuals, unique gameplay mechanics, and environmental interactions.

### Game Modes

Campaign, Survival, Challenge Mode, Daily Challenges, Weekly Events, Endless Nightmare Mode.

### Visual Effects

GPU particles, smoke, sparks, steam, heat distortion, lightning, muzzle flashes, dynamic lighting, shockwaves, explosions, damage indicators. Visual quality should feel modern and premium.

### Audio

Architecture for dynamic music, ambience, tower sounds, enemy sounds, boss themes. Style: industrial steampunk, orchestral, mechanical ambience.

### Save System

Backend authoritative. Support guest accounts, registered accounts, cloud saves, cross-device progression. Prevent progression cheating.

### Security

JWT authentication, refresh tokens, validation, rate limiting, anti-cheat protections, audit logging.

---

## Part 2 — Implementation decisions

| Topic | Decision |
|---|---|
| Database | PostgreSQL (Npgsql) in production; SQLite fallback for zero-setup local development. |
| Art | Procedural high-fidelity: layered PixiJS vector graphics, gradients, generated textures and custom shaders/filters. An asset manifest lets painted sprites replace procedural models later. No pixel art, no placeholder boxes. |
| Anti-cheat | The server issues a signed level session (id, RNG seed, HMAC token). The client submits an action log plus a summary. The server validates ownership, single completion, minimum wall-clock duration, pad legality, unlocks, upgrade-tree order, spend vs. maximum possible income, and score ceilings. All rewards are computed server-side. |
| Scope | Built milestone by milestone with all content defined as data; every system wired end to end. |
| Mediator | Hand-rolled handlers per command/query (no MediatR). FluentValidation for validators. |
| API style | Minimal APIs, one endpoint module per slice. |
| Client sim | Deterministic, fixed 30 Hz tick, seeded RNG, pure TypeScript with no rendering dependencies. |
| Pathing | Flow fields per exit on a build-pad grid, so placing towers can reroute enemies (Defense Grid style). Placement that would fully block every route is rejected. |
| Power cores | Defense Grid style: enemies steal cores from the vault and carry them to an exit; killed carriers drop cores that float home unless another enemy picks them up. The level is lost when every core has left the map. |
| Tower ids | Numbered by build order in the simulation so the server can follow upgrades and sales in the action log. |
| Saves | A save is session id + action log + tick; resuming replays the deterministic simulation to that tick. |
| Session anti-cheat | `RunValidator` replays the log's economy exactly (costs, refunds, placement incl. route sealing, upgrade order, rules, interaction cooldowns) and bounds income, kills, bosses, cores and timing. `tests/fixtures/client-run.json` keeps client and server rules in lockstep. |
| Audio | Fully procedural (Web Audio synthesis, generative score, ambience). `AUDIO_MANIFEST` in `src/TD.Client/src/game/audio/engine.ts` swaps any recipe or stem for a recorded asset. |
| Art | Canvas2D-baked procedural textures (terrain, 31 tower models, 23 enemy designs) rendered by PixiJS with a multiplied light map, GPU particles, bloom, weather and fog; quality tiers auto-downgrade on slow devices. |
| Wave intel | Between waves the battlefield marks the entrances the next wave will use (lettered when a level has several) and animates the current route to the vault: chevrons along the flow field for ground units, a straight line for flyers. It updates live as towers reroute the maze. The top HUD strip shows the next wave as enemy chips (count, entrance letter, elite/air/boss marks) beside the call-wave button; tapping them opens a detailed list. All of it is read-only presentation derived from the level data. |
| In-battle HUD | Two docked bands: a top command strip (gold, cores, wave · wave console · speed and pause) and a bottom dock (build bar and map interaction). The camera frames the map between their measured heights, so the HUD never covers the playfield at rest; only contextual panels (tower details, wave details, toasts) float over it. |
| Monetisation | The game is free to play: no ads, no purchases, no premium currency, and nothing gated behind payment. The only support channel is an optional "Buy me a coffee" link (https://buymeacoffee.com/sockless, `SUPPORT_URL` in `src/TD.Client/src/lib/links.ts`) shown in the title-screen footer and in a Support panel on the Settings screen. It opens externally and has no effect on progression. |
| Dev tooling | `/dev/sandbox?map=<id>&tier=<1-4>` (development builds only) renders any map with every tower for visual review; add `&wait` to hold the first wave. |

### Repository layout

```
TD.slnx
src/TD.Application/        ASP.NET Core host, Infrastructure/, Features/<Slice>/, Content/*.json
src/TD.Client/             Vite + React + TypeScript + PixiJS 8 PWA
tests/TD.Application.Tests/ xUnit integration tests
docs/GAME_DESIGN.md        this file
CLAUDE.md                  standing instructions for AI-assisted development
```

### Milestones

0. Persist instructions; restructure repo.
1. Backend foundation: infrastructure, accounts/auth, rate limiting, audit, OpenTelemetry, SignalR, migrations, tests.
2. Content slices, JSON data, seeder, campaign level generator, content endpoints.
3. Client foundation: Vite/React/PWA, API client with token refresh, design system, menus.
4. Simulation engine: pathing, combat, towers/upgrades/synergies, enemies/abilities, map mechanics.
5. Renderer, VFX and procedural art.
6. Audio engine.
7. Progression loop: sessions/anti-cheat, rewards, research, commander, unlocks, achievements, statistics, save games.
8. Modes: survival, challenge, daily, weekly, endless; leaderboards; live SignalR updates.
9. Polish: performance/quality tiers, offline/install, security review, full test pass.

---

## Part 3 — Content catalogue

### Damage types

Ballistic, Electric, Fire, Chemical, Force, Temporal. Every enemy has a resistance value per type (negative = weakness).

### Status effects

Burn (fire DoT), Corrode (armour shred over time), Shock (brief stun chance, chains), Slow, Stun, Stasis (time freeze), Expose (takes extra damage), Reveal (cloak removed).

### Towers (31)

Every tower has: Tier 1 → Tier 2 (branch A / B) → Tier 3 (branch A / B, follows its Tier 2 branch) → Ultimate → Prestige ranks (post-ultimate, stacking), plus synergies with other towers.

| Category | Towers |
|---|---|
| Ballistic | Rivet Cannon, Gatling Nest, Railgun Turret, Mortar Tower, Flak Battery (anti-air), Harpoon Launcher (pull/pin) |
| Electrical | Tesla Coil, Arc Tower, Storm Generator, Galvanic Mine Layer |
| Flame | Incinerator, Furnace Tower, Napalm Projector, Boiler Bomb |
| Chemical | Acid Sprayer, Corrosion Pump, Toxic Diffuser, Alchemical Still |
| Support | Amplifier Beacon, Spotter Tower (reveals cloak), Steam Pressure Booster, Gear Forge (economy), Signal Relay (range network) |
| Mechanical | Clockwork Snare, Steam Hammer, Sawblade Launcher |
| Experimental | Time Distortion Tower, Gravity Manipulator, Singularium Engine, Aether Prism, Phase Lance |

### Enemies (22)

Automaton Scout, Clockwork Swarm, Rivet Rat, Steam Golem, Tesla Wraith, Brass Juggernaut, Smog Phantom (cloaked), Boiler Walker (explodes on death), Gyrocopter (flying), Zeppelin Carrier (flying, spawns units), Magnet Drone (flying, deflects projectiles), Shield Bearer (projects shields), Mender Automaton (heals), Chimney Stalker (smoke blinds towers), Iron Beetle (burrows), Copper Centipede (splits into segments), Aether Leech (drains tower power), Sapper (disables towers), Vapor Djinn (phases through damage periodically). Bosses: Pressure Titan, Ironclad Behemoth, The Grand Orrery.

### Maps (25)

Industrial City, Steam Foundry, Airship Dockyard, Underground Tunnels, Flooded Factory, Clockwork Citadel, Arctic Generator Station, Magnetic Research Facility, Ashvale Coal Mines, Canal Locks, Rail Yard Junction, Sky Bridge, Clocktower Square, Aether Refinery, Volcanic Forge, Sewer Labyrinth, Observatory Summit, Dirigible Graveyard, Tidal Pumping Station, Glassworks, Lightning Farm, Brass Bazaar, Assembly Line, Smog Marshes, Royal Exhibition Hall.

Each map has its own palette and props, one signature mechanic (floodgates, conveyor belts, magnetic pulses, freezing, steam vents, drawbridges, lightning rods, etc.) and an environmental interaction the player can trigger. The 100-level campaign is 25 maps × 4 variants, with a boss level every 10th level.

### Difficulty presets

Recruit, Engineer, Veteran, Inventor, Master Artificer, Grand Mechanist, Nightmare, Impossible — each a set of modifier values. The server computes the reward multiplier from the final modifier set.

### Research

About 75 nodes across Steam Power, Engineering, Electricity, Chemistry and Military Science, with cross-category prerequisites.

### Commander

Levels 1–100 granting permanent bonuses, tower unlocks, cosmetics and gameplay options (e.g. extra speed settings, starting-gold perks, loadout slots).
