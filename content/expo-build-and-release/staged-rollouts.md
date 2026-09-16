---
title: Staged Rollouts
description: Releasing to a fraction of users first — Apple's phased release, Google Play staged rollouts via the console or eas submit, and EAS Update per-update and branch rollouts — with what each can and cannot undo.
status: current
toolchain: expo
sdk: 57
---

A staged rollout releases a change to a small share of users, lets you watch it, and then widens it.
It limits the blast radius of a bad release: 1% of users hitting a crash is an incident; 100% is an
outage.

An Expo app has **three** independent rollout mechanisms, because it ships through two stores and,
optionally, an update service:

| Mechanism | Controls | Who decides the percentage |
| --- | --- | --- |
| App Store phased release | A new binary version on iOS | Apple's fixed 7-day schedule |
| Google Play staged rollout | A new binary version on Android | You |
| EAS Update rollouts | A JavaScript update on installed binaries | You |

They do not coordinate with each other, and their undo stories are very different.

## Why it exists / when to use it — and when NOT to

Use a staged rollout for every production release that you cannot fully test in advance — which is
most of them. It is cheapest where the undo is also cheap: EAS Update rollouts.

A staged rollout does not help if nobody is watching crash and error rates while it runs. Set up
[Monitoring](monitoring.md) first.

It is also not a substitute for a fix path. A store rollout can be **halted**, but users who already
received the build keep it.

## Basic example

### EAS Update: publish to 10% first

```bash
eas update --branch production --message "new checkout flow" --rollout-percentage=10
```

`--rollout-percentage` is a verified `eas update` flag in eas-cli 24.5.0. Then widen, or back out:

```bash
# Change the percentage of an in-progress update rollout (interactive)
eas update:edit

# Undo the rollout of that update
eas update:revert-update-rollout
```

### Google Play: staged rollout from `eas submit`

```json title=eas.json
{
  "submit": {
    "production": {
      "android": {
        "track": "production",
        "releaseStatus": "inProgress",
        "rollout": 0.1
      }
    }
  }
}
```

`releaseStatus` and `rollout` are verified fields of the `@expo/eas-json` 24.5.0 submit schema;
`rollout` is a number giving the staged rollout fraction. Widen or halt the rollout afterwards in the
Play Console.

### App Store: phased release

Enable **phased release for automatic updates** on the version in App Store Connect before it is
released. There is no percentage to choose.

## How it works

### App Store phased release

From Apple's App Store Connect documentation:

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Share of users with automatic updates | 1% | 2% | 5% | 10% | 20% | 50% | 100% |

- It applies to users with **automatic updates turned on**. Apple states that apps in phased release
  can be manually downloaded from the App Store by anyone at any time.
- It applies to **version updates only**, not new installs.
- You can **pause** for up to 30 days in total, with no limit on the number of pauses. Resuming picks
  up on the day it left off.
- You can **release to all users** at any time.

So a phased release reduces exposure among existing users with auto-update on. New installs and
manual updaters get the new version on day one.

### Google Play staged rollout

From Google's Play Console documentation:

- The update reaches the percentage of users you choose, and the percentage does **not** increase
  automatically — you raise it.
- **Halting** stops additional users from receiving it. Users who already received the version
  **remain on it**.
- You can resume a halted rollout and adjust the percentage.
- Staged rollouts are for **updates**, not for an app's first publication.
- Google's recommended recovery from a bad bundle is to create and roll out a new release with a fixed
  bundle.

A new release requires a higher `versionCode`. See [Versioning and Runtime Versions](versioning.md).

### EAS Update rollouts

Expo documents two kinds:

**Per-update rollouts** — `eas update --rollout-percentage`:

- Only one update can be rolled out on a branch at a time.
- While a rollout is in progress, it must be ended before a new update with the same runtime version
  can be published.

**Branch-based rollouts** — `eas channel:rollout`, an interactive command that points a percentage of
a channel's users at a second branch, and later edits or ends that rollout:

