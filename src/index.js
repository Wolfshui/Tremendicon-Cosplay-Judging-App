const SESSION_DAYS = 7;
const PASSWORD_ITERATIONS = 120000;

const ALLOWED_FIELD_TYPES = new Set([
  'short_text',
  'long_text',
  'multiple_choice',
  'checkbox_list',
  'numeric',
  'date_time',
  'external_link',
  'media_link',
  'consent_checkbox',
  'social_links'
]);

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status);
      }
      console.error(error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  }
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'GET' && pathname === '/') return renderHome(env);
  if (request.method === 'GET' && matchPath(pathname, '/events/:eventSlug')) {
    const { eventSlug } = extractPathParams(pathname, '/events/:eventSlug');
    return getPublicEventPage(env, eventSlug);
  }
  if (request.method === 'GET' && matchPath(pathname, '/events/:eventSlug/competitions/:competitionSlug')) {
    const { eventSlug, competitionSlug } = extractPathParams(pathname, '/events/:eventSlug/competitions/:competitionSlug');
    return getPublicCompetitionPage(env, eventSlug, competitionSlug);
  }

  if (request.method === 'POST' && pathname === '/auth/register') return registerContestant(request, env);
  if (request.method === 'POST' && pathname === '/auth/login') return login(request, env);
  if (request.method === 'POST' && pathname === '/auth/logout') return logout(request, env);
  if (request.method === 'POST' && pathname === '/auth/password-reset') return requestPasswordReset(request, env);

  if (request.method === 'GET' && pathname === '/me') {
    const user = await requireAuth(request, env);
    return jsonResponse({ user });
  }

  if (request.method === 'GET' && pathname === '/contestant/form-fields') {
    const user = await requireRole(request, env, ['contestant']);
    const competitionId = Number(url.searchParams.get('competitionId'));
    return getContestantFormFields(env, user, competitionId);
  }

  if (request.method === 'POST' && matchPath(pathname, '/competitions/:competitionId/apply')) {
    const user = await requireRole(request, env, ['contestant']);
    const { competitionId } = extractPathParams(pathname, '/competitions/:competitionId/apply');
    return saveApplicationDraft(request, env, user, Number(competitionId));
  }

  if (request.method === 'POST' && matchPath(pathname, '/entries/:entryId/submit')) {
    const user = await requireRole(request, env, ['contestant']);
    const { entryId } = extractPathParams(pathname, '/entries/:entryId/submit');
    return submitEntry(env, user, Number(entryId));
  }

  if (request.method === 'GET' && matchPath(pathname, '/entries/:entryId/review')) {
    const user = await requireRole(request, env, ['contestant']);
    const { entryId } = extractPathParams(pathname, '/entries/:entryId/review');
    return reviewEntry(env, user, Number(entryId));
  }

  if (request.method === 'GET' && matchPath(pathname, '/results/:privateToken')) {
    const { privateToken } = extractPathParams(pathname, '/results/:privateToken');
    return getPrivateResultsByToken(env, privateToken);
  }

  if (request.method === 'GET' && matchPath(pathname, '/contestant/results/:entryId')) {
    const user = await requireRole(request, env, ['contestant']);
    const { entryId } = extractPathParams(pathname, '/contestant/results/:entryId');
    return getContestantResultsByAuth(env, user, Number(entryId));
  }

  if (request.method === 'GET' && pathname === '/contestant/schedule') {
    const user = await requireRole(request, env, ['contestant']);
    return getContestantSchedule(env, user);
  }

  if (request.method === 'POST' && matchPath(pathname, '/slots/:slotId/reserve')) {
    const user = await requireRole(request, env, ['contestant']);
    const { slotId } = extractPathParams(pathname, '/slots/:slotId/reserve');
    return reserveScheduleSlot(request, env, user, Number(slotId));
  }

  if (request.method === 'GET' && pathname === '/judge/contestants') {
    const user = await requireRole(request, env, ['judge', 'admin']);
    return judgeSearchContestants(url, env, user);
  }

  if (request.method === 'POST' && pathname === '/judge/scores') {
    const user = await requireRole(request, env, ['judge', 'admin']);
    return upsertScore(request, env, user);
  }

  if (request.method === 'GET' && pathname === '/judge/leaderboard') {
    const user = await requireRole(request, env, ['judge', 'admin']);
    return getLeaderboard(url, env, user);
  }

  if (request.method === 'GET' && pathname === '/judge/schedule') {
    const user = await requireRole(request, env, ['judge', 'admin']);
    return getJudgeSchedule(url, env, user);
  }

  if (pathname.startsWith('/admin/')) {
    const user = await requireRole(request, env, ['admin']);
    return adminRoute(request, env, user, pathname, url);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

async function adminRoute(request, env, user, pathname, url) {
  if (request.method === 'POST' && pathname === '/admin/events') return upsertEvent(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/competitions') return upsertCompetition(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/rounds') return upsertRound(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/form-fields') return upsertFormField(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/rubric-categories') return upsertRubricCategory(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/consent-items') return upsertConsentItem(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/schedule-slots') return createScheduleSlot(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/judge-assignments') return assignJudge(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/messages') return createAdminMessage(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/email-templates') return upsertEmailTemplate(request, env, user);
  if (request.method === 'POST' && pathname === '/admin/event-settings') return updateEventSettings(request, env, user);
  if (request.method === 'GET' && pathname === '/admin/dashboard') return getAdminDashboard(url, env);
  if (request.method === 'GET' && pathname === '/admin/schedule') return getAdminSchedule(url, env);

  if (request.method === 'POST' && matchPath(pathname, '/admin/entries/:entryId/advancement')) {
    const { entryId } = extractPathParams(pathname, '/admin/entries/:entryId/advancement');
    return setEntryAdvancement(request, env, user, Number(entryId));
  }

  if (request.method === 'POST' && matchPath(pathname, '/admin/entries/:entryId/status')) {
    const { entryId } = extractPathParams(pathname, '/admin/entries/:entryId/status');
    return setEntryStatus(request, env, user, Number(entryId));
  }

  if (request.method === 'POST' && matchPath(pathname, '/admin/feedback-publication/:competitionId')) {
    const { competitionId } = extractPathParams(pathname, '/admin/feedback-publication/:competitionId');
    return setFeedbackPublication(request, env, user, Number(competitionId));
  }

  if (request.method === 'GET' && pathname === '/admin/export/contestants.csv') return exportContestants(url, env);
  if (request.method === 'GET' && pathname === '/admin/export/scores.csv') return exportScores(url, env);
  if (request.method === 'GET' && pathname === '/admin/export/schedule.csv') return exportSchedule(url, env);

  if (request.method === 'POST' && pathname === '/admin/import/contestants') {
    return jsonResponse({
      message: 'Import scaffolding is present but full CSV import processing is intentionally deferred in MVP.',
      todo: 'Parse CSV rows and upsert users/contestants in a future iteration.'
    });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

async function renderHome(env) {
  const events = await env.DB.prepare(
    `SELECT e.id, e.name, e.slug, e.description,
      (SELECT COUNT(*) FROM competitions c WHERE c.event_id = e.id AND c.is_active = 1) AS active_competitions
     FROM events e
     WHERE e.is_public = 1
     ORDER BY e.created_at DESC`
  ).all();

  const items = (events.results || []).map((event) =>
    `<li><a href="/events/${escapeHtml(event.slug)}">${escapeHtml(event.name)}</a> - ${escapeHtml(event.description || '')} (${event.active_competitions} active competitions)</li>`
  ).join('');

  return new Response(`<!doctype html>
<html><head><meta charset="utf-8" /><title>Tremendicon Cosplay Judging MVP</title></head>
<body>
  <h1>Tremendicon Cosplay Judging MVP</h1>
  <p>Public event directory with role-based API endpoints for admin, judges, and contestants.</p>
  <h2>Events</h2>
  <ul>${items || '<li>No public events yet.</li>'}</ul>
</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

async function getPublicEventPage(env, eventSlug) {
  const event = await env.DB.prepare('SELECT * FROM events WHERE slug = ? AND is_public = 1').bind(eventSlug).first();
  if (!event) return jsonResponse({ error: 'Event not found' }, 404);

  const competitions = await env.DB.prepare(
    'SELECT id, name, slug, division, is_active, deadline FROM competitions WHERE event_id = ? ORDER BY name'
  ).bind(event.id).all();

  return jsonResponse({
    event: normalizeEvent(event),
    competitions: competitions.results || []
  });
}

async function getPublicCompetitionPage(env, eventSlug, competitionSlug) {
  const competition = await env.DB.prepare(
    `SELECT c.*, e.name AS event_name, e.slug AS event_slug
     FROM competitions c
     JOIN events e ON e.id = c.event_id
     WHERE e.slug = ? AND c.slug = ? AND e.is_public = 1`
  ).bind(eventSlug, competitionSlug).first();

  if (!competition) return jsonResponse({ error: 'Competition not found' }, 404);

  const rounds = await env.DB.prepare(
    'SELECT id, name, round_number FROM rounds WHERE competition_id = ? ORDER BY round_number'
  ).bind(competition.id).all();

  return jsonResponse({
    competition: normalizeCompetition(competition),
    rounds: rounds.results || []
  });
}

async function registerContestant(request, env) {
  const payload = await parseJsonBody(request);
  const email = normalizeEmail(payload.email);
  const password = payload.password;
  const displayName = (payload.displayName || '').trim();

  if (!email || !password || password.length < 8 || !displayName) {
    return jsonResponse({ error: 'email, password (min 8), and displayName are required' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return jsonResponse({ error: 'Email already registered' }, 409);

  const passwordSalt = generatePasswordSalt();
  const passwordHash = await hashPassword(password, passwordSalt);
  const result = await env.DB.prepare(
    'INSERT INTO users (email, password_salt, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)'
  ).bind(email, passwordSalt, passwordHash, 'contestant', displayName).run();

  const userId = result.meta.last_row_id;
  await ensureContestantProfile(env, userId);
  await logAudit(env, { actorUserId: userId, action: 'contestant_registered', targetType: 'user', targetId: String(userId), details: { email } });

  const sessionToken = await createSession(env, userId);
  return jsonResponse({ message: 'Registered', sessionToken }, 201, { 'set-cookie': buildSessionCookie(sessionToken) });
}

async function login(request, env) {
  const payload = await parseJsonBody(request);
  const email = normalizeEmail(payload.email);
  const password = payload.password;
  if (!email || !password) return jsonResponse({ error: 'email and password are required' }, 400);

  const user = await env.DB.prepare('SELECT id, email, password_salt, password_hash, role, display_name, is_active FROM users WHERE email = ?').bind(email).first();
  if (!user || !user.is_active) return jsonResponse({ error: 'Invalid credentials' }, 401);

  const passwordHash = await hashPassword(password, user.password_salt);
  if (passwordHash !== user.password_hash) return jsonResponse({ error: 'Invalid credentials' }, 401);

  const sessionToken = await createSession(env, user.id);
  return jsonResponse(
    { message: 'Logged in', sessionToken, user: sanitizeUser(user) },
    200,
    { 'set-cookie': buildSessionCookie(sessionToken) }
  );
}

async function logout(request, env) {
  const token = getSessionTokenFromRequest(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return jsonResponse({ message: 'Logged out' }, 200, { 'set-cookie': 'session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' });
}

async function requestPasswordReset(request, env) {
  const payload = await parseJsonBody(request);
  const email = normalizeEmail(payload.email);
  if (!email) return jsonResponse({ error: 'email is required' }, 400);

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (user) {
    await env.DB.prepare(
      `INSERT INTO notifications (user_id, template_key, payload_json, status)
       VALUES (?, 'password_reset', ?, 'queued')`
    ).bind(user.id, JSON.stringify({ email, reset_link: 'TODO: integrate reset provider' })).run();
  }

  return jsonResponse({ message: 'If the account exists, a password reset notification has been queued.' });
}

async function getContestantFormFields(env, _user, competitionId) {
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  const competition = await env.DB.prepare('SELECT id, name, is_active FROM competitions WHERE id = ?').bind(competitionId).first();
  if (!competition || !competition.is_active) return jsonResponse({ error: 'Competition unavailable' }, 404);

  const fields = await env.DB.prepare(
    `SELECT id, field_key, label, field_type, options_json, is_required, is_visible, display_order, help_text
     FROM form_fields
     WHERE competition_id = ? AND is_visible = 1
     ORDER BY display_order, id`
  ).bind(competitionId).all();

  const consents = await env.DB.prepare(
    `SELECT ci.id, ci.consent_type, ci.label, ci.is_required
     FROM consent_items ci
     JOIN events e ON e.id = ci.event_id
     JOIN competitions c ON c.event_id = e.id
     WHERE c.id = ? AND ci.is_enabled = 1
     ORDER BY ci.display_order, ci.id`
  ).bind(competitionId).all();

  return jsonResponse({ competition, fields: parseJsonColumns(fields.results || [], ['options_json']), consents: consents.results || [] });
}

async function saveApplicationDraft(request, env, user, competitionId) {
  const payload = await parseJsonBody(request);
  const submission = payload.submission || {};
  const consents = payload.consents || {};

  const contestant = await ensureContestantProfile(env, user.id);
  const competition = await env.DB.prepare(
    `SELECT c.id, c.event_id, c.is_active, e.moderation_enabled
     FROM competitions c
     JOIN events e ON e.id = c.event_id
     WHERE c.id = ?`
  ).bind(competitionId).first();

  if (!competition || !competition.is_active) return jsonResponse({ error: 'Competition unavailable' }, 404);

  const existing = await env.DB.prepare('SELECT id, is_locked FROM entries WHERE competition_id = ? AND contestant_id = ?').bind(competitionId, contestant.id).first();
  if (existing && existing.is_locked) return jsonResponse({ error: 'Submission is locked and cannot be changed' }, 409);

  const status = competition.moderation_enabled ? 'pending_review' : 'draft';
  const privateToken = `entry-${randomToken()}`;

  let entryId = existing?.id;
  if (existing) {
    await env.DB.prepare(
      'UPDATE entries SET submission_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(JSON.stringify(submission), status, existing.id).run();
  } else {
    const insert = await env.DB.prepare(
      `INSERT INTO entries (competition_id, contestant_id, status, submission_json, private_results_token)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(competitionId, contestant.id, status, JSON.stringify(submission), privateToken).run();
    entryId = insert.meta.last_row_id;
  }

  await persistSubmissionConsents(env, entryId, consents);

  await env.DB.prepare(
    `INSERT INTO notifications (event_id, competition_id, entry_id, user_id, template_key, payload_json, status)
     VALUES (?, ?, ?, ?, 'application_received', ?, 'queued')`
  ).bind(
    competition.event_id,
    competitionId,
    entryId,
    user.id,
    JSON.stringify({ competitionId, contestantId: contestant.id })
  ).run();

  return jsonResponse({
    message: 'Draft saved. Review before final submit (submission locks after submit).',
    entryId,
    reviewUrl: `/entries/${entryId}/review`,
    warning: 'Once submitted, this entry cannot be changed.'
  });
}

async function submitEntry(env, user, entryId) {
  const entry = await env.DB.prepare(
    `SELECT e.id, e.status, e.is_locked
     FROM entries e
     JOIN contestants c ON c.id = e.contestant_id
     WHERE e.id = ? AND c.user_id = ?`
  ).bind(entryId, user.id).first();

  if (!entry) return jsonResponse({ error: 'Entry not found' }, 404);
  if (entry.is_locked) return jsonResponse({ error: 'Entry already submitted and locked' }, 409);

  await env.DB.prepare(
    `UPDATE entries
     SET is_locked = 1,
         status = 'submitted',
         submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(entryId).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'entry_submitted',
    targetType: 'entry',
    targetId: String(entryId),
    details: { statusBefore: entry.status }
  });

  return jsonResponse({ message: 'Submission finalized and locked', entryId });
}

async function reviewEntry(env, user, entryId) {
  const entry = await env.DB.prepare(
    `SELECT e.id, e.status, e.is_locked, e.submission_json, e.private_results_token,
            c.name AS competition_name
     FROM entries e
     JOIN contestants ct ON ct.id = e.contestant_id
     JOIN competitions c ON c.id = e.competition_id
     WHERE e.id = ? AND ct.user_id = ?`
  ).bind(entryId, user.id).first();

  if (!entry) return jsonResponse({ error: 'Entry not found' }, 404);

  return jsonResponse({
    entry: {
      id: entry.id,
      status: entry.status,
      isLocked: Boolean(entry.is_locked),
      competitionName: entry.competition_name,
      submission: safeParse(entry.submission_json),
      privateResultsUrl: `/results/${entry.private_results_token}`
    },
    warning: 'Final submit will permanently lock this submission.'
  });
}

async function getPrivateResultsByToken(env, privateToken) {
  const entry = await env.DB.prepare(
    `SELECT e.id, e.status, e.is_advancing,
            c.name AS competition_name, c.feedback_visible,
            r.id AS round_id, r.name AS round_name,
            ct.contestant_number
     FROM entries e
     JOIN competitions c ON c.id = e.competition_id
     JOIN contestants ct ON ct.id = e.contestant_id
     LEFT JOIN rounds r ON r.competition_id = c.id
     WHERE e.private_results_token = ?
     ORDER BY r.round_number`
  ).bind(privateToken).all();

  if (!(entry.results || []).length) return jsonResponse({ error: 'Result link not found' }, 404);

  const first = entry.results[0];
  const scoring = await getEntryScores(env, first.id, first.feedback_visible === 1);

  return jsonResponse({
    entryId: first.id,
    contestantNumber: first.contestant_number,
    competitionName: first.competition_name,
    status: first.status,
    isAdvancing: Boolean(first.is_advancing),
    rounds: dedupeRounds(entry.results || []),
    scoring
  });
}

async function getContestantResultsByAuth(env, user, entryId) {
  const entry = await env.DB.prepare(
    `SELECT e.private_results_token
     FROM entries e
     JOIN contestants c ON c.id = e.contestant_id
     WHERE e.id = ? AND c.user_id = ?`
  ).bind(entryId, user.id).first();

  if (!entry) return jsonResponse({ error: 'Result not found' }, 404);
  return getPrivateResultsByToken(env, entry.private_results_token);
}

async function getContestantSchedule(env, user) {
  const rows = await env.DB.prepare(
    `SELECT e.id AS entry_id, c.name AS competition_name, s.id AS slot_id,
            s.check_in_time, s.judging_time, s.location, s.buffer_minutes
     FROM entries e
     JOIN contestants ct ON ct.id = e.contestant_id
     LEFT JOIN schedule_reservations sr ON sr.entry_id = e.id
     LEFT JOIN schedule_slots s ON s.id = sr.slot_id
     JOIN competitions c ON c.id = e.competition_id
     WHERE ct.user_id = ?
     ORDER BY s.judging_time`
  ).bind(user.id).all();

  return jsonResponse({ schedule: rows.results || [] });
}

async function reserveScheduleSlot(request, env, user, slotId) {
  const payload = await parseJsonBody(request);
  const entryId = Number(payload.entryId);
  if (!entryId) return jsonResponse({ error: 'entryId is required' }, 400);

  const ownEntry = await env.DB.prepare(
    `SELECT e.id
     FROM entries e
     JOIN contestants c ON c.id = e.contestant_id
     WHERE e.id = ? AND c.user_id = ?`
  ).bind(entryId, user.id).first();
  if (!ownEntry) return jsonResponse({ error: 'Entry not found' }, 404);

  const slot = await env.DB.prepare('SELECT id, capacity, competition_id FROM schedule_slots WHERE id = ?').bind(slotId).first();
  if (!slot) return jsonResponse({ error: 'Slot not found' }, 404);

  const occupancy = await env.DB.prepare('SELECT COUNT(*) AS count FROM schedule_reservations WHERE slot_id = ?').bind(slotId).first();
  if ((occupancy?.count || 0) >= slot.capacity) return jsonResponse({ error: 'Slot is full' }, 409);

  const entryCompetition = await env.DB.prepare('SELECT competition_id FROM entries WHERE id = ?').bind(entryId).first();
  if (entryCompetition.competition_id !== slot.competition_id) return jsonResponse({ error: 'Slot must match entry competition' }, 400);

  await env.DB.prepare('DELETE FROM schedule_reservations WHERE entry_id = ?').bind(entryId).run();
  await env.DB.prepare('INSERT INTO schedule_reservations (slot_id, entry_id) VALUES (?, ?)').bind(slotId, entryId).run();

  await env.DB.prepare(
    `INSERT INTO notifications (competition_id, entry_id, user_id, template_key, payload_json, status)
     VALUES (?, ?, ?, 'schedule_assigned', ?, 'queued')`
  ).bind(slot.competition_id, entryId, user.id, JSON.stringify({ slotId })).run();

  return jsonResponse({ message: 'Schedule slot reserved', slotId, entryId });
}

async function judgeSearchContestants(url, env, user) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  const roundId = Number(url.searchParams.get('roundId') || 0) || null;
  const query = (url.searchParams.get('q') || '').trim();

  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);
  if (!(await canJudgeCompetitionRound(env, user, competitionId, roundId))) return jsonResponse({ error: 'Access denied for this scope' }, 403);

  const rows = await env.DB.prepare(
    `SELECT e.id AS entry_id, ct.contestant_number, u.display_name, e.status, e.is_advancing
     FROM entries e
     JOIN contestants ct ON ct.id = e.contestant_id
     JOIN users u ON u.id = ct.user_id
     WHERE e.competition_id = ?
       AND (ct.contestant_number LIKE ? OR u.display_name LIKE ?)
     ORDER BY ct.contestant_number`
  ).bind(competitionId, `%${query}%`, `%${query}%`).all();

  return jsonResponse({ contestants: rows.results || [] });
}

async function upsertScore(request, env, user) {
  const payload = await parseJsonBody(request);
  const entryId = Number(payload.entryId);
  const roundId = Number(payload.roundId);
  const categoryId = Number(payload.categoryId);
  const numericScore = Number(payload.score);

  if (!entryId || !roundId || !categoryId || Number.isNaN(numericScore)) {
    return jsonResponse({ error: 'entryId, roundId, categoryId and score are required' }, 400);
  }
  if (numericScore < 1 || numericScore > 20) return jsonResponse({ error: 'score must be between 1 and 20' }, 400);

  const entry = await env.DB.prepare('SELECT competition_id FROM entries WHERE id = ?').bind(entryId).first();
  if (!entry) return jsonResponse({ error: 'Entry not found' }, 404);

  if (!(await canJudgeCompetitionRound(env, user, entry.competition_id, roundId))) {
    return jsonResponse({ error: 'Access denied for this scope' }, 403);
  }

  const category = await env.DB.prepare('SELECT id FROM rubric_categories WHERE id = ? AND competition_id = ?').bind(categoryId, entry.competition_id).first();
  if (!category) return jsonResponse({ error: 'Category not found for competition' }, 404);

  await env.DB.prepare(
    `INSERT INTO scores (entry_id, round_id, judge_user_id, category_id, score, private_note, public_feedback)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_id, round_id, judge_user_id, category_id)
     DO UPDATE SET score = excluded.score,
                   private_note = excluded.private_note,
                   public_feedback = excluded.public_feedback,
                   updated_at = CURRENT_TIMESTAMP`
  ).bind(
    entryId,
    roundId,
    user.id,
    categoryId,
    numericScore,
    payload.privateNote || null,
    payload.publicFeedback || null
  ).run();

  return jsonResponse({ message: 'Score saved' });
}

async function getLeaderboard(url, env, user) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  const roundId = Number(url.searchParams.get('roundId') || 0) || null;

  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);
  if (!(await canJudgeCompetitionRound(env, user, competitionId, roundId))) return jsonResponse({ error: 'Access denied for this scope' }, 403);

  const rows = await env.DB.prepare(
    `SELECT e.id AS entry_id,
            ct.contestant_number,
            u.display_name AS contestant_name,
            e.is_advancing,
            ROUND(AVG(s.score), 2) AS average_score,
            COUNT(DISTINCT s.judge_user_id) AS judges_scored
     FROM entries e
     JOIN contestants ct ON ct.id = e.contestant_id
     JOIN users u ON u.id = ct.user_id
     LEFT JOIN scores s ON s.entry_id = e.id AND (? IS NULL OR s.round_id = ?)
     WHERE e.competition_id = ?
     GROUP BY e.id, ct.contestant_number, u.display_name, e.is_advancing
     ORDER BY average_score DESC, ct.contestant_number ASC`
  ).bind(roundId, roundId, competitionId).all();

  return jsonResponse({ leaderboard: addRanks(rows.results || []) });
}

async function getJudgeSchedule(url, env, user) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  if (!(await canJudgeCompetitionRound(env, user, competitionId, null))) {
    return jsonResponse({ error: 'Access denied for this competition' }, 403);
  }

  const rows = await env.DB.prepare(
    `SELECT s.id AS slot_id, s.round_id, s.check_in_time, s.judging_time, s.location, s.buffer_minutes,
            ct.contestant_number, u.display_name AS contestant_name
     FROM schedule_slots s
     LEFT JOIN schedule_reservations sr ON sr.slot_id = s.id
     LEFT JOIN entries e ON e.id = sr.entry_id
     LEFT JOIN contestants ct ON ct.id = e.contestant_id
     LEFT JOIN users u ON u.id = ct.user_id
     WHERE s.competition_id = ?
     ORDER BY s.judging_time`
  ).bind(competitionId).all();

  return jsonResponse({ schedule: rows.results || [] });
}

async function upsertEvent(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.name || !payload.slug) return jsonResponse({ error: 'name and slug are required' }, 400);

  if (payload.id) {
    await env.DB.prepare(
      `UPDATE events
       SET name = ?, slug = ?, description = ?, home_content_json = ?, navigation_json = ?, branding_json = ?,
           moderation_enabled = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      payload.name,
      payload.slug,
      payload.description || null,
      JSON.stringify(payload.homeContent || {}),
      JSON.stringify(payload.navigation || []),
      JSON.stringify(payload.branding || {}),
      payload.moderationEnabled ? 1 : 0,
      payload.isPublic === false ? 0 : 1,
      payload.id
    ).run();

    await logAudit(env, { actorUserId: user.id, action: 'event_updated', eventId: payload.id, targetType: 'event', targetId: String(payload.id), details: payload });
    return jsonResponse({ message: 'Event updated', eventId: payload.id });
  }

  const result = await env.DB.prepare(
    `INSERT INTO events (name, slug, description, home_content_json, navigation_json, branding_json, moderation_enabled, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    payload.name,
    payload.slug,
    payload.description || null,
    JSON.stringify(payload.homeContent || {}),
    JSON.stringify(payload.navigation || []),
    JSON.stringify(payload.branding || {}),
    payload.moderationEnabled ? 1 : 0,
    payload.isPublic === false ? 0 : 1
  ).run();

  const eventId = result.meta.last_row_id;
  await logAudit(env, { actorUserId: user.id, action: 'event_created', eventId, targetType: 'event', targetId: String(eventId), details: payload });
  return jsonResponse({ message: 'Event created', eventId }, 201);
}

async function upsertCompetition(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.eventId || !payload.name || !payload.slug || !payload.division) {
    return jsonResponse({ error: 'eventId, name, slug and division are required' }, 400);
  }

  if (payload.id) {
    await env.DB.prepare(
      `UPDATE competitions
       SET event_id = ?, name = ?, slug = ?, division = ?, is_active = ?, feedback_visible = ?,
           public_content_json = ?, rules_content = ?, prizes_content = ?, deadline = ?, faq_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      payload.eventId,
      payload.name,
      payload.slug,
      payload.division,
      payload.isActive === false ? 0 : 1,
      payload.feedbackVisible ? 1 : 0,
      JSON.stringify(payload.publicContent || {}),
      payload.rulesContent || '',
      payload.prizesContent || '',
      payload.deadline || null,
      JSON.stringify(payload.faq || []),
      payload.id
    ).run();

    await logAudit(env, {
      actorUserId: user.id,
      action: 'competition_updated',
      eventId: payload.eventId,
      competitionId: payload.id,
      targetType: 'competition',
      targetId: String(payload.id),
      details: payload
    });
    return jsonResponse({ message: 'Competition updated', competitionId: payload.id });
  }

  const insert = await env.DB.prepare(
    `INSERT INTO competitions (event_id, name, slug, division, is_active, feedback_visible, public_content_json, rules_content, prizes_content, deadline, faq_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    payload.eventId,
    payload.name,
    payload.slug,
    payload.division,
    payload.isActive === false ? 0 : 1,
    payload.feedbackVisible ? 1 : 0,
    JSON.stringify(payload.publicContent || {}),
    payload.rulesContent || '',
    payload.prizesContent || '',
    payload.deadline || null,
    JSON.stringify(payload.faq || [])
  ).run();

  const competitionId = insert.meta.last_row_id;
  await logAudit(env, {
    actorUserId: user.id,
    action: 'competition_created',
    eventId: payload.eventId,
    competitionId,
    targetType: 'competition',
    targetId: String(competitionId),
    details: payload
  });

  return jsonResponse({ message: 'Competition created', competitionId }, 201);
}

async function upsertRound(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.competitionId || !payload.name || !payload.roundNumber) {
    return jsonResponse({ error: 'competitionId, name and roundNumber are required' }, 400);
  }

  if (payload.id) {
    await env.DB.prepare(
      'UPDATE rounds SET competition_id = ?, name = ?, round_number = ?, is_active = ? WHERE id = ?'
    ).bind(payload.competitionId, payload.name, payload.roundNumber, payload.isActive === false ? 0 : 1, payload.id).run();
    return jsonResponse({ message: 'Round updated', roundId: payload.id });
  }

  const insert = await env.DB.prepare(
    'INSERT INTO rounds (competition_id, name, round_number, is_active) VALUES (?, ?, ?, ?)'
  ).bind(payload.competitionId, payload.name, payload.roundNumber, payload.isActive === false ? 0 : 1).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'round_created',
    competitionId: payload.competitionId,
    targetType: 'round',
    targetId: String(insert.meta.last_row_id),
    details: payload
  });

  return jsonResponse({ message: 'Round created', roundId: insert.meta.last_row_id }, 201);
}

async function upsertFormField(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.competitionId || !payload.fieldKey || !payload.label || !payload.fieldType) {
    return jsonResponse({ error: 'competitionId, fieldKey, label, fieldType are required' }, 400);
  }

  if (!ALLOWED_FIELD_TYPES.has(payload.fieldType)) {
    return jsonResponse({ error: `fieldType must be one of: ${[...ALLOWED_FIELD_TYPES].join(', ')}` }, 400);
  }

  const optionsJson = payload.options ? JSON.stringify(payload.options) : null;

  if (payload.id) {
    await env.DB.prepare(
      `UPDATE form_fields
       SET competition_id = ?, field_key = ?, label = ?, field_type = ?, options_json = ?,
           is_required = ?, is_visible = ?, display_order = ?, help_text = ?
       WHERE id = ?`
    ).bind(
      payload.competitionId,
      payload.fieldKey,
      payload.label,
      payload.fieldType,
      optionsJson,
      payload.isRequired ? 1 : 0,
      payload.isVisible === false ? 0 : 1,
      payload.displayOrder || 0,
      payload.helpText || null,
      payload.id
    ).run();
    return jsonResponse({ message: 'Form field updated', formFieldId: payload.id });
  }

  const insert = await env.DB.prepare(
    `INSERT INTO form_fields (competition_id, field_key, label, field_type, options_json, is_required, is_visible, display_order, help_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    payload.competitionId,
    payload.fieldKey,
    payload.label,
    payload.fieldType,
    optionsJson,
    payload.isRequired ? 1 : 0,
    payload.isVisible === false ? 0 : 1,
    payload.displayOrder || 0,
    payload.helpText || null
  ).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'form_field_created',
    competitionId: payload.competitionId,
    targetType: 'form_field',
    targetId: String(insert.meta.last_row_id),
    details: payload
  });

  return jsonResponse({ message: 'Form field created', formFieldId: insert.meta.last_row_id }, 201);
}

