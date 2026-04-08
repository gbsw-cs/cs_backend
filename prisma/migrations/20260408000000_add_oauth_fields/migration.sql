ALTER TABLE "users" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'local';
  ALTER TABLE "users" ADD COLUMN "provider_id" TEXT;
  ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
  CREATE UNIQUE INDEX "users_provider_provider_id_key" ON "users"("provider", "provider_id");