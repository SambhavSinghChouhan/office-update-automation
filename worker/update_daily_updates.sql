ALTER TABLE daily_updates ADD COLUMN clock_in TEXT;
ALTER TABLE daily_updates ADD COLUMN clock_out TEXT;

ALTER TABLE daily_updates ADD COLUMN sprint_enabled INTEGER DEFAULT 0;
ALTER TABLE daily_updates ADD COLUMN sprint_clock_in TEXT;
ALTER TABLE daily_updates ADD COLUMN sprint_clock_out TEXT;

ALTER TABLE daily_updates ADD COLUMN ticket_name TEXT;
ALTER TABLE daily_updates ADD COLUMN chat_url TEXT;
ALTER TABLE daily_updates ADD COLUMN chat_snapshot TEXT;

ALTER TABLE daily_updates ADD COLUMN ytb_sent INTEGER DEFAULT 0;
ALTER TABLE daily_updates ADD COLUMN realm_sent INTEGER DEFAULT 0;
ALTER TABLE daily_updates ADD COLUMN completed INTEGER DEFAULT 0;