async function upsertRubricCategory(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.competitionId || !payload.name) return jsonResponse({ error: 'competitionId and name are required' }, 400);

  if (payload.id) {
    await env.DB.prepare(
      'UPDATE rubric_categories SET competition_id = ?, name = ?, description = ?, display_order = ? WHERE id = ?'
    ).bind(payload.competitionId, payload.name, payload.description || null, payload.displayOrder || 0, payload.id).run();
    return jsonResponse({ message: 'Rubric category updated', categoryId: payload.id });
  }

  const insert = await env.DB.prepare(
    'INSERT INTO rubric_categories (competition_id, name, description, display_order) VALUES (?, ?, ?, ?)'
  ).bind(payload.competitionId, payload.name, payload.description || null, payload.displayOrder || 0).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'rubric_category_created',
    competitionId: payload.competitionId,
    targetType: 'rubric_category',
    targetId: String(insert.meta.last_row_id),
    details: payload
  });

  return jsonResponse({ message: 'Rubric category created', categoryId: insert.meta.last_row_id }, 201);
}

async function upsertConsentItem(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.eventId || !payload.consentType || !payload.label) {
    return jsonResponse({ error: 'eventId, consentType, and label are required' }, 400);
  }

  if (payload.id) {
    await env.DB.prepare(
      `UPDATE consent_items
       SET event_id = ?, consent_type = ?, label = ?, is_required = ?, is_enabled = ?, display_order = ?
       WHERE id = ?`
    ).bind(
      payload.eventId,
      payload.consentType,
      payload.label,
      payload.isRequired === false ? 0 : 1,
      payload.isEnabled === false ? 0 : 1,
      payload.displayOrder || 0,
      payload.id
    ).run();
    return jsonResponse({ message: 'Consent item updated', consentItemId: payload.id });
  }

  const insert = await env.DB.prepare(
    `INSERT INTO consent_items (event_id, consent_type, label, is_required, is_enabled, display_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    payload.eventId,
    payload.consentType,
    payload.label,
    payload.isRequired === false ? 0 : 1,
    payload.isEnabled === false ? 0 : 1,
    payload.displayOrder || 0
  ).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'consent_item_created',
    eventId: payload.eventId,
    targetType: 'consent_item',
    targetId: String(insert.meta.last_row_id),
    details: payload
  });

  return jsonResponse({ message: 'Consent item created', consentItemId: insert.meta.last_row_id }, 201);
}

async function createScheduleSlot(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.competitionId || !payload.checkInTime || !payload.judgingTime || !payload.location) {
    return jsonResponse({ error: 'competitionId, checkInTime, judgingTime, location are required' }, 400);
  }

  const insert = await env.DB.prepare(
    `INSERT INTO schedule_slots (competition_id, round_id, check_in_time, judging_time, location, buffer_minutes, capacity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    payload.competitionId,
    payload.roundId || null,
    payload.checkInTime,
    payload.judgingTime,
    payload.location,
    payload.bufferMinutes || 0,
    payload.capacity || 1
  ).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'schedule_slot_created',
    competitionId: payload.competitionId,
    targetType: 'schedule_slot',
    targetId: String(insert.meta.last_row_id),
    details: payload
  });

  return jsonResponse({ message: 'Schedule slot created', slotId: insert.meta.last_row_id }, 201);
}

