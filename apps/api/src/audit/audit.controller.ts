import { Controller, Get, Query } from '@nestjs/common';
import { RoleLibelle } from '@caisse-crm/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

// Consultation du journal d'audit (§4, §6.7) : réservée à Responsable SI,
// DAF et Contrôleur interne (« lecture + audit réseau entier »). Direction
// Générale en est explicitement exclue (rôle de consultation métier, pas
// d'audit technique).
const ROLES_LECTURE_AUDIT: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.DAF,
  RoleLibelle.CONTROLEUR_INTERNE,
];

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(...ROLES_LECTURE_AUDIT)
  findAll(@Query() query: ListAuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
