import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, type AdresseClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ShopEmailService } from './shop-email.service';
import { ShopAarrrService } from './shop-aarrr.service';

export class InscriptionCompteDto {
  email!: string;
  password!: string;
  nom!: string;
  prenom!: string;
  telephone!: string;
  codeParrain?: string;
}

export class LoginCompteDto {
  email!: string;
  password!: string;
}

@Injectable()
export class ShopCompteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: ShopEmailService,
    private readonly aarrr: ShopAarrrService,
  ) {}

  private shopJwtSecret(): string {
    return (
      this.config.get<string>('JWT_SECRET_SHOP') ??
      this.config.get<string>('JWT_SECRET') ??
      'dev-shop-jwt'
    );
  }

  private shopPublicUrl(): string {
    return (
      this.config.get<string>('SHOP_PUBLIC_URL')?.trim() ||
      'https://www.majorautoparts.shop'
    ).replace(/\/$/, '');
  }

  async inscription(dto: InscriptionCompteDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.findCompteByEmail(email);
    if (existing) {
      throw new ConflictException('E-mail déjà utilisé.');
    }
    const client = await this.prisma.client.create({
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        typeClient: 'PHYSIQUE',
        contact: dto.telephone,
      },
    });
    const parrain = await this.aarrr.resoudreParrain(dto.codeParrain);
    const codeParrainage = await this.aarrr.nouvelCodeParrainage();
    const compte = await this.prisma.compteClient.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        clientId: client.id,
        codeParrainage,
        parrainId: parrain?.id ?? null,
      },
    });
    await this.rattacherCommandesInvitees(compte.id, compte.email, client.id);
    try {
      await this.aarrr.ingestServeur({
        action: 'INSCRIPTION',
        sessionId: `insc${compte.id.replace(/-/g, '').slice(0, 16)}`,
        compteClientId: compte.id,
        codeParrain: parrain?.codeParrainage,
      });
      if (parrain) {
        await this.aarrr.ingestServeur({
          action: 'INSCRIPTION_PARRAINEE',
          sessionId: `insc${compte.id.replace(/-/g, '').slice(0, 16)}`,
          compteClientId: compte.id,
          codeParrain: parrain.codeParrainage,
        });
      }
    } catch {
      // Funnel non bloquant
    }
    try {
      const base = this.shopPublicUrl();
      await this.email.envoyer(email, 'bienvenue_compte', {
        prenom: dto.prenom.trim(),
        compteUrl: `${base}/compte`,
        catalogueUrl: `${base}/catalogue`,
        codeParrainage,
      });
    } catch {
      // E-mail de bienvenue non bloquant
    }
    return this.tokens(compte.id, compte.email);
  }

  async login(dto: LoginCompteDto) {
    const compte = await this.findCompteByEmail(dto.email);
    if (!compte || !compte.actif) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    const ok = await bcrypt.compare(dto.password, compte.passwordHash);
    if (!ok) throw new UnauthorizedException('Identifiants invalides.');
    await this.rattacherCommandesInvitees(
      compte.id,
      compte.email,
      compte.clientId,
    );
    return this.tokens(compte.id, compte.email);
  }

  async refresh(refreshToken: string) {
    const comptes = await this.prisma.compteClient.findMany({
      where: { refreshTokenHash: { not: null }, actif: true },
    });
    for (const compte of comptes) {
      if (
        compte.refreshTokenHash &&
        (await bcrypt.compare(refreshToken, compte.refreshTokenHash))
      ) {
        return this.tokens(compte.id, compte.email);
      }
    }
    throw new UnauthorizedException('Refresh token invalide.');
  }

  /** Toujours 200 — pas d'énumération d'e-mails. */
  async motDePasseOublie(email: string) {
    const compte = await this.findCompteByEmail(email);
    if (compte?.actif) {
      const temp = randomBytes(16).toString('hex');
      await this.prisma.compteClient.update({
        where: { id: compte.id },
        data: { passwordHash: await bcrypt.hash(temp, 10) },
      });
      await this.email.envoyer(email, 'mot_de_passe_oublie', {
        temporaryPassword: temp,
        compteUrl: `${this.shopPublicUrl()}/compte`,
      });
    }
    return { ok: true };
  }

  async mesCommandes(compteId: string) {
    const compte = await this.prisma.compteClient.findUnique({
      where: { id: compteId },
    });
    if (!compte) {
      throw new UnauthorizedException('Compte introuvable.');
    }
    await this.rattacherCommandesInvitees(
      compte.id,
      compte.email,
      compte.clientId,
    );
    return this.prisma.commandeWeb.findMany({
      where: {
        statut: { not: 'PANIER' },
        OR: [
          { compteClientId: compteId },
          { emailInvite: { equals: compte.email, mode: 'insensitive' } },
        ],
      },
      include: {
        lignes: {
          select: {
            id: true,
            designationSnapshot: true,
            quantite: true,
            prixUnitaireTtc: true,
            referenceSnapshot: true,
          },
        },
        boutiqueRetrait: { select: { nom: true, adresse: true } },
        zoneLivraison: { select: { libelle: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async creerAdresse(
    compteId: string,
    dto: {
      libelle: string;
      ligne1: string;
      ligne2?: string;
      ville: string;
      telephone?: string;
      region?: string;
      codePostal?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    const compte = await this.prisma.compteClient.findUnique({
      where: { id: compteId },
    });
    if (!compte) {
      throw new UnauthorizedException('Compte introuvable.');
    }
    const created = await this.prisma.adresseClient.create({
      data: {
        compteClientId: compteId,
        clientId: compte.clientId,
        libelle: dto.libelle.trim() || 'Livraison',
        ligne1: dto.ligne1.trim(),
        ligne2: dto.ligne2?.trim() || null,
        ville: dto.ville.trim(),
        region: dto.region?.trim() || null,
        codePostal: dto.codePostal?.trim() || null,
        telephone: dto.telephone?.trim() || null,
        pays: 'CI',
        lat: this.geoOrNull(dto.lat),
        lng: this.geoOrNull(dto.lng),
      },
    });
    return this.serializeAdresse(created, 'carnet');
  }

  async mesAdresses(compteId: string) {
    const compte = await this.prisma.compteClient.findUnique({
      where: { id: compteId },
    });
    if (!compte) {
      throw new UnauthorizedException('Compte introuvable.');
    }
    const saved = await this.prisma.adresseClient.findMany({
      where: { compteClientId: compteId },
      orderBy: { createdAt: 'desc' },
    });
    if (saved.length > 0) {
      return saved.map((a) => this.serializeAdresse(a, 'carnet'));
    }

    // Fallback : dernière adresse de livraison (compte ou checkout invité même e-mail)
    const last = await this.prisma.commandeWeb.findFirst({
      where: {
        modeFulfillment: 'LIVRAISON',
        adresseLivraisonJson: { not: Prisma.DbNull },
        OR: [
          { compteClientId: compteId },
          { emailInvite: { equals: compte.email, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, adresseLivraisonJson: true, telephoneInvite: true },
    });
    const raw = last?.adresseLivraisonJson;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const a = raw as Record<string, unknown>;
      const ligne1 = typeof a.ligne1 === 'string' ? a.ligne1 : '';
      const ville = typeof a.ville === 'string' ? a.ville : '';
      if (ligne1.trim()) {
        return [
          {
            id: `last-${last.id}`,
            libelle: 'Dernière livraison',
            ligne1,
            ligne2: null as string | null,
            ville: ville || 'Abidjan',
            region: null as string | null,
            codePostal: null as string | null,
            pays: 'CI',
            telephone:
              (typeof a.telephone === 'string' ? a.telephone : null) ??
              last.telephoneInvite,
            lat: this.jsonNumber(a.lat ?? a.latitude),
            lng: this.jsonNumber(a.lng ?? a.longitude),
            source: 'derniere_commande' as const,
          },
        ];
      }
    }
    return [];
  }

  async moi(compteId: string) {
    const compte = await this.prisma.compteClient.findUnique({
      where: { id: compteId },
      include: { client: { include: { fidelite: true } } },
    });
    if (!compte || !compte.actif) {
      throw new UnauthorizedException('Compte introuvable.');
    }
    const filleuls = await this.prisma.compteClient.count({
      where: { parrainId: compte.id },
    });
    return {
      compteClientId: compte.id,
      email: compte.email,
      prenom: compte.client.prenom,
      nom: compte.client.nom,
      displayName: this.displayName(
        compte.client.prenom ?? '',
        compte.client.nom ?? '',
      ),
      telephone: compte.client.contact,
      codeParrainage: compte.codeParrainage,
      filleuls,
      fidelite: compte.client.fidelite
        ? {
            niveau: compte.client.fidelite.niveau,
            pointsCumules: compte.client.fidelite.pointsCumules,
          }
        : null,
    };
  }

  verifyToken(token: string): { sub: string } {
    try {
      return this.jwt.verify(token, { secret: this.shopJwtSecret() });
    } catch {
      throw new UnauthorizedException('Token shop invalide.');
    }
  }

  private geoOrNull(n: number | undefined): number | null {
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }

  private jsonNumber(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private serializeAdresse(
    a: AdresseClient,
    source: 'carnet' | 'derniere_commande',
  ) {
    return {
      id: a.id,
      libelle: a.libelle,
      ligne1: a.ligne1,
      ligne2: a.ligne2,
      ville: a.ville,
      region: a.region,
      codePostal: a.codePostal,
      pays: a.pays,
      telephone: a.telephone,
      lat: this.decimalOrNull(a.lat),
      lng: this.decimalOrNull(a.lng),
      source,
    };
  }

  private decimalOrNull(
    value: Prisma.Decimal | number | null | undefined,
  ): number | null {
    if (value == null) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private async findCompteByEmail(email: string) {
    return this.prisma.compteClient.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
  }

  /** Rattache les commandes checkout invité au compte (même e-mail). */
  private async rattacherCommandesInvitees(
    compteId: string,
    email: string,
    clientId: string,
  ) {
    await this.prisma.commandeWeb.updateMany({
      where: {
        statut: { not: 'PANIER' },
        compteClientId: null,
        emailInvite: { equals: email, mode: 'insensitive' },
      },
      data: { compteClientId: compteId, clientId },
    });
  }

  private displayName(prenom: string, nom: string) {
    const p = prenom?.trim() ?? '';
    const n = nom?.trim() ?? '';
    if (p && n) return `${p} ${n.charAt(0).toUpperCase()}.`;
    return p || n || 'Client';
  }

  private async tokens(compteClientId: string, email: string) {
    const compte = await this.prisma.compteClient.findUnique({
      where: { id: compteClientId },
      include: { client: true },
    });
    const prenom = compte?.client.prenom ?? '';
    const nom = compte?.client.nom ?? '';
    const displayName = this.displayName(prenom, nom);

    const accessToken = this.jwt.sign(
      { sub: compteClientId, email, type: 'compte_client' },
      { secret: this.shopJwtSecret(), expiresIn: '15m' },
    );
    const refreshToken = randomBytes(32).toString('hex');
    await this.prisma.compteClient.update({
      where: { id: compteClientId },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 10) },
    });
    return {
      accessToken,
      refreshToken,
      compteClientId,
      email,
      prenom,
      nom,
      displayName,
    };
  }
}