async function assignJudge(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.judgeUserId || !payload.competitionId) {
    return jsonResponse({ error: 'judgeUserId and competitionId are required' }, 400);
  }

  const judge = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(payload.judgeUserId).first();
  if (!judge || judge.role !== 'judge') return jsonResponse({ error: 'judgeUserId must reference a judge account' }, 400);

  await env.DB.prepare(
    'INSERT OR IGNORE INTO judge_assignments (judge_user_id, competition_id, round_id) VALUES (?, ?, ?)'
  ).bind(payload.judgeUserId, payload.competitionId, payload.roundId || null).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'judge_assignment_changed',
    competitionId: payload.competitionId,
    targetType: 'judge_assignment',
    targetId: `${payload.judgeUserId}:${payload.competitionId}:${payload.roundId || 'all'}`,
    details: payload
  });

  return jsonResponse({ message: 'Judge assigned' });
}

async function createAdminMessage(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.subject || !payload.body || !payload.targetScope) {
    return jsonResponse({ error: 'subject, body, targetScope are required' }, 400);
  }

  const insert = await env.DB.prepare(
    `INSERT INTO admin_messages (event_id, competition_id, created_by, subject, body, target_scope, target_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    payload.eventId || null,
    payload.competitionId || null,
    user.id,
    payload.subject,
    payload.body,
    payload.targetScope,
    JSON.stringify(payload.target || {})
  ).run();

  return jsonResponse({
    message: 'Admin message created (delivery integration intentionally stubbed for MVP)',
    adminMessageId: insert.meta.last_row_id
  }, 201);
}

async function upsertEmailTemplate(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.templateKey || !payload.subjectTemplate || !payload.bodyTemplate) {
    return jsonResponse({ error: 'templateKey, subjectTemplate, and bodyTemplate are required' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO email_templates (event_id, template_key, subject_template, body_template, is_enabled)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(event_id, template_key)
     DO UPDATE SET subject_template = excluded.subject_template,
                   body_template = excluded.body_template,
                   is_enabled = excluded.is_enabled`
  ).bind(
    payload.eventId || null,
    payload.templateKey,
    payload.subjectTemplate,
    payload.bodyTemplate,
    payload.isEnabled === false ? 0 : 1
  ).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'email_template_updated',
    eventId: payload.eventId || null,
    targetType: 'email_template',
    targetId: payload.templateKey,
    details: payload
  });

  return jsonResponse({ message: 'Email template upserted' });
}

