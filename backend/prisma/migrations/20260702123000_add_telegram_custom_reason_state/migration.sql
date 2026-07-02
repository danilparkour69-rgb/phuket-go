-- AlterTable
ALTER TABLE "telegram_contacts" ADD COLUMN     "pending_reason_action" TEXT,
ADD COLUMN     "pending_reason_lead_id" UUID,
ADD COLUMN     "pending_reason_message_id" INTEGER,
ADD COLUMN     "pending_reason_requested_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "telegram_contacts_pending_reason_lead_id_idx" ON "telegram_contacts"("pending_reason_lead_id");
