-- CreateTable
CREATE TABLE "lead_follow_up_answers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "lead_id" UUID NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_follow_up_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_follow_up_answers_lead_id_sort_order_idx" ON "lead_follow_up_answers"("lead_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "lead_follow_up_answers_lead_id_question_key_key" ON "lead_follow_up_answers"("lead_id", "question_key");

-- AddForeignKey
ALTER TABLE "lead_follow_up_answers" ADD CONSTRAINT "lead_follow_up_answers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
