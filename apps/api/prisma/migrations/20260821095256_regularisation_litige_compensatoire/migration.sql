-- CreateTable
CREATE TABLE "regularisation_litige" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "montantRetenu" DECIMAL(14,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "validateurId" TEXT NOT NULL,
    "dateRegularisation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regularisation_litige_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regularisation_litige_transactionId_key" ON "regularisation_litige"("transactionId");

-- AddForeignKey
ALTER TABLE "regularisation_litige" ADD CONSTRAINT "regularisation_litige_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisation_litige" ADD CONSTRAINT "regularisation_litige_validateurId_fkey" FOREIGN KEY ("validateurId") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
