-- Grant superuser privileges to victor and suit
-- This gives them unrestricted access to the database, similar to root.

ALTER USER victor WITH SUPERUSER;
ALTER USER suit WITH SUPERUSER;

-- Grant all privileges on all tables in the public schema
-- This provides granular control if SUPERUSER is too broad.
-- Note: This won't apply to new tables created later.

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO victor;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO victor;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO victor;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO suit;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO suit;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO suit;

-- For any new tables created in the future by other users,
-- grant victor and suit the same privileges automatically.

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO victor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO victor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO victor;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO suit;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO suit;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO suit;
