# Content Structure — What Goes On Every Screen

*This document defines the actual content for the demo: the persona, the subject, the copy, the construct scripts, and every piece of data that makes the screens feel real.*
*Design spec tells you how it looks. This tells you what it says.*

---

## 1. The Demo Persona

All demo screens use this one learner. Everything is built around him.

```
Name:          Arjun Sharma
Age:           18
Track:         Track 1 (Competitive — JEE Advanced 2027)
Exam:          JEE Advanced — May 18, 2027
Days to exam:  321 days (as of demo date)
Subject:       Mathematics (demo uses this subject only)
Daily time:    90 minutes
Streak:        14 days
Rank target:   Top 5% (AIR < 2,500)
Current proj:  Top 12% (AIR ~6,000)

Interest domains:   Cricket, Cinema, Geography
Learning style:     Example-first, Do > Read, Solo
Preferred analogy:  Cricket (Math), Physics analogies (Thermodynamics)
Pace:               Fast on Algebra, slow on Calculus
```

---

## 2. Demo Concept Map — JEE Mathematics

10 concepts across all 5 orbit stages. This is the demo's knowledge state.

| Concept | Orbit Stage | p_known | Last practiced | Next due |
|---------|-------------|---------|----------------|----------|
| Functions — Basics | Mastered | 0.97 | 8 days ago | 24 days |
| Limits | Confident | 0.81 | 3 days ago | 6 days |
| Continuity | Confident | 0.78 | 5 days ago | 4 days |
| Differentiation — Rules | Practicing | 0.62 | 1 day ago | 3 days |
| Chain Rule | Practicing | 0.54 | Today | — |
| Integration — Basics | Seen | 0.38 | 2 days ago | Tomorrow |
| Integration by Parts | Unknown | 0.12 | Never | — |
| Definite Integrals | Unknown | 0.08 | Never | — |
| Applications of Integration | Unknown | 0.04 | Never | — |
| Differential Equations | Unknown | 0.02 | Never | — |

**Prerequisite edges (for concept map rendering):**
```
Functions → Limits → Continuity → Differentiation → Chain Rule
Chain Rule → Integration Basics → Integration by Parts → Definite Integrals
Definite Integrals → Applications of Integration
Integration Basics → Differential Equations
```

---

## 3. Platform Copy — All Static Text

### 3.1 Dashboard Copy

**Greeting (time-sensitive):**
```
Before 12pm:  "Good morning, Arjun."
12pm–5pm:     "Good afternoon, Arjun."
After 5pm:    "Good evening, Arjun."
```

**Subline:**
```
"Wednesday, July 2, 2026 · JEE Advanced 2027"
```

**Session card — computed session for Arjun today:**
```
Title:     "Review + First Look"
Type chip: "Plain Session"
Reasoning: "Integration Basics is overdue. Chain Rule is ready to advance. Adding a first look at Integration by Parts."
Stats:
  Concepts:  3
  Est. time: 34 min
  Difficulty: Medium
CTA button: "Start today's session"
```

**Countdown block:**
```
Number:  321
Unit:    "days to JEE Advanced"
Subline: "May 18, 2027"
```

**Daily target:**
```
"3 concepts today to stay on track"
```

**Pace indicator:**
```
"On track ·" [green dot] "Blueprint week 3 of 46"
```

**Rank projection:**
```
"Current trajectory"
Large: "Top 12%"
Subline: "~AIR 6,000 in Mathematics"
Trending: "↑ Improved from top 18% last week"
```

**Stats row:**
```
[14] Streak
[3]  Mastered
[2]  Due today
[21] Days active
```

**SM-2 queue section:**
```
Label: "REVIEW DUE"
Row 1: [Seen badge] Integration Basics · Due tomorrow
Row 2: [Practicing badge] Chain Rule · Due in 3 days
Row 3: [Confident badge] Continuity · Due in 4 days
Footer: "2 concepts due today · 3 more this week"
```

---

### 3.2 Concept Map Copy

**Page heading:** "Your Knowledge Map"
**Subline:** "Mathematics · JEE Advanced"

**Filter labels:** All · Unknown · Seen · Practicing · Confident · Mastered

**Layout toggle:** Radial · Tree · Grid

