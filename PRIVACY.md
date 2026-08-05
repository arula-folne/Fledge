# Privacy

Fledge does **not** include advertising, usage analytics, telemetry, or crash reporting SDKs.

## What leaves your machine

| Destination | When | Purpose |
|-------------|------|---------|
| Microsoft / Xbox / Minecraft services | Sign-in | Official authentication |
| Mojang CDN / launcher meta | Install & launch | Game files |
| Fabric / Forge / NeoForge / Adoptium | Loader or Java install | Official downloads |
| Modrinth / CurseForge APIs | When you search or install content | Content metadata & files |
| [mc-heads.net](https://mc-heads.net) | Avatar display fallback | Skin face preview (UUID may be sent) |
| Local Discord client (IPC) | Only if Rich Presence is enabled | Optional status display |

There is **no** Fledge-operated analytics backend.

## Local data

Accounts, tokens (Electron `safeStorage`), settings, instances, and caches stay under the app’s `Data/` / `Instances/` directories on your machine.

## Secrets

CurseForge API keys belong in `.env` (`FLEDGE_CURSEFORGE_API_KEY`) or local settings—never in git. See `.env.example`.

## Contact

Questions about this policy: open an issue on [arula-folne/Fledge](https://github.com/arula-folne/Fledge).