async function updateEventSettings(request, env, user) {
  const payload = await parseJsonBody(request);
  if (!payload.eventId) return jsonResponse({ error: 'eventId is required' }, 400);

  await env.DB.prepare(
    `UPDATE events
     SET moderation_enabled = COALESCE(?, moderation_enabled),
         branding_json = COALESCE(?, branding_json),
         navigation_json = COALESCE(?, navigation_json),
         home_content_json = COALESCE(?, home_content_json),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    payload.moderationEnabled === undefined ? null : (payload.moderationEnabled ? 1 : 0),
    payload.branding ? JSON.stringify(payload.branding) : null,
    payload.navigation ? JSON.stringify(payload.navigation) : null,
    payload.homeContent ? JSON.stringify(payload.homeContent) : null,
    payload.eventId
  ).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'event_settings_changed',
    eventId: payload.eventId,
    targetType: 'event',
    targetId: String(payload.eventId),
    details: payload
  });

  return jsonResponse({ message: 'Event settings updated' });
}

async function getAdminDashboard(url, env) {
  const eventId = Number(url.searchParams.get('eventId') || 0) || null;

  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*) AS total_entries,
       SUM(CASE WHEN e.status = 'no_show' THEN 1 ELSE 0 END) AS no_show_count,
       ROUND(AVG(s.score), 2) AS average_score,
       COUNT(DISTINCT s.judge_user_id) AS judges_active
     FROM entries e
     LEFT JOIN scores s ON s.entry_id = e.id
     JOIN competitions c ON c.id = e.competition_id
     WHERE (? IS NULL OR c.event_id = ?)`
  ).bind(eventId, eventId).first();

  const perRound = await env.DB.prepare(
    `SELECT r.id AS round_id, r.name AS round_name,
            COUNT(DISTINCT e.id) AS contestants,
            COUNT(s.id) AS scores_submitted,
            ROUND(AVG(s.score), 2) AS average_round_score
     FROM rounds r
     JOIN competitions c ON c.id = r.competition_id
     LEFT JOIN entries e ON e.competition_id = c.id
     LEFT JOIN scores s ON s.round_id = r.id AND s.entry_id = e.id
     WHERE (? IS NULL OR c.event_id = ?)
     GROUP BY r.id, r.name
     ORDER BY r.round_number`
  ).bind(eventId, eventId).all();

  const judgeProgress = await env.DB.prepare(
    `SELECT u.id AS judge_user_id, u.display_name,
            COUNT(DISTINCT ja.competition_id || ':' || COALESCE(ja.round_id, 'all')) AS assignment_count,
            COUNT(s.id) AS score_count
     FROM users u
     LEFT JOIN judge_assignments ja ON ja.judge_user_id = u.id
     LEFT JOIN scores s ON s.judge_user_id = u.id
     WHERE u.role = 'judge'
     GROUP BY u.id, u.display_name
     ORDER BY u.display_name`
  ).all();

  return jsonResponse({
    totals: totals || {},
    perRound: perRound.results || [],
    judgeProgress: judgeProgress.results || []
  });
}

