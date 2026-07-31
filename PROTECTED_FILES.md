# Protected Repository Files

The following file must not be replaced by an older ZIP or generated template:

- `src/lib/supabase.ts`

The repository integrity workflow checks every push to `main` and every pull request. It fails when:

- the protected Supabase file changes unexpectedly;
- the environment-variable fallback returns;
- a file recorded in `REPOSITORY_BASELINE.json` disappears;
- the migration history drops below the recorded minimum.

## Build rule

Future patches should contain only changed or newly added files. Before accepting a new full-project ZIP, run:

```bash
node scripts/verify-repository-integrity.mjs
```

When a protected file must be changed intentionally, update its SHA-256 value in `REPOSITORY_BASELINE.json` in the same reviewed commit.

When new permanent files are added, add them to `required_files`. Never remove required files merely to make the integrity check pass without first confirming the deletion is intentional.
