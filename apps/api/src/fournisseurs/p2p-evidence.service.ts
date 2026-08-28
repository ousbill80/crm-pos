import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeEvidenceP2p } from '@prisma/client';
import { RoleLibelle } from '@caisse-crm/shared';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, promises as fs } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { AuthenticatedUser } from '../auth/types';
import { resolveZoneScopeForSuperviseur } from '../boutiques/boutique-scope.util';
import { PrismaService } from '../prisma/prisma.service';

export const P2P_EVIDENCE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export const P2P_EVIDENCE_DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const P2P_EVIDENCE_ABSOLUTE_MAX_BYTES = 10 * 1024 * 1024;

export function configuredP2pEvidenceMaxBytes(
  raw: unknown = process.env.P2P_EVIDENCE_MAX_BYTES,
) {
  const value = Number(raw ?? P2P_EVIDENCE_DEFAULT_MAX_BYTES);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > P2P_EVIDENCE_ABSOLUTE_MAX_BYTES
  ) {
    throw new Error(
      `P2P_EVIDENCE_MAX_BYTES doit être compris entre 1 et ${P2P_EVIDENCE_ABSOLUTE_MAX_BYTES}.`,
    );
  }
  return value;
}

export interface P2pEvidenceUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class P2pEvidenceService {
  readonly maxBytes: number;
  private readonly storageDirectory: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const configuredDirectory =
      config.get<string>('P2P_EVIDENCE_STORAGE_DIR')?.trim() ||
      join(process.cwd(), 'var', 'p2p-evidence');
    this.storageDirectory = resolve(configuredDirectory);
    if (!isAbsolute(this.storageDirectory)) {
      throw new Error('P2P_EVIDENCE_STORAGE_DIR doit être un chemin absolu.');
    }
    this.maxBytes = configuredP2pEvidenceMaxBytes(
      config.get('P2P_EVIDENCE_MAX_BYTES'),
    );
    mkdirSync(this.storageDirectory, { recursive: true, mode: 0o700 });
  }

  async upload(
    type: TypeEvidenceP2p,
    sourceId: string,
    file: P2pEvidenceUpload | undefined,
    user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Fichier multipart requis.');
    if (file.size < 1 || file.size > this.maxBytes) {
      throw new BadRequestException(
        `La taille du fichier doit être comprise entre 1 et ${this.maxBytes} octets.`,
      );
    }
    this.assertContent(file);
    const source = await this.resolveSource(type, sourceId);
    await this.assertSourceScope(source.boutiqueId, user);
    this.assertUploadRole(type, user);

    const storageKey = randomUUID();
    const target = this.storagePath(storageKey);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await fs.writeFile(target, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const evidence = await tx.evidenceP2p.create({
          data: {
            type,
            sourceId,
            societeId: source.societeId,
            boutiqueId: source.boutiqueId,
            storageKey,
            mimeType: file.mimetype,
            tailleOctets: file.size,
            empreinteSha256: sha256,
            uploaderId: user.userId,
          },
          select: {
            id: true,
            type: true,
            sourceId: true,
            societeId: true,
            boutiqueId: true,
            mimeType: true,
            tailleOctets: true,
            empreinteSha256: true,
            uploaderId: true,
            dateCreation: true,
          },
        });
        await tx.journalAudit.create({
          data: {
            utilisateurId: user.userId,
            action: 'P2P_EVIDENCE_UPLOADED',
            entite: 'EvidenceP2p',
            entiteId: evidence.id,
            details: JSON.stringify({
              type,
              sourceId,
              sha256,
              tailleOctets: file.size,
            }),
          },
        });
        return evidence;
      });
    } catch (error) {
      await fs.rm(target, { force: true });
      throw error;
    }
  }

  async download(id: string, user: AuthenticatedUser) {
    const evidence = await this.prisma.evidenceP2p.findUnique({
      where: { id },
    });
    if (!evidence) throw new NotFoundException('Preuve P2P introuvable.');
    await this.assertSourceScope(evidence.boutiqueId, user);
    const path = this.storagePath(evidence.storageKey);
    try {
      await fs.access(path);
    } catch {
      throw new NotFoundException('Contenu de la preuve P2P introuvable.');
    }
    await this.prisma.journalAudit.create({
      data: {
        utilisateurId: user.userId,
        action: 'P2P_EVIDENCE_DOWNLOADED',
        entite: 'EvidenceP2p',
        entiteId: evidence.id,
        details: JSON.stringify({
          type: evidence.type,
          sourceId: evidence.sourceId,
          sha256: evidence.empreinteSha256,
        }),
      },
    });
    return {
      evidence,
      stream: createReadStream(path),
    };
  }

  private assertContent(file: P2pEvidenceUpload) {
    if (
      !P2P_EVIDENCE_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof P2P_EVIDENCE_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new UnsupportedMediaTypeException('Type de fichier non autorisé.');
    }
    const bytes = file.buffer;
    const matches =
      (file.mimetype === 'application/pdf' &&
        bytes.subarray(0, 5).toString('ascii') === '%PDF-') ||
      (file.mimetype === 'image/png' &&
        bytes
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          )) ||
      (file.mimetype === 'image/jpeg' &&
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff);
    if (!matches) {
      throw new UnsupportedMediaTypeException(
        'Le contenu du fichier ne correspond pas au type MIME déclaré.',
      );
    }
  }

  private async resolveSource(type: TypeEvidenceP2p, sourceId: string) {
    if (type === TypeEvidenceP2p.RECEIPT || type === TypeEvidenceP2p.QUALITY) {
      const receipt = await this.prisma.receptionAchat.findUnique({
        where: { id: sourceId },
        select: {
          commande: { select: { societeId: true, boutiqueId: true } },
        },
      });
      if (!receipt) throw new NotFoundException('Réception P2P introuvable.');
      return this.requireCompany(receipt.commande);
    }
    if (type === TypeEvidenceP2p.CUSTOMS) {
      const dossier = await this.prisma.dossierDouane.findUnique({
        where: { id: sourceId },
        select: {
          expedition: {
            select: {
              commande: { select: { societeId: true, boutiqueId: true } },
            },
          },
        },
      });
      if (!dossier) throw new NotFoundException('Dossier douane introuvable.');
      return this.requireCompany(dossier.expedition.commande);
    }
    const invoice = await this.prisma.factureFournisseur.findUnique({
      where: { id: sourceId },
      select: {
        lignes: {
          select: {
            ligneCommande: {
              select: {
                commande: { select: { societeId: true, boutiqueId: true } },
              },
            },
          },
        },
      },
    });
    if (!invoice)
      throw new NotFoundException('Facture fournisseur introuvable.');
    const commands = invoice.lignes
      .map((line) => line.ligneCommande?.commande)
      .filter(
        (
          command,
        ): command is { societeId: string | null; boutiqueId: string | null } =>
          Boolean(command),
      );
    const companyIds = new Set(commands.map((command) => command.societeId));
    if (companyIds.size !== 1) {
      throw new BadRequestException(
        'La société de la facture P2P ne peut pas être déterminée de façon unique.',
      );
    }
    return this.requireCompany(commands[0]);
  }

  private requireCompany(source: {
    societeId: string | null;
    boutiqueId: string | null;
  }) {
    if (!source?.societeId) {
      throw new BadRequestException(
        'La source P2P doit être rattachée à une société.',
      );
    }
    return { societeId: source.societeId, boutiqueId: source.boutiqueId };
  }

  private assertUploadRole(type: TypeEvidenceP2p, user: AuthenticatedUser) {
    const allowed: Record<TypeEvidenceP2p, RoleLibelle[]> = {
      RECEIPT: [RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE],
      QUALITY: [RoleLibelle.QUALITE_STOCKS],
      CUSTOMS: [RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE],
      INVOICE: [RoleLibelle.RAF_COMPTABLE, RoleLibelle.RESPONSABLE_SI],
    };
    if (!allowed[type].includes(user.role)) {
      throw new ForbiddenException(
        'Ce rôle ne peut pas déposer cette catégorie de preuve P2P.',
      );
    }
  }

  private async assertSourceScope(
    boutiqueId: string | null,
    user: AuthenticatedUser,
  ) {
    if (user.role === RoleLibelle.RESPONSABLE_BOUTIQUE) {
      if (!user.boutiqueId || boutiqueId !== user.boutiqueId) {
        throw new ForbiddenException(
          'Preuve hors du périmètre de la boutique.',
        );
      }
    }
    if (user.role === RoleLibelle.SUPERVISEUR_ZONE) {
      const zoneId = await resolveZoneScopeForSuperviseur(this.prisma, user);
      if (!boutiqueId) {
        throw new ForbiddenException('Preuve hors du périmètre de la zone.');
      }
      const boutique = await this.prisma.boutique.findFirst({
        where: { id: boutiqueId, zoneId },
        select: { id: true },
      });
      if (!boutique) {
        throw new ForbiddenException('Preuve hors du périmètre de la zone.');
      }
    }
  }

  private storagePath(storageKey: string) {
    if (!/^[0-9a-f-]{36}$/i.test(storageKey)) {
      throw new BadRequestException('Clé de stockage invalide.');
    }
    const path = resolve(this.storageDirectory, storageKey);
    if (!path.startsWith(`${this.storageDirectory}${sep}`)) {
      throw new BadRequestException('Chemin de stockage invalide.');
    }
    return path;
  }
}
