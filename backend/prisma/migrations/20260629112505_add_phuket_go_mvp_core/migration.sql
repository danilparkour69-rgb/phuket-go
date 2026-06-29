-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'blocked');

-- CreateEnum
CREATE TYPE "partner_status" AS ENUM ('active', 'hidden', 'debt');

-- CreateEnum
CREATE TYPE "commission_type" AS ENUM ('per_person', 'fixed', 'percent');

-- CreateEnum
CREATE TYPE "excursion_status" AS ENUM ('draft', 'published', 'hidden');

-- CreateEnum
CREATE TYPE "excursion_photo_image_type" AS ENUM ('real', 'ai_enhanced', 'ai_generated');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('new', 'waiting_partner', 'accepted', 'declined', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('website', 'article', 'admin', 'telegram');

-- CreateEnum
CREATE TYPE "lead_actor_type" AS ENUM ('system', 'user', 'admin', 'partner');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "points_balance" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'active',
ADD COLUMN     "telegram_chat_id" TEXT,
ADD COLUMN     "telegram_username" TEXT;

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "telegram_username" TEXT,
    "telegram_chat_id" TEXT,
    "commission_type" "commission_type" NOT NULL DEFAULT 'per_person',
    "default_commission_thb" INTEGER NOT NULL DEFAULT 100,
    "status" "partner_status" NOT NULL DEFAULT 'active',
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "excursion_status" NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excursion_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "short_emotion" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "route" TEXT,
    "duration" TEXT,
    "price_from_thb" INTEGER NOT NULL,
    "price_from_rub" INTEGER NOT NULL,
    "rub_rate" DECIMAL(10,4) NOT NULL,
    "rate_date" TIMESTAMP(3) NOT NULL,
    "currency_note" TEXT NOT NULL,
    "included" JSONB,
    "not_included" JSONB,
    "take_with_you" JSONB,
    "restrictions" JSONB,
    "insurance" TEXT NOT NULL,
    "guide_language_note" TEXT,
    "cancellation_policy" TEXT,
    "partner_id" UUID NOT NULL,
    "status" "excursion_status" NOT NULL DEFAULT 'draft',
    "seo_title" TEXT NOT NULL,
    "seo_description" TEXT NOT NULL,
    "source_url" TEXT,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excursions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_photos" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "excursion_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL,
    "image_type" "excursion_photo_image_type" NOT NULL DEFAULT 'real',
    "alt" TEXT,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "block" TEXT,
    "role" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_url" TEXT,
    "source_type" TEXT,
    "usage_allowed" BOOLEAN NOT NULL DEFAULT true,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excursion_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "public_number" TEXT NOT NULL,
    "source" "lead_source" NOT NULL DEFAULT 'website',
    "status" "lead_status" NOT NULL DEFAULT 'new',
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_telegram" TEXT,
    "requested_date" TIMESTAMP(3),
    "people_count" INTEGER,
    "comment" TEXT,
    "source_page" TEXT,
    "user_id" UUID,
    "excursion_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "lead_id" UUID NOT NULL,
    "from_status" "lead_status",
    "to_status" "lead_status" NOT NULL,
    "actor_type" "lead_actor_type" NOT NULL DEFAULT 'system',
    "actor_id" UUID,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "excursion_categories_slug_key" ON "excursion_categories"("slug");

-- CreateIndex
CREATE INDEX "excursion_categories_status_sort_order_idx" ON "excursion_categories"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "excursions_slug_key" ON "excursions"("slug");

-- CreateIndex
CREATE INDEX "excursions_category_id_status_idx" ON "excursions"("category_id", "status");

-- CreateIndex
CREATE INDEX "excursions_partner_id_idx" ON "excursions"("partner_id");

-- CreateIndex
CREATE INDEX "excursions_status_price_from_rub_idx" ON "excursions"("status", "price_from_rub");

-- CreateIndex
CREATE INDEX "excursion_photos_excursion_id_sort_order_idx" ON "excursion_photos"("excursion_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "leads_public_number_key" ON "leads"("public_number");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "leads_user_id_created_at_idx" ON "leads"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_excursion_id_idx" ON "leads"("excursion_id");

-- CreateIndex
CREATE INDEX "leads_partner_id_idx" ON "leads"("partner_id");

-- CreateIndex
CREATE INDEX "lead_status_history_lead_id_created_at_idx" ON "lead_status_history"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "excursions" ADD CONSTRAINT "excursions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "excursion_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursions" ADD CONSTRAINT "excursions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_photos" ADD CONSTRAINT "excursion_photos_excursion_id_fkey" FOREIGN KEY ("excursion_id") REFERENCES "excursions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_excursion_id_fkey" FOREIGN KEY ("excursion_id") REFERENCES "excursions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
