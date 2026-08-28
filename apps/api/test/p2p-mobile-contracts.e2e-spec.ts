import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { RoleLibelle } from '@caisse-crm/shared';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { SensitiveActionChallengeService } from '../src/auth/sensitive-action-challenge.service';
import { AchatsStateMachineService } from '../src/fournisseurs/achats-state-machine.service';
import { P2pAccountingCalculator } from '../src/fournisseurs/p2p-accounting.calculator';
import { P2pAccountingService } from '../src/fournisseurs/p2p-accounting.service';
import { P2pEvidenceService } from '../src/fournisseurs/p2p-evidence.service';
import { PlanningAchatsService } from '../src/fournisseurs/planning-achats.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

describe('P2P mobile backend contracts (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let storageDirectory: string;
  let auth: AuthService;
  let challenges: SensitiveActionChallengeService;
  let evidence: P2pEvidenceService;
  let planning: PlanningAchatsService;
  let accounting: P2pAccountingService;
  const users = new Map<
    RoleLibelle,
    {
      userId: string;
      login: string;
      role: RoleLibelle;
      boutiqueId: string | null;
    }
  >();
  let companyId: string;
  let receiptId: string;
  let ownBoutiqueId: string;
  let otherBoutiqueId: string;

  beforeAll(async () => {
    await env.start();
    storageDirectory = await mkdtemp(join(tmpdir(), 'p2p-evidence-'));
    const audit = new AuditService(env.prisma);
    auth = new AuthService(
      env.prisma,
      new JwtService({ secret: 'test-secret' }),
      audit,
    );
    challenges = new SensitiveActionChallengeService(env.prisma, auth, audit);
    evidence = new P2pEvidenceService(
      env.prisma,
      new ConfigService({
        P2P_EVIDENCE_STORAGE_DIR: storageDirectory,
        P2P_EVIDENCE_MAX_BYTES: 128,
      }),
    );
    planning = new PlanningAchatsService(
      env.prisma,
      new AchatsStateMachineService(),
    );
    accounting = new P2pAccountingService(
      env.prisma,
      new P2pAccountingCalculator(),
    );

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'P2P zone' },
    });
    const otherZone = await env.prisma.zone.create({
      data: { nomZone: 'Other zone' },
    });
    ownBoutiqueId = (
      await env.prisma.boutique.create({
        data: { nom: 'P2P boutique', adresse: 'A', zoneId: zone.id },
      })
    ).id;
    otherBoutiqueId = (
      await env.prisma.boutique.create({
        data: { nom: 'Other boutique', adresse: 'B', zoneId: otherZone.id },
      })
    ).id;
    companyId = (
      await env.prisma.societe.create({
        data: { raisonSociale: 'P2P mobile', adresse: 'Abidjan' },
      })
    ).id;

    for (const role of [
      RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE,
      RoleLibelle.QUALITE_STOCKS,
      RoleLibelle.RAF_COMPTABLE,
      RoleLibelle.CAISSIER_CENTRAL,
      RoleLibelle.RESPONSABLE_BOUTIQUE,
      RoleLibelle.DAF,
    ]) {
      const roleRow = await env.prisma.role.create({
        data: { libelle: role, niveauHabilitation: 1 },
      });
      const user = await env.prisma.utilisateur.create({
        data: {
          nom: role,
          prenom: 'Test',
          login: `${role}-${crypto.randomUUID()}`,
          passwordHash: await AuthService.hashPassword('correct-password'),
          roleId: roleRow.id,
          boutiqueId:
            role === RoleLibelle.RESPONSABLE_BOUTIQUE ? ownBoutiqueId : null,
        },
      });
      users.set(role, {
        userId: user.id,
        login: user.login,
        role,
        boutiqueId: user.boutiqueId,
      });
    }

    const supplier = await env.prisma.fournisseur.create({
      data: { nom: 'P2P supplier' },
    });
    const product = await env.prisma.produit.create({
      data: { designation: 'P2P product', prixUnitaire: 100 },
    });
    const order = await env.prisma.commandeAchat.create({
      data: {
        numero: `PO-${crypto.randomUUID()}`,
        fournisseurId: supplier.id,
        societeId: companyId,
        boutiqueId: ownBoutiqueId,
        initiateurId: users.get(RoleLibelle.RAF_COMPTABLE)!.userId,
        lignes: {
          create: { produitId: product.id, quantite: 1, prixUnitaire: 100 },
        },
      },
    });
    const quarantine = await env.prisma.entrepot.create({
      data: {
        nom: 'Quarantine',
        code: `Q-${crypto.randomUUID()}`,
        usage: 'QUARANTAINE',
        boutiqueId: ownBoutiqueId,
      },
    });
    receiptId = (
      await env.prisma.receptionAchat.create({
        data: {
          numero: `REC-${crypto.randomUUID()}`,
          commandeId: order.id,
          fournisseurId: supplier.id,
          emplacementQuarantaineId: quarantine.id,
          receptionnaireId: users.get(RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE)!
            .userId,
          clientOperationId: crypto.randomUUID(),
        },
      })
    ).id;

    const ownCentre = await env.prisma.centreCout.create({
      data: {
        societeId: companyId,
        boutiqueId: ownBoutiqueId,
        code: 'OWN',
        libelle: 'Own centre',
      },
    });
    await env.prisma.centreCout.create({
      data: {
        societeId: companyId,
        boutiqueId: otherBoutiqueId,
        code: 'OTHER',
        libelle: 'Other centre',
      },
    });
    await env.prisma.budgetAchat.create({
      data: {
        centreCoutId: ownCentre.id,
        libelle: 'Active budget',
        devise: 'XOF',
        montantAlloue: 1000,
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      },
    });

    const glAccount = await env.prisma.compteComptable.create({
      data: { societeId: companyId, numero: '521TEST', intitule: 'Treasury' },
    });
    const bank = await env.prisma.compteTresorerie.create({
      data: {
        societeId: companyId,
        code: 'BANK',
        libelle: 'Bank',
        type: 'BANK',
        compteComptableId: glAccount.id,
      },
    });
    const cash = await env.prisma.compteTresorerie.create({
      data: {
        societeId: companyId,
        code: 'CASH',
        libelle: 'Cash',
        type: 'CENTRAL_CASH',
        compteComptableId: glAccount.id,
      },
    });
    for (const account of [bank, cash]) {
      await env.prisma.propositionPaiementFournisseur.create({
        data: {
          numero: `PP-${crypto.randomUUID()}`,
          societeId: companyId,
          montant: 100,
          devise: 'XOF',
          mode: account.type === 'BANK' ? 'VIREMENT' : 'CAISSE_CENTRALE',
          compteTresorerieId: account.id,
          dateExecutionPrevue: new Date('2026-08-25'),
          clientOperationId: crypto.randomUUID(),
          preparateurId: users.get(RoleLibelle.RAF_COMPTABLE)!.userId,
        },
      });
    }
  }, 120_000);

  afterAll(async () => {
    await env.stop();
    await rm(storageDirectory, { recursive: true, force: true });
  }, 30_000);

  it('stores only validated content under an opaque server key', async () => {
    const uploader = users.get(RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE)!;
    const pdf = Buffer.from('%PDF-1.7\nsafe');
    const uploaded = await evidence.upload(
      'RECEIPT',
      receiptId,
      { buffer: pdf, mimetype: 'application/pdf', size: pdf.length },
      uploader,
    );
    expect(uploaded.empreinteSha256).toHaveLength(64);
    expect(Object.keys(uploaded)).not.toContain('storageKey');
    const storedNames = await readdir(storageDirectory);
    expect(storedNames).toHaveLength(1);
    expect(storedNames[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(storedNames[0]).not.toContain('..');

    await expect(
      evidence.upload(
        'RECEIPT',
        receiptId,
        {
          buffer: Buffer.from('<script>spoof</script>'),
          mimetype: 'application/pdf',
          size: 22,
        },
        uploader,
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(
      evidence.upload(
        'RECEIPT',
        receiptId,
        {
          buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(200)]),
          mimetype: 'application/pdf',
          size: 205,
        },
        uploader,
      ),
    ).rejects.toThrow(/128 octets/);
    await expect(
      evidence.upload(
        'QUALITY',
        receiptId,
        { buffer: pdf, mimetype: 'application/pdf', size: pdf.length },
        uploader,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const otherBoutiqueReader = {
      ...users.get(RoleLibelle.RESPONSABLE_BOUTIQUE)!,
      boutiqueId: otherBoutiqueId,
    };
    await expect(
      evidence.download(uploaded.id, otherBoutiqueReader),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes cost centres and active budgets to the user boutique', async () => {
    const user = users.get(RoleLibelle.RESPONSABLE_BOUTIQUE)!;
    const centres = await planning.listerCentresCout({}, user);
    expect(centres.map((item) => item.code)).toEqual(['OWN']);
    const budgets = await planning.listerBudgetsActifs(
      { activeAt: '2026-08-24' },
      user,
    );
    expect(budgets).toHaveLength(1);
    expect(budgets[0].montantDisponible).toBe('1000.00');
  });

  it('lists and protects supplier payment proposals by treasury scope', async () => {
    const central = users.get(RoleLibelle.CAISSIER_CENTRAL)!;
    const result = await accounting.listPaymentProposals(
      { page: 1, limit: 50 },
      central,
    );
    expect(result.total).toBe(1);
    expect(result.items[0].compteTresorerie.type).toBe('CENTRAL_CASH');
    const bank =
      await env.prisma.propositionPaiementFournisseur.findFirstOrThrow({
        where: { compteTresorerie: { type: 'BANK' } },
      });
    await expect(
      accounting.paymentProposalDetail(bank.id, central),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects challenge wrong user, purpose, replay, expiry and lockout', async () => {
    const daf = users.get(RoleLibelle.DAF)!;
    const raf = users.get(RoleLibelle.RAF_COMPTABLE)!;
    await expect(
      challenges.create(daf.userId, 'wrong-password', 'P2P_PAYMENT_APPROVE'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const challenge = await challenges.create(
      daf.userId,
      'correct-password',
      'P2P_PAYMENT_APPROVE',
    );
    await expect(
      challenges.consume(
        challenge.challengeId,
        raf.userId,
        'P2P_PAYMENT_APPROVE',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      challenges.consume(
        challenge.challengeId,
        daf.userId,
        'P2P_PAYMENT_EXECUTE',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await challenges.consume(
      challenge.challengeId,
      daf.userId,
      'P2P_PAYMENT_APPROVE',
    );
    await expect(
      challenges.consume(
        challenge.challengeId,
        daf.userId,
        'P2P_PAYMENT_APPROVE',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const expired = await challenges.create(
      daf.userId,
      'correct-password',
      'P2P_PAYMENT_EXECUTE',
    );
    await env.prisma.challengeActionSensible.update({
      where: { id: expired.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      challenges.consume(
        expired.challengeId,
        daf.userId,
        'P2P_PAYMENT_EXECUTE',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await env.prisma.utilisateur.update({
      where: { id: daf.userId },
      data: { lockedUntil: new Date(Date.now() + 60_000) },
    });
    await expect(
      challenges.create(daf.userId, 'correct-password', 'P2P_PAYMENT_APPROVE'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
