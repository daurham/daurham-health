# Health backup and recovery

This is the portable copy of Health-owned data. It is separate from any Neon provider snapshot. A Neon plan's own backups, if the current plan includes them, are an extra layer. They do not replace this file, and no plan upgrade is required.

Create a backup once a month, and again before a schema migration.

Authentication is not in the backup. After a restore, sign in with the existing owner account. Passwords and sessions are not copied.

## Create

```bash
npm run backup:create -- ./backups/health-2026-09-22.health-backup.zip
```

The command reads the configured Health database, writes the archive, and verifies it before it exits.

## Verify

```bash
npm run backup:verify -- ./backups/health-2026-09-22.health-backup.zip
```

Verification only reads the file. It does not connect to a database.

## Restore dry run

```bash
npm run backup:restore -- ./backups/health-2026-09-22.health-backup.zip
```

This prints schema versions, row counts, and conflicts. It does not write.

## Restore to a new database

Point `DATABASE_URL` at an empty Health database that has already had `npm run migrate` applied. The destination must be on the same migration as the backup. User tables must be empty. Migration seed rows for sources, exercises, and templates are replaced so original ids survive.

```bash
HEALTH_BACKUP_RESTORE=yes npm run backup:restore -- ./backups/health-2026-09-22.health-backup.zip --apply
```

If the destination already has nutrition, training, body, activity, or sleep rows, restore stops. It does not merge and it does not overwrite newer rows.

## Verify recovery

```bash
npm run backup:verify -- ./backups/health-2026-09-22.health-backup.zip
```

Then confirm row counts in the destination match the dry-run list. Derived sleep nights and activity days are restored with the raw evidence, not recomputed alone.

## What is not in the file

- Passwords, sessions, API keys, and the Apple Health ingest token
- Photos that exist only on Home-AI disk
- A Settings download may be a portable export when the full archive is large. Portable exports omit raw samples, raw sleep intervals, and capture jobs. Use the CLI archive for disaster recovery.

Settings → Data & Backup downloads a private copy for the signed-in owner. The machine ingest token cannot read it.
