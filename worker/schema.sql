CREATE TABLE settings (
    id INTEGER PRIMARY KEY,
    ticket_name TEXT NOT NULL,
    email_status TEXT DEFAULT 'Checked',
    default_clock_out TEXT DEFAULT '23:40',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    sprint INTEGER DEFAULT 0,
    sprint_clock_in TEXT,
    sprint_clock_out TEXT,
    ticket_name TEXT,
    chat_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workflow_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow TEXT,
    status TEXT,
    message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);