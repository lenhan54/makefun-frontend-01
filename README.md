# make.fun bounties — a tiny, fast frontend

[![makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/c/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/lenhan54/makefun-frontend-01/rank.svg)](https://make.fun/c/makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/lenhan54/makefun-frontend-01/reward.svg)](https://make.fun/c/makefun-frontend-01)

A static frontend for [make.fun](https://make.fun): the live bounty board,
a bounty's page with its rewards, that bounty's leaderboard, and public
profiles — all read-only from make.fun's public API.

- **Board** (`#/`): dense table of the open bounties — live pot split into
  reward + entry fees, entry fee, time left, entries. Sortable; rows patch
  in place when fresh data arrives.
- **Bounty** (`#/bounty/<slug>`): reward first, then the Rewards table
  (Base, Fee share, Pays now), dates including the final window, and
  whether it still takes entries (judged by its deadline, not its status).
- **Leaderboard** (`#/bounty/<slug>/leaderboard`): rank, entrant, judge win
  rate with its 90% interval, prize now. Paginated, 50 rows a page.
- **Profile** (`#/u/<handle>`): mobile-first public profile — entered,
  ranked, wins, best place, total prizes, entries placed first.

Performance: the first load is only the shell, the stylesheet, the router
and the API layer — views load lazily. API answers are cached with ETags
(`If-None-Match`): fresh answers come from memory, older ones revalidate
and a 304 reuses the cached body. The footer shows the live counts:
requests, from-memory hits, and 304 revalidations.

Run it: `node serve.ts`, then open http://localhost:8080. Screenshots are
taken with `python3 shots.py` (Playwright, headless Chromium).

Check it from the kit directory with
`node cli/makefun.mjs check --kit . --repo <this repository>`.
