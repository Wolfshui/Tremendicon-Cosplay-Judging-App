DELETE FROM audit_logs;
DELETE FROM admin_messages;
DELETE FROM notifications;
DELETE FROM email_templates;
DELETE FROM scores;
DELETE FROM schedule_reservations;
DELETE FROM schedule_slots;
DELETE FROM submission_consents;
DELETE FROM entries;
DELETE FROM judge_assignments;
DELETE FROM rubric_categories;
DELETE FROM form_fields;
DELETE FROM contestants;
DELETE FROM rounds;
DELETE FROM competitions;
DELETE FROM consent_items;
DELETE FROM events;
DELETE FROM sessions;
DELETE FROM users;

INSERT INTO users (id, email, password_salt, password_hash, role, display_name) VALUES
  (1, 'admin@tremendicon.test', 'salt-admin-v1', '46e3f99062e01ed7d75e4ed07bf5f9d6884e55427324460d34441e083656b8f7', 'admin', 'Tremendicon Admin'),
  (2, 'judge@tremendicon.test', 'salt-judge-v1', 'b45548723b8d4d9ad363c3f68f4fd5283a39616a12036aa110a9eeaaa9101449', 'judge', 'Head Judge'),
  (3, 'contestant@tremendicon.test', 'salt-contestant-v1', 'ade962ea498998b88e07238a94de37f0dec5f1a5b3fd3174d1a31feebe18cf2d', 'contestant', 'Demo Contestant');

INSERT INTO events (id, name, slug, description, home_content_json, navigation_json, branding_json, moderation_enabled, is_public)
VALUES (
  1,
  'Tremendicon 2026 Cosplay Championship',
  'tremendicon-2026',
  'Multi-division cosplay judging event with configurable rounds and scoring.',
  '{"hero":"Welcome to Tremendicon cosplay tournaments","cta":"Apply now"}',
  '["Home","Competitions","Schedule","FAQ"]',
  '{"primaryColor":"#5A31F4","secondaryColor":"#F9B233","logoText":"Tremendicon"}',
  1,
  1
);

INSERT INTO consent_items (event_id, consent_type, label, is_required, display_order) VALUES
  (1, 'waiver', 'I agree to the cosplay event liability waiver', 1, 1),
  (1, 'media_release', 'I consent to photography and video publication', 1, 2),
  (1, 'minor_guardian', 'If minor, guardian consent has been obtained', 1, 3),
  (1, 'terms_privacy', 'I accept the terms and privacy policy', 1, 4);

INSERT INTO competitions (id, event_id, name, slug, division, is_active, feedback_visible, public_content_json, rules_content, prizes_content, deadline, faq_json)
VALUES
  (1, 1, 'Youth Cosplay', 'youth', 'Youth', 1, 1, '{"overview":"Youth division for cosplayers under 18."}', 'Follow event safety and craftsmanship rules.', 'Top 3 trophies and sponsor packs', '2026-07-01T23:59:00Z', '[{"q":"Age limit?","a":"Under 18."}]'),
  (2, 1, 'Adult Cosplay', 'adult', 'Adult', 1, 0, '{"overview":"Adult solo division."}', 'No hazardous props. Stage-safe costumes only.', 'Cash prizes for finalists', '2026-07-01T23:59:00Z', '[]'),
  (3, 1, 'Group Cosplay', 'group', 'Group', 1, 0, '{"overview":"Team and group entries welcome."}', 'Groups up to 8 members.', 'Best Performance award', '2026-07-01T23:59:00Z', '[]');

INSERT INTO rounds (id, competition_id, name, round_number) VALUES
  (1, 1, 'Prelims', 1),
  (2, 1, 'Finals', 2),
  (3, 2, 'Prelims', 1),
  (4, 2, 'Finals', 2),
  (5, 3, 'Prelims', 1);

INSERT INTO contestants (id, user_id, contestant_number, private_token)
VALUES (1, 3, 'C-1001', 'contestant-private-1001');

