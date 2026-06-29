-- CreateEnum
CREATE TYPE "tripadvisor_match_status" AS ENUM ('not_matched', 'matched', 'approved', 'disabled');

-- CreateEnum
CREATE TYPE "tripadvisor_sync_status" AS ENUM ('not_started', 'success', 'error', 'skipped');

-- AlterTable
ALTER TABLE "excursions" ADD COLUMN     "tripadvisor_location_id" TEXT,
ADD COLUMN     "tripadvisor_location_name" TEXT,
ADD COLUMN     "tripadvisor_rating" DECIMAL(3, 2),
ADD COLUMN     "tripadvisor_review_count" INTEGER,
ADD COLUMN     "tripadvisor_ranking" INTEGER,
ADD COLUMN     "tripadvisor_web_url" TEXT,
ADD COLUMN     "tripadvisor_rating_image_url" TEXT,
ADD COLUMN     "tripadvisor_last_synced_at" TIMESTAMP(3),
ADD COLUMN     "tripadvisor_match_status" "tripadvisor_match_status" NOT NULL DEFAULT 'not_matched',
ADD COLUMN     "tripadvisor_sync_status" "tripadvisor_sync_status" NOT NULL DEFAULT 'not_started',
ADD COLUMN     "tripadvisor_sync_message" TEXT,
ADD COLUMN     "tripadvisor_display_allowed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "provider" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "last_validation_at" TIMESTAMP(3),
    "last_validation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_api_usage" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "provider" TEXT NOT NULL,
    "budget_date" TIMESTAMP(3) NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_provider_key" ON "integration_credentials"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_api_usage_provider_budget_date_key" ON "integration_api_usage"("provider", "budget_date");
