# Users — Who We Are Building For, Who We Are Not, and When

---

## Why This Document Exists

Building for everyone means building for no one. Every product decision — what content to create, which constructs to prioritize, what the session looks like, how long it should be, what motivates the learner — depends on knowing exactly who is using it.

This document defines:
- The learner lifecycle (the full population of people who might ever use this)
- Who the primary user is now and why
- Who we are explicitly not building for now
- When each segment gets added and why that order

---

## The Learner Lifecycle

Every person who might use this platform falls somewhere on this path:

```
School (Class 1–5)
      ↓
School (Class 6–10) — foundational subjects, first real academic pressure
      ↓
Class 11–12 — subject specialization, major competitive exam prep begins
      ↓
Competitive Exams — JEE, NEET, CUET, board exams, entrance tests
      ↓
Degree (UG) — broad academic learning, some exam-focus (GATE, placements)
      ↓
      ├── Job Seeker — needs specific skills to get first job
      ├── Working Professional — wants to upskill or switch domains
      └── Post-grad / Research — wants deep knowledge, academic focus
```

And separately, cutting across all of these:

```
Intrinsic Learner — learns for genuine interest, no external goal
(can be at any stage of the lifecycle)
```

---

## The Two Core Axes

Every user sits on two spectrums:

**Axis 1: Goal**
```
EXAM-DRIVEN ←————————————————→ SKILL-DRIVEN ←——————————→ KNOWLEDGE-DRIVEN
(crack this test)          (get this job)          (understand this thing)
```

**Axis 2: Time Pressure**
```
HARD DEADLINE ←————————————————————————————→ NO DEADLINE
(exam in 6 months)                           (learning for life)
```

The three tracks map directly to positions on these axes:
- Track 0 (Knowledge): No deadline, knowledge-driven
- Track 1 (Competitive): Hard deadline, exam-driven
- Track 2 (Skill + Job): Soft deadline, skill-driven

---

## Primary User — Now

**The Serious 16–22 Year Old with a Real Goal**

### Profile

- Age: 16–22
- In: Class 11, Class 12, or first 2 years of college
- Location: India-primary (JEE/GATE/UPSC context), but subject content is universal
- Has a specific, real goal:
  - Track 0: "I want to genuinely understand calculus / CS / physics — not just pass it"
  - Track 1: "I need to crack JEE / GATE / board exam"
  - Track 2: "I need to be able to code well enough to get a job"
- Has 1–3 hours available per day for deliberate study
- Is frustrated with:
  - YouTube: too passive, no feedback, easy to zone out
  - Coaching factories: rigid, one-size-fits-all, treat students as batch not individuals
  - Existing apps: gamified to the point of being unserious, or so serious they feel like punishment
- Is motivated enough to start — doesn't need entertainment to engage
- Needs help sustaining effort without burning out

### Why This User

- **High pain, high stakes.** They have a real goal with real consequences. They will engage seriously.
- **Maps to all three tracks.** The 16–22 range covers competitive exam prep (11–12), subject mastery (all), and early career skill-building (degree + post-degree).
- **Willing to go deep.** Younger learners often want genuine mastery, not just the credential. This matches the product philosophy.
- **India is the right starting market.** 1.5M JEE aspirants per year. 200,000+ GATE candidates. Massive unmet need for adaptive, personalized preparation.
- **Not served well by current options.** Existing platforms either underprice (cheap content, no adaptation) or overprice (coaching centers that charge ₹1–2L with no personalization).

---

## Secondary Users — Later

These users are real, important, and will be added. But not now.

### Working Professional Seeking Upskilling (Track 2 extension)

**Who:** 25–40 year old professional wanting to switch domains or level up (software engineer moving to ML, finance analyst learning Python, marketer learning data analysis).

**What they need:** Skill track with compressed sessions (1 hour/day max), practical project-based proof of skill, certification that employers recognize.

**Why not now:** Different time constraints require a different session engine. Different motivation pattern (career ROI is the driver, not academic interest). Different content (more industry-practical, less theoretical). This is a Phase 4+ addition.

**When:** When the Skill + Job track (Track 2) is stable and validated with the primary user. The engine scales to this user without fundamental changes — just session length and content calibration.

---

### Class 6–10 Student

**Who:** 11–15 year old student building foundational subject knowledge.

