Set-Location $PSScriptRoot
$env:BULWARK_BACKEND = 'real'
$env:DATABASE_URL = 'postgresql://bulwark:Blue1984@localhost:5432/bulwark_dev'
$env:NUXT_SESSION_PASSWORD = 'dev-session-password-must-be-at-least-32-characters'
$env:JWT_SECRET = 'dev-jwt-secret-must-be-at-least-32-characters-long-okay'
$env:BULWARK_PDF_STUB = '1'
pnpm dev
