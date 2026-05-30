PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','judge','contestant')),
  display_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  home_content_json TEXT NOT NULL DEFAULT '{}',
  navigation_json TEXT NOT NULL DEFAULT '[]',
  branding_json TEXT NOT NULL DEFAULT '{}',
  moderation_enabled INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consent_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  consent_type TEXT NOT NULL,
  label TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 1,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  division TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  feedback_visible INTEGER NOT NULL DEFAULT 0,
  public_content_json TEXT NOT NULL DEFAULT '{}',
  rules_content TEXT NOT NULL DEFAULT '',
  prizes_content TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  faq_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, slug),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, round_number),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contestants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  contestant_number TEXT NOT NULL UNIQUE,
  private_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS form_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options_json TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  help_text TEXT,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rubric_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS judge_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judge_user_id INTEGER NOT NULL,
  competition_id INTEGER NOT NULL,
  round_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (judge_user_id, competition_id, round_id),
  FOREIGN KEY (judge_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  contestant_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submission_json TEXT NOT NULL DEFAULT '{}',
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_advancing INTEGER NOT NULL DEFAULT 1,
  private_results_token TEXT NOT NULL UNIQUE,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (competition_id, contestant_id),
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (contestant_id) REFERENCES contestants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submission_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  consent_item_id INTEGER NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  UNIQUE (entry_id, consent_item_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (consent_item_id) REFERENCES consent_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL,
  round_id INTEGER,
  check_in_time TEXT NOT NULL,
  judging_time TEXT NOT NULL,
  location TEXT NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS schedule_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (slot_id) REFERENCES schedule_slots(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  round_id INTEGER NOT NULL,
  judge_user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  score REAL NOT NULL CHECK (score >= 1 AND score <= 20),
  private_note TEXT,
  public_feedback TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (entry_id, round_id, judge_user_id, category_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (judge_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES rubric_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  template_key TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, template_key),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  competition_id INTEGER,
  entry_id INTEGER,
  user_id INTEGER,
  template_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  competition_id INTEGER,
  created_by INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  target_scope TEXT NOT NULL,
  target_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER,
  competition_id INTEGER,
  actor_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_competitions_event ON competitions(event_id);
CREATE INDEX IF NOT EXISTS idx_rounds_competition ON rounds(competition_id);
CREATE INDEX IF NOT EXISTS idx_entries_competition ON entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_scores_entry_round ON scores(entry_id, round_id);
CREATE INDEX IF NOT EXISTS idx_assignments_judge ON judge_assignments(judge_user_id);
