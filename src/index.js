const SESSION_DAYS = 7;
const PASSWORD_ITERATIONS = 100000;

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
  if (request.method === 'GET' && pathname === '/login') return renderLoginPage();
  if (request.method === 'GET' && pathname === '/register') return renderRegisterPage();
  if (request.method === 'GET' && pathname === '/password-reset-required') {
    const user = await requireAuth(request, env, { allowPasswordResetPending: true });
    return renderPasswordResetPage(user);
  }
  if (request.method === 'GET' && pathname === '/admin') {
    const user = await requireRole(request, env, ['admin'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return Response.redirect(new URL('/portal/dashboard', request.url).toString(), 302);
  }
  if (request.method === 'GET' && pathname === '/judge') {
    const user = await requireRole(request, env, ['judge', 'admin'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return Response.redirect(new URL('/portal/dashboard', request.url).toString(), 302);
  }
  if (request.method === 'GET' && pathname === '/portal/dashboard') {
    const user = await requireRole(request, env, ['admin', 'judge'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return renderPortalPage(user, 'dashboard');
  }
  if (request.method === 'GET' && pathname === '/portal/event-setup') {
    const user = await requireRole(request, env, ['admin'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return renderPortalPage(user, 'event-setup');
  }
  if (request.method === 'GET' && pathname === '/portal/contestant-selection') {
    const user = await requireRole(request, env, ['admin', 'judge'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return renderPortalPage(user, 'contestant-selection');
  }
  if (request.method === 'GET' && pathname === '/portal/user-settings') {
    const user = await requireRole(request, env, ['admin'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return renderPortalPage(user, 'user-settings');
  }
  if (request.method === 'GET' && pathname === '/contestant') {
    const user = await requireRole(request, env, ['contestant'], { allowPasswordResetPending: true });
    if (user.requiresPasswordReset) return Response.redirect(new URL('/password-reset-required', request.url).toString(), 302);
    return renderRolePortal('contestant', user);
  }
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
  if (request.method === 'POST' && pathname === '/auth/change-password') return changePassword(request, env);

  if (request.method === 'GET' && pathname === '/me') {
    const user = await requireAuth(request, env, { allowPasswordResetPending: true });
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

  if (request.method === 'GET' && pathname === '/admin/contestant-users') {
    const user = await requireRole(request, env, ['admin']);
    return adminListContestantUsers(url, env, user);
  }
  if (request.method === 'POST' && pathname === '/admin/contestant-membership') {
    const user = await requireRole(request, env, ['admin']);
    return adminSetContestantMembership(request, env, user);
  }
  if (request.method === 'GET' && pathname === '/admin/users') {
    const user = await requireRole(request, env, ['admin']);
    return adminListUsers(url, env, user);
  }
  if (request.method === 'POST' && pathname === '/admin/users') {
    const user = await requireRole(request, env, ['admin']);
    return adminCreateUser(request, env, user);
  }
  if (request.method === 'POST' && matchPath(pathname, '/admin/users/:userId/status')) {
    const user = await requireRole(request, env, ['admin']);
    const { userId } = extractPathParams(pathname, '/admin/users/:userId/status');
    return adminSetUserStatus(request, env, user, Number(userId));
  }
  if (request.method === 'POST' && matchPath(pathname, '/admin/users/:userId/temp-password')) {
    const user = await requireRole(request, env, ['admin']);
    const { userId } = extractPathParams(pathname, '/admin/users/:userId/temp-password');
    return adminResetTempPassword(request, env, user, Number(userId));
  }
  if (request.method === 'POST' && pathname === '/admin/profile') {
    const user = await requireRole(request, env, ['admin']);
    return adminUpdateProfile(request, env, user);
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

function getNeonThemeStyles() {
  return `
    :root {
      --space-black: #050505;
      --midnight-navy: #0a1128;
      --hot-pink: #ff00ff;
      --electric-blue: #00ffff;
      --neon-purple: #bf00ff;
      --chrome-light: #f6fbff;
      --chrome-mid: #7fa4c8;
      --steel-blue: #34577d;
      --ink: #eaf3ff;
      --muted: #c4d1e6;
      --good: #7bffba;
      --bad: #ff7aa4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 700px at 20% 10%, rgba(191, 0, 255, 0.22), transparent 55%),
        radial-gradient(900px 600px at 80% 20%, rgba(0, 255, 255, 0.18), transparent 58%),
        radial-gradient(1000px 800px at 50% 85%, rgba(255, 0, 255, 0.18), transparent 55%),
        radial-gradient(2px 2px at 12% 8%, rgba(255, 255, 255, 0.95), transparent 60%),
        radial-gradient(1.4px 1.4px at 42% 28%, rgba(255, 255, 255, 0.9), transparent 60%),
        radial-gradient(1.8px 1.8px at 76% 62%, rgba(255, 255, 255, 0.95), transparent 62%),
        radial-gradient(1.6px 1.6px at 85% 32%, rgba(255, 255, 255, 0.92), transparent 60%),
        radial-gradient(1.2px 1.2px at 30% 78%, rgba(255, 255, 255, 0.85), transparent 58%),
        linear-gradient(180deg, var(--space-black), var(--midnight-navy));
      background-attachment: fixed;
      padding: 18px;
      overflow-x: hidden;
      position: relative;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      inset: -20% -10%;
      pointer-events: none;
      z-index: 0;
      opacity: 0.45;
      filter: blur(8px);
    }
    body::before {
      background:
        radial-gradient(40% 20% at 30% 65%, rgba(255, 0, 255, 0.45), transparent 68%),
        radial-gradient(55% 18% at 70% 35%, rgba(191, 0, 255, 0.42), transparent 70%);
      transform: rotate(-6deg);
    }
    body::after {
      background:
        conic-gradient(from 190deg at 22% 45%, transparent 0deg, rgba(255, 0, 255, 0.22) 62deg, transparent 120deg),
        conic-gradient(from 20deg at 74% 58%, transparent 0deg, rgba(191, 0, 255, 0.18) 60deg, transparent 130deg);
      transform: rotate(8deg);
      opacity: 0.35;
    }
    .neon-shell {
      position: relative;
      z-index: 1;
      margin: 0 auto;
      width: 100%;
      max-width: 1120px;
      background: linear-gradient(155deg, rgba(15, 20, 45, 0.6), rgba(5, 7, 20, 0.6));
      border-radius: 18px;
      border: 1px solid rgba(0, 255, 255, 0.55);
      box-shadow:
        0 0 0 1px rgba(255, 0, 255, 0.22) inset,
        0 0 22px rgba(0, 255, 255, 0.28),
        0 18px 45px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      padding: 22px;
    }
    .chrome-logo {
      margin: 0;
      line-height: 1;
      position: relative;
      display: inline-block;
      color: transparent;
      background: linear-gradient(180deg, #f7feff 0%, #b8c7d6 35%, #dce8f3 58%, #7f97af 100%);
      -webkit-background-clip: text;
      background-clip: text;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 900;
      text-shadow: 0 0 20px rgba(0, 255, 255, 0.25);
    }
    .chrome-logo::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 49%;
      height: 18%;
      background: linear-gradient(90deg, rgba(255, 0, 255, 0.82), rgba(191, 0, 255, 0.92));
      mix-blend-mode: screen;
      opacity: 0.92;
      pointer-events: none;
    }
    .neon-title {
      margin: 8px 0;
      font-size: clamp(1.5rem, 3.4vw, 2.05rem);
      font-weight: 900;
      letter-spacing: 0.04em;
      color: #f4e7ff;
      text-shadow:
        0 0 6px rgba(255, 255, 255, 0.6),
        0 0 18px rgba(191, 0, 255, 0.88),
        0 0 38px rgba(191, 0, 255, 0.45);
    }
    .neon-subtitle {
      margin: 0;
      color: var(--muted);
      max-width: 70ch;
    }
    .neon-divider {
      height: 1px;
      margin: 16px 0 18px;
      border: 0;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.95) 45%, rgba(255, 0, 255, 0.85) 53%, transparent);
      box-shadow: 0 0 14px rgba(255, 0, 255, 0.72);
    }
    .glass-panel {
      position: relative;
      background: linear-gradient(145deg, rgba(12, 16, 36, 0.6), rgba(5, 7, 18, 0.6));
      border: 1px solid rgba(0, 255, 255, 0.42);
      border-radius: 14px;
      padding: 14px;
      box-shadow: inset 0 0 0 1px rgba(255, 0, 255, 0.23), 0 0 16px rgba(0, 255, 255, 0.16);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    .starburst {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      clip-path: polygon(50% 0%, 62% 28%, 92% 18%, 75% 45%, 100% 50%, 75% 55%, 92% 82%, 62% 72%, 50% 100%, 38% 72%, 8% 82%, 25% 55%, 0% 50%, 25% 45%, 8% 18%, 38% 28%);
      background: linear-gradient(180deg, #b3dcff, #2c5f92);
      color: white;
      font-size: 0.75rem;
      box-shadow: 0 0 12px rgba(0, 255, 255, 0.45);
      margin-left: 8px;
    }
    .grid {
      display: grid;
      gap: 14px;
    }
    .grid.two {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .grid.three {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    label {
      display: block;
      margin: 11px 0 6px;
      font-weight: 700;
      color: #d8eeff;
    }
    input {
      width: 100%;
      border-radius: 10px;
      border: 1px solid rgba(0, 255, 255, 0.45);
      color: #f2f8ff;
      background: rgba(8, 14, 33, 0.7);
      padding: 11px 12px;
      font: inherit;
      outline: 0;
      box-shadow: inset 0 0 14px rgba(0, 255, 255, 0.08);
    }
    input:focus {
      border-color: rgba(255, 0, 255, 0.86);
      box-shadow: 0 0 0 1px rgba(255, 0, 255, 0.45), 0 0 15px rgba(191, 0, 255, 0.42);
    }
    button,
    .button-link {
      border-radius: 11px;
      border: 1px solid rgba(0, 255, 255, 0.5);
      color: #ecf6ff;
      background:
        linear-gradient(175deg, rgba(244, 252, 255, 0.35), rgba(44, 95, 146, 0.48) 38%, rgba(17, 40, 74, 0.8) 85%),
        linear-gradient(90deg, rgba(0, 255, 255, 0.08), rgba(191, 0, 255, 0.1));
      box-shadow:
        inset 0 1px 2px rgba(255, 255, 255, 0.55),
        inset 0 -8px 16px rgba(0, 20, 48, 0.45),
        0 0 18px rgba(0, 255, 255, 0.25);
      font: inherit;
      font-weight: 700;
      padding: 10px 14px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      position: relative;
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
    }
    button::before,
    .button-link::before {
      content: "";
      position: absolute;
      inset: 2px 8px auto;
      height: 35%;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0));
      pointer-events: none;
    }
    button:hover,
    .button-link:hover {
      transform: translateY(-1px);
      border-color: rgba(255, 0, 255, 0.75);
      box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.62), 0 0 20px rgba(255, 0, 255, 0.38);
    }
    button:disabled {
      cursor: wait;
      opacity: 0.8;
    }
    .error { color: var(--bad); }
    .ok { color: var(--good); }
    .row {
      margin-top: 12px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .cards {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
    }
    .card {
      border-radius: 12px;
      border: 1px solid rgba(255, 0, 255, 0.38);
      padding: 12px;
      background: linear-gradient(155deg, rgba(11, 19, 46, 0.72), rgba(14, 9, 32, 0.72));
      box-shadow: 0 0 12px rgba(191, 0, 255, 0.2);
    }
    .card h3 {
      margin: 0;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #99f0ff;
    }
    .card p {
      margin: 8px 0 0;
      font-size: 1.26rem;
      color: #fff;
      font-weight: 800;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(4, 10, 25, 0.6);
      border-radius: 10px;
      overflow: hidden;
    }
    th,
    td {
      border-bottom: 1px solid rgba(0, 255, 255, 0.18);
      text-align: left;
      padding: 10px;
      font-size: 0.9rem;
      white-space: nowrap;
    }
    th {
      background: linear-gradient(90deg, rgba(0, 255, 255, 0.18), rgba(191, 0, 255, 0.2));
      color: #f6f4ff;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-size: 0.76rem;
    }
    tr:hover td {
      background: rgba(255, 0, 255, 0.08);
    }
    .flash {
      min-height: 18px;
      margin: 8px 0 0;
      font-size: 0.92rem;
      color: #bdf6ff;
    }
    .flash.error {
      color: var(--bad);
    }
    .center-shell {
      max-width: 520px;
    }
    .event-list {
      display: grid;
      gap: 10px;
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .event-list li {
      border-radius: 12px;
      border: 1px solid rgba(0, 255, 255, 0.3);
      background: rgba(9, 16, 38, 0.55);
      padding: 11px;
      box-shadow: inset 0 0 12px rgba(0, 255, 255, 0.08);
    }
    a {
      color: #bdf6ff;
    }
    .portal-layout {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }
    .portal-nav {
      position: sticky;
      top: 10px;
    }
    .portal-nav-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .portal-nav a {
      display: block;
      border-radius: 10px;
      padding: 10px 12px;
      text-decoration: none;
      border: 1px solid rgba(0, 255, 255, 0.35);
      background: rgba(10, 18, 42, 0.66);
      color: #daf3ff;
      font-weight: 700;
    }
    .portal-nav a.active {
      border-color: rgba(255, 0, 255, 0.85);
      box-shadow: 0 0 16px rgba(255, 0, 255, 0.35);
      background: linear-gradient(90deg, rgba(255, 0, 255, 0.22), rgba(0, 255, 255, 0.18));
      color: #fff;
    }
    .portal-mobile-nav {
      display: none;
      margin-bottom: 12px;
    }
    select {
      width: 100%;
      border-radius: 10px;
      border: 1px solid rgba(0, 255, 255, 0.45);
      color: #f2f8ff;
      background: rgba(8, 14, 33, 0.7);
      padding: 11px 12px;
      font: inherit;
      outline: 0;
      box-shadow: inset 0 0 14px rgba(0, 255, 255, 0.08);
    }
    @media (max-width: 760px) {
      body { padding: 10px; }
      .neon-shell { padding: 14px; }
      th,
      td { font-size: 0.82rem; }
      .portal-layout {
        grid-template-columns: 1fr;
      }
      .portal-nav {
        display: none;
      }
      .portal-mobile-nav {
        display: block;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transition: none !important;
      }
    }
  `;
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
    `<li>
      <strong><a href="/events/${escapeHtml(event.slug)}">${escapeHtml(event.name)}</a></strong><br />
      <span>${escapeHtml(event.description || 'No event description yet.')}</span><br />
      <small>${event.active_competitions} active competitions</small>
    </li>`
  ).join('');

  return new Response(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tremendicon Cosplay Judging MVP</title>
  <style>${getNeonThemeStyles()}</style>
</head>
<body>
  <main class="neon-shell">
    <div class="chrome-logo" style="font-size: clamp(1.4rem, 4.4vw, 2.4rem);">Tremendicon Mission Control</div>
    <h1 class="neon-title">Public Event Directory</h1>
    <p class="neon-subtitle">A holographic gateway to events, competitions, and role-based portals for judges and administrators.</p>
    <hr class="neon-divider" />

    <section class="glass-panel">
      <p><a class="button-link" href="/login">Login Portal (Admin, Judge, Contestant)</a></p>
      <h2 class="neon-title" style="font-size: 1.1rem; margin-top: 6px;">Active Events</h2>
      <ul class="event-list">${items || '<li>No public events yet.</li>'}</ul>
    </section>
  </main>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function renderLoginPage() {
  return new Response(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tremendicon Login</title>
  <style>${getNeonThemeStyles()}</style>
</head>
<body>
  <main class="neon-shell center-shell">
    <div class="chrome-logo" style="font-size: clamp(1.1rem, 4vw, 1.7rem);">Tremendicon Access</div>
    <h1 class="neon-title">Account Login</h1>
    <p class="neon-subtitle">Authenticate to access your mission-control portal (admin, judge, or contestant).</p>
    <hr class="neon-divider" />
    <section class="glass-panel">
      <form id="login-form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" required />

        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />

        <button id="submit" type="submit">Sign In</button>
        <div id="message" class="flash" aria-live="polite"></div>
      </form>
      <div class="row">
        <a class="button-link" href="/register">Register New Account</a>
      </div>
      <p class="neon-subtitle" style="font-size: 0.88rem; margin-top: 12px;">Demo: admin@tremendicon.test / admin123, judge@tremendicon.test / judge123, contestant@tremendicon.test / contestant123</p>
    </section>
  </main>

  <script>
    const form = document.getElementById('login-form');
    const submit = document.getElementById('submit');
    const message = document.getElementById('message');

    const showMessage = (text, kind) => {
      message.textContent = text;
      message.className = ('flash ' + (kind || '')).trim();
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      if (!email || !password) {
        showMessage('Email and password are required.', 'error');
        return;
      }

      submit.disabled = true;
      showMessage('Signing in...', '');

      try {
        const loginRes = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const loginBody = await loginRes.json();
        if (!loginRes.ok) {
          showMessage(loginBody.error || 'Login failed.', 'error');
          return;
        }

        const meRes = await fetch('/me');
        const meBody = await meRes.json();
        if (!meRes.ok || !meBody.user) {
          showMessage('Login succeeded but user info could not be loaded.', 'error');
          return;
        }

        if (meBody.user.requiresPasswordReset) {
          showMessage('Password reset is required. Redirecting...', 'ok');
          window.location.assign('/password-reset-required');
          return;
        }

        const role = meBody.user.role;
        if (role === 'admin') {
          showMessage('Welcome admin. Redirecting...', 'ok');
          window.location.assign('/admin');
          return;
        }
        if (role === 'judge') {
          showMessage('Welcome judge. Redirecting...', 'ok');
          window.location.assign('/judge');
          return;
        }
        if (role === 'contestant') {
          showMessage('Welcome contestant. Redirecting...', 'ok');
          window.location.assign('/contestant');
          return;
        }

        showMessage('Login succeeded, but this role has no portal configured.', 'error');
      } catch {
        showMessage('Network error while signing in.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function renderPasswordResetPage(user) {
  return new Response(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Password Reset Required</title>
  <style>${getNeonThemeStyles()}</style>
</head>
<body>
  <main class="neon-shell center-shell">
    <div class="chrome-logo" style="font-size: clamp(1.1rem, 4vw, 1.7rem);">Security Checkpoint</div>
    <h1 class="neon-title">Password Update Required</h1>
    <p class="neon-subtitle">Welcome ${escapeHtml(user.displayName || user.email)}. You must set a new password before accessing portal pages.</p>
    <hr class="neon-divider" />
    <section class="glass-panel">
      <form id="reset-form">
        <label for="currentPassword">Current / Temporary Password</label>
        <input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required />

        <label for="newPassword">New Password (min 8 chars)</label>
        <input id="newPassword" name="newPassword" type="password" autocomplete="new-password" minlength="8" required />

        <label for="confirmPassword">Confirm New Password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />

        <button id="submit" type="submit">Update Password</button>
        <div id="message" class="flash" aria-live="polite"></div>
      </form>
      <div class="row">
        <button id="logout" type="button">Log Out</button>
      </div>
    </section>
  </main>

  <script>
    const form = document.getElementById('reset-form');
    const submit = document.getElementById('submit');
    const message = document.getElementById('message');
    const logout = document.getElementById('logout');

    const showMessage = (text, kind) => {
      message.textContent = text;
      message.className = ('flash ' + (kind || '')).trim();
    };

    const routeForRole = (role) => {
      if (role === 'admin') return '/admin';
      if (role === 'judge') return '/judge';
      return '/contestant';
    };

    const ensureResetIsNeeded = async () => {
      const meRes = await fetch('/me');
      const meBody = await meRes.json();
      if (!meRes.ok || !meBody.user) {
        window.location.assign('/login');
        return null;
      }
      if (!meBody.user.requiresPasswordReset) {
        window.location.assign(routeForRole(meBody.user.role));
        return null;
      }
      return meBody.user;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const currentPassword = String(data.get('currentPassword') || '');
      const newPassword = String(data.get('newPassword') || '');
      const confirmPassword = String(data.get('confirmPassword') || '');

      if (!currentPassword || !newPassword || !confirmPassword) {
        showMessage('All fields are required.', 'error');
        return;
      }
      if (newPassword.length < 8) {
        showMessage('New password must be at least 8 characters.', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        showMessage('New password and confirmation do not match.', 'error');
        return;
      }

      submit.disabled = true;
      showMessage('Updating password...', '');

      try {
        const response = await fetch('/auth/change-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const body = await response.json();
        if (!response.ok) {
          showMessage(body.error || 'Password update failed.', 'error');
          return;
        }

        const meRes = await fetch('/me');
        const meBody = await meRes.json();
        if (!meRes.ok || !meBody.user) {
          showMessage('Password changed but user session could not be verified.', 'error');
          return;
        }

        showMessage('Password updated. Redirecting...', 'ok');
        setTimeout(() => window.location.assign(routeForRole(meBody.user.role)), 700);
      } catch {
        showMessage('Network error while updating password.', 'error');
      } finally {
        submit.disabled = false;
      }
    });

    logout.addEventListener('click', async () => {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.assign('/login');
    });

    ensureResetIsNeeded().catch(() => {
      window.location.assign('/login');
    });
  </script>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function renderRegisterPage() {
  return new Response(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tremendicon Register</title>
  <style>${getNeonThemeStyles()}</style>
</head>
<body>
  <main class="neon-shell center-shell">
    <div class="chrome-logo" style="font-size: clamp(1.1rem, 4vw, 1.7rem);">Contestant Creation Console</div>
    <h1 class="neon-title">Create Contestant Account</h1>
    <p class="neon-subtitle">Register your identity beacon, then return to login to access your contestant, admin, or judge portal.</p>
    <hr class="neon-divider" />
    <section class="glass-panel">
      <form id="register-form">
        <label for="displayName">Display Name</label>
        <input id="displayName" name="displayName" type="text" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="username" required />

        <label for="password">Password (min 8 chars)</label>
        <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />

        <button id="submit" type="submit">Register</button>
        <div id="message" class="flash" aria-live="polite"></div>
      </form>
      <div class="row">
        <a class="button-link" href="/login">Back to Login</a>
      </div>
    </section>
  </main>

  <script>
    const form = document.getElementById('register-form');
    const submit = document.getElementById('submit');
    const message = document.getElementById('message');

    const showMessage = (text, kind) => {
      message.textContent = text;
      message.className = ('flash ' + (kind || '')).trim();
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const displayName = String(data.get('displayName') || '').trim();
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');

      if (!displayName || !email || password.length < 8) {
        showMessage('Display name, email, and a password of at least 8 characters are required.', 'error');
        return;
      }

      submit.disabled = true;
      showMessage('Creating account...', '');

      try {
        const response = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayName, email, password })
        });
        const body = await response.json();

        if (!response.ok) {
          showMessage(body.error || 'Registration failed.', 'error');
          return;
        }

        showMessage('Registration successful. Redirecting to login...', 'ok');
        setTimeout(() => window.location.assign('/login'), 900);
      } catch {
        showMessage('Network error while creating account.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function renderPortalPage(user, page) {
  const isJudge = user.role === 'judge';
  const navItems = [
    { key: 'dashboard', label: 'Dashboard', href: '/portal/dashboard', roles: ['admin', 'judge'] },
    { key: 'event-setup', label: 'Event Setup', href: '/portal/event-setup', roles: ['admin'] },
    { key: 'contestant-selection', label: 'Contestant Selection', href: '/portal/contestant-selection', roles: ['admin', 'judge'] },
    { key: 'user-settings', label: 'User Settings', href: '/portal/user-settings', roles: ['admin'] }
  ].filter((item) => item.roles.includes(user.role));

  const activeNav = navItems.find((item) => item.key === page) || navItems[0];
  const titleByPage = {
    dashboard: 'Dashboard',
    'event-setup': 'Event Setup',
    'contestant-selection': 'Contestant Selection',
    'user-settings': 'User Settings'
  };
  const title = titleByPage[activeNav.key] || 'Portal';

  let content = '';
  let script = '';

  if (activeNav.key === 'dashboard') {
    if (isJudge) {
      content = `
      <section class="glass-panel controls">
        <h2>Judge Dashboard</h2>
        <div class="grid three">
          <label>Competition ID
            <input id="competition-id" type="number" min="1" value="1" />
          </label>
          <label>Round ID (optional)
            <input id="round-id" type="number" min="1" placeholder="Any" />
          </label>
          <label>Search
            <input id="search-query" type="text" placeholder="Contestant number or name" />
          </label>
        </div>
        <div class="row">
          <button id="search-contestants" class="primary" type="button">Search Contestants</button>
          <button id="load-leaderboard" type="button">Load Leaderboard</button>
          <button id="load-schedule" type="button">Load Schedule</button>
        </div>
        <p id="flash" class="flash"></p>
      </section>

      <section class="glass-panel">
        <h2>Contestant Search</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Entry ID</th><th>Contestant #</th><th>Name</th><th>Status</th><th>Advancing</th></tr>
            </thead>
            <tbody id="contestant-table"></tbody>
          </table>
        </div>
      </section>

      <section class="glass-panel">
        <h2>Leaderboard</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Rank</th><th>Contestant #</th><th>Name</th><th>Avg Score</th><th>Judges Scored</th><th>Advancing</th></tr>
            </thead>
            <tbody id="leaderboard-table"></tbody>
          </table>
        </div>
      </section>`;

      script = `
      const flash = document.getElementById('flash');
      const contestantTable = document.getElementById('contestant-table');
      const leaderboardTable = document.getElementById('leaderboard-table');
      const competitionIdInput = document.getElementById('competition-id');
      const roundIdInput = document.getElementById('round-id');
      const searchInput = document.getElementById('search-query');

      const showFlash = (text, isError) => {
        flash.textContent = text;
        flash.className = isError ? 'flash error' : 'flash';
      };
      const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);
      const fetchJson = async (path) => {
        const response = await fetch(path);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Request failed');
        return body;
      };
      const ids = () => {
        const competitionId = Number(competitionIdInput.value) || 1;
        const roundId = roundIdInput.value.trim() ? Number(roundIdInput.value) : null;
        return { competitionId, roundId };
      };

      const searchContestants = async () => {
        try {
          showFlash('Searching contestants...');
          const { competitionId, roundId } = ids();
          const q = encodeURIComponent(searchInput.value.trim());
          const roundQuery = roundId ? '&roundId=' + roundId : '';
          const data = await fetchJson('/judge/contestants?competitionId=' + competitionId + roundQuery + '&q=' + q);
          const rows = data.contestants || [];
          contestantTable.innerHTML = rows.length ? rows.map((row) => '<tr><td>' + safe(toText(row.entry_id)) + '</td><td>' + safe(toText(row.contestant_number)) + '</td><td>' + safe(toText(row.display_name)) + '</td><td>' + safe(toText(row.status)) + '</td><td>' + (row.is_advancing ? 'Yes' : 'No') + '</td></tr>').join('') : '<tr><td colspan="5">No contestants found.</td></tr>';
          showFlash('Contestants loaded.');
        } catch (error) {
          showFlash(error.message, true);
        }
      };

      const loadLeaderboard = async () => {
        try {
          showFlash('Loading leaderboard...');
          const { competitionId, roundId } = ids();
          const roundQuery = roundId ? '&roundId=' + roundId : '';
          const data = await fetchJson('/judge/leaderboard?competitionId=' + competitionId + roundQuery);
          const rows = data.leaderboard || [];
          leaderboardTable.innerHTML = rows.length ? rows.map((row) => '<tr><td>' + safe(toText(row.rank)) + '</td><td>' + safe(toText(row.contestant_number)) + '</td><td>' + safe(toText(row.contestant_name)) + '</td><td>' + safe(toText(row.average_score)) + '</td><td>' + safe(toText(row.judges_scored)) + '</td><td>' + (row.is_advancing ? 'Yes' : 'No') + '</td></tr>').join('') : '<tr><td colspan="6">No leaderboard data.</td></tr>';
          showFlash('Leaderboard loaded.');
        } catch (error) {
          showFlash(error.message, true);
        }
      };

      document.getElementById('search-contestants').addEventListener('click', searchContestants);
      document.getElementById('load-leaderboard').addEventListener('click', loadLeaderboard);
      document.getElementById('load-schedule').addEventListener('click', () => showFlash('Use Contestant Selection page for read-only schedule context.'));
      searchContestants();
      loadLeaderboard();`;
    } else {
      content = `
      <section class="glass-panel controls">
        <h2>Dashboard Filters</h2>
        <div class="grid two">
          <label>Event ID
            <input id="event-id" type="number" min="1" value="1" />
          </label>
          <label>Competition ID
            <input id="competition-id" type="number" min="1" value="1" />
          </label>
        </div>
        <div class="row">
          <button id="load-dashboard" class="primary" type="button">Load Dashboard</button>
          <button id="load-schedule" type="button">Load Schedule</button>
        </div>
        <div class="row">
          <a id="csv-contestants" href="/admin/export/contestants.csv?competitionId=1">Contestants CSV</a>
          <a id="csv-scores" href="/admin/export/scores.csv?competitionId=1">Scores CSV</a>
          <a id="csv-schedule" href="/admin/export/schedule.csv?competitionId=1">Schedule CSV</a>
        </div>
        <p id="flash" class="flash"></p>
      </section>
      <section class="glass-panel"><h2>Totals</h2><div id="totals" class="cards"></div></section>
      <section class="glass-panel"><h2>Round Performance</h2><div class="table-wrap"><table><thead><tr><th>Round</th><th>Contestants</th><th>Scores Submitted</th><th>Average Score</th></tr></thead><tbody id="round-table"></tbody></table></div></section>
      <section class="glass-panel"><h2>Judge Progress</h2><div class="table-wrap"><table><thead><tr><th>Judge</th><th>Assignments</th><th>Scores Submitted</th></tr></thead><tbody id="judge-table"></tbody></table></div></section>
      <section class="glass-panel"><h2>Schedule</h2><div class="table-wrap"><table><thead><tr><th>Slot</th><th>Round</th><th>Judging Time</th><th>Location</th><th>Reserved</th><th>Contestants</th></tr></thead><tbody id="schedule-table"></tbody></table></div></section>`;

      script = `
      const flash = document.getElementById('flash');
      const totalsNode = document.getElementById('totals');
      const roundTable = document.getElementById('round-table');
      const judgeTable = document.getElementById('judge-table');
      const scheduleTable = document.getElementById('schedule-table');
      const eventIdInput = document.getElementById('event-id');
      const competitionIdInput = document.getElementById('competition-id');
      const csvContestants = document.getElementById('csv-contestants');
      const csvScores = document.getElementById('csv-scores');
      const csvSchedule = document.getElementById('csv-schedule');
      const showFlash = (text, isError) => { flash.textContent = text; flash.className = isError ? 'flash error' : 'flash'; };
      const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);
      const fetchJson = async (path) => { const response = await fetch(path); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body; };
      const updateCsvLinks = () => {
        const competitionId = Number(competitionIdInput.value) || 1;
        csvContestants.href = '/admin/export/contestants.csv?competitionId=' + competitionId;
        csvScores.href = '/admin/export/scores.csv?competitionId=' + competitionId;
        csvSchedule.href = '/admin/export/schedule.csv?competitionId=' + competitionId;
      };
      const loadDashboard = async () => {
        try {
          showFlash('Loading dashboard...');
          const eventId = Number(eventIdInput.value) || 1;
          const data = await fetchJson('/admin/dashboard?eventId=' + eventId);
          const totals = data.totals || {};
          const cards = [['Total Entries', toText(totals.total_entries)], ['No-Shows', toText(totals.no_show_count)], ['Average Score', toText(totals.average_score)], ['Judges Active', toText(totals.judges_active)]];
          totalsNode.innerHTML = cards.map(([label, value]) => '<article class="card"><h3>' + safe(label) + '</h3><p>' + safe(value) + '</p></article>').join('');
          const perRound = data.perRound || [];
          roundTable.innerHTML = perRound.length ? perRound.map((row) => '<tr><td>' + safe(toText(row.round_name)) + '</td><td>' + safe(toText(row.contestants)) + '</td><td>' + safe(toText(row.scores_submitted)) + '</td><td>' + safe(toText(row.average_round_score)) + '</td></tr>').join('') : '<tr><td colspan="4">No round data.</td></tr>';
          const judgeProgress = data.judgeProgress || [];
          judgeTable.innerHTML = judgeProgress.length ? judgeProgress.map((row) => '<tr><td>' + safe(toText(row.display_name)) + '</td><td>' + safe(toText(row.assignment_count)) + '</td><td>' + safe(toText(row.score_count)) + '</td></tr>').join('') : '<tr><td colspan="3">No judge progress found.</td></tr>';
          showFlash('Dashboard loaded.');
        } catch (error) { showFlash(error.message, true); }
      };
      const loadSchedule = async () => {
        try {
          showFlash('Loading schedule...');
          const competitionId = Number(competitionIdInput.value) || 1;
          const data = await fetchJson('/admin/schedule?competitionId=' + competitionId);
          const rows = data.schedule || [];
          scheduleTable.innerHTML = rows.length ? rows.map((row) => '<tr><td>' + safe(toText(row.slot_id)) + '</td><td>' + safe(toText(row.round_id)) + '</td><td>' + safe(toText(row.judging_time)) + '</td><td>' + safe(toText(row.location)) + '</td><td>' + safe(toText(row.reserved_count)) + '/' + safe(toText(row.capacity)) + '</td><td>' + safe(toText(row.contestant_numbers)) + '</td></tr>').join('') : '<tr><td colspan="6">No schedule slots found.</td></tr>';
          showFlash('Schedule loaded.');
        } catch (error) { showFlash(error.message, true); }
      };
      competitionIdInput.addEventListener('input', updateCsvLinks);
      document.getElementById('load-dashboard').addEventListener('click', loadDashboard);
      document.getElementById('load-schedule').addEventListener('click', loadSchedule);
      updateCsvLinks();
      loadDashboard();
      loadSchedule();`;
    }
  }

  if (activeNav.key === 'event-setup') {
    content = `
    <section class="glass-panel controls">
      <h2>Event Setup</h2>
      <p class="neon-subtitle">Create or update events, competitions, rounds, branding, and contestant questions.</p>
      <div class="grid two">
        <label>Event ID (optional for update)
          <input id="event-id" type="number" min="1" placeholder="Create if empty" />
        </label>
        <label>Event Name
          <input id="event-name" type="text" placeholder="Tremendicon 2026" />
        </label>
      </div>
      <div class="grid two">
        <label>Event Slug
          <input id="event-slug" type="text" placeholder="tremendicon-2026" />
        </label>
        <label>Description
          <input id="event-description" type="text" placeholder="Main event description" />
        </label>
      </div>
      <div class="row"><button id="save-event" type="button" class="primary">Save Event</button></div>
      <hr class="neon-divider" />
      <div class="grid three">
        <label>Competition ID (optional for update)
          <input id="competition-id" type="number" min="1" placeholder="Create if empty" />
        </label>
        <label>Competition Name
          <input id="competition-name" type="text" placeholder="Armor Division" />
        </label>
        <label>Competition Slug
          <input id="competition-slug" type="text" placeholder="armor-division" />
        </label>
      </div>
      <div class="grid two">
        <label>Event ID (for competition)
          <input id="competition-event-id" type="number" min="1" value="1" />
        </label>
        <label>Division
          <input id="competition-division" type="text" placeholder="Master" />
        </label>
      </div>
      <div class="row"><button id="save-competition" type="button">Save Competition</button></div>
      <hr class="neon-divider" />
      <div class="grid three">
        <label>Round ID (optional for update)
          <input id="round-id" type="number" min="1" placeholder="Create if empty" />
        </label>
        <label>Competition ID (for round)
          <input id="round-competition-id" type="number" min="1" value="1" />
        </label>
        <label>Round Name
          <input id="round-name" type="text" placeholder="Prelims" />
        </label>
      </div>
      <div class="grid two">
        <label>Round Number
          <input id="round-number" type="number" min="1" value="1" />
        </label>
        <label>Branding Accent (hex)
          <input id="branding-accent" type="text" placeholder="#ff00ff" />
        </label>
      </div>
      <div class="row">
        <button id="save-round" type="button">Save Round</button>
        <button id="save-branding" type="button">Save Branding/Content</button>
      </div>
      <hr class="neon-divider" />
      <div class="grid two">
        <label>Question Competition ID
          <input id="field-competition-id" type="number" min="1" value="1" />
        </label>
        <label>Question Key
          <input id="field-key" type="text" placeholder="character_name" />
        </label>
      </div>
      <div class="grid two">
        <label>Question Label
          <input id="field-label" type="text" placeholder="Character Name" />
        </label>
        <label>Field Type
          <select id="field-type">
            <option value="short_text">short_text</option>
            <option value="long_text">long_text</option>
            <option value="multiple_choice">multiple_choice</option>
            <option value="checkbox_list">checkbox_list</option>
            <option value="numeric">numeric</option>
            <option value="date_time">date_time</option>
            <option value="external_link">external_link</option>
            <option value="media_link">media_link</option>
            <option value="consent_checkbox">consent_checkbox</option>
            <option value="social_links">social_links</option>
          </select>
        </label>
      </div>
      <div class="row"><button id="save-question" type="button">Save Contestant Question</button></div>
      <p id="flash" class="flash"></p>
    </section>`;

    script = `
    const flash = document.getElementById('flash');
    const showFlash = (text, isError) => { flash.textContent = text; flash.className = isError ? 'flash error' : 'flash'; };
    const fetchJson = async (path, options = {}) => {
      const response = await fetch(path, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      return body;
    };

    document.getElementById('save-event').addEventListener('click', async () => {
      try {
        const payload = {
          id: Number(document.getElementById('event-id').value) || undefined,
          name: document.getElementById('event-name').value.trim(),
          slug: document.getElementById('event-slug').value.trim(),
          description: document.getElementById('event-description').value.trim()
        };
        await fetchJson('/admin/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('Event saved.');
      } catch (error) { showFlash(error.message, true); }
    });

    document.getElementById('save-competition').addEventListener('click', async () => {
      try {
        const payload = {
          id: Number(document.getElementById('competition-id').value) || undefined,
          eventId: Number(document.getElementById('competition-event-id').value) || 1,
          name: document.getElementById('competition-name').value.trim(),
          slug: document.getElementById('competition-slug').value.trim(),
          division: document.getElementById('competition-division').value.trim() || 'General'
        };
        await fetchJson('/admin/competitions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('Competition saved.');
      } catch (error) { showFlash(error.message, true); }
    });

    document.getElementById('save-round').addEventListener('click', async () => {
      try {
        const payload = {
          id: Number(document.getElementById('round-id').value) || undefined,
          competitionId: Number(document.getElementById('round-competition-id').value) || 1,
          name: document.getElementById('round-name').value.trim(),
          roundNumber: Number(document.getElementById('round-number').value) || 1
        };
        await fetchJson('/admin/rounds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('Round saved.');
      } catch (error) { showFlash(error.message, true); }
    });

    document.getElementById('save-branding').addEventListener('click', async () => {
      try {
        const eventId = Number(document.getElementById('competition-event-id').value) || 1;
        const accent = document.getElementById('branding-accent').value.trim();
        const payload = {
          eventId,
          branding: accent ? { accent } : {},
          homeContent: { hero: document.getElementById('event-name').value.trim() || 'Event Home' }
        };
        await fetchJson('/admin/event-settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('Branding/content settings saved.');
      } catch (error) { showFlash(error.message, true); }
    });

    document.getElementById('save-question').addEventListener('click', async () => {
      try {
        const payload = {
          competitionId: Number(document.getElementById('field-competition-id').value) || 1,
          fieldKey: document.getElementById('field-key').value.trim(),
          label: document.getElementById('field-label').value.trim(),
          fieldType: document.getElementById('field-type').value
        };
        await fetchJson('/admin/form-fields', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('Contestant question saved.');
      } catch (error) { showFlash(error.message, true); }
    });`;
  }

  if (activeNav.key === 'contestant-selection') {
    if (isJudge) {
      content = `
      <section class="glass-panel controls">
        <h2>Contestant Selection (Read Only)</h2>
        <div class="grid three">
          <label>Competition ID
            <input id="competition-id" type="number" min="1" value="1" />
          </label>
          <label>Round ID (optional)
            <input id="round-id" type="number" min="1" placeholder="Any" />
          </label>
          <label>Search
            <input id="search-query" type="text" placeholder="Contestant number or name" />
          </label>
        </div>
        <div class="row"><button id="search" type="button" class="primary">Search</button></div>
        <p id="flash" class="flash"></p>
      </section>
      <section class="glass-panel">
        <h2>Results</h2>
        <div class="table-wrap"><table><thead><tr><th>Entry ID</th><th>Contestant #</th><th>Name</th><th>Status</th><th>Advancing</th></tr></thead><tbody id="rows"></tbody></table></div>
      </section>`;

      script = `
      const flash = document.getElementById('flash');
      const rowsNode = document.getElementById('rows');
      const showFlash = (text, isError) => { flash.textContent = text; flash.className = isError ? 'flash error' : 'flash'; };
      const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);
      const fetchJson = async (path) => { const response = await fetch(path); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body; };
      const search = async () => {
        try {
          showFlash('Loading contestants...');
          const competitionId = Number(document.getElementById('competition-id').value) || 1;
          const roundIdText = document.getElementById('round-id').value.trim();
          const q = encodeURIComponent(document.getElementById('search-query').value.trim());
          const roundQuery = roundIdText ? '&roundId=' + Number(roundIdText) : '';
          const data = await fetchJson('/judge/contestants?competitionId=' + competitionId + roundQuery + '&q=' + q);
          const rows = data.contestants || [];
          rowsNode.innerHTML = rows.length ? rows.map((row) => '<tr><td>' + safe(toText(row.entry_id)) + '</td><td>' + safe(toText(row.contestant_number)) + '</td><td>' + safe(toText(row.display_name)) + '</td><td>' + safe(toText(row.status)) + '</td><td>' + (row.is_advancing ? 'Yes' : 'No') + '</td></tr>').join('') : '<tr><td colspan="5">No results.</td></tr>';
          showFlash('Loaded.');
        } catch (error) { showFlash(error.message, true); }
      };
      document.getElementById('search').addEventListener('click', search);
      search();`;
    } else {
      content = `
      <section class="glass-panel controls">
        <h2>Contestant Selection</h2>
        <div class="grid two">
          <label>Competition ID
            <input id="competition-id" type="number" min="1" value="1" />
          </label>
          <label>Search Contestants
            <input id="search-query" type="text" placeholder="Name or email" />
          </label>
        </div>
        <div class="row"><button id="search" class="primary" type="button">Search</button></div>
        <p id="flash" class="flash"></p>
      </section>
      <section class="glass-panel">
        <h2>Contestants</h2>
        <div class="table-wrap"><table><thead><tr><th>User ID</th><th>Contestant #</th><th>Name</th><th>Email</th><th>In Competition</th><th>Actions</th></tr></thead><tbody id="rows"></tbody></table></div>
      </section>`;

      script = `
      const flash = document.getElementById('flash');
      const rowsNode = document.getElementById('rows');
      const showFlash = (text, isError) => { flash.textContent = text; flash.className = isError ? 'flash error' : 'flash'; };
      const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
      const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);
      const fetchJson = async (path, options = {}) => { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body; };

      const load = async () => {
        try {
          showFlash('Searching contestants...');
          const competitionId = Number(document.getElementById('competition-id').value) || 1;
          const q = encodeURIComponent(document.getElementById('search-query').value.trim());
          const data = await fetchJson('/admin/contestant-users?competitionId=' + competitionId + '&q=' + q);
          const rows = data.users || [];
          rowsNode.innerHTML = rows.length ? rows.map((row) => {
            const action = row.entry_id ? '<button data-action="remove" data-user-id="' + row.user_id + '">Remove</button>' : '<button data-action="add" data-user-id="' + row.user_id + '">Add</button>';
            return '<tr><td>' + safe(toText(row.user_id)) + '</td><td>' + safe(toText(row.contestant_number)) + '</td><td>' + safe(toText(row.display_name)) + '</td><td>' + safe(toText(row.email)) + '</td><td>' + (row.entry_id ? 'Yes' : 'No') + '</td><td>' + action + '</td></tr>';
          }).join('') : '<tr><td colspan="6">No contestants found.</td></tr>';
          showFlash('Contestants loaded.');
        } catch (error) { showFlash(error.message, true); }
      };

      rowsNode.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        try {
          const competitionId = Number(document.getElementById('competition-id').value) || 1;
          const userId = Number(button.getAttribute('data-user-id'));
          const action = button.getAttribute('data-action');
          await fetchJson('/admin/contestant-membership', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ competitionId, userId, action })
          });
          showFlash(action === 'add' ? 'Contestant added.' : 'Contestant removed.');
          await load();
        } catch (error) { showFlash(error.message, true); }
      });

      document.getElementById('search').addEventListener('click', load);
      load();`;
    }
  }

  if (activeNav.key === 'user-settings') {
    content = `
    <section class="glass-panel controls">
      <h2>User Settings</h2>
      <div class="grid two">
        <label>Display Name
          <input id="new-display-name" type="text" placeholder="Judge Nova" />
        </label>
        <label>Email
          <input id="new-email" type="email" placeholder="judge@tremendicon.com" />
        </label>
      </div>
      <div class="grid two">
        <label>Temporary Password
          <input id="new-password" type="password" placeholder="TempPass123" />
        </label>
        <label>Role
          <select id="new-role"><option value="judge">judge</option><option value="admin">admin</option></select>
        </label>
      </div>
      <div class="row"><button id="create-user" type="button" class="primary">Create User</button></div>
      <hr class="neon-divider" />
      <div class="grid two">
        <label>Search Users
          <input id="search-query" type="text" placeholder="Name or email" />
        </label>
        <label>Role Filter
          <select id="role-filter"><option value="">all</option><option value="admin">admin</option><option value="judge">judge</option><option value="contestant">contestant</option></select>
        </label>
      </div>
      <div class="row"><button id="load-users" type="button">Load Users</button></div>
      <hr class="neon-divider" />
      <h3 style="margin: 0 0 8px;">My Profile</h3>
      <div class="grid two">
        <label>New Display Name
          <input id="profile-display-name" type="text" placeholder="Optional" />
        </label>
        <label>New Email
          <input id="profile-email" type="email" placeholder="Optional" />
        </label>
      </div>
      <div class="grid two">
        <label>Current Password
          <input id="profile-current-password" type="password" />
        </label>
        <label>New Password
          <input id="profile-new-password" type="password" minlength="8" />
        </label>
      </div>
      <div class="row"><button id="save-profile" type="button">Save Profile</button></div>
      <p id="flash" class="flash"></p>
    </section>

    <section class="glass-panel">
      <h2>Users</h2>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead><tbody id="users-table"></tbody></table></div>
    </section>`;

    script = `
    const flash = document.getElementById('flash');
    const usersTable = document.getElementById('users-table');
    const showFlash = (text, isError) => { flash.textContent = text; flash.className = isError ? 'flash error' : 'flash'; };
    const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);
    const fetchJson = async (path, options = {}) => { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Request failed'); return body; };

    const loadUsers = async () => {
      try {
        showFlash('Loading users...');
        const q = encodeURIComponent(document.getElementById('search-query').value.trim());
        const role = encodeURIComponent(document.getElementById('role-filter').value);
        const data = await fetchJson('/admin/users?q=' + q + '&role=' + role);
        const rows = data.users || [];
        usersTable.innerHTML = rows.length ? rows.map((row) => '<tr><td>' + safe(toText(row.id)) + '</td><td>' + safe(toText(row.display_name)) + '</td><td>' + safe(toText(row.email)) + '</td><td>' + safe(toText(row.role)) + '</td><td>' + (row.is_active ? 'Yes' : 'No') + '</td><td><button data-action="toggle" data-user-id="' + row.id + '" data-active="' + (row.is_active ? '1' : '0') + '">' + (row.is_active ? 'Disable' : 'Enable') + '</button> <button data-action="reset" data-user-id="' + row.id + '">Reset Temp Password</button></td></tr>').join('') : '<tr><td colspan="6">No users found.</td></tr>';
        showFlash('Users loaded.');
      } catch (error) { showFlash(error.message, true); }
    };

    document.getElementById('create-user').addEventListener('click', async () => {
      try {
        const payload = {
          displayName: document.getElementById('new-display-name').value.trim(),
          email: document.getElementById('new-email').value.trim(),
          tempPassword: document.getElementById('new-password').value,
          role: document.getElementById('new-role').value
        };
        await fetchJson('/admin/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('User created. Temporary password reset required on first login.');
        loadUsers();
      } catch (error) { showFlash(error.message, true); }
    });

    document.getElementById('save-profile').addEventListener('click', async () => {
      try {
        const payload = {
          displayName: document.getElementById('profile-display-name').value.trim(),
          email: document.getElementById('profile-email').value.trim(),
          currentPassword: document.getElementById('profile-current-password').value,
          newPassword: document.getElementById('profile-new-password').value
        };
        await fetchJson('/admin/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        showFlash('Profile updated.');
      } catch (error) { showFlash(error.message, true); }
    });

    usersTable.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const userId = Number(button.getAttribute('data-user-id'));
      const action = button.getAttribute('data-action');

      try {
        if (action === 'toggle') {
          const isActive = button.getAttribute('data-active') === '1';
          await fetchJson('/admin/users/' + userId + '/status', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ isActive: !isActive })
          });
          showFlash('User status updated.');
        }
        if (action === 'reset') {
          const tempPassword = prompt('Enter a temporary password (min 8 chars):');
          if (!tempPassword) return;
          await fetchJson('/admin/users/' + userId + '/temp-password', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tempPassword })
          });
          showFlash('Temporary password set. User must reset on first login.');
        }
        loadUsers();
      } catch (error) { showFlash(error.message, true); }
    });

    document.getElementById('load-users').addEventListener('click', loadUsers);
    loadUsers();`;
  }

  const navHtml = navItems.map((item) => `<li><a class="${item.key === activeNav.key ? 'active' : ''}" href="${item.href}">${escapeHtml(item.label)}</a></li>`).join('');
  const optionsHtml = navItems.map((item) => `<option value="${item.href}" ${item.key === activeNav.key ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');

  return new Response(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${getNeonThemeStyles()}</style>
</head>
<body>
  <main class="neon-shell">
    <header>
      <div>
        <div class="chrome-logo" style="font-size: clamp(1.1rem, 3.6vw, 1.8rem);">${escapeHtml(title)}</div>
        <h1 class="neon-title" style="font-size: 1.3rem; margin-bottom: 4px;">Mission Control Workspace <span class="starburst">✦</span></h1>
        <p class="neon-subtitle">Signed in as ${escapeHtml(user.displayName || user.email)} (${escapeHtml(user.role)}).</p>
      </div>
      <button id="logout" type="button">Log Out</button>
    </header>
    <hr class="neon-divider" />

    <div class="portal-mobile-nav">
      <label for="mobile-nav">Navigate</label>
      <select id="mobile-nav">${optionsHtml}</select>
    </div>

    <div class="portal-layout">
      <aside class="portal-nav glass-panel">
        <h2 style="margin-top: 0;">Menu</h2>
        <ul class="portal-nav-list">${navHtml}</ul>
      </aside>
      <section>
        ${content}
      </section>
    </div>
  </main>

  <script>
    document.getElementById('logout').addEventListener('click', async () => {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.assign('/login');
    });
    const mobileNav = document.getElementById('mobile-nav');
    if (mobileNav) mobileNav.addEventListener('change', () => { window.location.assign(mobileNav.value); });
    ${script}
  </script>
</body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

function renderRolePortal(portal, user) {
  const title = portal === 'admin' ? 'Admin Portal' : (portal === 'judge' ? 'Judge Portal' : 'Contestant Portal');
  const dashboard = portal === 'admin'
    ? `
    <section class="glass-panel controls">
      <h2>Dashboard Filters</h2>
      <div class="grid two">
        <label>Event ID
          <input id="event-id" type="number" min="1" value="1" />
        </label>
        <label>Competition ID
          <input id="competition-id" type="number" min="1" value="1" />
        </label>
      </div>
      <div class="row">
        <button id="load-dashboard" class="primary" type="button">Load Dashboard</button>
        <button id="load-schedule" type="button">Load Schedule</button>
      </div>
      <div class="row">
        <a id="csv-contestants" href="/admin/export/contestants.csv?competitionId=1">Contestants CSV</a>
        <a id="csv-scores" href="/admin/export/scores.csv?competitionId=1">Scores CSV</a>
        <a id="csv-schedule" href="/admin/export/schedule.csv?competitionId=1">Schedule CSV</a>
      </div>
      <p id="flash" class="flash"></p>
    </section>

    <section class="glass-panel">
      <h2>Totals</h2>
      <div id="totals" class="cards"></div>
    </section>

    <section class="glass-panel">
      <h2>Round Performance</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Contestants</th>
              <th>Scores Submitted</th>
              <th>Average Score</th>
            </tr>
          </thead>
          <tbody id="round-table"></tbody>
        </table>
      </div>
    </section>

    <section class="glass-panel">
      <h2>Judge Progress</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Judge</th>
              <th>Assignments</th>
              <th>Scores Submitted</th>
            </tr>
          </thead>
          <tbody id="judge-table"></tbody>
        </table>
      </div>
    </section>

    <section class="glass-panel">
      <h2>Schedule</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Round</th>
              <th>Judging Time</th>
              <th>Location</th>
              <th>Reserved</th>
              <th>Contestants</th>
            </tr>
          </thead>
          <tbody id="schedule-table"></tbody>
        </table>
      </div>
    </section>`
    : portal === 'judge' ? `
    <section class="glass-panel controls">
      <h2>Judge Tools</h2>
      <div class="grid three">
        <label>Competition ID
          <input id="competition-id" type="number" min="1" value="1" />
        </label>
        <label>Round ID (optional)
          <input id="round-id" type="number" min="1" placeholder="Any" />
        </label>
        <label>Search
          <input id="search-query" type="text" placeholder="Contestant number or name" />
        </label>
      </div>
      <div class="row">
        <button id="search-contestants" class="primary" type="button">Search Contestants</button>
        <button id="load-leaderboard" type="button">Load Leaderboard</button>
        <button id="load-schedule" type="button">Load Schedule</button>
      </div>
      <p id="flash" class="flash"></p>
    </section>

    <section class="glass-panel">
      <h2>Contestant Search</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entry ID</th>
              <th>Contestant #</th>
              <th>Name</th>
              <th>Status</th>
              <th>Advancing</th>
            </tr>
          </thead>
          <tbody id="contestant-table"></tbody>
        </table>
      </div>
    </section>

    <section class="glass-panel">
      <h2>Leaderboard</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Contestant #</th>
              <th>Name</th>
              <th>Avg Score</th>
              <th>Judges Scored</th>
              <th>Advancing</th>
            </tr>
          </thead>
          <tbody id="leaderboard-table"></tbody>
        </table>
      </div>
    </section>

    <section class="glass-panel">
      <h2>Schedule</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Round</th>
              <th>Judging Time</th>
              <th>Location</th>
              <th>Contestant #</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody id="schedule-table"></tbody>
        </table>
      </div>
    </section>`
    : `
    <section class="glass-panel controls">
      <h2>Contestant Tools</h2>
      <div class="grid two">
        <label>Competition ID
          <input id="competition-id" type="number" min="1" value="1" />
        </label>
        <label>Entry ID
          <input id="entry-id" type="number" min="1" value="1" />
        </label>
      </div>
      <div class="row">
        <button id="load-form-fields" class="primary" type="button">Load Form Fields</button>
        <button id="save-draft" type="button">Save Draft</button>
        <button id="load-schedule" type="button">Load My Schedule</button>
      </div>
      <div class="row">
        <button id="load-review" type="button">Load Review</button>
        <button id="submit-entry" type="button">Submit Entry</button>
        <button id="load-results" type="button">Load Results</button>
      </div>
      <p id="flash" class="flash"></p>
    </section>

    <section class="glass-panel">
      <h2>Response</h2>
      <div class="table-wrap">
        <pre id="contestant-output" style="margin:0; white-space:pre-wrap; color:#cfe9ff; font-size:0.9rem;"></pre>
      </div>
    </section>`;

  const script = portal === 'admin'
    ? `
    const flash = document.getElementById('flash');
    const totalsNode = document.getElementById('totals');
    const roundTable = document.getElementById('round-table');
    const judgeTable = document.getElementById('judge-table');
    const scheduleTable = document.getElementById('schedule-table');

    const eventIdInput = document.getElementById('event-id');
    const competitionIdInput = document.getElementById('competition-id');

    const csvContestants = document.getElementById('csv-contestants');
    const csvScores = document.getElementById('csv-scores');
    const csvSchedule = document.getElementById('csv-schedule');

    const showFlash = (text, isError) => {
      flash.textContent = text;
      flash.className = isError ? 'flash error' : 'flash';
    };

    const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);

    const updateCsvLinks = () => {
      const competitionId = Number(competitionIdInput.value) || 1;
      csvContestants.href = '/admin/export/contestants.csv?competitionId=' + competitionId;
      csvScores.href = '/admin/export/scores.csv?competitionId=' + competitionId;
      csvSchedule.href = '/admin/export/schedule.csv?competitionId=' + competitionId;
    };

    const fetchJson = async (path) => {
      const response = await fetch(path);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      return body;
    };

    const renderTotals = (totals) => {
      const cards = [
        ['Total Entries', toText(totals.total_entries)],
        ['No-Shows', toText(totals.no_show_count)],
        ['Average Score', toText(totals.average_score)],
        ['Judges Active', toText(totals.judges_active)]
      ];
      totalsNode.innerHTML = cards.map(([label, value]) => '<article class="card"><h3>' + safe(label) + '</h3><p>' + safe(value) + '</p></article>').join('');
    };

    const renderRoundTable = (rows) => {
      if (!rows.length) {
        roundTable.innerHTML = '<tr><td colspan="4">No round data.</td></tr>';
        return;
      }
      roundTable.innerHTML = rows.map((row) => (
        '<tr>' +
        '<td>' + safe(toText(row.round_name)) + '</td>' +
        '<td>' + safe(toText(row.contestants)) + '</td>' +
        '<td>' + safe(toText(row.scores_submitted)) + '</td>' +
        '<td>' + safe(toText(row.average_round_score)) + '</td>' +
        '</tr>'
      )).join('');
    };

    const renderJudgeTable = (rows) => {
      if (!rows.length) {
        judgeTable.innerHTML = '<tr><td colspan="3">No judge progress found.</td></tr>';
        return;
      }
      judgeTable.innerHTML = rows.map((row) => (
        '<tr>' +
        '<td>' + safe(toText(row.display_name)) + '</td>' +
        '<td>' + safe(toText(row.assignment_count)) + '</td>' +
        '<td>' + safe(toText(row.score_count)) + '</td>' +
        '</tr>'
      )).join('');
    };

    const renderSchedule = (rows) => {
      if (!rows.length) {
        scheduleTable.innerHTML = '<tr><td colspan="6">No schedule slots found.</td></tr>';
        return;
      }
      scheduleTable.innerHTML = rows.map((row) => (
        '<tr>' +
        '<td>' + safe(toText(row.slot_id)) + '</td>' +
        '<td>' + safe(toText(row.round_id)) + '</td>' +
        '<td>' + safe(toText(row.judging_time)) + '</td>' +
        '<td>' + safe(toText(row.location)) + '</td>' +
        '<td>' + safe(toText(row.reserved_count)) + '/' + safe(toText(row.capacity)) + '</td>' +
        '<td>' + safe(toText(row.contestant_numbers)) + '</td>' +
        '</tr>'
      )).join('');
    };

    const loadDashboard = async () => {
      try {
        showFlash('Loading dashboard...');
        const eventId = Number(eventIdInput.value) || 1;
        const data = await fetchJson('/admin/dashboard?eventId=' + eventId);
        renderTotals(data.totals || {});
        renderRoundTable(data.perRound || []);
        renderJudgeTable(data.judgeProgress || []);
        showFlash('Dashboard loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    };

    const loadSchedule = async () => {
      try {
        showFlash('Loading schedule...');
        const competitionId = Number(competitionIdInput.value) || 1;
        const data = await fetchJson('/admin/schedule?competitionId=' + competitionId);
        renderSchedule(data.schedule || []);
        showFlash('Schedule loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    };

    competitionIdInput.addEventListener('input', updateCsvLinks);
    document.getElementById('load-dashboard').addEventListener('click', loadDashboard);
    document.getElementById('load-schedule').addEventListener('click', loadSchedule);

    updateCsvLinks();
    loadDashboard();
    loadSchedule();`
    : portal === 'judge' ? `
    const flash = document.getElementById('flash');
    const contestantTable = document.getElementById('contestant-table');
    const leaderboardTable = document.getElementById('leaderboard-table');
    const scheduleTable = document.getElementById('schedule-table');

    const competitionIdInput = document.getElementById('competition-id');
    const roundIdInput = document.getElementById('round-id');
    const searchInput = document.getElementById('search-query');

    const showFlash = (text, isError) => {
      flash.textContent = text;
      flash.className = isError ? 'flash error' : 'flash';
    };

    const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const toText = (value) => value === null || value === undefined || value === '' ? '-' : String(value);

    const fetchJson = async (path) => {
      const response = await fetch(path);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      return body;
    };

    const ids = () => {
      const competitionId = Number(competitionIdInput.value) || 1;
      const roundId = roundIdInput.value.trim() ? Number(roundIdInput.value) : null;
      return { competitionId, roundId };
    };

    const renderContestants = (rows) => {
      if (!rows.length) {
        contestantTable.innerHTML = '<tr><td colspan="5">No contestants found.</td></tr>';
        return;
      }
      contestantTable.innerHTML = rows.map((row) => (
        '<tr>' +
        '<td>' + safe(toText(row.entry_id)) + '</td>' +
        '<td>' + safe(toText(row.contestant_number)) + '</td>' +
        '<td>' + safe(toText(row.display_name)) + '</td>' +
        '<td>' + safe(toText(row.status)) + '</td>' +
        '<td>' + (row.is_advancing ? 'Yes' : 'No') + '</td>' +
        '</tr>'
      )).join('');
    };

    const renderLeaderboard = (rows) => {
      if (!rows.length) {
        leaderboardTable.innerHTML = '<tr><td colspan="6">No leaderboard data.</td></tr>';
        return;
      }
      leaderboardTable.innerHTML = rows.map((row) => (
        '<tr>' +
        '<td>' + safe(toText(row.rank)) + '</td>' +
        '<td>' + safe(toText(row.contestant_number)) + '</td>' +
        '<td>' + safe(toText(row.contestant_name)) + '</td>' +
        '<td>' + safe(toText(row.average_score)) + '</td>' +
        '<td>' + safe(toText(row.judges_scored)) + '</td>' +
        '<td>' + (row.is_advancing ? 'Yes' : 'No') + '</td>' +
        '</tr>'
      )).join('');
    };

    const renderSchedule = (rows) => {
      if (!rows.length) {
        scheduleTable.innerHTML = '<tr><td colspan="6">No schedule entries.</td></tr>';
        return;
      }
      scheduleTable.innerHTML = rows.map((row) => (
        '<tr>' +
        '<td>' + safe(toText(row.slot_id)) + '</td>' +
        '<td>' + safe(toText(row.round_id)) + '</td>' +
        '<td>' + safe(toText(row.judging_time)) + '</td>' +
        '<td>' + safe(toText(row.location)) + '</td>' +
        '<td>' + safe(toText(row.contestant_number)) + '</td>' +
        '<td>' + safe(toText(row.contestant_name)) + '</td>' +
        '</tr>'
      )).join('');
    };

    const searchContestants = async () => {
      try {
        showFlash('Searching contestants...');
        const { competitionId, roundId } = ids();
        const q = encodeURIComponent(searchInput.value.trim());
        const roundQuery = roundId ? '&roundId=' + roundId : '';
        const data = await fetchJson('/judge/contestants?competitionId=' + competitionId + roundQuery + '&q=' + q);
        renderContestants(data.contestants || []);
        showFlash('Contestants loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    };

    const loadLeaderboard = async () => {
      try {
        showFlash('Loading leaderboard...');
        const { competitionId, roundId } = ids();
        const roundQuery = roundId ? '&roundId=' + roundId : '';
        const data = await fetchJson('/judge/leaderboard?competitionId=' + competitionId + roundQuery);
        renderLeaderboard(data.leaderboard || []);
        showFlash('Leaderboard loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    };

    const loadSchedule = async () => {
      try {
        showFlash('Loading schedule...');
        const { competitionId } = ids();
        const data = await fetchJson('/judge/schedule?competitionId=' + competitionId);
        renderSchedule(data.schedule || []);
        showFlash('Schedule loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    };

    document.getElementById('search-contestants').addEventListener('click', searchContestants);
    document.getElementById('load-leaderboard').addEventListener('click', loadLeaderboard);
    document.getElementById('load-schedule').addEventListener('click', loadSchedule);

    searchContestants();
    loadLeaderboard();
    loadSchedule();`
    : `
    const flash = document.getElementById('flash');
    const output = document.getElementById('contestant-output');
    const competitionIdInput = document.getElementById('competition-id');
    const entryIdInput = document.getElementById('entry-id');

    const showFlash = (text, isError) => {
      flash.textContent = text;
      flash.className = isError ? 'flash error' : 'flash';
    };

    const showOutput = (data) => {
      output.textContent = JSON.stringify(data, null, 2);
    };

    const fetchJson = async (path, options = {}) => {
      const response = await fetch(path, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      return body;
    };

    const competitionId = () => Number(competitionIdInput.value) || 1;
    const entryId = () => Number(entryIdInput.value) || 1;

    document.getElementById('load-form-fields').addEventListener('click', async () => {
      try {
        showFlash('Loading form fields...');
        const data = await fetchJson('/contestant/form-fields?competitionId=' + competitionId());
        showOutput(data);
        showFlash('Form fields loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    });

    document.getElementById('save-draft').addEventListener('click', async () => {
      try {
        showFlash('Saving draft...');
        const data = await fetchJson('/competitions/' + competitionId() + '/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ submission: {}, consents: {} })
        });
        showOutput(data);
        showFlash('Draft saved.');
      } catch (error) {
        showFlash(error.message, true);
      }
    });

    document.getElementById('load-schedule').addEventListener('click', async () => {
      try {
        showFlash('Loading schedule...');
        const data = await fetchJson('/contestant/schedule');
        showOutput(data);
        showFlash('Schedule loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    });

    document.getElementById('load-review').addEventListener('click', async () => {
      try {
        showFlash('Loading entry review...');
        const data = await fetchJson('/entries/' + entryId() + '/review');
        showOutput(data);
        showFlash('Entry review loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    });

    document.getElementById('submit-entry').addEventListener('click', async () => {
      try {
        showFlash('Submitting entry...');
        const data = await fetchJson('/entries/' + entryId() + '/submit', { method: 'POST' });
        showOutput(data);
        showFlash('Entry submitted.');
      } catch (error) {
        showFlash(error.message, true);
      }
    });

    document.getElementById('load-results').addEventListener('click', async () => {
      try {
        showFlash('Loading results...');
        const data = await fetchJson('/contestant/results/' + entryId());
        showOutput(data);
        showFlash('Results loaded.');
      } catch (error) {
        showFlash(error.message, true);
      }
    });

    // quick default view for signed-in contestants
    fetchJson('/contestant/schedule').then((data) => {
      showOutput(data);
      showFlash('Welcome! Schedule loaded.');
    }).catch((error) => {
      showFlash(error.message, true);
    });`;

  return new Response(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${getNeonThemeStyles()}</style>
</head>
<body>
  <main class="neon-shell">
    <header>
      <div>
        <div class="chrome-logo" style="font-size: clamp(1.1rem, 3.6vw, 1.8rem);">${escapeHtml(title)}</div>
        <h1 class="neon-title" style="font-size: 1.3rem; margin-bottom: 4px;">Mission Control Workspace <span class="starburst">✦</span></h1>
        <p class="neon-subtitle">Signed in as ${escapeHtml(user.displayName || user.email)} (${escapeHtml(user.role)}).</p>
      </div>
      <button id="logout" type="button">Log Out</button>
    </header>

    <hr class="neon-divider" />

    ${dashboard}
  </main>

  <script>
    ${script}

    document.getElementById('logout').addEventListener('click', async () => {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.assign('/login');
    });
  </script>
</body>
</html>`, {
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

  const user = await env.DB.prepare(
    'SELECT id, email, password_salt, password_hash, role, display_name, is_active, password_reset_required FROM users WHERE email = ?'
  ).bind(email).first();
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

async function changePassword(request, env) {
  const user = await requireAuth(request, env, { allowPasswordResetPending: true });
  const payload = await parseJsonBody(request);
  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return jsonResponse({ error: 'currentPassword and newPassword (min 8) are required' }, 400);
  }

  const row = await env.DB.prepare('SELECT id, password_salt, password_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!row) return jsonResponse({ error: 'User not found' }, 404);

  const currentHash = await hashPassword(currentPassword, row.password_salt);
  if (currentHash !== row.password_hash) return jsonResponse({ error: 'Current password is incorrect' }, 401);

  const passwordSalt = generatePasswordSalt();
  const passwordHash = await hashPassword(newPassword, passwordSalt);
  await env.DB.prepare(
    'UPDATE users SET password_salt = ?, password_hash = ?, password_reset_required = 0 WHERE id = ?'
  ).bind(passwordSalt, passwordHash, user.id).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'password_changed',
    targetType: 'user',
    targetId: String(user.id),
    details: { via: 'forced_reset' }
  });

  return jsonResponse({ message: 'Password updated' });
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

async function adminListContestantUsers(url, env, _user) {
  const competitionId = Number(url.searchParams.get('competitionId'));
  const q = (url.searchParams.get('q') || '').trim();
  if (!competitionId) return jsonResponse({ error: 'competitionId is required' }, 400);

  const rows = await env.DB.prepare(
    `SELECT u.id AS user_id,
            u.display_name,
            u.email,
            ct.contestant_number,
            e.id AS entry_id,
            e.status
     FROM users u
     LEFT JOIN contestants ct ON ct.user_id = u.id
     LEFT JOIN entries e ON e.contestant_id = ct.id AND e.competition_id = ?
     WHERE u.role = 'contestant'
       AND (u.display_name LIKE ? OR u.email LIKE ?)
     ORDER BY u.display_name
     LIMIT 200`
  ).bind(competitionId, `%${q}%`, `%${q}%`).all();

  return jsonResponse({ users: rows.results || [] });
}

async function adminSetContestantMembership(request, env, user) {
  const payload = await parseJsonBody(request);
  const competitionId = Number(payload.competitionId);
  const userId = Number(payload.userId);
  const action = String(payload.action || '').trim();
  if (!competitionId || !userId || !['add', 'remove'].includes(action)) {
    return jsonResponse({ error: 'competitionId, userId, and action(add|remove) are required' }, 400);
  }

  const targetUser = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
  if (!targetUser || targetUser.role !== 'contestant') return jsonResponse({ error: 'Target user must be a contestant' }, 400);

  const competition = await env.DB.prepare('SELECT id FROM competitions WHERE id = ?').bind(competitionId).first();
  if (!competition) return jsonResponse({ error: 'Competition not found' }, 404);

  const contestant = await ensureContestantProfile(env, userId);
  const existing = await env.DB.prepare('SELECT id FROM entries WHERE competition_id = ? AND contestant_id = ?').bind(competitionId, contestant.id).first();

  if (action === 'add') {
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO entries (competition_id, contestant_id, status, submission_json, private_results_token)
         VALUES (?, ?, 'draft', '{}', ?)`
      ).bind(competitionId, contestant.id, `entry-${randomToken()}`).run();
    }
    await logAudit(env, {
      actorUserId: user.id,
      action: 'contestant_membership_added',
      competitionId,
      targetType: 'contestant',
      targetId: String(contestant.id),
      details: { userId }
    });
    return jsonResponse({ message: 'Contestant added to competition' });
  }

  if (existing) {
    await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(existing.id).run();
  }
  await logAudit(env, {
    actorUserId: user.id,
    action: 'contestant_membership_removed',
    competitionId,
    targetType: 'contestant',
    targetId: String(contestant.id),
    details: { userId }
  });
  return jsonResponse({ message: 'Contestant removed from competition' });
}

async function adminListUsers(url, env, _user) {
  const q = (url.searchParams.get('q') || '').trim();
  const role = (url.searchParams.get('role') || '').trim();
  const rows = await env.DB.prepare(
    `SELECT id, display_name, email, role, is_active, created_at
     FROM users
     WHERE (? = '' OR role = ?)
       AND (display_name LIKE ? OR email LIKE ?)
     ORDER BY created_at DESC
     LIMIT 300`
  ).bind(role, role, `%${q}%`, `%${q}%`).all();
  return jsonResponse({ users: rows.results || [] });
}

async function adminCreateUser(request, env, user) {
  const payload = await parseJsonBody(request);
  const displayName = String(payload.displayName || '').trim();
  const email = normalizeEmail(payload.email);
  const tempPassword = String(payload.tempPassword || '');
  const role = String(payload.role || '').trim();

  if (!displayName || !email || tempPassword.length < 8 || !['admin', 'judge'].includes(role)) {
    return jsonResponse({ error: 'displayName, email, tempPassword (min 8), and role(admin|judge) are required' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return jsonResponse({ error: 'Email already registered' }, 409);

  const passwordSalt = generatePasswordSalt();
  const passwordHash = await hashPassword(tempPassword, passwordSalt);
  const insert = await env.DB.prepare(
    `INSERT INTO users (email, password_salt, password_hash, role, display_name, password_reset_required)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).bind(email, passwordSalt, passwordHash, role, displayName).run();

  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(insert.meta.last_row_id).run();
  await logAudit(env, {
    actorUserId: user.id,
    action: 'user_created',
    targetType: 'user',
    targetId: String(insert.meta.last_row_id),
    details: { email, role, forcedReset: true }
  });
  return jsonResponse({ message: 'User created', userId: insert.meta.last_row_id }, 201);
}

async function adminSetUserStatus(request, env, user, userId) {
  if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
  const payload = await parseJsonBody(request);
  const isActive = payload.isActive ? 1 : 0;

  await env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(isActive, userId).run();
  if (!isActive) {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  }

  await logAudit(env, {
    actorUserId: user.id,
    action: 'user_status_changed',
    targetType: 'user',
    targetId: String(userId),
    details: { isActive: Boolean(isActive) }
  });
  return jsonResponse({ message: 'User status updated' });
}

async function adminResetTempPassword(request, env, user, userId) {
  if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
  const payload = await parseJsonBody(request);
  const tempPassword = String(payload.tempPassword || '');
  if (tempPassword.length < 8) return jsonResponse({ error: 'tempPassword must be at least 8 characters' }, 400);

  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!row) return jsonResponse({ error: 'User not found' }, 404);

  const salt = generatePasswordSalt();
  const hash = await hashPassword(tempPassword, salt);
  await env.DB.prepare(
    'UPDATE users SET password_salt = ?, password_hash = ?, password_reset_required = 1 WHERE id = ?'
  ).bind(salt, hash, userId).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'user_temp_password_reset',
    targetType: 'user',
    targetId: String(userId),
    details: { forcedReset: true }
  });
  return jsonResponse({ message: 'Temporary password set' });
}

async function adminUpdateProfile(request, env, user) {
  const payload = await parseJsonBody(request);
  const displayName = String(payload.displayName || '').trim();
  const email = payload.email ? normalizeEmail(payload.email) : null;
  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');

  const existing = await env.DB.prepare('SELECT id, email, password_salt, password_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!existing) return jsonResponse({ error: 'User not found' }, 404);

  if (newPassword) {
    if (newPassword.length < 8) return jsonResponse({ error: 'newPassword must be at least 8 characters' }, 400);
    if (!currentPassword) return jsonResponse({ error: 'currentPassword is required to change password' }, 400);
    const currentHash = await hashPassword(currentPassword, existing.password_salt);
    if (currentHash !== existing.password_hash) return jsonResponse({ error: 'Current password is incorrect' }, 401);
  }

  let nextSalt = existing.password_salt;
  let nextHash = existing.password_hash;
  if (newPassword) {
    nextSalt = generatePasswordSalt();
    nextHash = await hashPassword(newPassword, nextSalt);
  }

  await env.DB.prepare(
    `UPDATE users
     SET display_name = COALESCE(?, display_name),
         email = COALESCE(?, email),
         password_salt = ?,
         password_hash = ?,
         password_reset_required = 0
     WHERE id = ?`
  ).bind(displayName || null, email || null, nextSalt, nextHash, user.id).run();

  await logAudit(env, {
    actorUserId: user.id,
    action: 'profile_updated',
    targetType: 'user',
    targetId: String(user.id),
    details: { displayNameChanged: Boolean(displayName), emailChanged: Boolean(email), passwordChanged: Boolean(newPassword) }
  });

  return jsonResponse({ message: 'Profile updated' });
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

async function requireAuth(request, env, options = {}) {
  const allowPasswordResetPending = Boolean(options.allowPasswordResetPending);
  const token = getSessionTokenFromRequest(request);
  if (!token) throw new HttpError(401, 'Authentication required');

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.display_name, u.is_active, u.password_reset_required
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!row || !row.is_active) throw new HttpError(401, 'Invalid or expired session');
  if (row.password_reset_required && !allowPasswordResetPending) throw new HttpError(403, 'Password reset required');
  return sanitizeUser(row);
}

async function requireRole(request, env, allowedRoles, options = {}) {
  const user = await requireAuth(request, env, options);
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

  const contestantNumber = `C-${10000 + Number(userId)}`;
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
    displayName: user.display_name,
    requiresPasswordReset: Boolean(user.password_reset_required)
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
