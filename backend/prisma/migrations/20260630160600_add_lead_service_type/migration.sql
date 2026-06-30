-- CreateEnum
CREATE TYPE "lead_service_type" AS ENUM ('excursion', 'bike_rental', 'car_rental', 'visa', 'border_run', 'money_exchange');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "service_type" "lead_service_type" NOT NULL DEFAULT 'excursion';
