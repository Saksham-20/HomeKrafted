-- Realistic volume, on top of a normally-seeded database.
--
-- **This is the thing that made the load test honest.** The first ramp
-- passed at p95 4.55 ms against the 16 products `prisma/seed.ts` creates,
-- which measured nothing except that the query planner likes a table that
-- fits in one page. Re-run against these numbers it gave p95 2.06 s, and
-- the catalogue read turned out to be scanning 2,016 rows per request.
--
-- A load test against seed data is a false pass, and it is a convincing
-- one, because every number in the report looks excellent.
--
-- Scale: 500 buyers, 50 kitchens, 1,000 listings, 50,000 orders with
-- three lines each — roughly a year of a busy small marketplace, which is
-- the point at which an unindexed scan starts to show and well before the
-- data is unwieldy to load.
--
-- Run it against a **throwaway** database only. It writes rows with
-- predictable ids (`u1`, `p1`, `o1`…) that would collide with anything
-- real, and it never cleans up.
--
--     psql "$DATABASE_URL" -f load/volume.sql
--
-- Every `moderationStatus` is set explicitly: the M22 default is
-- `pending`, so leaving it out seeds a catalogue that is invisible to
-- every public query and the whole browse ramp would measure an empty
-- result set.

INSERT INTO "User" (id,name,email,phone,role,"createdAt","authProviders","referralCode")
SELECT 'u'||g,'U'||g,'u'||g||'@x.test','+9199000'||lpad(g::text,5,'0'),'consumer',now(),
       ARRAY['email']::"AuthProvider"[], 'REF'||g
FROM generate_series(1,500) g;

INSERT INTO "Vendor" (id,slug,name,type,bio,"avatarPlaceholder","bannerPlaceholder",location,area,lat,lng,"joinedAt")
SELECT 'v'||g,'v'||g,'V'||g,'maker','b','a','b','Chandigarh','Sector 17',30.74,76.78,now()
FROM generate_series(1,50) g;

INSERT INTO "Category" (id,slug,name,"imagePlaceholder") VALUES ('c1','c1','C1','x');

INSERT INTO "Product" (id,slug,"vendorId",name,"categoryId","defaultWeightSku",description,"updatedAt","moderationStatus")
SELECT 'p'||g,'p'||g,'v'||((g%50)+1),'P'||g,'c1','sku'||g,'d',now(),'active'
FROM generate_series(1,1000) g;

INSERT INTO "Address" (id,"userId",label,"recipientName",phone,line1,city,state,pincode,"updatedAt")
SELECT 'a'||g,'u'||g,'home','N','+919900000000','l','Chandigarh','CH','160001',now()
FROM generate_series(1,500) g;

-- Spread across every status and back through time, so the status filter
-- and the date-window aggregates have something to narrow.
INSERT INTO "Order" (id,"orderNumber","userId",status,"shippingAddressIds","placedAt",subtotal,total,"paymentMethod")
SELECT 'o'||g,'HK'||g,'u'||((g%500)+1),
       (ARRAY['placed','packed','shipped','delivered','cancelled'])[(g%5)+1]::"OrderStatus",
       ARRAY['a'||((g%500)+1)], now()-(g||' minutes')::interval,100,100,'wallet'
FROM generate_series(1,50000) g;

-- Three lines per order. `OrderItem.productId` is what the whole seller
-- portal scopes by, and it had no index until M23 — this is the table
-- that made a HomeKrafter's dashboard slower with every stranger's order.
INSERT INTO "OrderItem" (id,"orderId","productId",name,quantity,price,"addressId")
SELECT 'oi'||g||'_'||k,'o'||g,'p'||(((g*3+k)%1000)+1),'N',1,100,'a'||((g%500)+1)
FROM generate_series(1,50000) g, generate_series(1,3) k;

-- Without this the planner is working from stats for an empty table and
-- picks a plan the real one would never get.
ANALYZE "User"; ANALYZE "Vendor"; ANALYZE "Product";
ANALYZE "Order"; ANALYZE "OrderItem";