**Concept hover tooltip example (Integration Basics):**
```
Integration — Basics
[Seen badge]
p_known: 0.38
Last practiced: 2 days ago
Next due: Tomorrow
Click to view full history →
```

**Concept detail panel (Integration Basics — right panel):**
```
[Heading] Integration — Basics
[Orbit badge: Seen]

[p_known section]
Knowledge confidence: 38%
[Progress bar showing 0.38, colored orange/seen]
"You've encountered this concept but it hasn't solidified yet."

[History sparkline label] p_known over 14 days

[Prerequisites]
Chain Rule ✓ (Confident)

[Unlocks]
Integration by Parts (locked)
Definite Integrals (locked)

[Stats]
Questions attempted: 12
Accuracy: 58%
Sessions: 3

[CTA] "Practice this concept"
```

**Cluster watermark labels (behind node groups):**
```
"LIMITS & CONTINUITY"    (top-left cluster)
"DIFFERENTIATION"        (center cluster)  
"INTEGRATION"            (bottom-right cluster)
"DIFFERENTIAL EQUATIONS" (far right, mostly unknown)
```

---

### 3.3 Session Copy

**Session header:**
```
← Back    Integration — Basics · [Seen badge]    Q 1 of 8    14:23 ⏱
[Progress bar: 0% filled]
```

**Question 1 (MCQ):**
```
Q1 of 8

Which of the following represents the integral of f(x) = 2x with respect to x?

A. x² + C
B. 2x² + C  
C. x + C
D. 2 + C
```

**Answer feedback — correct:**
```
✓ Correct

A. x² + C  ← [highlighted green]

The integral of 2x is x² + C. When we integrate xⁿ, we add 1 to the power and divide 
by the new power: ∫2x dx = 2·(x²/2) + C = x² + C.

p_known: 0.38 → 0.44  [bar animates]
```

**Answer feedback — incorrect:**
```
✗ Not quite

You chose: B. 2x² + C
Correct: A. x² + C  ← [highlighted]

The integral of 2x is x² + C, not 2x². You correctly identified it as a power function, 
but the division step (÷2) was missed.

p_known: 0.38 → 0.34  [bar drops]
This type of error: Conceptual — the division rule in integration.
```

**Session pause overlay:**
```
Session paused

"Integration — Basics · Q 3 of 8"
Progress saved. You can resume anytime.

[Resume session]  [End session]
```

**Concept transition (between questions on different concepts):**
```
[Subtle label appears for 600ms]
"Next: Chain Rule"
```

---

### 3.4 Session Summary Copy

**Result header:**
```
✓ Session complete

34 min · 8 questions · 6/8 correct (75%)
```

**Concepts moved section:**
```
WHAT MOVED

Integration — Basics    [Seen] → [Seen]      +0.14    (0.38 → 0.52)
Chain Rule             [Practicing] → [Confident]  +0.19  (0.62 → 0.81)  ★ Biggest gain
Integration by Parts   [Unknown] → [Seen]     +0.14    (0.12 → 0.26)
```

**Chain Rule upgrade callout:**
```
★  Chain Rule reached Confident
   "You've moved from Practicing to Confident. One more strong session and this could be Mastered."
```

**Review schedule:**
```
SCHEDULED FOR REVIEW

[Seen]       Integration Basics    · Tomorrow
[Confident]  Chain Rule            · In 5 days
[Seen]       Integration by Parts  · In 2 days
```

**Tomorrow's preview:**
```
Tomorrow's session
3 concepts · ~31 min · Plain Session
"Integration by Parts will be back. Definite Integrals as a first look."

See you tomorrow.
```

---

### 3.5 Blueprint Copy (Track 1)

**Page heading:** "Your Study Blueprint"
**Subline:** "JEE Advanced 2027 · Mathematics"

**Tab: This Week (Week 3 of 46)**
```
Monday, Jun 30    Integration Basics (review)                     28 min  ✓
Tuesday, Jul 1    Chain Rule (advance) · Continuity (review)      35 min  ✓
Wednesday, Jul 2  Integration Basics (review) · Chain Rule (advance) · IBP (new)   34 min  ← TODAY
Thursday, Jul 3   Definite Integrals (new) · IBP (review)         38 min
Friday, Jul 4     Applications review                             30 min
Saturday, Jul 5   Weekly mock: Differentiation + Integration      60 min
Sunday, Jul 6     Rest / catch-up if needed                       —
```

