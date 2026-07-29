DMH SALES OS v3.0.0 — GOLDEN FOUNDATION

SOURCE OF TRUTH
GitHub is the source of truth. Create a brand-new repository and upload this package once.
Do not connect the old Bolt project to the new repository.

APPLICATION ENVIRONMENT VARIABLES
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

SUPABASE EDGE FUNCTION SECRETS
RESEND_API_KEY
APP_URL                 (your permanent Netlify URL, no trailing slash)
OUTREACH_FROM_EMAIL     info@debtpaper.com
OUTREACH_FROM_NAME      Data Market House

SUPABASE automatically supplies SUPABASE_URL, SUPABASE_ANON_KEY and
SUPABASE_SERVICE_ROLE_KEY to hosted Edge Functions. Do not create custom
secrets beginning with SUPABASE_.

IMPORTANT FUNCTION SECURITY
send-buyer-invite: JWT verification ON
redeem-buyer-invite: JWT verification OFF
inbound-email-webhook: JWT verification OFF
email-provider-webhook: JWT verification OFF

FIRST DEPLOYMENT
1. Create a new GitHub repository.
2. Upload the CONTENTS of this folder, not the folder itself.
3. Create a fresh Bolt project from that repository. Do not let an old Bolt
   workspace sync into the repository.
4. Connect Netlify to the new GitHub repository.
5. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify.
6. Deploy the Supabase migrations in numeric order if using a new Supabase project.
7. Deploy all Supabase Edge Functions.
8. Add Edge Function secrets and set APP_URL to the final Netlify URL.
9. Test Owner -> Employee -> Buyer invitation -> NDA -> Buyer Portal.

This package intentionally excludes old ZIPs, duplicate SQL copies, build artifacts,
notes from previous versions and generated JavaScript configuration duplicates.
