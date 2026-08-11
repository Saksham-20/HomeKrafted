import * as argon2 from 'argon2';

/**
 * The only place argon2 parameters are set. Every `hash` call in the
 * server passes one of these two objects; nothing calls `argon2.hash`
 * bare.
 *
 * **Why this file exists.** Until M31 all seven call sites used the
 * library defaults — argon2id at `m=65536` (64 MiB), `t=3`, **`p=4`**.
 * That is a *stronger* configuration than OWASP asks for, chosen by the
 * library rather than by us, and on the production box (1 vCPU) it was
 * the single largest fixed cost in every sign-in, sign-up and code
 * request. `p=4` is the worst part: four lanes are four threads
 * contending for one core, so the parallelism buys nothing and costs
 * scheduling.
 *
 * **Verification is unaffected by changing these.** `argon2.verify`
 * reads m/t/p out of the stored digest, so every password hashed under
 * the old parameters keeps working at its own cost until
 * `AuthService.maybeRehash` upgrades it on the owner's next successful
 * sign-in. Never gate `verify` on a parameter check.
 */

/**
 * Passwords: the OWASP argon2id reference configuration (19 MiB, t=2,
 * p=1), unchanged from their recommendation.
 *
 * `p: 1` is not a weakening on this hardware — it is the correct value
 * for one core. Raise `memoryCost` first if the box ever grows; memory
 * hardness is what an attacker with GPUs actually has to pay for.
 */
export const PASSWORD_HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * One-time codes, deliberately cheaper than passwords (8 MiB, t=2, p=1).
 *
 * **This is a security decision, so here is the reasoning rather than a
 * number.** A stored `OtpChallenge.codeHash` protects a six-digit code —
 * a space of 10^6 — that is single-use, expires in five minutes
 * (`OTP_TTL_SECONDS`), and is guessable at most 5 times per row, 10
 * times per destination per 15 minutes, from an IP allowed 20 auth
 * requests a minute. Those caps, not the hash, are what make the code
 * unguessable online; no argon2 setting can make 10^6 safe against an
 * unthrottled oracle, and every setting is safe with the caps in place.
 *
 * What the hash actually defends is an attacker who can *read the table*
 * during the five minutes a row is live. 8 MiB × t=2 keeps that
 * memory-hard — a full sweep of the space is still hours of GPU time
 * against a row that dies in minutes — while removing ~100–250 ms from
 * every code we issue. That matters here because the sign-up path mints
 * a code on the same core that is answering the sign-up request.
 *
 * Codes are never migrated: the TTL retires every stored hash within
 * five minutes on its own.
 */
export const OTP_HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 8192,
  timeCost: 2,
  parallelism: 1,
};
