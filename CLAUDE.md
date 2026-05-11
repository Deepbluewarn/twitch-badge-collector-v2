# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `Deepbluewarn/twitch-badge-collector-v2`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Operations

### OTA — host selector hotfix

호스트 DOM이 바뀌어 selector가 깨졌을 때 코드 재배포 없이 JSON push로 hotfix. 절차/주의사항: `docs/ota-selectors.md`.
