import { Module } from "@nestjs/common";
import { PrismaService } from "prisma/prisma.service";
import { AttachmentsService } from "../attachments/attachments.service";import { StorageService } from "../storage/storage.service";

import { AttachmentsGlobalController } from "./attachments.global.controller";
import { AttachmentsGlobalService } from "./attachments.global.service";
import { ChemistryAttachmentsService } from "./chemistryattachments.service";

@Module({
  imports: [],
  controllers: [AttachmentsGlobalController],
  providers: [
    PrismaService,

    // dependencies of AttachmentsGlobalService:
    AttachmentsService,
    ChemistryAttachmentsService,
    StorageService,

    // the actual service Nest cannot resolve:
    AttachmentsGlobalService,
  ],
  exports: [AttachmentsGlobalService],
})
export class AttachmentsGlobalModule {}
