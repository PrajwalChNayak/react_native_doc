---
title: EAS Workflows
description: What EAS Workflows is — YAML files in .eas/workflows/ that run build, submit, update and custom jobs on Expo's infrastructure — with the verified triggers, job types, parameters and eas workflow commands, and how it compares to your own CI.
status: current
toolchain: expo
sdk: 57
---

EAS Workflows is Expo's hosted CI/CD. You describe a workflow in a YAML file under `.eas/workflows/`, and
Expo runs its jobs on EAS infrastructure — on a trigger such as a push to a branch, on a schedule, or when
you run it from the command line. Jobs can be **pre-packaged** (build, submit, update, and others) or
**custom** steps you write.

It is a metered part of EAS, and it is an alternative to — not an extension of — GitHub Actions, GitLab CI
or any other CI you already run.

What is on this page was checked against Expo's Workflows documentation (syntax and pre-packaged jobs
pages) and the `eas workflow:*` commands in the **eas-cli 24.5.0** command manifest. **No workflow was
created, validated or run while writing it** — that requires an Expo account and uploads the project.
Treat the YAML below as illustrating documented keys, and run `eas workflow:validate` on your own file.

## Why it exists / when to use it — and when NOT to

Workflows exists to chain EAS operations — build, then submit, or fingerprint then build-or-update —
without you writing the CI glue, maintaining macOS runners, or managing an `EXPO_TOKEN` in a third-party CI.

Consider it when:

- You have no CI yet and already use EAS Build and Update.
- You need macOS for iOS builds and would otherwise pay for Mac CI runners elsewhere.
- You want pre-packaged jobs that understand EAS concepts such as fingerprints and channels.

Do **not** adopt it when:

- **Your CI already works.** Calling `npx eas-cli` from existing CI gets you the same builds and updates.
- **Your pipeline is mostly not mobile.** Backend tests and deployment belong where the rest of your
  pipeline lives.
- **You need to stay off third-party infrastructure.** `eas workflow:run` uploads your project directory to
  EAS servers unless you use `--ref`.
- **Cost matters and your volume is high.** Workflow run time is metered, and build jobs also consume build
  usage. See [Costs and Limits](costs-and-limits.md).

## Basic example

```yaml title=.eas/workflows/build-production.yml
name: Production builds

on:
  push:
    branches: ['main']

jobs:
  build_android:
    type: build
    params:
      platform: android
      profile: production

  build_ios:
    type: build
    params:
      platform: ios
      profile: production
```

Validate and run it from your machine:

```bash
eas workflow:validate .eas/workflows/build-production.yml
eas workflow:run .eas/workflows/build-production.yml --wait
```

`profile` names a build profile in your [eas.json](eas-json.md); the workflow does not replace it.

## How it works

### File location and size

Workflow files are YAML (`.yml` or `.yaml`) in `.eas/workflows/`. Expo's syntax documentation gives a
maximum file size of 16 KiB.

### Top-level keys

| Key | Purpose |
| --- | --- |
| `name` | Name shown on the EAS dashboard |
| `run_name` | Title for an individual run; supports `${{ }}` expressions |
| `on` | The events that trigger the workflow |
| `jobs` | The jobs that make up the workflow |
| `defaults` | Default settings applied to all jobs |
| `concurrency` | Configuration for cancelling in-progress runs |

### Triggers (`on`)

The documented triggers are `push`, `pull_request`, `pull_request_labeled`, `pull_request_comment`,
`ref_delete`, `app_store_connect`, `schedule` (with `cron`) and `workflow_dispatch` (with `inputs`). Each
accepts an optional `if` condition.

Repository triggers need Expo to receive events from your Git host. This page did not verify the setup
steps for that connection; follow Expo's Workflows get-started guide. `eas workflow:run` works without any
trigger configured.

### Job keys

| Key | Purpose |
| --- | --- |
| `type` | A pre-packaged job type. Omit it for a custom job |
| `params` | Parameters for the job type |
| `needs` | Jobs that must **succeed** before this one runs |
| `after` | Jobs that must **complete** (successfully or not) before this one runs |
| `if` | Condition for running the job |
| `environment` | The EAS environment whose variables the job uses |
| `runs_on` | Worker type |
| `image` | VM image |
| `steps` | Commands for a custom job |
| `outputs` | Values exposed to later jobs |
| `env` | Job-level environment variables |
| `hooks` | Steps run before or after applicable job types |

### Pre-packaged job types

Documented types include `build`, `submit`, `update`, `fingerprint`, `get-build`, `testflight`, `maestro`,
`maestro-cloud`, `update-rollout`, `branch-delete`, `repack`, `deploy` (EAS Hosting), `slack`,
`github-comment`, `require-approval`, `apple-device-registration-request` and `doc`.

Parameters for the common ones, as listed in Expo's pre-packaged jobs documentation:

| Type | Required | Optional |
| --- | --- | --- |
| `build` | `platform` | `profile`, `message`, `refresh_ad_hoc_provisioning_profile` |
| `submit` | `build_id` | `profile`, `groups` |
| `update` | — | `branch`, `channel`, `platform`, `message`, `rollout_percentage`, `private_key_path`, `upload_sentry_sourcemaps` |
| `fingerprint` | — | `unstable_skip_cng_check` |
| `get-build` | — | `platform`, `profile`, `distribution`, `channel`, `runtime_version`, `fingerprint_hash`, `app_version`, `app_build_version`, `git_commit_hash`, `sdk_version`, `simulator`, `app_identifier`, `wait_for_in_progress` |
| `testflight` | `build_id` or `asc_build_id` | `profile`, `internal_groups`, `external_groups`, `changelog`, `submit_beta_review`, `wait_processing_timeout_seconds` |