async function getAdminSchedule(url, env) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  const rows = await env.DB.prepare(
    `SELECT s.id AS slot_id, s.round_id, s.check_in_time, s.judging_time, s.location, s.buffer_minutes, s.capacity,
            COUNT(sr.id) AS reserved_count,
            GROUP_CONCAT(ct.contestant_number) AS contestant_numbers
     FROM schedule_slots s
     LEFT JOIN schedule_reservations sr ON sr.slot_id = s.id
     LEFT JOIN entries e ON e.id = sr.entry_id
     LEFT JOIN contestants ct ON ct.id = e.contestant_id
     WHERE s.competition_id = ?
     GROUP BY s.id, s.round_id, s.check_in_time, s.judging_time, s.location, s.buffer_minutes, s.capacity
     ORDER BY s.judging_time`
  ).bind(competitionId).all();

  return jsonResponse({ schedule: rows.results || [] });
}

async function setEntryAdvancement(request, env, user, entryId) {
  const payload = await parseJsonBody(request);
  if (typeof payload.isAdvancing !== 'boolean') return jsonResponse({ error: 'isAdvancing boolean is required' }, 400);

  const entry = await env.DB.prepare('SELECT competition_id FROM entries WHERE id = ?').bind(entryId).first();
  if (!entry) return jsonResponse({ error: 'Entry not found' }, 404);

  await env.DB.prepare('UPDATE entries SET is_advancing = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(payload.isAdvancing ? 1 : 0, entryId).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'advancement_decision',
    competitionId: entry.competition_id,
    targetType: 'entry',
    targetId: String(entryId),
    details: payload
  });

  return jsonResponse({ message: 'Advancement updated', entryId, isAdvancing: payload.isAdvancing });
}

