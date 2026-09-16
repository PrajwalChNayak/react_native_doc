---
title: Rollouts and Rollbacks
description: Sending an EAS update to a percentage of users, growing or reverting that rollout, rolling out a whole branch on a channel, and rolling back to a previous update or the embedded bundle.
status: current
toolchain: expo
sdk: 57
---

A rollout limits how many users receive an update until you have seen it behave in production. A
rollback replaces a bad update with a known-good one. EAS Update has two rollout mechanisms and three
rollback commands, and choosing the right one during an incident is much easier if you have read this
page before the incident.

Every command and flag here was read from the **eas-cli 24.5.0** command manifest. The behaviour and
limitations come from Expo's rollouts documentation. None of these commands were run against a real
project while writing this page, because they publish to live channels.

> [!NOTE] Expo Go vs development build
> Rollouts target builds that have a channel. Expo Go and development builds are not set to a specific
> channel — the installed `expo-updates` types say `Updates.channel` is always `null` there — so test
> rollout behaviour on a `preview` or `production` build.

## Why it exists / when to use it — and when NOT to

An update reaches every matching user as they relaunch the app, with no store review in between. That
is the point of updates and also their risk: a bad update is a bad release for everyone on that runtime
version. A rollout turns "everyone" into "10% first".

Use a rollout for any update to a production channel that changes behaviour, not only for risky ones —
the risky ones are the ones you did not recognise as risky.

A rollout does **not** help with:

- **Native changes.** Those need a binary; see [What OTA Updates May Not Change](ota-limits-and-policy.md).
- **Users who have not relaunched.** Exposure grows as users open the app, not as you raise the
  percentage.

## Basic example

Publish an update to 10% of users on the branch:

```bash
eas update --branch production --message "new retry logic" --rollout-percentage 10
```

Watch your crash and error reporting. Then raise it:

```bash
eas update:edit --rollout-percentage 50
eas update:edit --rollout-percentage 100
```

Or, if it misbehaves, revert it:

```bash
eas update:revert-update-rollout --branch production --message "revert retry logic"
```

`--rollout-percentage` must be an integer between 1 and 100. `eas update:edit` takes an update group
ID as an argument, or prompts you to choose one on the branch you pass with `--branch`.

## How it works

### Two rollout mechanisms

| | Per-update rollout | Branch rollout on a channel |
| --- | --- | --- |
| What rolls out | One update group on a branch | Every update on a new branch |
| Start | `eas update --rollout-percentage <n>` | `eas channel:rollout <channel> --action create --branch <b> --percent <n> --runtime-version <rv>` |
| Change percentage | `eas update:edit --rollout-percentage <n>` | `eas channel:rollout <channel> --action edit --percent <n>` |
| Finish | Raise to 100 | `--action end --outcome republish-and-revert` |
| Abandon | `eas update:revert-update-rollout` | `--action end --outcome revert` |
| Inspect | `eas update:list`, `eas update:view` | `eas channel:rollout <channel> --action view`, `eas channel:view` |

### Per-update rollouts

The update is served to the chosen percentage; everyone else keeps receiving the previous latest update
on the branch.

Limitations stated in Expo's documentation:

- **Only one update can be rolled out on a branch at a time.**
- **While it is in progress you cannot publish another update with the same runtime version** to that
  branch. Finish or revert the rollout first.

That second limitation is the reason to keep rollouts short. A rollout left at 10% for a week blocks
every hotfix for that runtime version.

### Branch rollouts on a channel

A channel normally points at one branch. A branch rollout points a percentage of the channel's users at
a second branch while the rest stay on the current one. It suits a *set* of updates — a feature branch
you publish to several times during the rollout.

```bash
# Send 10% of the production channel's users to the release-2 branch
eas channel:rollout production --action create --branch release-2 --percent 10 --runtime-version 1.4.0

# Grow it
eas channel:rollout production --action edit --percent 50

# Finish: republish release-2's latest update onto the original branch, then end the rollout
eas channel:rollout production --action end --outcome republish-and-revert

# Or abandon: everyone goes back to the original branch
eas channel:rollout production --action end --outcome revert
```

The `--action` values are exactly `create`, `edit`, `end` and `view`, and `--outcome` is exactly
`republish-and-revert` or `revert`. Run with no flags and the command walks you through the choices
interactively.

Limitations from Expo's documentation:

- **Only one branch can be rolled out on a channel at a time.**
- You can keep publishing to either branch with `eas update --branch <branch>`.
- **You cannot use `eas update --channel <channel>` during an active branch rollout**, because the
  channel is linked to two branches. Publish by branch name.

### How users are assigned

Expo's documentation describes assignment as probabilistic against the percentage you set; it does not
document the exact bucketing algorithm. Do not build a test plan that assumes a particular device is in
or out of a rollout. Verify on a device by reading `Updates.updateId` on a debug screen.

## Rollbacks

Three commands, for three situations:

