-- M36 — supply goes national: a pincode, not one of 21 curated areas.
--
-- Every statement here is additive or a constraint being *relaxed*.
-- Nothing is dropped and no existing value is rewritten, because the
-- thirteen live HomeKrafters and every decided application must keep
-- resolving exactly as they do today. `SellerApplication.area` and
-- `Vendor.area` stay populated for those rows; only new rows arrive
-- without an area.

-- The `/sell` form no longer asks for an area, so the column can no
-- longer be required. It was a closed list of 21 tricity areas plus the
-- literal 'other', and 'other' was unapprovable — which is the bug this
-- migration exists to end.
ALTER TABLE "SellerApplication" ALTER COLUMN "area" DROP NOT NULL;

-- Where the applicant says they are. Any valid Indian pincode.
ALTER TABLE "SellerApplication" ADD COLUMN "pincode" TEXT;

-- Carried onto the storefront at approval, so a kitchen's stated location
-- survives the application row it arrived on.
ALTER TABLE "Vendor" ADD COLUMN "pincode" TEXT;

-- Backfill: pre-M36 tricity vendors get the pincode of the area they are
-- already in, where that is unambiguous. Deliberately NOT attempted —
-- a curated area does not map cleanly to one pincode (Chandigarh's
-- sectors share codes, and 160055 spans two districts), so a guess here
-- would write a wrong pincode onto a real storefront and look
-- authoritative. These stay NULL, which reads correctly as "they signed
-- up before we asked".

-- The launch gate lives in the existing key/value settings table, so it
-- needs no column. Seeded to the tricity: supply is national from today,
-- demand is not. An empty or absent value means "no gate" — see
-- `SettingsService.getServicedPincodePrefixes` for why the fallback is
-- open rather than closed.
INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
VALUES ('servicedPincodePrefixes', '160,1401,1403,1341,1346', NOW())
ON CONFLICT ("key") DO NOTHING;
