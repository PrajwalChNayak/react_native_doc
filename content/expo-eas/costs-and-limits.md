---
title: Costs and Limits
description: What EAS actually meters — builds, update users and bandwidth, workflow minutes, concurrency and queue priority — what could and could not be verified about current prices, and what you can do without paying.
status: current
toolchain: expo
sdk: 57
---

EAS is a **paid hosted service with a free tier**. Build, Update and Workflows are metered, and what
you get on the free plan is enough to evaluate them and ship small apps — not an unlimited service. This
page explains what is metered, how that affects decisions, and what you can do without EAS at all.

> [!WARNING] Prices change. This page is not the price list
> Expo publishes its plans and usage rates at **expo.dev/pricing**, with billing details in the Expo
> documentation under Billing. The figures below were read from that page on **2026-09-15** and are
> included only so you can see the shape of the plans. **Check the pricing page before making any
> decision that depends on a number.** Per-unit usage rates are deliberately not reproduced here; read
> them on the pricing page.

## Why it exists / when to use it — and when NOT to

Read this page when you are deciding whether to adopt EAS, choosing a plan, or wondering why a build is
waiting in a queue on release day.

Do not use it as a reason to assume EAS is required. Every product in EAS has an alternative:

| Product | What is metered | Alternative with no EAS bill |
| --- | --- | --- |
| EAS Build | Builds, by platform and worker size; queue priority; concurrency | `npx expo run:android` / `npx expo run:ios`, or your own CI. `eas build --local` still needs an Expo account but runs on your machine |
| EAS Update | Monthly active users receiving updates; bandwidth | A self-hosted server implementing the `expo-updates` protocol, or shipping store releases |
| EAS Workflows | Workflow run time (CI/CD minutes) | GitHub Actions, GitLab CI, Bitrise, Jenkins |
| EAS Submit | Included in plans as listed on the pricing page | Transporter, Xcode, the Play Console, fastlane |

## Basic example

The plan cards on expo.dev/pricing, as read on 2026-09-15. Two separate reads of the page agreed on
these values:

| Plan | Price shown | Builds | Updates | Other items listed |
| --- | --- | --- | --- | --- |
| Free | $0/month | 15 Android and 15 iOS builds, low-priority queue | 1K MAUs | 60 minutes of CI/CD Workflows; submit to app stores |
| Starter | $19/month plus additional usage cost | $45 of build credit, high-priority queue, access to large workers | 3K MAUs | 1 concurrency ($50/extra, up to 5 extra) |
| Production | $199/month plus additional usage cost | $225 of build credit | 50K MAUs | 2 concurrencies ($50/extra, up to 5 extra); priority support; SSO |
| Enterprise | Custom pricing | Build credit starting at $1,000 and customizable | 1M+ MAUs | 5 concurrencies ($50/extra); SLAs |

Usage beyond included amounts on paid plans is billed at per-unit rates listed on the same page. Expo's
plans documentation states that **Free plan accounts cannot incur overage charges**; what exactly happens
when a Free plan limit is reached is described in Expo's billing FAQ, which this page did not verify.

## How it works

### EAS Build

Expo's usage-based pricing documentation says a flat fee is charged per build executed at higher
priority, varying by platform and resource class, and that subscribers receive monthly build credit that
resets and expires at the end of each billing period.

Three consequences for decisions:

- **Worker size costs money.** `resourceClass` in `eas.json`, or `--resource-class` on the command line,
  selects larger workers, which are priced higher. Use them where they save real time.
- **iOS and Android are priced separately.** `--platform all` is two builds.
- **Failed builds are still builds.** A hosted build that fails on a problem you could reproduce locally
  costs the same as a successful one. Reproduce native build failures locally first — see
  [Building Locally](local-builds.md).

### Queues and concurrency

The Free plan uses a low-priority queue; paid plans list a high-priority queue and, from Production,
included concurrencies. In practice that means:

