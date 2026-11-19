# 20 · Email (Resend)

**Decision:** every email Geet sends goes through **Resend**, from `listengeet.com` addresses, using Geet's own templates (`emails/templates/`). **Clerk's emails are switched off.** Clerk still handles sign-in logic; it just does not send anything to people.

Covers: sign-in codes, sign-up welcome, new-sign-in alerts, marketing, copyright acknowledgements, and an optional admin digest.

---

## 1. Addresses (one purpose each)

| From address | Display name | Used for | Reply-To | Inbound |
|---|---|---|---|---|
| `security@listengeet.com` | Geet Security | Sign-in codes, new sign-in alerts, anything about account safety | `support@listengeet.com` | Forwarded |
| `hello@listengeet.com` | Geet | Welcome email after sign-up | `hello@listengeet.com` | Forwarded |
| `marketing@listengeet.com` | Geet News | Announcements and the weekly new-songs email. Only to people who opted in | `hello@listengeet.com` | Forwarded |
| `copyright@listengeet.com` | Geet Copyright | Acknowledgement of a takedown report; claimants reply here | itself | Forwarded to the owner, kept for the record |
| `alerts@listengeet.com` | Geet Alerts | Optional daily admin digest to the owner (open reports, failed uploads, storage over 80 %) | none | Not monitored |
| `support@listengeet.com` | (never a sender) | The "Contact" address in the footer and Reply-To for security mail | | Forwarded |

Rules: no `no-reply` address (replies are welcome and go to a human). Never send transactional mail from `marketing@`, never marketing from `security@` or `hello@`.

**Receiving mail:** Resend is for sending. Use **Cloudflare Email Routing** (free, you already use Cloudflare DNS) to forward `hello@`, `support@`, `security@`, `copyright@`, `marketing@` to your real inbox. Routing adds MX records on the root domain; Resend's return-path records live on a `send.` subdomain, so they do not clash.

**Dev environment:** verify `dev.listengeet.com` as a second Resend domain and send from `security@dev.listengeet.com` etc. Dev emails carry a `[DEV]` subject prefix and are delivered **only** to addresses in `EMAIL_DEV_ALLOWLIST`; anything else is logged and dropped. The dev instance can never email real people.

---

## 2. What sends when

| Email | Template | Trigger | Rule |
|---|---|---|---|
| **Sign-in code** | `verification-code` | Clerk `emails.created` webhook for the verification-code template | Sent immediately; highest priority; never throttled |
| **Welcome** | `welcome` | Clerk `user.created` webhook | Once per account (`profiles.welcome_sent_at`); skipped if the address bounced |
| **New sign-in alert** | `signin-alert` | First authenticated API call from a device not seen before (section 4) | Not on the first device, not within 10 minutes of sign-up, max 3 per day per user |
| **Marketing announcement** | `marketing-announcement` | Admin schedules a send | Opted-in users only (section 5) |
| **Weekly new songs** | `marketing-weekly` | Admin or weekly job | Opted-in users only; at most 1 marketing email per week and 2 per month in total |
| **Copyright acknowledgement** | `copyright-received` | A report of kind `copyright` is submitted | Immediately, to the claimant's address, one per report |
| **Admin digest** (optional) | plain text | Daily cron | Off unless `ADMIN_DIGEST=1` |

Friend requests, messages and jam invites are **not** emailed: they use push notifications and the bell (doc 05). That keeps volume low (see limits).

---

## 3. Turning Clerk's emails off

Do this first in the **development** Clerk instance and test sign-in before touching production.

