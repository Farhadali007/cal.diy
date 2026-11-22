# Upstream-sync policy — VOICERO fork of Cal.diy

Task 1.10. This policy governs how (and whether) changes from upstream
[calcom/cal.diy](https://github.com/calcom/cal.diy) enter this fork.

## Pinned baseline

- Baseline: upstream commit `ae027bb70e694e2d2c44569f398d6cbcee0389b1`
  (2026-11-13, `@calcom/web` 6.2.0), MIT-licensed.
- The baseline is **pinned**. The fork does not track upstream `main`.
- Upstream Cal.diy is in maintenance mode (Cal.com's development focus is
  the commercial platform), so VOICERO owns this codebase's future. A
  blanket merge or rebase would risk pulling commercial/EE drift, licence
  changes, or breaking changes into the VOICERO multi-tenancy layer.

## What gets synced: security fixes only

- Security fixes from upstream are **cherry-picked individually**, never
  merged wholesale.
- Priority: CVSS >= 7.0 — pick up within one week of disclosure; lower
  severity — batched in the monthly check (see below).
- A candidate is skipped only with a recorded verdict + evidence, e.g.
  the affected code is dead EE debris (task 1.11) or an app VOICERO does
  not ship. "Not applicable" is a decision, not an omission.

## What never gets synced

- Feature merges, bulk upstream rebases, commercial/EE code.
- Anything that changes the `LICENSE` — re-verify the licence file on
  every sync; a licence change upstream is a founder decision, not a
  routine cherry-pick.
- Anything touching the VOICERO multi-tenancy layer without a dedicated
  task in the VOICERO Calendar task queue.

## Process

1. **Monthly check** (first week of the month): compare upstream `main`
   HEAD against the pinned baseline; review upstream security advisories
   and the CVE feeds for Cal.diy/Cal.com.
2. List candidate security commits; record the list (with verdicts) in
   the VOICERO Calendar WORKLOG.
3. Cherry-pick each accepted commit onto a branch; resolve conflicts
   minimally; run the affected test suites + typecheck.
4. Commit as `chore(upstream): cherry-pick <upstream-sha> (<advisory>)`
   keeping the original commit message in the body.
5. Record the sync in the WORKLOG (upstream SHA, advisory, tests run).
6. Never force-push. Never merge upstream `main` into this fork.

## Re-baselining

Moving the pinned baseline to a newer upstream commit is a **founder
decision** and a dedicated task: it requires a full regression run, a
licence re-verification, and a TASK-QUEUE entry. It is not part of the
monthly security sync.

## Sync log

| Date | Upstream SHA | Advisory / subject | Fork commit |
|---|---|---|---|
| — | — | No upstream syncs yet. | — |

VOICERO-authored security fixes (not cherry-picks — upstream had no fix):

| Date | Advisory | Fork commit |
|---|---|---|
| 2026-11-22 | CVE-2026-57858 (stored XSS in analytics tag templates) | `7a702f3` |
| 2026-11-22 | CVE-2026-112043 (team webhook auth bypass) | `323571f` |