- On the Free plan, **wait time is not guaranteed**, and it is longest when everyone else is building too.
- Without extra concurrency, your builds run **one after another**. Android and iOS for one release, plus a
  development build someone started, form a queue of your own.

If a release deadline depends on a hosted build finishing, the plan's queue and concurrency are part of
that deadline.

### EAS Update

Expo's documentation says EAS Update is billed on two metrics: **monthly active users** — unique
installations that download updates in the billing period — and **global edge bandwidth**. Two practical
points:

- MAUs count installations receiving updates, not your total user base. An app with many installs and
  few updates can still exceed a plan's MAU figure, because every installation that checks and downloads
  in a period counts.
- **Bandwidth scales with update size.** Large assets in updates cost more to deliver and take longer to
  download. Keep heavy assets in the binary when they rarely change.

### EAS Workflows

The Free plan card lists **60 minutes** of CI/CD Workflows. Workflow jobs run on EAS infrastructure. Per
Expo's Workflows job documentation, a `build` job uses EAS Build, so a workflow that builds consumes build
usage as well as workflow time. Per-minute rates by worker type are on the pricing page.

### What costs nothing extra

- `npx expo run:android` and `npx expo run:ios` — no account, no service.
- `npx expo prebuild`, config plugins, Expo modules, Expo Router, the SDK packages.
- Distributing a binary you built yourself through the stores.

## Platform differences

:::tabs
@tab Android
Android binaries can be built on macOS, Linux or Windows, so a free local or self-hosted CI path is
always available. Paying for hosted Android builds is a convenience, not a necessity.
@tab iOS
iOS binaries require macOS with Xcode. Without a Mac, the real choice is between a hosted service (EAS or
another) and a Mac CI runner you pay for elsewhere. Neither is free, and an Apple Developer Program
membership is required to sign for devices or the store regardless.
:::

## Common patterns

### Build Android locally, iOS on EAS

Android builds need only a JDK and the Android SDK. Building them locally or on ordinary Linux CI while
using EAS only for iOS halves hosted build usage for many teams.

### Keep development builds off the hosted queue

A development build changes only when native code changes. Build it once, share it through
[internal distribution](internal-distribution.md), and iterate on JavaScript with the dev server. Rebuilding
it for every branch spends build usage on nothing new.

### Watch update size before MAUs become the problem

Check the size of what `eas update` uploads. An update that re-ships every image is bandwidth multiplied by
every active installation.

### Put a number on it before you commit

Estimate monthly builds per platform, expected MAUs receiving updates, and workflow minutes, then price
them on expo.dev/pricing against a local or self-hosted alternative. A decision made without that
arithmetic is a decision made on marketing.

## Common mistakes

- **Treating the free tier as unlimited.** Builds, update MAUs and workflow minutes are all limited.
- **Quoting prices from a blog post or this page in a budget.** Plans change. Use the live pricing page.
- **Debugging a native build failure with repeated hosted builds.** Each attempt is a metered build.
  Reproduce locally.
- **Using `--platform all` to test one platform.** Two builds.
- **Choosing the largest worker by default.** Larger workers cost more; measure whether they shorten your
  build enough to matter.
- **Shipping large assets in every update.** Bandwidth is metered.
- **Assuming EAS is required to ship.** It is not. `npx expo run:*` and your own CI produce real release
  binaries.
- **Discovering queue times on release day.** Know your plan's queue priority and concurrency before a
  deadline depends on them.

## Related topics

- [EAS Overview](overview.md) — what each product does, and the alternatives.
- [Building Locally](local-builds.md) — the no-bill path for builds.
- [Building on EAS](building.md) — `--resource-class` and what a hosted build does.
- [eas.json and Build Profiles](eas-json.md) — `resourceClass` and worker settings.
- [EAS Update](update.md) — what an update contains, and therefore what it costs to deliver.
- [EAS Workflows](workflows.md) — what workflow jobs consume.
- [Internal Distribution](internal-distribution.md) — reusing builds instead of rebuilding.