**Gap analysis panel:**
```
⚠ AT CURRENT PACE

You will not reach Differential Equations before April 2027.
That leaves 6 weeks with incomplete coverage.

Options:
[+15 min/day]  "Reach full coverage by March"
[Deprioritize] "Skip low-weight topics (removes 3 concepts)"
```

**Rank projection chart label:**
```
Math readiness: Week 3 → Week 46
Current: Top 12%
Target:  Top 5%
The gap: ~8 weeks of consistent progress at current accuracy
```

---

## 4. Construct Scripts

### 4.1 Feynman Loop — Integration Basics

**Trigger context:** Integration Basics has been seen in plain session twice. p_known 0.38 after 2 sessions. Engine decides this concept needs depth, not more MCQs.

**Step 1 — Construct intro:**
```
[Icon]  Feynman Loop

"You've seen Integration Basics twice. But your score suggests it's not clicking yet.

Let's try something different. Instead of answering questions, you're going to teach this concept to someone else.

Teaching forces you to find the gaps in your own understanding."

[Begin]
```

**Step 2 — Character entry:**
```
[Rohan enters]

Character name: Rohan
Role: Arjun's study partner
Personality: Always asks "but why?" — gets confused by anything abstract, needs concrete examples

Dialogue: "Arjun, I've been trying to understand integration for an hour and I'm completely lost. 
You've studied this — can you explain it to me? What even is integration?"
```

**Step 3 — Teaching canvas prompt:**
```
Rohan is waiting.

Explain integration to Rohan. Use any words, any example — whatever you think will help him understand.

[Large text area]
Hint text: "Think about what integration actually does — not how to calculate it."

Word count: 0 / 50 minimum
```

**Step 4 — Character follow-up (after first explanation):**

*If learner explained the method (how to calculate):*
```
Rohan [confused expression]:
"Okay, I get that you add 1 to the power and divide. But what is that actually doing? 
Like, if I integrate something, what have I found? What does the answer mean?"
```

*If learner explained the concept (what it means):*
```
Rohan [curious expression]:
"Oh interesting. But you mentioned 'area under the curve' — I don't understand why 
area has anything to do with a formula. Can you show me with a real example?"
```

**Step 5 — Breakdown moment:**

*The hard follow-up (always asked regardless of first explanation):*
```
Rohan [confused expression]:
"Wait, you said integration is the reverse of differentiation. But differentiation gives 
you the rate of change — so integration gives you... what? The original thing? 
But why would you ever want to go backwards?"
```

*If learner gets stuck or gives a weak answer:*
```
[Gap callout box]

"You explained the mechanical process well — but Rohan's question is about meaning.

The gap: You haven't connected integration to a real-world situation where 'going backwards' is useful."

"Try again. Give Rohan one real situation where you'd need integration — not the formula, the situation."
```

**Step 6 — Rebuild prompt:**
```
"Rohan needs one concrete situation. 

Think about: if you know how fast something is changing at every moment, 
and you want to know the total — that's integration."

[Teaching canvas — second attempt]
```

**Step 7 — Resolution:**

*Good explanation example:*
```
Learner writes: "Imagine Virat Kohli's run rate changes every over — 
sometimes 12 runs per over, sometimes 4. Differentiation would tell you 
the rate at any specific over. Integration adds all of those up to give 
you the total runs scored. You're going backwards from rate → total."

Rohan [Aha expression]:
"Oh. So integration is like... summing up changes over time? 
And the area under the curve is literally just the total? That makes sense."
```

**Construct summary:**
```
Feynman Loop complete

✓ You explained well:
  "Arjun connected integration to a cumulative process (runs over time).
   Rohan understood 'area = total' through the cricket analogy."

⚡ The gap you found:
  "First explanation focused on the method (how to calculate).
   Rohan needed meaning first — what integration is for."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BKT Movement
Plain session average:     +0.08 per session
This session (Feynman):   +0.21
                           ↑ 2.6× faster

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Engine decision:
"Next session will target the meaning-first gap — 
 starting with applications before methods for this concept."
```

---

### 4.2 Debug the Machine — Binary Search (Track 2 preview)

**Skill:** Data Structures — Binary Search