1. Clerk Dashboard → **Customization → Emails**. For each template Geet can trigger (the verification-code template is the one that matters, because sign-in uses Google plus email code), open it and **turn off "Delivered by Clerk"**. Per Clerk's docs, once delivery is off Clerk stops sending and you must send the email yourself from the webhook.
2. Dashboard → **Webhooks** → add endpoint `https://api.listengeet.com/api/webhooks/clerk` (dev: `dev-api…`), subscribe to `user.created`, `user.deleted`, and the email event (named `emails.created` in Clerk's docs; confirm the exact name in the **Event Catalog** tab). Copy the signing secret to `CLERK_WEBHOOK_SECRET`.
3. The API verifies the signature (Svix headers) before doing anything, returns `200` quickly, and sends through Resend. Webhooks can repeat, so each email uses an **idempotency key** (the Clerk event id).
4. **Mapping:** the email event carries the recipient, a subject, Clerk's rendered `body`, and a nested `data` object with the template variables (for example the one-time code). Field names are not fully documented, so **log the first real payload in dev** and map from that. Render **Geet's own `verification-code` template** from `data`; do not forward Clerk's HTML.
5. **Fail safe:** if a Clerk email arrives for a template Geet has no design for, send Clerk's own rendered `body` through Resend from `security@` so nobody is locked out, and log a warning to add a template.
6. Clerk may also send its own notifications for things like new-device sign-in. Turn those off the same way; Geet's alert (section 4) replaces them.

**Check before you build:** I could not confirm from Clerk's pages whether the "Delivered by Clerk" switch is available on the free (Hobby) plan. Test in the dev instance first. If it is locked, the only choices are to keep Clerk's code emails or move that one email to a paid Clerk plan; the rest of this doc still works.

---

## 4. New sign-in alerts (how Geet detects a new device)

Clerk does not hand Geet the browser or location in a webhook, so the API does it:

1. On each authenticated request the API reads the Clerk session id (`sid`). The first time it sees a `sid`, it builds a **device fingerprint** = hash of (browser family, OS family, country) from the `User-Agent` and Vercel's geo headers (`x-vercel-ip-country`, `x-vercel-ip-city`).
2. Lookup in `sign_in_devices` (doc 13). Known fingerprint: update `last_seen`. Unknown: insert it and, if the account is older than 10 minutes and this is not its first device, queue the `signin-alert` email.
3. The email shows device (for example "Chrome on Android"), approximate location (city, country), time in the user's time zone (default IST), and sign-in method (Google or email code). **It never shows the IP address**, and the raw IP is never stored.
4. **Sign out of all devices** button goes to `/profile#devices`, where the user sees signed-in devices and can **Sign out all other devices** (revokes Clerk sessions through the Clerk backend API). The link is a normal page link: it requires sign-in, so it cannot be abused by someone holding only the email.
5. Retention: device rows are kept 90 days after `last_seen`.

---

## 5. Marketing: consent, sending, unsubscribing

**Consent model (opt-in, default off):**
- The user chooses in two places: **Onboarding step 3** ("Send me news about new songs and features. About twice a month.", a toggle, default off) and **Profile → Notifications → Email: Geet news**.
- Stored as `profiles.email_news` (boolean) and `email_news_at`. Geet's database **does not store email addresses**. At send time the API fetches the address from Clerk's backend API for opted-in users only.
- Security and account emails cannot be turned off and are never marketing.

**Every marketing email must have:**
- `marketing@` as the sender and a real Reply-To.
- A visible **Unsubscribe** link and **Email preferences** link (in the footer template).
- The headers `List-Unsubscribe: <https://listengeet.com/email/unsubscribe?t=TOKEN>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` so Gmail and Apple Mail show their own unsubscribe button.
- A sender postal address in the footer. **Put the real address in `MARKETING_POSTAL_ADDRESS`; I left `[postal address]` as a placeholder on purpose.**
- A one-line reason why the person is receiving it.

**Unsubscribe page** `/email/unsubscribe?t=…` (public web page, no sign-in; the token is a signed token that identifies the profile and does not expire):
- Opening it (GET) shows: "Unsubscribe from Geet news?" with a primary **Unsubscribe** button. The one-click POST from mail apps unsubscribes immediately without a page.
- Done state: "You're unsubscribed. You'll still get security emails." with text buttons **Undo** and **Email preferences**.
- Unsubscribing sets `email_news=false` instantly.

**Suppression:** a hard bounce or a spam complaint (from Resend's webhook, section 7) sets `email_news=false` and adds a row to `email_suppressions`; the address is never mailed again by marketing, and transactional mail to a bouncing address is paused until it validates.

**Frequency policy:** at most 1 marketing email per week and 2 per month per person. The queue enforces it.

**Sending method (recommended):** the API sends marketing itself through Resend's API (single or batch endpoint) with its own unsubscribe tokens. Reason: it works on any plan, it keeps all consent logic in one place, and addresses never need to be copied into a second system. (Resend also offers Broadcasts and Contacts; I could not confirm they are included in the free plan, so do not depend on them.)

**Admin composer:** a new **Emails** tab in `/admin` (doc 09).

**Compliance notes (not legal advice):** India's Digital Personal Data Protection Act 2023 expects clear, specific consent and an easy way to withdraw; CAN-SPAM requires sender identity, address, and honoring unsubscribes; GDPR applies if you email people in the EU. The opt-in-default-off model, one-click unsubscribe, and no purchased lists satisfy the common core. Have the Privacy page say what email is used for and that Resend processes it.

---

## 6. Free-tier limits and what they mean

From Resend's pricing page: Free plan **3,000 emails per month, 100 per day**, 3 domains, **1 webhook endpoint**, 30-day data retention, no dedicated IP.

| Limit | Consequence | Rule in Geet |
|---|---|---|
| **100 emails per day, shared by everything** | Every email-code sign-in uses one. More than about 100 code sign-ins and sign-ups in a day would block logins | **Make Google the primary button on the sign-in page.** Email code is secondary (doc 05). Watch the daily count in Admin → Overview. Upgrade Resend before logins approach 60 a day |
| 3,000 per month | About 100 a day on average | Marketing is capped so it can never starve transactional mail |
| 1 webhook endpoint | Delivery, bounce and complaint events must all arrive at one URL | Single `/api/webhooks/resend` that routes by event type |

**Daily budget order:** (1) sign-in codes, (2) welcome, (3) copyright acknowledgements, (4) sign-in alerts, (5) admin digest, (6) marketing. Marketing may use at most `MARKETING_DAILY_CAP` (default **50**) and only while at least 20 sends remain for the day. When the budget is exhausted, lower-priority emails wait in `email_jobs` and send after midnight UTC; sign-in codes are never delayed by lower priorities and a failed code send shows the user "We couldn't send the code. Try Google, or try again in a minute."

A marketing blast to more than 50 opted-in people therefore takes several days at the free tier. That is deliberate; the composer shows "Will take about N days".

---

## 7. Resend webhook (`POST /api/webhooks/resend`)

Verify the signature, return `200` fast. Handle: `email.bounced` (hard: suppress; soft: retry rules), `email.complained` (suppress marketing at once), `email.delivery_delayed` (log), `email.failed` (log, mark job failed). Keep `email.delivered` for the Emails tab statistics only (counts, no addresses). Do **not** enable open or click tracking: it needs link rewriting (hurts trust and spam scoring) and tracks readers; use unsubscribe and complaint rates as the health signals.

---

## 8. DNS for sending (Cloudflare, all **DNS only**)

Add the records Resend's dashboard shows after you add the domain. Typically: an **SPF** TXT (include Resend's sender), **DKIM** records, and a return-path **MX** on the `send.` subdomain. Then:

| Name | Type | Value | Note |
|---|---|---|---|
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@listengeet.com; fo=1` | Start at `p=none`, read the reports for 2 to 4 weeks, then move to `p=quarantine` |
| `@` | MX | Cloudflare Email Routing records | For inbound forwarding |

Keep one SPF record per name (merge includes, never two). Verify in Resend until "Verified". **Reputation note:** transactional and marketing share the `listengeet.com` domain reputation. If marketing complaints ever exceed about 0.1 %, move marketing to a subdomain (for example `news.listengeet.com`) and change `EMAIL_FROM_MARKETING`. Everything is configured by env, so that is a one-line change.

---

## 9. The templates (`emails/templates/`)

Each has an `.html` and a `.txt` (plain text is required: send both). Placeholders use `{{name}}`.

| File | From | Subject | Placeholders |
|---|---|---|---|
| `verification-code` | security@ | `{{code}} is your Geet code` | `code`, `purpose` ("sign in", "create your account"), `minutes`, `email` |
| `signin-alert` | security@ | `New sign-in to your Geet account` | `device`, `location`, `time`, `method`, `secure_url`, `email` |
| `welcome` | hello@ | `Welcome to Geet` | `first_name`, `username`, `app_url`, `email` |
| `marketing-announcement` | marketing@ | `{{subject}}` | `subject`, `preheader`, `hero_image`, `hero_alt`, `kicker`, `headline`, `body_html`, `body_text`, `cta_label`, `cta_url`, `unsubscribe_url`, `preferences_url`, `postal_address` |
| `marketing-weekly` | marketing@ | `{{subject}}` (default "New on Geet this week") | `subject`, `preheader`, `headline`, `intro`, `track1..3_{title,artist,language,url,cover}`, `cta_url`, `unsubscribe_url`, `preferences_url`, `postal_address` |
| `copyright-received` | copyright@ | `We received your copyright report ({{reference}})` | `reference`, `track_title`, `track_artist`, `date`, `days`, `email` |

`emails/previews/` has desktop and mobile renders of each with sample data. `_manifest.json` lists subject and sender per template.

### Design rules (match doc 01)
- Black background (`#000000`) set explicitly with `bgcolor`, so dark-mode inversion in mail apps does not wreck it. White text, `#B3B3B3` secondary. Footer text uses `#8A8A8A` (readable on black) instead of the app's `#6B6B6B`.
- One yellow pill button per email, built as a table so it survives Outlook. Yellow also marks the numbers, the kicker, "better together", and the five-bar mark above headings (built from table cells, no image).
- Logo from `https://listengeet.com/email/email-logo.png` (160×39 displayed, 2× source). **Publish `emails/assets/*` at `web/public/email/`.**
- 600 px wide, single column, fully fluid under 620 px, 16 px body, 34 px heading (28 px on phones). Outfit and Inter are named first; where mail apps ignore web fonts they fall back to Avenir Next / Segoe UI / Helvetica / Arial, and Gurmukhi and Devanagari fall back to system Noto fonts.
- Alt text on every image; layout tables use `role="presentation"`; hidden preheader text per email; each message under 100 KB (Gmail clips at about 102 KB).
- No tracking pixels, no remote fonts, no JavaScript, no background images, no GIFs.
- Hero image for announcements: **1200×525 JPG** (shown 600×262), keep key content centered, under 150 KB.

### Rendering
Simplest: load the HTML, replace `{{name}}` placeholders (escape values for HTML; `body_html` is trusted admin-authored HTML only), and send both parts. If you prefer components, port these files to React Email 1:1 and keep the same output. Either way **do not change the look** without updating the previews.

### Localization (draft; native review needed)
Emails are sent in the user's `profiles.language`; fall back to English. Marketing is authored per language by the admin (one send per language list).

| String | English | ਪੰਜਾਬੀ | हिन्दी |
|---|---|---|---|
| code subject | {{code}} is your Geet code | ਤੁਹਾਡਾ Geet ਕੋਡ ਹੈ {{code}} | आपका Geet कोड है {{code}} |
| code heading | Your sign-in code | ਤੁਹਾਡਾ ਸਾਈਨ ਇਨ ਕੋਡ | आपका साइन इन कोड |
| code body | Enter this code in Geet to {{purpose}}. It expires in {{minutes}} minutes. | {{purpose}} ਲਈ ਇਹ ਕੋਡ Geet ਵਿੱਚ ਦਰਜ ਕਰੋ। ਇਹ {{minutes}} ਮਿੰਟਾਂ ਵਿੱਚ ਖ਼ਤਮ ਹੋ ਜਾਵੇਗਾ। | {{purpose}} के लिए यह कोड Geet में दर्ज करें। यह {{minutes}} मिनट में समाप्त हो जाएगा। |
| code ignore | Didn't ask for this? You can ignore this email. | ਤੁਸੀਂ ਇਹ ਨਹੀਂ ਮੰਗਿਆ? ਇਸ ਈਮੇਲ ਨੂੰ ਅਣਡਿੱਠਾ ਕਰ ਦਿਓ। | आपने यह नहीं माँगा? इस ईमेल को अनदेखा करें। |
| alert subject | New sign-in to your Geet account | ਤੁਹਾਡੇ Geet ਖਾਤੇ ਵਿੱਚ ਨਵਾਂ ਸਾਈਨ ਇਨ | आपके Geet खाते में नया साइन इन |
| alert heading | New sign-in | ਨਵਾਂ ਸਾਈਨ ਇਨ | नया साइन इन |
| alert fine | If this was you, there's nothing to do. | ਜੇ ਇਹ ਤੁਸੀਂ ਸੀ, ਤਾਂ ਕੁਝ ਕਰਨ ਦੀ ਲੋੜ ਨਹੀਂ। | अगर यह आप थे, तो कुछ करने की ज़रूरत नहीं। |
| alert button | Sign out of all devices | ਸਾਰੇ ਡਿਵਾਈਸਾਂ ਤੋਂ ਸਾਈਨ ਆਊਟ ਕਰੋ | सभी डिवाइस से साइन आउट करें |
| welcome subject | Welcome to Geet | Geet ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ | Geet में आपका स्वागत है |
| welcome heading | You're in, {{first_name}}. | {{first_name}}, ਤੁਸੀਂ ਅੰਦਰ ਹੋ। | {{first_name}}, आप अंदर हैं। |
| welcome button | Open Geet | Geet ਖੋਲ੍ਹੋ | Geet खोलें |
| unsubscribe | Unsubscribe | ਅਨਸਬਸਕ੍ਰਾਈਬ ਕਰੋ | अनसब्सक्राइब करें |

Use `<html lang="pa">` / `lang="hi"` for those sends.

### Testing checklist
Send a test of every template to Gmail (web and app), Apple Mail, Outlook (desktop and web), and Yahoo; check dark mode, a 390 px phone width, images off (alt text still makes sense), and the plain-text part. Check headers with a spam tester and that SPF, DKIM, DMARC all pass. The admin **Send test to me** button (doc 09) sends to the admin's own address only.

---

## 10. Environment variables (API)

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Send key. Use a **sending-only** key, one per environment |
| `RESEND_WEBHOOK_SECRET` | Verify Resend webhooks |
| `CLERK_WEBHOOK_SECRET` | Verify Clerk webhooks |
| `EMAIL_FROM_SECURITY`, `EMAIL_FROM_HELLO`, `EMAIL_FROM_MARKETING`, `EMAIL_FROM_COPYRIGHT`, `EMAIL_FROM_ALERTS` | Full `Name <address>` values, for example `Geet Security <security@listengeet.com>` |
| `EMAIL_REPLY_TO_SUPPORT` | `support@listengeet.com` |
| `EMAIL_DEV_ALLOWLIST` | Dev only: comma-separated addresses allowed to receive mail |
| `MARKETING_DAILY_CAP` | Default 50 |
| `MARKETING_POSTAL_ADDRESS` | Required before any marketing send; the composer refuses to send without it |
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe tokens |
| `ADMIN_DIGEST` | `1` to enable the owner digest |

## 11. Data additions (also in doc 13)
`profiles.email_news`, `profiles.email_news_at`, `profiles.welcome_sent_at`; tables `sign_in_devices`, `email_jobs`, `email_log`, `email_suppressions`. `email_log` stores template, status, Resend message id and profile id, **never the address or body**, and is deleted after 90 days.

## 12. Build notes
- Phase 1 (doc 17): Resend client, `verification-code` and `welcome` templates, Clerk webhook, idempotency, dev allowlist.
- Phase 5: sign-in alerts and the devices list.
- Phase 6: marketing queue, unsubscribe page, admin Emails tab, Resend webhook, copyright acknowledgement.
- Acceptance: a dev sign-up receives the code and the welcome from Geet's addresses; Clerk sends nothing (check Clerk's email log is empty); a second browser triggers one alert; unsubscribing from a marketing email stops the next send; a bounced test address is suppressed.
