# Ballast

A **liquidation-protection guardian** for Aave, with a ship's-inclinometer UI — built on **KeeperHub** for the *Agent Economy* hackathon.

> **In plain words:** watches an Aave loan's health factor. If a crash pushes it toward liquidation, Ballast deterministically pays down the loan through KeeperHub — dry-run first, routed privately so it can't be front-run, retried through gas spikes, every step audited. The screen is a brass ship's inclinometer: the needle is the health factor.

_README is being written — see `PROGRESS.md` for live status and `guardian/` + `ballast/` for the code._