Parameter names use underscores (`rollout_percentage`), unlike the hyphenated `eas` command-line flags
(`--rollout-percentage`). Copying a flag name into `params` is a common mistake.

A `build` job runs an EAS Build, so it consumes build usage as well as workflow time.

### Custom jobs and sequencing

A job without `type` runs `steps`. `needs` orders jobs and lets a later job read an earlier job's
`outputs` through `${{ needs.<job>.outputs.<name> }}`:

```yaml title=.eas/workflows/test-then-update.yml
name: Test, then publish update

on:
  push:
    branches: ['main']

jobs:
  test:
    steps:
      - uses: eas/checkout
      - run: npm ci
      - run: npm test

  publish_update:
    needs: [test]
    type: update
    params:
      branch: production
      message: 'Update from main'
      # Start as a rollout; raise it deliberately. See Rollouts and Rollbacks.
      rollout_percentage: 10
```

### The commands

From the eas-cli 24.5.0 manifest:

| Command | What it does |
| --- | --- |
| `eas workflow:create [name]` | Create a workflow file; `--template` is `build`, `update`, `deploy` or `custom` |
| `eas workflow:validate <path>` | Validate a workflow YAML file |
| `eas workflow:run <file>` | Run a workflow |
| `eas workflow:list` | List workflows for the project |
| `eas workflow:runs` | List recent runs, filterable by `--workflow` and `--status` |
| `eas workflow:view` | Show a run and its jobs |
| `eas workflow:status` | Show a run's status; `--wait` blocks until it finishes |
| `eas workflow:logs` | Show logs for a run or job |
| `eas workflow:cancel` | Cancel one or more runs |
| `eas workflow:ssh` | Marked **experimental**: open an SSH session on a job's worker |
| `eas workflow:insights` | Run counts, success rate and trends |

`eas workflow:run` flags worth knowing:

| Flag | Meaning |
| --- | --- |
| `--wait` | Wait for the run; exit codes are 0 success, 11 failure, 12 cancelled, 13 wait aborted |
| `-F, --input key=value` | Pass an input; repeat for several |
| `--ref <git ref>` | Run from that commit in your repository instead of uploading the local directory |
| `--ssh` | Open an SSH session on each VM job for debugging (`--ssh-idle-timeout` in seconds, 0–3600) |
| `--non-interactive`, `--json` | Script-friendly behaviour |

> [!WARNING] `eas workflow:run` uploads your working directory
> Without `--ref`, the entire local project directory is packaged and uploaded for the run, including
> uncommitted changes. Use `--ref` when the run should reflect exactly what is committed.

## Platform differences

:::tabs
@tab Android
Android jobs can run on Linux workers. If your only EAS use is Android, an existing Linux CI running
`npx expo run:android` or Gradle directly is usually the cheaper path.
@tab iOS
iOS build jobs need macOS, which is where hosted workflows save the most effort compared with maintaining
Mac CI runners yourself.
:::

## Common patterns

### Start with `workflow:run`, add triggers later

Run a workflow by hand until its jobs behave, then add `on`. A trigger on a broken workflow spends
metered minutes on every push.

### Use `--wait` in scripts

```bash
eas workflow:run .eas/workflows/build-production.yml --wait --non-interactive
```

Branch on the documented exit codes rather than parsing output.

### Keep the same steps runnable outside EAS

Put build and test logic in `package.json` scripts and call them from custom steps. The same scripts then
run locally and in any other CI, so moving off Workflows later is a configuration change, not a rewrite.

## Security considerations

**Threat.** A workflow runs code from your repository with access to the EAS environment variables you
assign, and can publish updates and submit builds.

**Exploit.** A pull request edits `.eas/workflows/*.yml` to print secret environment variables in a custom
step, or adds a `submit` job, and a trigger runs it.

**Fix.** Review changes to `.eas/workflows/` as carefully as release scripts. Scope `environment` per job so
only jobs that need production variables get them, and protect production update channels with
`eas channel:protect`.

**Verification.** Open a test pull request that changes a workflow file and confirm your review process —
code owners, required approvals — catches it before any trigger runs it.

## Common mistakes

- **Assuming Workflows is required for EAS Build or Update.** Both work from any CI through `eas-cli`.
- **Hyphenated parameter names.** `rollout-percentage` is a CLI flag; the `update` job parameter is
  `rollout_percentage`.
- **Running without `--ref` and expecting committed code.** The local directory, uncommitted changes
  included, is uploaded.
- **Forgetting build jobs cost build usage.** A workflow that builds on every push spends both workflow
  minutes and builds.
- **Using `needs` where `after` is meant.** `needs` skips the job if a dependency fails; `after` runs it
  once dependencies complete either way — the right choice for a notification job.
- **Not validating before pushing.** `eas workflow:validate` catches schema errors before a trigger does.
- **Letting unreviewed workflow changes run with production environment variables.**

## Related topics

- [EAS Overview](overview.md) — where Workflows fits among the EAS products.
- [Costs and Limits](costs-and-limits.md) — what workflow minutes and build jobs consume.
- [Building on EAS](building.md) — what a `build` job runs.
- [EAS Update](update.md) — what an `update` job publishes.
- [Rollouts and Rollbacks](rollouts-and-rollbacks.md) — using `rollout_percentage` safely.
- [Runtime Versions, Channels and Branches](runtime-versions.md) — fingerprints and channels in jobs.
- [EAS Secrets and Build-Time Variables](../expo-security/eas-secrets.md) — environments and secrets.
