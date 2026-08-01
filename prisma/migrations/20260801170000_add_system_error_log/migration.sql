CREATE TABLE "system_error_logs" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_error_logs_at_idx" ON "system_error_logs"("at");
