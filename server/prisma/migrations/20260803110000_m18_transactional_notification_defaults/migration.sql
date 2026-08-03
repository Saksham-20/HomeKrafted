-- M18: transactional notifications reach people where they are.
--
-- `NotificationPreference` rows were auto-created with in-app only, which
-- was the honest default while no provider could send anything. Now that
-- order events actually fan out, an order confirmation nobody sees until
-- they next open the site is not a confirmation.
--
-- Only rows still sitting at the exact old default are touched. A row
-- where any channel was changed is somebody's explicit choice and is left
-- alone — this migration must not un-mute anyone who muted themselves.
--
-- `promo` is excluded on purpose: opting somebody into marketing on
-- WhatsApp is how a sender gets blocked, and a block is per-sender, so one
-- promo would cost every future order update to that person.
UPDATE "NotificationPreference"
SET "whatsapp" = true, "email" = true
WHERE "category" <> 'promo'
  AND "sms" = false
  AND "whatsapp" = false
  AND "email" = false
  AND "inapp" = true;
