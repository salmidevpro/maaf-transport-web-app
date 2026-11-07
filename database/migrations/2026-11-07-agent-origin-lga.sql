-- Run once on existing MAAF databases before deploying the matching app build.
ALTER TABLE agent_profiles
  ADD COLUMN origin_lga VARCHAR(80) NOT NULL DEFAULT '' AFTER origin_state;