**Broken code presented:**
```python
def binary_search(arr, target):
    left = 0
    right = len(arr)          # Bug 1: should be len(arr) - 1
    
    while left < right:       # Bug 2: should be left <= right
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    
    return -1
```

**Test results (pre-fix):**
```
Test 1: Find 7 in [1,3,5,7,9]        ✗  Expected: 3  Got: -1
Test 2: Find 1 in [1,3,5,7,9]        ✗  Expected: 0  Got: -1
Test 3: Find 9 in [1,3,5,7,9]        ✓  Expected: 4  Got: 4
Test 4: Find 6 in [1,3,5,7,9]        ✓  Expected: -1  Got: -1
Test 5: Find target in [5]            ✗  Expected: 0  Got: -1
```

**Diagnosis prompt:**
```
Something is wrong. Before you fix it — figure out what.

What is the bug? Describe it in plain English first.
Don't touch the code yet.

[Text area]
```

**Good diagnosis response:**
```
"right should be len(arr) - 1, not len(arr). 
When right = len(arr), the mid calculation can give an index out of bounds, 
and the loop condition left < right misses the case where left == right, 
which is when the target might be at that position."
```

**Post-fix test results:**
```
Test 1: Find 7 in [1,3,5,7,9]        ✓  Expected: 3  Got: 3
Test 2: Find 1 in [1,3,5,7,9]        ✓  Expected: 0  Got: 0
Test 3: Find 9 in [1,3,5,7,9]        ✓  Expected: 4  Got: 4
Test 4: Find 6 in [1,3,5,7,9]        ✓  Expected: -1  Got: -1
Test 5: Find target in [5]            ✓  Expected: 0  Got: 0

5/5 tests passing ✓
```

**Explain prompt:**
```
Now explain: why did these two bugs cause the failures you saw in tests 1, 2, and 5?
Write one sentence per bug.

[Text area — min 2 sentences]
```

---

## 5. Character Profiles

### 5.1 The Confused Student — Rohan

```
Full name:     Rohan Mehta
Age:           18 (same as Arjun)
Background:    First-year student, sharp but impatient, hates abstract explanations
Personality:   Asks "but why?" to everything. Gets frustrated when things feel arbitrary.
               Very good at sensing when someone is explaining something they don't fully understand.
Voice:         Direct, slightly informal ("I don't get it", "wait but", "okay but then why")
What he asks:  Always pushes from method → meaning. Never satisfied with "just do this."
What he never says: "I understand" until you've actually explained it at depth.
Cultural ref:  Mumbai, cricket fan, makes movie references occasionally
```

**Rohan's expression states:**
```
Neutral:   Listening, slightly skeptical, arms crossed
Curious:   Leaning in, one eyebrow raised
Confused:  Furrowed brow, slight frown, hand on chin
Thinking:  Looking away, processing
Aha:       Eyes wide, sitting up, slight smile
Satisfied: Nodding, relaxed, "okay I get it now" energy
```

**Rohan's dialogue patterns:**
```
Opening:   "I've been stuck on [concept] — can you explain it?"
Follow-up: "Wait, but [pushback on surface explanation]"
Confusion: "I don't understand what that actually means in practice."
Hard push:  "Okay but WHY does [rule/formula] work? Why not just [alternative]?"
Resolution: "Oh. That actually makes sense. Why didn't anyone just say that?"
```

---

### 5.2 The Skeptic (V3+)

```
Full name:     Priya
Age:           20
Personality:   Engineering student, extremely analytical, challenges everything.
               Will not accept anything without proof. But when convinced, totally convinced.
Voice:         Precise, slightly adversarial, uses "prove it" and "that's not sufficient"
What she asks: "What's your evidence for that?" "Why is that the right approach and not [alternative]?"
Best for:      Concepts with multiple approaches, proofs, reasoning-heavy topics
```

---

### 5.3 The Interviewer (V5)

```
Full name:     Ankit (no last name)
Role:          Senior SDE at a product company, 6 years experience
Personality:   Professional, probing, not unkind — but expects clarity
Voice:         Direct, interview-formal, asks follow-ups immediately
What he asks:  "Walk me through your approach." "What's the time complexity?" "What would you do differently?"
Best for:      Track 2 — skill validation, code walkthroughs, system design
```

---

