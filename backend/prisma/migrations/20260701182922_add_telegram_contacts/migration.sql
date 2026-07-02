-- CreateTable
CREATE TABLE "telegram_contacts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "chat_id" TEXT NOT NULL,
    "telegram_user_id" TEXT,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "chat_type" TEXT NOT NULL,
    "last_message_text" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_contacts_chat_id_key" ON "telegram_contacts"("chat_id");

-- CreateIndex
CREATE INDEX "telegram_contacts_last_seen_at_idx" ON "telegram_contacts"("last_seen_at");