async function setEntryStatus(request, env, user, entryId) {
  const payload = await parseJsonBody(request);
  const status = payload.status;
  const valid = new Set(['submitted', 'pending_review', 'withdrawn', 'disqualified', 'no_show']);
  if (!valid.has(status)) return jsonResponse({ error: `status must be one of ${[...valid].join(', ')}` }, 400);

  const entry = await env.DB.prepare('SELECT competition_id FROM entries WHERE id = ?').bind(entryId).first();
  if (!entry) return jsonResponse({ error: 'Entry not found' }, 404);

  await env.DB.prepare('UPDATE entries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, entryId).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'entry_status_changed',
    competitionId: entry.competition_id,
    targetType: 'entry',
    targetId: String(entryId),
    details: payload
  });

  return jsonResponse({ message: 'Entry status updated', status });
}

async function setFeedbackPublication(request, env, user, competitionId) {
  const payload = await parseJsonBody(request);
  if (typeof payload.enabled !== 'boolean') return jsonResponse({ error: 'enabled boolean is required' }, 400);

  const competition = await env.DB.prepare('SELECT event_id FROM competitions WHERE id = ?').bind(competitionId).first();
  if (!competition) return jsonResponse({ error: 'Competition not found' }, 404);

  await env.DB.prepare('UPDATE competitions SET feedback_visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(payload.enabled ? 1 : 0, competitionId).run();

  await env.DB.prepare(
    `INSERT INTO notifications (event_id, competition_id, template_key, payload_json, status)
     VALUES (?, ?, 'feedback_published', ?, 'queued')`
  ).bind(competition.event_id, competitionId, JSON.stringify({ enabled: payload.enabled })).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'feedback_publication_changed',
    eventId: competition.event_id,
    competitionId,
    targetType: 'competition',
    targetId: String(competitionId),
    details: payload
  });

  return jsonResponse({ message: 'Feedback publication setting updated', enabled: payload.enabled });
}

