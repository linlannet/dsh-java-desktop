# AGENTS.md — dsh-java-desktop

## Project
Tauri 2 + React 19 desktop client for DSH Java; bundles the agent runtime (JAR + JRE). Version 0.2.2.

## Layout
- `src/` React app (`App.tsx`, `components/`, `lib/`, `platform/`)
- `src-tauri/` Rust shell (`tauri.conf.json`, `capabilities/`, `src/`)
- `resources/agent/` bundled `dsh-java-app.jar` + runtime
- `tests/unit/` vitest suites
- `scripts/` h5 smoke and boundary checks
- `docs/specs/` design specs

## Build & Test
- Install: `npm install`
- Build: `npm run build` (tsc + vite)
- Test: `npm test`
- Boundary: `npm run check:boundary`
- Dev app: `npm run tauri:dev`
- Agent JAR: `npm run agent:copy`

## Conventions
- Business layers (`App.tsx`, `components/`, `lib/`) must not import `@tauri-apps/*`
  directly — go through `src/platform/*`
- No direct `fetch`, `localStorage`, or `platform ===` branches in business layers
- Capability contracts live in `src/platform/contract.ts`
- Keep H5 artifact relative-path safe (`base: "./"`)

## Do Not
- Do not edit `node_modules/` or `dist/`
- Do not fork UI into another React entry
- Do not commit credentials or tokens

## Key Docs
- `README.md`, `README.en.md`
- `docs/specs/mobile_app_evolution/`
- `llms.txt`