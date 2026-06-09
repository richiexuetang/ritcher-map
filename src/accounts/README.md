# accounts (Rails)

Users, sessions, and billing for RitcherMap. An API-only Rails app that:

- **Issues session tokens** the Go gateway validates at the edge.
- **Manages subscriptions** (free vs. premium) via Stripe Checkout + webhooks.
- Is the natural home for the **admin** surface (CRUD-heavy work Rails is good at).

Rails earns its place here: this is the form-and-CRUD-heavy corner of the system
where its productivity wins outright, and it's isolated from the latency-critical
read path.

## The gateway contract (important)

The gateway (Go) validates every session token. `JwtService` and
`gateway/internal/auth` must agree:

| Property   | Value                                   |
|------------|-----------------------------------------|
| Algorithm  | HS256                                   |
| Secret     | shared `JWT_SECRET` env var (identical) |
| `sub`      | the user id, as a **string** (UUID)     |
| `exp`      | required                                |

Change one side and you must change the other. `test/services/jwt_service_test.rb`
pins this shape.

## Endpoints

```
GET  /healthz

POST /auth/register    {email, password}  -> {token, user}     public
POST /auth/login       {email, password}  -> {token, user}     public
GET  /account/me                          -> {user, subscription}   (Bearer)
POST /billing/checkout                     -> {checkout_url}         (Bearer)
POST /billing/webhook                      Stripe -> 200/4xx    (signature-verified)
```

These map to the gateway's proxied prefixes (`/auth`, `/account`, `/billing`).

## Data model

- **users** — UUID id, email (unique, normalized lowercase), `password_digest`
  (`has_secure_password` / bcrypt).
- **subscriptions** — one per user, created `free` on signup; carries Stripe
  customer/subscription ids and `current_period_end`. `User#premium?` is true
  only when the subscription is `active` and not past `current_period_end`.

## Run

This is a standard `rails new accounts --api --database=postgresql` skeleton with
the files in this directory added. To stand it up:

```bash
rails new accounts --api --database=postgresql   # if starting fresh
# drop these files in (Gemfile, app/, config/, db/migrate/, test/), then:
bundle install
DATABASE_USER=postgres DATABASE_PASSWORD=postgres rails db:create db:migrate

JWT_SECRET=dev-secret \           # MUST match the gateway's JWT_SECRET
FRONTEND_URL=http://localhost:5173 \
rails server -p 8083
```

Billing is optional locally — without `STRIPE_SECRET_KEY` the app boots fine and
`/billing/*` returns 503. To enable it:

```bash
STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID=price_... STRIPE_WEBHOOK_SECRET=whsec_...
# forward webhooks in dev with: stripe listen --forward-to localhost:8083/billing/webhook
```

## Test

```bash
rails test
```

Covers: the JWT contract (HS256 / string `sub` / required `exp` / wrong-secret /
expired / garbage), user provisioning + email normalization + validation +
`premium?` gating, and the login flow (valid / case-insensitive / wrong password
/ unknown email).

## Design notes

**Self-contained auth.** `Authenticatable` validates the Bearer JWT directly
rather than trusting the gateway's `X-User-Id`. Since both share the secret this
is consistent, and it means the service authenticates correctly even when hit
directly (tests, internal calls) — defense in depth rather than total reliance
on the edge.

**Webhook is unauthenticated but verified.** Stripe calls `/billing/webhook`
server-to-server, so it's outside JWT auth; trust comes from
`Stripe::Webhook.construct_event` verifying the `Stripe-Signature` header. A bad
signature → 400.

**Stripe is lazy.** The gem is configured from env at boot, but API calls only
happen when an endpoint is hit, so the app runs without billing configured.
`StripeService::NotConfigured` maps to 503.

**Subscription truth lives here.** `premium?` is the single gate other parts of
the system consult (e.g. enforcing free-tier tracking limits). When the read/sync
side needs to enforce premium, it should consult this — likely surfaced as a
claim in the JWT or a small internal lookup — rather than re-implementing the rule.