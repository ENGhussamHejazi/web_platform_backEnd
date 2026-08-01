-- CreateTable
CREATE TABLE "customer_conversations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_conversations_storeId_lastMessageAt_idx" ON "customer_conversations"("storeId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_conversations_storeId_customerId_key" ON "customer_conversations"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "customer_messages_conversationId_createdAt_idx" ON "customer_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "customer_conversations" ADD CONSTRAINT "customer_conversations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_conversations" ADD CONSTRAINT "customer_conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "customer_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

