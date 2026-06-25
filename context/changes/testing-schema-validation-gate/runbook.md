# Operator Runbook: Production Schema Validation Gate

One-time setup steps required before the smoke workflow can run. Complete all five sections in order. The workflow (`smoke.yml`) reads four GitHub repository secrets; this runbook tells you where to get each value and where to put it.

---

## 1. Supabase Personal Access Token -- `SUPABASE_ACCESS_TOKEN`

**What it is:** A personal access token (PAT) for the Supabase Management API. The workflow uses it to call `supabase gen types typescript --project-id <ref>` against the live production project.

**Steps:**

1. Log in to [Supabase dashboard](https://supabase.com/dashboard).
2. Click your avatar (top-right) > **Account** > **Access tokens**.
3. Click **Generate new token**. Name it `github-smoke-gate` (or similar). Copy the token value -- it is shown only once.
4. In GitHub, go to your repository > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
5. Name: `SUPABASE_ACCESS_TOKEN`. Value: the token you copied.

---

## 2. Production Project Reference -- `SUPABASE_PROJECT_REF`

**What it is:** The short alphanumeric identifier for your Supabase production project (visible in the project URL: `https://supabase.com/dashboard/project/<ref>`).

**Steps:**

1. In the Supabase dashboard, open your production project.
2. Click **Settings** > **General**. The **Reference ID** field shows the ref (e.g. `abcdefghijklmnop`).
3. Copy it.
4. In GitHub, add a new repository secret: name `SUPABASE_PROJECT_REF`, value the ref you copied.

---

## 3. Dedicated Smoke User -- `SMOKE_USER_ID`

**What it is:** A UUID for a dedicated service account in `auth.users` that the smoke script uses to INSERT, SELECT, and DELETE a session row. It must be a real user so the `sessions.user_id` FK to `auth.users.id` is satisfied. The account never receives real traffic.

**Convention:** Use the email `smoke+schema-gate@<your-domain>` (replace `<your-domain>` with the domain you own -- no real mail delivery required; the account is created via the service-role key which bypasses email confirmation). Note: used `pomo-sapiens.com`

**Steps:**

1. In the Supabase dashboard, open your production project.
2. Go to **Authentication** > **Users** > **Add user** > **Create new user**.
3. Email: `smoke+schema-gate@pomo-sapiens.com`. Password: any strong password (it is never used for login). Uncheck "Send email invitation" if present.
4. After creating, click the user row to open the detail view. Copy the **User UID** (UUID format).
5. In GitHub, add a new repository secret: name `SMOKE_USER_ID`, value the UUID you copied.

**Alternative (service-role API):** If the dashboard does not expose a "Create user" button, call the Admin API:

```bash
curl -X POST "https://<ref>.supabase.co/auth/v1/admin/users" \
  -H "apikey: <service_role_key>" \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke+schema-gate@<your-domain>","password":"<strong-pwd>","email_confirm":true}'
```

The response body contains `"id": "<uuid>"` -- use that as `SMOKE_USER_ID`.

---

## 4. Service-Role Key -- `SUPABASE_SERVICE_ROLE_KEY`

**What it is:** The `service_role` JWT for your production Supabase project. It bypasses RLS and is required for the smoke script to INSERT and DELETE rows owned by the smoke user without a session cookie. **Keep this secret -- it grants full database access.**

**This secret likely already exists** in your GitHub repository (it is used by `npm test` in CI). Verify its presence before creating a duplicate.

**Steps:**

1. In the Supabase dashboard, open your production project > **Settings** > **API**.
2. Under **Project API keys**, copy the `service_role` key (the one labeled "secret").
3. In GitHub, check **Settings** > **Secrets and variables** > **Actions** for an existing `SUPABASE_SERVICE_ROLE_KEY` secret.
4. If it is absent, add it now with the value you copied.

---

## 5. Auto-trigger via push to main

**How it works:** The smoke workflow triggers automatically on every push to `main` (including PR merges). It waits 5 minutes (`sleep 300`) before running the gates, giving Cloudflare Workers Builds time to complete the deploy. No webhook or extra credentials are required.

**No action needed** -- this is wired in `.github/workflows/smoke.yml` and activates as soon as the file is merged to `main`.

> **Note:** Cloudflare Workers Builds does not expose a simple dashboard webhook for deploy-success events. Their notification system requires a Cloudflare Queue + consumer Worker intermediary, which adds unnecessary infrastructure for this use case. The push-to-main + 5 min delay approach is equivalent in practice since deploys consistently finish well within that window.

---

## 6. Verification Checklist

Confirm each item before proceeding to Phase 2.

| Item                                   | How to verify                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` secret         | GitHub repo > Settings > Secrets > Actions -- secret listed                                          |
| `SUPABASE_PROJECT_REF` secret          | Same page -- secret listed                                                                           |
| `SMOKE_USER_ID` secret                 | Same page -- secret listed                                                                           |
| `SUPABASE_SERVICE_ROLE_KEY` secret     | Same page -- secret listed (may be pre-existing)                                                     |
| Smoke user exists in prod `auth.users` | Supabase dashboard > Authentication > Users -- `smoke+schema-gate@pomo-sapiens.com` row visible      |

Once all five rows are checked, the operator prerequisites are complete. Proceed to Phase 2 manual verification (trigger `smoke.yml` via `workflow_dispatch` in GitHub Actions).
