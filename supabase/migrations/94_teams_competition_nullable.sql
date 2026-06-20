ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_competition_id_fkey;
ALTER TABLE teams ALTER COLUMN competition_id DROP NOT NULL;
ALTER TABLE teams ADD CONSTRAINT teams_competition_id_fkey
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teams_orphaned ON teams(competition_id) WHERE competition_id IS NULL;
