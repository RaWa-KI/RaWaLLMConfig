# Push-Checkliste (RaWaLLMConfig)

Jeder Push auf das oeffentliche Remote muss diese Checkliste erfuellen. Der
`pre-push`-Hook (`scripts/git-hooks/pre-push`, Installation: `pnpm hooks:install`)
prueft Punkte 1–6 **mechanisch** und blockiert bei einem ❌. Die manuellen
Punkte 7–9 liegen in der Verantwortung der pushenden Person/Session.

## Mechanisch erzwungen (Hook)

| # | Pruefung | Was blockiert wird |
|---|---|---|
| 1 | Verbotene Pfade in ungepushten Historie | Interne Doku, Provider-Loader, Steuerdokumente, Session-/Toolchain-Arbeitsstaende in irgendeinem Commit des Push-Deltas |
| 2 | Verbotene Pfade im Tree | Dieselben Pfade im Stand des gepushten Refs (auch bei `git add -f`) |
| 3 | Verbotene Inhalts-Muster im Delta | Secrets (Private Keys, Token-Muster) und persoenliche Muster in added lines + Commit-Messages. Persoenliche Muster: lokal in `scripts/git-hooks/public-push-policy.local.txt` (gitignored) |
| 4 | `pnpm typecheck` gruen | Pushes mit rotem Typecheck |
| 5 | Herkunft: Ref basiert auf `origin/main` | Pushes von Branches, die nicht auf dem oeffentlichen main aufsetzen |
| 6 | Fast-forward auf `main` + Tags | Force-Push auf `main`, Ueberschreiben/Loesch-Veraenderung bestehender Tags |

Policy-Datei (Pfade + generische Muster): `scripts/git-hooks/public-push-policy.txt`.
Aenderungen an den verbotenen Pfaden/Mustern immer dort UND hier pflegen.

## Manuell (vor jedem Push)

| # | Pruefung |
|---|---|
| 7 | Delta selbst gelesen: `git log origin/main..HEAD -p` — gehoert jede Zeile in ein oeffentliches Repo? |
| 8 | Keine Binaries/Archive/Logs/Screenshots/Dumps im Delta, die nicht zum App-Release gehoeren |
| 9 | Neue Dateien: Absicht und Publikum geprueft (oeffentlich heisst: fuer immer, fuer alle) |

## Bypass

`git push --no-verify` ueberspringt den Hook — **nur mit ausdruecklichem Owner-Go**
und dokumentiertem Grund. Der manuelle Teil der Checkliste bleibt auch dann Pflicht.

## Selbsttest

`git push --dry-run origin <ref>` — der Hook laeuft auch im Dry-Run und zeigt die
Checkliste mit ✅/❌, ohne dass etwas gepusht wird.
