# Sandbox Seller Setup

Set up an eBay Sandbox test user as a seller so you can use Sell APIs.

## Prerequisites

1. **eBay Developer Account** at [developer.ebay.com](https://developer.ebay.com/)
2. **Sandbox keyset** (App ID, Dev ID, Cert ID) from the Developer Portal
3. **Sandbox test user** created via Developer Portal > Sandbox > Test Users
4. **OAuth user token** — run `npm run ebay:auth` (see [README](../README.md))

## Setup .env

Ensure these are in your `.env`:

```bash
EBAY_ENV=sandbox
EBAY_CLIENT_ID=your_sandbox_app_id
EBAY_CLIENT_SECRET=your_sandbox_cert_id
EBAY_DEV_ID=your_dev_id
EBAY_SITE_ID=0
EBAY_TOKEN_FILE=.ebay_tokens.json
```

The scripts read the OAuth token from `.ebay_tokens.json` automatically.
If you have an Auth'n'Auth token, set `EBAY_TRADING_AUTH_TOKEN=` instead.

## Run

### Step 1: Register as seller

```bash
npm run sandbox:seller:setup
```

Expected output:
```
=== ValidateTestUserRegistration (Sandbox) ===

App ID: -GawainA****
Dev ID: 8052bbee****
Auth method: OAuth IAF token
Site ID: 0

Calling ValidateTestUserRegistration...
Ack: Success

Sandbox seller registration successful!
```

### Step 2: Verify registration

```bash
npm run sandbox:seller:check
```

Expected output:
```
=== Check Seller Privileges (Sandbox) ===

Attempt 1/6: Calling getPrivileges...
  sellerRegistrationCompleted: true

Seller registration confirmed! Ready to use Sell APIs.
```

### Both steps at once

```bash
npm run sandbox:seller:setup-and-check
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Auth token invalid / expired` | OAuth token expired | Run `npm run ebay:auth` to re-authenticate |
| `User not found / invalid user` | Wrong sandbox user | Sandbox usernames must have `TESTUSER_` prefix |
| `Access denied / Request not allowed` | Wrong endpoint or Site ID | Verify `EBAY_ENV=sandbox` and `EBAY_SITE_ID=0` |
| `sellerRegistrationCompleted` stays `false` | Propagation delay or corrupted user | Wait a few minutes and retry, or create a new sandbox test user |

## How it works

1. **ValidateTestUserRegistration** (Trading API / XML) — registers the sandbox test user as a seller. This is a sandbox-only API that simulates the real seller onboarding process.

2. **getPrivileges** (Sell Account API / REST) — returns the `sellerRegistrationCompleted` flag. When `true`, the user can create inventory items, offers, and listings.
