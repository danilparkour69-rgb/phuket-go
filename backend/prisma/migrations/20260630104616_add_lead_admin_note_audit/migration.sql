-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "admin_note_updated_at" TIMESTAMP(3),
ADD COLUMN     "admin_note_updated_by_id" UUID;

-- CreateIndex
CREATE INDEX "leads_admin_note_updated_by_id_idx" ON "leads"("admin_note_updated_by_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_admin_note_updated_by_id_fkey" FOREIGN KEY ("admin_note_updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
