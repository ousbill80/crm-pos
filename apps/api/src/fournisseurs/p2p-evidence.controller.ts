import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleLibelle } from '@caisse-crm/shared';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ROLES_LECTURE_ACHATS } from '../caisses/access-scope.constants';
import { UploadP2pEvidenceDto } from './dto/p2p-evidence.dto';
import {
  configuredP2pEvidenceMaxBytes,
  P2pEvidenceService,
  type P2pEvidenceUpload,
} from './p2p-evidence.service';

@Controller('achats/evidences')
export class P2pEvidenceController {
  constructor(private readonly evidence: P2pEvidenceService) {}

  @Post()
  @Roles(
    RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
    RoleLibelle.QUALITE_STOCKS,
    RoleLibelle.RAF_COMPTABLE,
    RoleLibelle.RESPONSABLE_SI,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      // multer.memoryStorage() n’est pas résolu par le projectService ESLint.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- typage multer
      storage: memoryStorage(),
      limits: {
        files: 1,
        fileSize: configuredP2pEvidenceMaxBytes(),
      },
    }),
  )
  upload(
    @Body() dto: UploadP2pEvidenceDto,
    @UploadedFile() file: P2pEvidenceUpload | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.evidence.upload(dto.type, dto.sourceId, file, user);
  }

  @Get(':id/download')
  @Roles(...ROLES_LECTURE_ACHATS)
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { evidence, stream } = await this.evidence.download(id, user);
    response.set({
      'Content-Type': evidence.mimeType,
      'Content-Length': String(evidence.tailleOctets),
      'Content-Disposition': `attachment; filename="evidence-${evidence.id}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(stream);
  }
}
