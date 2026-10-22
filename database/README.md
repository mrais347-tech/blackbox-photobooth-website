# Blackbox backend

Project: iacplaiyqnbekdkhjbak (Singapore). Applied migration: blackbox_private_orders_storage.
blackbox-schema.sql records that migration; do not replay it on an initialized project.

## Implemented
- Private order-originals (8 MiB, JPEG/PNG/WebP) and order-renders (5 MiB, JPEG/PNG) buckets.
- Orders and asset manifest with RLS and explicit grants.
- Approved staff can read orders/assets and edit fulfillment status/tracking only.
- Only trusted server code can create orders/assets or update payment fields.
- Staff allowlist is keyed to Supabase Auth user ID. Users cannot add themselves.
- Admin page: /admin.html. Password sign-in, in-memory session, latest 100 orders, 60-second signed photo links, fulfillment updates.
- Test orders default true. Printing/shipping blocked unless payment_status is paid.

## Activation tasks
1. Obtain owner/staff email from the user. Provision an Auth account securely, then add its actual Auth UUID to blackbox_admins using trusted administration. Do not insert account passwords in SQL or commit them.
2. Verify password login, signed downloads and order updates end-to-end with that staff account.
3. Preview test uploads are implemented by the test-orders Edge Function. It issues four signed upload slots, authenticates each session with a random 256-bit bearer token (hash stored in DB), validates delivery/design fields, checks file size/type/signatures, and atomically saves an unpaid test order. The endpoint has an atomic lifetime cap of 10 sessions and 3 sessions per hashed IP per hour. Direct public table writes/storage uploads remain denied. Replace these preview limits with CAPTCHA and production quotas before opening checkout.
4. Store originals as <order UUID>/<random file UUID>.<extension>, and the rendered preview in order-renders. Record each in order_assets. Original image formats must be decoded/verified before print processing; MIME restrictions alone do not validate bytes.
5. Confirm print dimensions/DPI, set quantities, prices and shipping with the owner. Current canvas is a preview, not a certified print-ready export.
6. Implement verified Billplz callbacks; browser redirects must never mark orders paid.
7. Agree photo retention period and implement retryable Storage API deletion plus manifest cleanup. SQL deletion of a manifest/order does not delete stored files. No automatic retention job exists yet.

## Verification
Transaction-scoped synthetic user/order tests (rolled back): non-admin and forged user_metadata cannot see orders; approved admin can read and update tracking; admin cannot change payment_status; unpaid orders cannot enter printing. Security advisor: no findings at setup.
Customer test-upload API verified with synthetic photos: all four private files stored, wrong token rejected, completed order saved once on repeated submissions. Staff browser access still needs account activation. Live checkout remains closed.

## Test upload implementation

Applied migration: private_test_upload_sessions, source in test-orders.sql. Edge source in supabase/functions/test-orders/index.ts; deploy as test-orders with verify_jwt=false because session authentication is implemented in the function. No service key is included in browser code. Browser users explicitly consent before uploading. Drafts expire after two hours. Signed upload tokens also expire after two hours. Files are immutable via the signed slots; no overwrite token is issued. JPEG originals are converted client-side at up to 4000px, removing original metadata; the preview is 600x1800 PNG and explicitly not print-ready.

A synthetic test order is retained for studio inspection. Preview sessions/files are not auto-deleted. The lifetime cap reserves a maximum of 290 MiB of upload slots. Do not delete session rows just to reset the limit without first removing their files through Storage API. No live payment or email/WhatsApp notification is sent by this flow.
