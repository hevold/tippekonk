@AGENTS.md

# Desken — project instructions

Read `docs/SPEC.md` before writing code. It is the contract: stack, file
ownership, data model, conventions, and definition of done. `src/db/schema.ts`
is the database contract — extend it only by adding a new migration with
`pnpm db:generate` and never by editing existing migration files.

Quick commands (run from `cms/`): `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm build`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`.
