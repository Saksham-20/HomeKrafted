-- M37: meal-subscription lifecycle + dated-menu changes get their own
-- notification category. Deliberately the ONLY statement in this
-- migration: Postgres allows ADD VALUE inside a transaction only if the
-- new value is not used in that same transaction, so nothing else may
-- ever join this file.
ALTER TYPE "NotificationCategory" ADD VALUE 'meals';
