# PlantHub — Real SMS OTP via eOTP (FREE tier)

This project uses **eOTP** for SMS password recovery. It does **not** send
fake SMS and does **not** require Twilio for this flow.

Official provider: https://eotp.com.vn/
API documentation: https://eotp.com.vn/docs/

## Provider account activation (performed by project owner)

1. Create and verify an eOTP account.
2. Create a **web** project for PlantHub and complete any required approval.
3. Select the **FREE** tier. As published on 2026-11-16, the provider advertises
   **100 OTP/month** and **20 OTP/day** in this tier. Terms can change.
4. In sending settings choose **SMS** as the channel, **digits**, **6 digits**,
   and a 300-second expiry, matching the existing Front Users OTP input.
5. Open **API key & integration** and copy the API key and **one-time-visible**
   secret key. Do not expose these in a frontend bundle or Git repository.
6. In `back/.env` fill in **only the values** after:
   `EASYOTP_API_KEY=` and `EASYOTP_API_SECRET=`
7. Restart the backend so it loads the environment variables.
8. In Front Users use Forgot password > Phone number > Send OTP.
   A matching registered mobile phone number is required.

No code or script can create real approved provider credentials on behalf of
the owner without their account registration and approval.

## Database

The new fields in the PasswordResets table have already been added locally.
For any other deployment/database, run the idempotent schema migration:

```bash
cd back
node scripts/migrateEotpReset.js
```

The migration saves a backup before altering SQLite and adds only columns
that are missing.

## How recovery works

- The backend checks the provided number against the saved profile.
- eOTP generates and sends a 6-digit OTP using SMS; the backend persists
  a provider request ID instead of an SMS code.
- `/auth/verify-otp` asks eOTP to validate the code.
- Only a successful eOTP verification returns a short-lived one-use
  password reset token.
- `/auth/reset-password` requires the token for phone-based recovery.
- Each account has a 60-second cooldown and 5 requests/hour.
- Email recovery retains its existing local OTP-hash flow.

If provider credentials are missing or eOTP is unavailable, sending fails
clearly; the app never claims a fake SMS was sent.

## Verification

Run:
```bash
node --test tests/eotp.node-test.js
```

Tests simulate API responses. An actual phone delivery test requires
valid eOTP keys and a registered mobile number, and was **not** performed.

## Cost and quotas

The FREE tier is limited and subject to the provider's approval and terms.
The service may restrict delivery by country/channel. It is not unlimited or
independent of provider availability. Confirm quota and delivery status
in the eOTP project dashboard.