## 6. Empty State Copy

```
Dashboard — no track set:
  "Set up your track to get started"
  "Tell us what you're working toward and we'll compute your first session."
  [Choose a track]

Concept map — empty:
  "Your knowledge map is empty"
  "Your first session will populate this map."
  [Start your first session]

Session — no session computed:
  "No session scheduled"
  "The engine needs a little more information to compute your first session."
  [Complete setup →]

Portfolio — no artifacts:
  "No portfolio artifacts yet"
  "Complete a Track 2 session to generate your first verified artifact."
  [Go to Track 2]

Blueprint — no exam set:
  "No exam date set"
  "Set your exam date so we can build your study timeline."
  [Set exam date]
```

---

## 7. Error States Copy

```
Session lost connection:
  "Session interrupted"
  "Your progress is saved. Reconnect to continue."
  [Try again]

BKT calculation failed:
  "Something went wrong"
  "We couldn't update your progress. Your session is saved — we'll retry."
  [Continue anyway]

Concept graph not loaded:
  "Map couldn't load"
  "We're having trouble loading your concept map. Your session data is safe."
  [Reload]
```

---

## 8. Micro-copy (Labels, Tooltips, Confirmations)

```
Orbit stage tooltips:
  Unknown:    "You haven't studied this concept yet."
  Seen:       "You've encountered this — it's not solidified yet."
  Practicing: "You're actively learning this. Keep going."
  Confident:  "Strong grasp. Spaced review will push this to Mastered."
  Mastered:   "You know this. The system will check back in ~3 weeks."

p_known tooltip:
  "Confidence score: how certain the engine is that you know this concept.
   Calculated from your response history using Bayesian Knowledge Tracing."

SM-2 tooltip:
  "Review scheduled by spaced repetition — the engine brings this back at the moment you're about to forget it."

BKT movement tooltip (construct summary):
  "Plain session baseline is calculated from your last 5 sessions on similar concepts."

Rank projection tooltip:
  "Based on your current p_known across all JEE Math concepts, weighted by exam marking scheme.
   Updated after every session."

Abandon session confirmation:
  "End session?"
  "Your progress so far will be saved. The engine will account for the partial session."
  [End session]  [Keep going]

Construct skip:
  "Skip this construct?"
  "You can always return to this format. The engine will use a plain session instead."
  [Skip]  [Continue]
```

---

## 9. Navigation Labels

```
Sidebar items:
  Home          (dashboard)
  My Map        (concept map)
  Sessions      (session history)
  Progress      (BKT trends, orbit history)
  Library       (VN — construct library explorer)
  Settings

Track switcher pills:
  Playground    (T0)
  Competitive   (T1)
  Skills        (T2)

Bottom of sidebar:
  [Avatar] Arjun Sharma
  Settings ⚙
```

---

## 10. Demo Sequence Content (for V0 → VN walk-through)

When walking through the demo, use this specific content sequence:

```
Screen 1:  Dashboard — Arjun, 321 days to JEE, "Start today's session" ready
Screen 2:  Concept map — 10 nodes, 5 orbit stages visible, hover Integration Basics
Screen 3:  Click Integration Basics → right panel opens with full detail
Screen 4:  Start session → Q1 of 8 (Integration MCQ) → answer correctly
Screen 5:  Q2 → answer incorrectly → see explanation + p_known drop
Screen 6:  Session continues → Q5: engine triggers construct (Integration Basics still at 0.38)
Screen 7:  Feynman Loop intro → Rohan appears
Screen 8:  Teaching canvas → type explanation
Screen 9:  Rohan follows up → breakdown moment
Screen 10: Rebuild → Rohan satisfied
Screen 11: Construct summary — BKT comparison visible (2.6× faster)
Screen 12: Session summary — Chain Rule upgraded to Confident
Screen 13: Dashboard returns — rank projection improved slightly
Screen 14: Blueprint — show week 3, gap analysis
Screen 15: Switch to Track 2 tab → Code Editor, binary search debug
Screen 16: VN — Library Explorer, compose Feynman Loop vs Debug the Machine
```

---

*Document: content-structure | Version: 1.0 | Last updated: 2026-07-02*
*Read alongside: 12-design-spec.md (how it looks), 08-interfaces.md (construct design), 09-library.md (library)*
