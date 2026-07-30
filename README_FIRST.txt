DMH SALES OS v4.0.0 — PRODUCTION CANDIDATE

SOURCE OF TRUTH
GitHub is the source of truth. Upload the CONTENTS of this folder to the repository.
Do not replace src/lib/supabase.ts unless you intentionally change the active project.

WHAT THIS BUILD CONSOLIDATES
- Owner, Employee, and Buyer application routes
- Buyer invitation, NDA, masked review, negotiation, agreement, payment, delivery, commission, and analytics
- Canonical Supabase migrations 001 through 062
- Canonical Supabase Edge Functions only
- v3.1.0 through v3.1.6 database hardening assets
- Production version metadata v4.0.0

APPLICATION ENVIRONMENT VARIABLES
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

SUPABASE EDGE FUNCTION SECRETS
RESEND_API_KEY
APP_URL
OUTREACH_FROM_EMAIL
OUTREACH_FROM_NAME

DEPLOYMENT ORDER
1. Back up the current GitHub repository and Supabase database.
2. Upload this folder's CONTENTS to GitHub.
3. Confirm src/lib/supabase.ts still points to the correct Supabase project.
4. Run only migrations that have not already been applied, in numeric order.
5. Deploy or update Edge Functions from supabase/functions.
6. Confirm Edge Function secrets and APP_URL.
7. Run npm install, then npm run build.
8. Deploy to Netlify and complete PRODUCTION_QA_CHECKLIST.txt.

SECURITY RULES
- Employees can view masked portfolio information only through authorized view paths.
- Employees cannot download masked files or access unmasked file records/paths.
- Buyers receive masked access only after NDA requirements are satisfied.
- Buyers receive unmasked access only after verified payment and owner release.
- Payment verification, final release, and payout controls remain Owner-only.