| Command | Use when | What it publishes |
| --- | --- | --- |
| `eas update:rollback` | The latest update on a branch is bad and the previous one was fine | Republishes the update group published before it; if there is none, a roll back to the embedded update |
| `eas update:republish` | You want a specific earlier update back, or want to copy one to another branch | A new update group with the same contents as the one you pick |
| `eas update:roll-back-to-embedded` | Every update on the runtime version is suspect | An instruction to use the bundle embedded in the binary |

### `eas update:rollback`

```bash
eas update:rollback --message "roll back checkout crash"
```

Its optional argument is the update group ID to roll back, which must be the latest update for its
branch and runtime version; in non-interactive mode it is required. This is the fastest incident
response when the previous update is known-good.

### `eas update:republish`

```bash
# Pick an update group from a branch and republish it
eas update:republish --branch production --message "restore 2026-09-10 build"

# Republish a specific group
eas update:republish --group <update-group-id> --message "restore known-good"

# Copy a tested update from staging to production
eas update:republish --branch staging --destination-branch production --message "promote"
```

`update:republish` accepts `--rollout-percentage` too. When omitted it defaults to 100, so a republish
is immediately available to everyone unless you say otherwise.

Republishing a tested update from a staging branch to production is a useful release pattern in its
own right: the bytes that reach production are the bytes you tested.

### `eas update:roll-back-to-embedded`

```bash
eas update:roll-back-to-embedded --branch production --runtime-version 1.4.0 --message "back to store build"
```

Users on that runtime version stop running downloaded updates and use the bundle that shipped inside
their binary. Use it when you cannot identify a good update, or when the binary itself is the only
version you trust. Accept the cost: users lose every fix published since that binary was built.

## Platform differences

Rollouts and rollbacks are server-side, so the mechanism is the same on both platforms. What differs is
what you publish: `eas update`, `update:republish`, `update:rollback` and
`update:roll-back-to-embedded` all accept `--platform android|ios|all`, which lets you roll back only
the platform that is broken.

:::tabs
@tab Android
Rolling back only Android is the right call when the defect is in Android-specific JavaScript. Pass
`--platform android` and leave iOS users on the newer update.
@tab iOS
The same with `--platform ios`. Remember that iOS users also cannot receive a fix through the store
quickly, so an update rollback may be your only fast lever.
:::

## Common patterns

### Always start production updates as rollouts

```bash
eas update --branch production --message "$MESSAGE" --rollout-percentage 10 --non-interactive
```

Make 10% the default in your release script and 100% a deliberate second step.

### Define "healthy" before you start

Decide the crash-free rate and error rate that let you raise the percentage, and check it at a fixed
interval. `eas update:insights` and `eas channel:insights` exist in eas-cli 24.5.0 for launch, crash and
user counts; this page did not verify the metrics they return, so confirm they match your own
monitoring before relying on them.

### Rehearse a rollback

Run `eas update:rollback` against a staging branch once, from the same CI job or laptop you would use in
an incident. The first time you run a rollback command should not be during an outage.

### Sign rollbacks too

All of these publishing commands accept `--private-key-path`. If your app enforces update code signing,
a rollback that is not signed is rejected by the app like any other unsigned update. See
[EAS Update Signing](../expo-security/update-signing.md).

## Security considerations

**Threat.** Rollout and rollback commands change what code users run, with no store review.

**Exploit.** Anyone with publish rights on the project can "roll back" production to an old update with a
known vulnerability, or end a rollout at 100% early.

**Fix.** Restrict publishing on production channels with `eas channel:protect`, run release commands from
CI with a scoped token rather than from laptops, and enforce update code signing.

**Verification.** From an account without admin rights, attempt `eas update:republish --destination-branch
production` against a protected channel's branch and confirm it is refused.

## Common mistakes

- **Leaving a per-update rollout open.** You cannot publish another update for that runtime version on the
  branch until it ends. Your hotfix waits.
- **Using `eas update --channel` during a branch rollout.** It is not allowed while the channel points at
  two branches. Publish with `--branch`.
- **Expecting a percentage change to reach users immediately.** Users pick up updates when they launch the
  app; the percentage controls eligibility, not delivery.
- **Republishing without a rollout percentage and assuming it is gradual.** `update:republish` defaults to
  100.
- **Rolling back to embedded when one earlier update was fine.** You discard every fix since the binary.
  Prefer `update:rollback` or `update:republish`.
- **Testing rollouts in a development build.** Its channel is `null`.
- **Rolling back without the signing key when signing is enforced.** The app rejects the rollback.

## Related topics

- [EAS Update](update.md) — publishing, and the full flag list.
- [Runtime Versions, Channels and Branches](runtime-versions.md) — what a channel and branch are.
- [What OTA Updates May Not Change](ota-limits-and-policy.md) — what no rollout can fix.
- [EAS Update Signing](../expo-security/update-signing.md) — signing rollbacks.
- [Rollback Strategy](../expo-build-and-release/rollback-strategy.md) — planning the undo in advance.
- [Monitoring](../expo-build-and-release/monitoring.md) — deciding when a rollout is healthy.
