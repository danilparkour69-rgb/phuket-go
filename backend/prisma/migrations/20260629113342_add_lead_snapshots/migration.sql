/*
  Warnings:

  - Added the required column `excursion_title_snapshot` to the `leads` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "commission_per_person_thb" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "commission_total_thb" INTEGER,
ADD COLUMN     "excursion_title_snapshot" TEXT NOT NULL,
ADD COLUMN     "price_rub_snapshot" INTEGER,
ADD COLUMN     "price_thb_snapshot" INTEGER;