- Only one branch can be rolled out on a channel at a time.
- While a branch rollout is in progress, `eas update --channel <channel>` cannot be used, because the
  CLI cannot tell which branch you mean. Publish with `--branch`.

Use a per-update rollout for a normal release on one branch. Use a branch rollout when you want to
move a channel from one line of development to another gradually.

> [!NOTE] Expo Go vs development build
> Update rollouts apply to binaries with `expo-updates`, a channel and a matching runtime version.
> Expo Go and development builds pointed at a dev server do not take part. Test the mechanics on a
> `preview` channel with preview builds.

### How they combine

A typical release has two stages that happen weeks apart:

```text
week 0   binary 1.5.0 approved
         iOS: phased release starts (7 days)     Android: staged rollout 10% → 50% → 100%
week 1+  JS fixes for 1.5.0 via EAS Update, each --rollout-percentage=10 first
```

Store rollouts decide how many users **have** the binary. Update rollouts decide how many of **those**
users receive a given update. An update at 10% on a binary that has reached 20% of Android users is
reaching roughly 2% of Android users.

## Platform differences

:::tabs
@tab iOS
- Fixed 7-day schedule; pause up to 30 days total; release to all at any time.
- Only affects automatic updaters. New installs and manual updates get the new version immediately.
- No way to pull back a version from users who received it; fix forward with a new version, or with an
  EAS Update if the problem is in JavaScript.
@tab Android
- You choose and raise the percentage.
- Halting stops new recipients; existing recipients keep the version.
- Fix forward with a new release at a higher `versionCode`, or with an EAS Update for JavaScript
  problems.
- `eas submit` can start the rollout with `releaseStatus: "inProgress"` and `rollout`.
:::

## Common patterns

### Define stages and exit criteria before you start

| Stage | Exposure | Hold for | Proceed if |
| --- | --- | --- | --- |
| 1 | EAS Update 10% | 2 hours of active use | Crash-free sessions and key error rates match the previous update |
| 2 | 50% | 1 day | Same, plus no new support reports |
| 3 | 100% | — | — |

Write the numbers down. "It looked fine" is not a criterion when the person watching is tired.

### Keep a known-good update ready

Before widening a rollout, know which update you would return to and confirm it is on the right
runtime version. See [Rollback Strategy](rollback-strategy.md).

### Use the Play Console for widening, `eas submit` for starting

Starting the rollout from `eas submit` makes the initial fraction reviewable in `eas.json`. Widening
is a judgement call based on monitoring and is better done by a person in the console.

## Common mistakes

- **Assuming App Store phased release limits all users.** It limits automatic updaters. Anyone can
  update manually, and new installs are not phased.
- **Expecting a halted Play rollout to remove the version.** Users who got it keep it. Fix forward.
- **Rolling out with nobody watching.** A staged rollout without monitoring is a slow full release.
- **Publishing a second update while a per-update rollout is in progress.** Expo documents that the
  rollout must be ended first for the same runtime version.
- **Using `eas update --channel` during a branch rollout.** It is not allowed while the rollout is in
  progress. Use `--branch`.
- **Starting a staged rollout for an app's first Play release.** Staged rollouts are for updates.
- **Treating `rollout` in `eas.json` as a percentage.** It is a fraction; `0.1` is 10%.

## Related topics

- [Rollouts and Rollbacks](../expo-eas/rollouts-and-rollbacks.md) — the EAS Update mechanics in more depth.
- [EAS Submit](../expo-eas/submit.md) — `track`, `releaseStatus` and `rollout`.
- [Monitoring](monitoring.md) — the signals that decide whether to widen.
- [Rollback Strategy](rollback-strategy.md) — what to do when a stage fails.
- [Runtime Versions, Channels and Branches](../expo-eas/runtime-versions.md) — channels and branches that branch rollouts move between.
- [Submission Checklists](submission-checklists.md) — the checks before a rollout starts.