async function exportContestants(url, env) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  const rows = await env.DB.prepare(
    `SELECT ct.contestant_number, u.display_name, u.email, e.status, e.is_advancing, e.submitted_at
     FROM entries e
     JOIN contestants ct ON ct.id = e.contestant_id
     JOIN users u ON u.id = ct.user_id
     WHERE e.competition_id = ?
     ORDER BY ct.contestant_number`
  ).bind(competitionId).all();

  return csvResponse(buildCsv(rows.results || []), 'contestants.csv');
}

async function exportScores(url, env) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  const rows = await env.DB.prepare(
    `SELECT ct.contestant_number, u.display_name AS contestant_name, r.round_number,
            rc.name AS category, s.score, ju.display_name AS judge_name,
            s.private_note, s.public_feedback
     FROM scores s
     JOIN entries e ON e.id = s.entry_id
     JOIN contestants ct ON ct.id = e.contestant_id
     JOIN users u ON u.id = ct.user_id
     JOIN rounds r ON r.id = s.round_id
     JOIN rubric_categories rc ON rc.id = s.category_id
     JOIN users ju ON ju.id = s.judge_user_id
     WHERE e.competition_id = ?
     ORDER BY r.round_number, ct.contestant_number, rc.display_order`
  ).bind(competitionId).all();

  return csvResponse(buildCsv(rows.results || []), 'scores.csv');
}

async function exportSchedule(url, env) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  const rows = await env.DB.prepare(
    `SELECT s.check_in_time, s.judging_time, s.location, s.buffer_minutes, s.capacity,
            ct.contestant_number, u.display_name AS contestant_name
     FROM schedule_slots s
     LEFT JOIN schedule_reservations sr ON sr.slot_id = s.id
     LEFT JOIN entries e ON e.id = sr.entry_id
     LEFT JOIN contestants ct ON ct.id = e.contestant_id
     LEFT JOIN users u ON u.id = ct.user_id
     WHERE s.competition_id = ?
     ORDER BY s.judging_time`
  ).bind(competitionId).all();

  return csvResponse(buildCsv(rows.results || []), 'schedule.csv');
}