**What they need:** Heavily different UX (more visual, shorter sessions, stronger gamification), parental involvement features, curriculum-aligned content (NCERT), safety/privacy layer (COPPA/DPDP compliance).

**Why not now:** This is a different product. The session length, motivation model, content presentation, and construct mix for a 12-year-old are categorically different from a 17-year-old. The construct philosophy (Feynman Loop, Tapas Mode, Socratic Pressure) is appropriate for mature learners who can handle abstract metacognition — not for early adolescents.

**When:** A separate product, built after the core platform is validated. Not a track extension — a new product.

---

### Graduate / Researcher

**Who:** 23–30 year old graduate student who wants very deep, domain-specific knowledge. Often already knows the basics — needs advanced material, primary source connection, research-level depth.

**What they need:** Depth beyond what the concept graph currently goes. Connection to research papers. Collaborative knowledge building. Peer discussion.

**Why not now:** Content requirements are extreme (research-level content for 5 subjects is beyond current scope). Audience is too small to justify. Motivation model is completely different (intrinsic, no external pressure, very self-directed).

**When:** Phase 6+. After the core platform is validated at scale.

---

### Teacher / Educator

**Who:** A teacher who wants to use the platform to assign adaptive content to their students, monitor class-level knowledge gaps, and personalize instruction.

**What they need:** Educator portal (assign, monitor, report), class-level X-Ray, ability to create or customize content sets.

**Why not now:** B2B product. Different buyer (institution, not individual). Different integration requirements. Different support needs.

**When:** Phase 6 — after platform layer exists and there's a critical mass of content worth assigning.

---

## Users We Are Never Building For (in this product)

| Segment | Why Not |
|---------|---------|
| **Casual learners** | The platform is built for deliberate, deep learning. Casual learners want low commitment, passive consumption, and immediate entertainment. Every design decision we make is the opposite of that. Building for them would compromise the product for serious learners. |
| **Non-STEM / non-subject domains** (cooking, fitness, personal development) | Different content models entirely. Not a platform that scales to arbitrary domains — it is specifically built for structured knowledge domains with clear concept graphs and objective answers. |
| **Enterprise / corporate L&D** | Very different buying cycle, different compliance needs, different learning context. Possible long-term, but a different company almost entirely. |

---

## The Job Seeker Sub-Segment — Important Nuance

The user identified this as critical: within Track 2, "job seeker" is not one person. It breaks into:

| Sub-type | What they want | Time available | Primary challenge |
|---------|---------------|----------------|------------------|
| **Recent graduate** | First job in chosen field | Lots (unemployed) | Don't know what employers actually want |
| **Career switcher** | Move from Field A to Field B | Limited (employed) | Building credibility in new domain while working |
| **Freelancer** | Enough skill to win gigs, not necessarily employed | Variable | Proving skill to strangers with no institutional backing |
| **Returning to workforce** | Re-skill after gap | Moderate | Confidence + current skill relevance |

All four want the same core product: learn skill → practice skill → prove skill → get opportunity. The session length and urgency vary. The Track 2 engine handles this by making session length learner-configured and opportunity matching query-based (what kind of opportunity: job / freelance / contract).

---

## User Definition Checklist for Every Product Decision

Before any major feature decision, run through this:

1. Which user is this for? (Primary / which secondary?)
2. Does this help that user's core goal, or is it cosmetic?
3. Does it compromise the experience for the primary user?
4. Is there a simpler version that solves 80% of the problem?
5. Do we have enough users of this type to validate it?

---

## What We Know About How Our User Studies

From the research documents (4 Stage folder):

- Working memory holds ~4 chunks simultaneously. Sessions that push beyond this cause cognitive overload, not learning.
- Spaced repetition with active retrieval (not re-reading) is the single highest-ROI learning activity.
- Intrinsic motivation (autonomy, competence, mastery) produces more durable learning than extrinsic (rewards, streaks, badges).
- The "2-sigma problem" (Bloom): one-on-one tutoring produces 2 standard deviation improvement over group instruction. Adaptive systems are the closest scalable approximation.
- Dopamine prediction error: reward comes from the moment of successful retrieval, not from completing a lesson. The system should create conditions for that moment.
- Flow state: challenge just above current ability, immediate feedback, clear goal. The session engine is designed to maintain this.

These are not abstract — every engine decision and construct choice references these findings.

---

*Document: users | Version: 1.0 | Last updated: 2026-06-25*
