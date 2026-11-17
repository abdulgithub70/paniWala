-- Run once as a migration after "init". Schema "water" is not exposed by Supabase's API by default,
-- RLS is an extra safety layer. Prisma connects as the postgres role and bypasses RLS.
ALTER TABLE "water"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."VendorProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."Address" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."OrderOffer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."OrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."DeviceToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "water"."Setting" ENABLE ROW LEVEL SECURITY;
