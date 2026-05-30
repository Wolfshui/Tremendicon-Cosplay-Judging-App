# Tremendicon Cosplay Judging App (MVP Foundation)

Cloudflare Worker + D1 MVP for managing cosplay tournaments with administrator, judge, and contestant flows.

## Stack

- JavaScript Worker app
- Cloudflare Wrangler workflow
- D1 (SQLite) schema + seed data

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Apply local migrations:
   ```bash
   npm run db:migrate
   ```
3. Seed demo data:
   ```bash
   npm run db:seed
   ```
4. Run locally:
   ```bash
   npm run dev
   ```

## Demo accounts

- Admin: `admin@tremendicon.test` / `admin123`
- Judge: `judge@tremendicon.test` / `judge123`
- Contestant: `contestant@tremendicon.test` / `contestant123`

## Included MVP capabilities

- Role model and basic auth (`admin`, `judge`, `contestant`) with session tokens
- Event/competition/round data model (one event with multiple competitions)
- Competition activation, feedback publication setting, and moderation toggle support
- Structured form builder (required/optional, ordering, visibility, multiple field types including external/media links and consent)
- Contestant submission flow with review + final lock on submit
- Private contestant results access via:
  - authenticated contestant endpoint
  - unique private token URL endpoint
- Judge assignment by competition and/or round
- Judge contestant search by contestant number or name
- Scoring on 1–20 scale with equal-average leaderboard calculations
- Private judge notes + contestant-visible feedback fields
- Schedule slots (admin-created) + contestant reservation (hybrid model)
- Admin dashboard summaries (totals, per-round stats, judge progress, average score, no-show count)
- CSV exports:
  - contestants
  - scores
  - schedule
- Notification template scaffolding and queued notification records for:
  - application received
  - schedule assigned
  - feedback published
  - password reset
- Audit logging for important admin actions and progression/status changes
- Import scaffolding endpoint for future CSV import implementation

## Database files

- Migration: `/db/migrations/0001_initial.sql`
- Seed: `/db/seed.sql`

## API highlights

- Public:
  - `GET /`
  - `GET /events/:eventSlug`
  - `GET /events/:eventSlug/competitions/:competitionSlug`
- Auth:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `POST /auth/password-reset`
- Contestant:
  - `GET /contestant/form-fields?competitionId=:id`
  - `POST /competitions/:competitionId/apply`
  - `GET /entries/:entryId/review`
  - `POST /entries/:entryId/submit`
  - `GET /contestant/results/:entryId`
  - `GET /results/:privateToken`
  - `GET /contestant/schedule`
  - `POST /slots/:slotId/reserve`
- Judge:
  - `GET /judge/contestants?competitionId=:id&roundId=:id&q=:search`
  - `POST /judge/scores`
  - `GET /judge/leaderboard?competitionId=:id&roundId=:id`
  - `GET /judge/schedule?competitionId=:id`
- Admin:
  - `POST /admin/events`
  - `POST /admin/competitions`
  - `POST /admin/rounds`
  - `POST /admin/form-fields`
  - `POST /admin/rubric-categories`
  - `POST /admin/consent-items`
  - `POST /admin/schedule-slots`
  - `POST /admin/judge-assignments`
  - `POST /admin/messages`
  - `POST /admin/email-templates`
  - `POST /admin/event-settings`
  - `POST /admin/entries/:entryId/advancement`
  - `POST /admin/entries/:entryId/status`
  - `POST /admin/feedback-publication/:competitionId`
  - `GET /admin/dashboard?eventId=:id`
  - `GET /admin/schedule?competitionId=:id`
  - `GET /admin/export/contestants.csv?competitionId=:id`
  - `GET /admin/export/scores.csv?competitionId=:id`
  - `GET /admin/export/schedule.csv?competitionId=:id`
  - `POST /admin/import/contestants` (scaffold/TODO)

## Testing

Run:

```bash
npm test
```