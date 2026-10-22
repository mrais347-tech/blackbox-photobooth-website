# Blackbox backend

Project: iacplaiyqnbekdkhjbak (Singapore). Applied migration: blackbox_private_orders_storage.
blackbox-schema.sql records that migration; do not replay it on an initialized project.

## Implemented
- Private order-originals (15 MiB, JPEG/PNG/WebP) and order-renders (20 MiB, JPEG/PNG) buckets.
- Orders and asset manifest with RLS and explicit grants.
- Approved staff can read orders/assets and edit fulfillment status/tracking only.
- Only trusted server code can create orders/assets or update payment fields.
- Staff allowlist is keyed to Supabase Auth user ID. Users cannot add themselves.
- Admin page: /admin.html. Password sign-in, in-memory session, latest 100 orders, 60-second signed photo links, fulfillment updates.
- Test orders default true. Printing/shipping blocked unless payment_status is paid.

## Activation tasks
1. Obtain owner/staff email from the user. Provision an Auth account securely, then add its actual Auth UUID to blackbox_admins using trusted administration. Do not insert account passwords in SQL or commit them.
2. Verify password login, signed downloads and order updates end-to-end with that staff account.
3. Implement server-mediated guest order creation and signed uploads with abuse protection, validation, bounded upload slots and idempotency before enabling customer submissions. Public uploads and table inserts are deliberately not granted.
4. Store originals as <order UUID>/<random file UUID>.<extension>, and the rendered preview in order-renders. Record each in order_assets. Original image formats must be decoded/verified before print processing; MIME restrictions alone do not validate bytes.
5. Confirm print dimensions/DPI, set quantities, prices and shipping with the owner. Current canvas is a preview, not a certified print-ready export.
6. Implement verified Billplz callbacks; browser redirects must never mark orders paid.
7. Agree photo retention period and implement retryable Storage API deletion plus manifest cleanup. SQL deletion of a manifest/order does not delete stored files. No automatic retention job exists yet.

## Verification
Transaction-scoped synthetic user/order tests (rolled back): non-admin and forged user_metadata cannot see orders; approved admin can read and update tracking; admin cannot change payment_status; unpaid orders cannot enter printing. Security advisor: no findings at setup.
Customer upload and staff browser flows remain untested until activation. Customer editor remains local-only; live checkout remains closed.
