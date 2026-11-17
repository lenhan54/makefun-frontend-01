# make.fun frontend — V4

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/lenhan54/makefun-frontend-01/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/lenhan54/makefun-frontend-01/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A fully working custom frontend for [make.fun](https://make.fun), built from
static files under `app/` with no build step and no framework. It reads only
the public make.fun API (GET, CORS open), and nothing else at run time.

## Surfaces

- **Board** (`#/`): a table of the live bounties — Bounty / Live pot / Fee /
  Time left / Entries — with sort buttons (Closing soon, Biggest pot, Most
  entries) and category chips, beside one bounty in full detail and the live
  Top 10 with each entrant's prize now. A stats strip above it totals the
  live pots, the entries, and the next deadline. Each bounty shows its live
  pot split apart ("$500 reward + $225.50 fees = $725.50 live pot"), its
  entry fee, a countdown that ticks every second with a progress bar, and
  how many entries passed the checks.
- **Bounty** (`#/bounty/<slug>`): the rewards table (Base + Fee share + Pays
  now) comes first, then a short summary and the description as clean
  paragraphs — no raw markdown — then dates and open/closed state. A bounty
  past its deadline counts as closed even if its status still reads open,
  and "Results by" is read from the final phase, not from an empty field.
- **Leaderboard** (`#/leaderboard/<slug>`): windowed to 50 rows at a time
  (buttons and scroll paging), with avatars, the judge win rate, the 90%
  interval, a "Prize now" column from the live rewards, switchable views,
  and a search box that filters by handle.
- **Profile** (`#/profile/<handle>`): avatar, bio, links, record (entered /
  placed / won / best place / prizes) and every entry. Find any profile from
  the search box in the header.

## Performance

- **First load is `index.html` alone** — the stylesheet and the views load
  after it, so the first load is 886 B gzipped (measured), under 1 KB.
- **ETag cache:** repeat requests inside the same minute send
  `If-None-Match` and get a 304 instead of a fresh download; the header
  shows the real counts on every surface (API requests · served from memory
  · × 304 Not Modified).
- **Small answers:** the bounty detail asks for `?submissions=summary`
  (about 100 KB instead of about 2.9 MB); the leaderboard answer is cached
  in memory between the board's Top 10 and the leaderboard page.
- **Live activity:** the latest-entries feed refreshes every 60 seconds.
- Dark theme, rounded panels, keyboard and screen-reader friendly, stacks
  cleanly on a phone — the profile screenshot is taken at 360 px wide.

## Run it

```sh
node serve.ts            # serves app/ at http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/`
to the output directory and writes `dossier.json` with `buildDossier` from
`vendor/makefun-frontend.ts`. Running it twice writes byte-identical output.

Screenshots in `screenshots/` are real renders of this app on live data:
the board (1280×800), the leaderboard (1280×800), and the profile on a
phone-width viewport (360×640). Each is under the 256 KiB cap.
