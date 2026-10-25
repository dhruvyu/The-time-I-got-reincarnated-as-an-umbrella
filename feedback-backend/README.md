# Chapter feedback setup (Cloudflare Workers + D1)

This is a **review-only feature** until you deploy the backend and configure its URL.

1. Create a free Cloudflare account and install Node.js locally.
2. From the `feedback-backend` directory run `npx wrangler login`.
3. Run `npx wrangler d1 create umbrella-feedback` and copy the returned database ID into `wrangler.toml`.
4. Run `npx wrangler d1 execute umbrella-feedback --remote --file=./schema.sql`.
5. Run `npx wrangler secret put HASH_SECRET` (use a long random secret) and `npx wrangler secret put ADMIN_TOKEN` (use a different long random secret).
6. Run `npx wrangler deploy` and copy the HTTPS worker URL.
7. Set `FEEDBACK_API` in the root `feedback.js` to the deployed URL.
8. Review and merge the pull request only when ready. GitHub Pages will serve the new files automatically.

## Moderating comments

Comments are **pending by default**. Approve or reject using authenticated API requests (never put the admin token in browser code).

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" https://YOUR-WORKER.workers.dev/admin/comments
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"id":1,"status":"approved"}' https://YOUR-WORKER.workers.dev/admin/comments
```

Use `"rejected"` to reject a comment. Only approved comments are returned publicly.

## Notes

- Ratings are unique per chapter per hashed visitor IP, and can be changed after 60 seconds. Shared IPs may share a rating; anonymous ratings cannot guarantee one vote per person.
- Visitor IPs are HMAC-hashed with a secret before storage; no raw IPs are written to D1.
- Comments have a two-per-ten-minute per-IP limit, honeypot, size checks, and manual moderation. For higher traffic add Cloudflare Turnstile/WAF and stronger abuse controls.
- CORS permits the production GitHub Pages origin; it is **not** authentication. Admin requests require a secret bearer token.
- New chapters use their chapter number as a separate feedback key. Don't reorder existing chapters after publishing or feedback will attach to different chapters.
- Before launching, publish a privacy notice covering pseudonymous abuse-prevention identifiers and comment retention.