INSERT INTO form_fields (competition_id, field_key, label, field_type, options_json, is_required, display_order, help_text) VALUES
  (1, 'character_name', 'Character Name', 'short_text', NULL, 1, 1, 'Name of character portrayed'),
  (1, 'craft_notes', 'Craftsmanship Notes', 'long_text', NULL, 1, 2, 'Materials and techniques used'),
  (1, 'division_track', 'Experience Division', 'multiple_choice', '["Novice","Intermediate","Master","Youth"]', 1, 3, NULL),
  (1, 'performance_style', 'Performance Type', 'checkbox_list', '["Runway","Skit","Craftsmanship"]', 0, 4, NULL),
  (1, 'years_experience', 'Years of Cosplay Experience', 'numeric', NULL, 0, 5, NULL),
  (1, 'contact_time', 'Preferred Contact Time', 'date_time', NULL, 0, 6, NULL),
  (1, 'reference_links', 'Reference Links', 'external_link', NULL, 1, 7, 'Google Drive or profile links'),
  (1, 'media_links', 'Image or Media Links', 'media_link', NULL, 0, 8, NULL),
  (1, 'guardian_consent', 'Guardian Consent', 'consent_checkbox', NULL, 1, 9, NULL),
  (1, 'social_links', 'Social/Profile Links', 'social_links', NULL, 0, 10, NULL);

INSERT INTO rubric_categories (id, competition_id, name, description, display_order) VALUES
  (1, 1, 'Craftsmanship', 'Construction quality and detail', 1),
  (2, 1, 'Accuracy', 'Faithfulness to source material', 2),
  (3, 1, 'Presentation', 'Stage presence and performance', 3),
  (4, 2, 'Craftsmanship', 'Build quality and complexity', 1),
  (5, 3, 'Team Cohesion', 'Group coordination and impact', 1);

INSERT INTO judge_assignments (judge_user_id, competition_id, round_id) VALUES
  (2, 1, NULL),
  (2, 2, 3);

INSERT INTO entries (id, competition_id, contestant_id, status, submission_json, is_locked, is_advancing, private_results_token, submitted_at)
VALUES
  (
    1,
    1,
    1,
    'submitted',
    '{"character_name":"Sailor Moon","craft_notes":"Hand-sewn bodice and EVA foam accessories","division_track":"Youth","reference_links":["https://drive.google.com/demo"],"social_links":["https://instagram.com/demo"]}',
    1,
    1,
    'entry-private-token-1001',
    '2026-05-01T18:00:00Z'
  );

INSERT INTO submission_consents (entry_id, consent_item_id, accepted)
SELECT 1, id, 1 FROM consent_items WHERE event_id = 1;

INSERT INTO schedule_slots (id, competition_id, round_id, check_in_time, judging_time, location, buffer_minutes, capacity) VALUES
  (1, 1, 1, '2026-08-01T09:00:00Z', '2026-08-01T09:30:00Z', 'Room A', 10, 1),
  (2, 1, 1, '2026-08-01T09:40:00Z', '2026-08-01T10:00:00Z', 'Room A', 10, 1);

INSERT INTO schedule_reservations (slot_id, entry_id) VALUES
  (1, 1);

INSERT INTO scores (entry_id, round_id, judge_user_id, category_id, score, private_note, public_feedback) VALUES
  (1, 1, 2, 1, 16, 'Strong sewing finish', 'Great seam consistency.'),
  (1, 1, 2, 2, 15, 'Accessory color slightly off', 'Excellent attention to details overall.'),
  (1, 1, 2, 3, 17, 'Energetic presentation', 'Confident stage performance.');

INSERT INTO email_templates (event_id, template_key, subject_template, body_template, is_enabled) VALUES
  (1, 'application_received', 'Application Received - {{competition_name}}', 'Thanks {{contestant_name}}, your application was received.', 1),
  (1, 'schedule_assigned', 'Judging Schedule Assigned', 'Your judging slot is {{judging_time}} at {{location}}.', 1),
  (1, 'feedback_published', 'Your Feedback is Available', 'Feedback is now visible on your private score page.', 1),
  (1, 'password_reset', 'Password Reset Request', 'Use this link to reset your password: {{reset_link}}', 1);

INSERT INTO notifications (event_id, competition_id, entry_id, user_id, template_key, payload_json, status) VALUES
  (1, 1, 1, 3, 'application_received', '{"competition_name":"Youth Cosplay"}', 'queued');

INSERT INTO audit_logs (event_id, competition_id, actor_user_id, action, target_type, target_id, details_json) VALUES
  (1, 1, 1, 'seed_data_created', 'system', 'seed', '{"note":"Initial demo data loaded"}');