async function requireAuth(request, env) {
  const token = getSessionTokenFromRequest(request);
  if (!token) throw new HttpError(401, 'Authentication required');

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.display_name, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!row || !row.is_active) throw new HttpError(401, 'Invalid or expired session');
  return sanitizeUser(row);
}

async function requireRole(request, env, allowedRoles) {
  const user = await requireAuth(request, env);
  if (!allowedRoles.includes(user.role)) throw new HttpError(403, 'Insufficient role');
  return user;
}

async function createSession(env, userId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, userId, expiresAt).run();
  return token;
}

function getSessionTokenFromRequest(request) {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();

  const cookie = request.headers.get('cookie') || '';
  const parts = cookie.split(';').map((part) => part.trim());
  const session = parts.find((part) => part.startsWith('session_token='));
  return session ? decodeURIComponent(session.split('=')[1]) : null;
}

async function canJudgeCompetitionRound(env, user, competitionId, roundId) {
  if (user.role === 'admin') return true;
  const row = await env.DB.prepare(
    `SELECT id
     FROM judge_assignments
     WHERE judge_user_id = ?
       AND competition_id = ?
       AND (round_id IS NULL OR round_id = ?)
     LIMIT 1`
  ).bind(user.id, competitionId, roundId).first();
  return Boolean(row);
}

async function ensureContestantProfile(env, userId) {
  const existing = await env.DB.prepare('SELECT id, contestant_number, private_token FROM contestants WHERE user_id = ?').bind(userId).first();
  if (existing) return existing;

  const sequence = await env.DB.prepare('SELECT COUNT(*) AS count FROM contestants').first();
  const contestantNumber = `C-${1001 + (sequence?.count || 0)}`;
  const privateToken = `contestant-${randomToken()}`;

  const insert = await env.DB.prepare(
    'INSERT INTO contestants (user_id, contestant_number, private_token) VALUES (?, ?, ?)'
  ).bind(userId, contestantNumber, privateToken).run();

  return {
    id: insert.meta.last_row_id,
    contestant_number: contestantNumber,
    private_token: privateToken
  };
}

async function persistSubmissionConsents(env, entryId, consentMap) {
  await env.DB.prepare('DELETE FROM submission_consents WHERE entry_id = ?').bind(entryId).run();

  const keys = Object.keys(consentMap);
  for (const key of keys) {
    const consentItemId = Number(key);
    if (!consentItemId) continue;
    await env.DB.prepare(
      'INSERT INTO submission_consents (entry_id, consent_item_id, accepted) VALUES (?, ?, ?)'
    ).bind(entryId, consentItemId, consentMap[key] ? 1 : 0).run();
  }
}

async function getEntryScores(env, entryId, includePublicFeedback) {
  const categories = await env.DB.prepare(
    `SELECT r.round_number, r.name AS round_name, rc.name AS category_name,
            ROUND(AVG(s.score), 2) AS average_score,
            GROUP_CONCAT(CASE WHEN s.private_note IS NOT NULL THEN s.private_note END, ' | ') AS private_notes,
            GROUP_CONCAT(CASE WHEN s.public_feedback IS NOT NULL THEN s.public_feedback END, ' | ') AS public_feedback
     FROM scores s
     JOIN rounds r ON r.id = s.round_id
     JOIN rubric_categories rc ON rc.id = s.category_id
     WHERE s.entry_id = ?
     GROUP BY r.round_number, r.name, rc.name
     ORDER BY r.round_number, rc.name`
  ).bind(entryId).all();

  const overall = await env.DB.prepare('SELECT ROUND(AVG(score), 2) AS average_score FROM scores WHERE entry_id = ?').bind(entryId).first();

  return {
    overallAverage: overall?.average_score ?? null,
    categories: (categories.results || []).map((row) => ({
      roundNumber: row.round_number,
      roundName: row.round_name,
      categoryName: row.category_name,
      averageScore: row.average_score,
      privateNotes: row.private_notes || '',
      publicFeedback: includePublicFeedback ? (row.public_feedback || '') : ''
    }))
  };
}

async function logAudit(env, data) {
  await env.DB.prepare(
    `INSERT INTO audit_logs (event_id, competition_id, actor_user_id, action, target_type, target_id, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    data.eventId || null,
    data.competitionId || null,
    data.actorUserId,
    data.action,
    data.targetType,
    data.targetId || null,
    JSON.stringify(data.details || {})
  ).run();
}

function normalizeEvent(event) {
  return {
    ...event,
    home_content_json: safeParse(event.home_content_json),
    navigation_json: safeParse(event.navigation_json),
    branding_json: safeParse(event.branding_json)
  };
}

function normalizeCompetition(competition) {
  return {
    ...competition,
    public_content_json: safeParse(competition.public_content_json),
    faq_json: safeParse(competition.faq_json)
  };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload, null, 2), { status, headers });
}

function csvResponse(csvBody, fileName) {
  return new Response(csvBody, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`
    }
  });
}

function buildSessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `session_token=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`;
}

export function buildCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((header) => escapeCsv(row[header]));
    lines.push(values.join(','));
  }
  return `${lines.join('\n')}\n`;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function dedupeRounds(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!row.round_id) continue;
    if (!seen.has(row.round_id)) seen.set(row.round_id, { roundId: row.round_id, roundName: row.round_name });
  }
  return [...seen.values()];
}

function addRanks(rows) {
  return rows.map((row, index) => ({ rank: index + 1, ...row }));
}

function parseJsonColumns(rows, columns) {
  return rows.map((row) => {
    const next = { ...row };
    for (const column of columns) {
      next[column] = safeParse(row[column]);
    }
    return next;
  });
}

async function parseJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function safeParse(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.display_name
  };
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function randomToken() {
  return crypto.randomUUID().replaceAll('-', '');
}

function generatePasswordSalt() {
  return crypto.randomUUID();
}

async function hashPassword(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const digest = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: PASSWORD_ITERATIONS
    },
    baseKey,
    256
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function matchPath(pathname, pattern) {
  const left = trimAndSplit(pathname);
  const right = trimAndSplit(pattern);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (right[i].startsWith(':')) continue;
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function extractPathParams(pathname, pattern) {
  const left = trimAndSplit(pathname);
  const right = trimAndSplit(pattern);
  const params = {};
  for (let i = 0; i < right.length; i += 1) {
    if (right[i].startsWith(':')) params[right[i].slice(1)] = left[i];
  }
  return params;
}

function trimAndSplit(value) {
  return String(value).split('/').filter(Boolean);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
