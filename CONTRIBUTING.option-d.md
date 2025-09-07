<!--
@file CONTRIBUTING.option-d.md
@description Contribution guide Option D (Journey / Step-based)
@path CONTRIBUTING.option-d.md
-->

# Contributing (Option D – Step-by-Step Journey)

A narrative path from idea → merged PR. For specific formatting details see `docs/code-style.md`.

## Step 1: Confirm License Acceptance

By contributing you agree your work is provided under the repository's `LICENSE` and you have rights to submit it.

## Step 2: Pick / Propose Work

* Select an open issue OR open a new one with: problem, proposed change, impact, validation approach.
* Keep scope tight; split large features into incremental PRs.

## Step 3: Environment Setup

```bash
npm install
npm test        # quick lint + unit feedback
npm run test:ci # coverage if needed
```
Node >= 18 required.

## Step 4: Branch & Scaffold

```bash
git pull origin master
git switch -c feat/<topic>   # or fix/<topic>
```
Add any new directory `README.md` early (template below) so reviewers see intent.

## Step 5: Implement with Style

Follow `docs/code-style.md`:

* File header JSDoc block.
* Exported symbol JSDoc (`@export`).
* Small, focused functions; early returns.
* Descriptive names; consistent casing.
* Keep shell patches minimal; heavy logic in JS helpers.

## Step 6: Test & Validate

Add / update:

* Unit tests under `tests/unit/` mirroring paths.
* Integration tests when cross-module behavior or CLI flows are affected.

Run locally until green. Ensure coverage thresholds stay intact.

## Step 7: Update Documentation

Update impacted docs if any of these changed:

* CLI flags / arguments / examples
* Config schema (fields, semantics, validation rules)
* Secrets mode behavior
* Patch scripts or ordering
* Environment variables / container paths
* Generated files / cache locations

Targets: root `README.md`, `docs/`, `examples/`, new or changed directory `README.md`.

### Directory README Template

```markdown
# <Directory>
Purpose: <one line>

Key Modules:
- `fileA.js`: role
- `fileB.js`: role

Environment / Inputs:
- VAR_NAME: meaning

Maintenance:
- ordering, gotchas, regeneration steps
```

## Step 8: Draft PR

Open a **draft** Pull Request early:

* Title: concise (e.g., `helpers: add manifest cache invalidation`).
* Description: what + why + test summary + doc impact.
* Include checklist (below). Iterate with reviewer feedback.

## Step 9: Finalize & Mark Ready

Before marking Ready for Review:

```text
- [ ] File headers & JSDoc complete
- [ ] Tests added/updated; coverage ok
- [ ] Directory README added/updated (where required)
- [ ] Docs/examples updated (if behavior changed)
- [ ] No stray debug logs
- [ ] New dependencies justified (if any)
- [ ] Ran npm test locally
```
Rebase onto `master` if diverged.

## Step 10: Review & Amend

Address feedback with incremental commits (avoid force-push until final if discussion ongoing). Summarize significant changes in comments if not obvious.

## Step 11: Merge Hygiene

Squash & merge or rebase & merge (project preference) preserving clear commit message summarizing scope.

## Step 12: Post-Merge Follow-Up

If feature is user-visible, ensure examples / docs reflect final merged form. Open follow-up issues for deferred improvements rather than inflating the merged PR.

## Commit Format (Recommended)

```text
area: imperative summary

(optional body: rationale, links, perf, security)
```
Areas: `helpers`, `scripts`, `patches`, `config`, `tests`, `docs`, `infra`.

## Dependency Policy

Add only with justification (size, necessity, maintenance). Prefer standard library + small utilities.

## Getting Help

Uncertain? Open a draft PR with an outline or create a minimal issue describing: context, goal, alternatives considered.

## Amendments

Process evolves—propose improvements via PR referencing friction encountered.

Ship confidently. Iterate responsibly. 🚀
