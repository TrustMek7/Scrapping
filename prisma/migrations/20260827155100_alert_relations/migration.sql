-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "MonitoredEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
