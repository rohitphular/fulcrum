// AUTO-MANAGED by cicd/app-deployment.sh — do not hand-edit.
// Always points at the dev /exec URL — the local browser always talks to dev.
// Prod deploys do not modify this file; prod testing happens against the live
// /exec URL recorded in cicd/envs.json from a deployed environment.
//
// config.js is gitignored — the PIN + TOTP gate protects your data, not this URL.
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA/exec',
};
