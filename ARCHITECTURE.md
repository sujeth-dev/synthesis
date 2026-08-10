# Synaptic — Architecture

## Storage Backend

Synaptic uses Supabase as its application database.

```
User → Next.js → src/lib/db/index.ts (Supabase client) → Supabase Postgres
                 src/lib/db/auth.ts (bcryptjs + JWT)
                 src/lib/db/queries.ts (data access)
```

Required local environment variables are documented in `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The database schema is versioned in `supabase/migrations/`.

## Adaptive Engine

```
1. BKT (Bayesian Knowledge Tracing)
   - Tracks p_know per (learner × skill)
   - Updates after every attempt

2. SM-2 (Spaced Repetition)
   - Schedules review intervals
   - Syncs with BKT: mastery → longer intervals

3. Session Engine (4 priority levels)
   - P1: Overdue SM-2 reviews
   - P2: Frustrated → easy win
   - P3: Interleaving (avoid same skill 2× in last 5)
   - P4: Lowest p_know among learnable skills

4. Motivation FSM
   - States: neutral | winning | bored | frustrated
   - 10-minute cooldown between interventions

5. Graph Engine (Prerequisite DAG)
   - Kahn's topological sort
   - computeUnblocked() runs after each mastery event
```

## API Routes

| Route | Purpose |
|-------|---------|
| POST /api/auth/register | Create account (bcrypt + JWT) |
| POST /api/auth/login    | Login → sets httpOnly cookie |
| POST /api/auth/logout   | Clear session |
| GET  /api/auth/me       | Current user |
| POST /api/onboard       | Init motivation state |
| POST /api/diagnostic    | Run placement → init all 31 skill states |
| POST /api/session       | start / next / end study session |
| POST /api/attempt       | Submit answer (server-side verified) |
| GET  /api/explanation   | Get explanation for skill (after correct attempt) |
| GET  /api/graph         | All 31 nodes + 37 edges + per-user mastery states |

## UI Routes

| Route      | Purpose |
|------------|---------|
| /dashboard | Skill list grouped by phase with mastery bars |
| /graph     | Interactive SVG prerequisite graph (click to explore) |
| /learn     | Adaptive study session (question → feedback → explanation) |
| /profile   | Analytics: heatmap, top skills, session history |
