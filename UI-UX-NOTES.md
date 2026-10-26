# UI/UX pass — notes before changes

Started 2026-10-26. Display only: no engine, selector, scheduler or gate change.
Every `data-testid` the e2e specs read is kept. Order the user asked for:
**dashboard (structure and layout) → exam feel → profile.**

Reviewed from the Alex screenshots (`scratchpad/deck/img/after-*.png`).
Research behind the direction: a learner dashboard should lead to an action,
not only show numbers (Bennett & Folley 2020, *JARHE*); more model detail
costs readability (Guerra et al. 2018).

## 1. Dashboard — structure and layout

What is wrong now

- No single "do this next". Three header buttons (`All dues (14)`, `Review 1`,
  `Continue Phase 2`) compete, and "1 urgent" beside "All dues (14)" reads as a
  contradiction.
- The next-session card is half width and the skill name is body text; the
  start button is far away in the header.
- "Why this one" draws every term, including two at 0, with weights (`×0.35`)
  that mean nothing to a learner.
- "Almost picked: X (0.27), Y (0.27) · its pick scored 0.27" makes an equal
  score look arbitrary.
- Reviews are split over three places: forecast card, urgent list, coming-up list.
- Stat cards: the mastered number is dark green `#2f5d3a` on a dark card (low contrast).
- The active-phase card repeats the same "Continue" button a third time.
- Muted text tokens are blue-purple greys on a green-black theme; they clash.

Planned

- [x] Hero = next session, full width: large skill name, reason, phase progress,
      and the buttons in the card (start, review N due, take the phase exam).
- [x] "Why this one" shows only terms that added to the score, as plain percentages;
      weights, totals and runners-up behind a "How it's scored" toggle.
- [x] Runners-up within 0.02 → "Close call: X scored almost the same."
- [x] Four stat tiles (mastered, learning, due now, due in 3 days) with theme colours.
- [x] Two columns: active-phase path (next skill ringed, "Next up") and the Bloom
      profile on the left; one Reviews card (forecast + due list + "All N scheduled")
      on the right.
- [x] "How you work" full width with a one-line subtitle; curriculum last.
- [x] Narrow-screen padding (`px-4` on phones), wrapping header and buttons.
- [x] Retone `--text-muted/faint/ghost` to warm greys that match the palette, at
      AA contrast in both themes.

## 2. Exam — feel

Read: `src/app/learn/exam/[phase]/page.tsx`, `src/components/exam/Debrief.tsx`.

What is wrong now

- The room does not feel like an exam: the clock is plain text, there is no sense
  of how far through you are (12–24 adaptive), and nothing shows the item's time
  target running down.
- Options are flat rows with a faint letter; no keyboard answering (A–D, Enter).
- The Bloom level is a grey word, with no sense of which of the six it is.
- There is no "leave and come back"; the run is saved, but the page never says so.
- Intro: two mode cards and a paragraph; the facts (length, time, effect on mastery)
  are buried in prose.
- Debrief opens on "81% on a medium item" (jargon) and has no "what to do next";
  the strongest and weakest levels have to be read off the dot chart.
- Levels with 2–3 items look as solid as levels with more.
- The per-item table is long and overflows on a phone.

Planned

- [x] Top bar: mode chip, a countdown with a draining bar (red under a minute),
      progress "Question n · stops between 12 and 24", and "Leave — progress is saved".
- [x] Question header: the level as a chip, "level k of 6", and a small pace ring
      against the item's target (amber when slow, red when well over; never a cut-off).
- [x] Options: lettered badges, a filled badge when chosen, keys A–D to choose and
      Enter to save, with a one-line key hint.
- [x] Intro: three fact tiles (12–24 questions · time limit or untimed · does not
      change mastery), then the two mode cards with the differences as bullets.
- [x] Debrief: headline "13 of 17 right", plain subline ("about 81% on a typical
      question"); a "What to do next" box: strongest level, weakest level, the first
      skill to revisit with Study, and Retake.
- [x] Levels answered on 2 or fewer questions say "few questions" beside the score.
- [x] Per-item table folds under "Every question (n)" and scrolls sideways on a phone.
- [x] (user ask) All questions visible in the top bar. The exam picks each item
      only after the last answer, so future questions do not exist yet: show all 24
      slots — served ones as numbered buttons, the rest as faint placeholders — with
      a marker at 12, "may stop here". Once the exam stops, the unused slots go.
- Kept: every `data-testid`, the h1 starting "N of M right", the hint and rapid-hint text.

## 3. Profile

Read: `src/app/profile/page.tsx`.

What is wrong now

- A 99% belief bar beside "Fragile · awaiting first review" contradicts itself.
- "belief is ahead of recent answers" is the most useful warning and is grey text.
- No ordering by what needs attention: rows are by recency, and the separate
  "Gaps, named" list repeats the same skills further down.
- "discounted for behaviour" is unexplained.
- One narrow column (`max-w-3xl`): the learning curve, Bloom and activity sit far
  below a long skill list.

Planned

- [x] Wider page, two columns on large screens: skills on the left; learning curve,
      Bloom, activity and sessions in a sticky right column.
- [x] Skills grouped, all rows still visible (the e2e reads every row):
      **Needs attention** (belief ahead of answers, high belief on under 3 attempts,
      fragile awaiting a first review) → **Still learning** → **Solid**. Each group
      has a count. The reason is a coloured chip on the row. "Gaps, named" is folded
      into the first group.
- [x] Fragile belief drawn striped until it survives a first review.
- [x] "N discounted for behaviour" → "N counted less" with a tooltip saying why.
- [x] A one-line summary under the name: how many skills need attention.

## Verify

`npx vitest run`, `npm run build`, e2e `learner-model` and `exam` specs, then
before/after screenshots of Alex for the deck.
