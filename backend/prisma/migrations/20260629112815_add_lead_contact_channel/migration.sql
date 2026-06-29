-- CreateEnum
CREATE TYPE "lead_contact_channel" AS ENUM ('telegram', 'whatsapp', 'max');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "contact_channel" "lead_contact_channel";
