import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PasswordChangeRequiredGuard } from './auth/guards/password-change-required.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CaissesModule } from './caisses/caisses.module';
import { ZonesModule } from './zones/zones.module';
import { BoutiquesModule } from './boutiques/boutiques.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CrmModule } from './crm/crm.module';
import { DevisModule } from './devis/devis.module';
import { FacturesClientModule } from './factures-client/factures-client.module';
import { ProduitsModule } from './produits/produits.module';
import { VentesModule } from './ventes/ventes.module';
import { FournisseursModule } from './fournisseurs/fournisseurs.module';
import { AlertesModule } from './alertes/alertes.module';
import { ReportingModule } from './reporting/reporting.module';
import { StocksModule } from './stocks/stocks.module';
import { InventairesModule } from './inventaires/inventaires.module';
import { EntrepotsModule } from './entrepots/entrepots.module';
import { EntrepriseModule } from './entreprise/entreprise.module';
import { UsersModule } from './users/users.module';
import { ShopModule } from './shop/shop.module';
import { CommandesWebModule } from './commandes-web/commandes-web.module';
import { AccountingAiModule } from './accounting-ai/accounting-ai.module';
import { ImmobilisationsModule } from './immobilisations/immobilisations.module';

const apiRateLimitConfigure = Number(
  process.env.API_RATE_LIMIT_PER_MINUTE ?? 600,
);
const API_RATE_LIMIT_PER_MINUTE =
  process.env.NODE_ENV === 'test'
    ? 100_000
    : Number.isFinite(apiRateLimitConfigure)
      ? Math.max(60, apiRateLimitConfigure)
      : 600;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Rate limiting générique (§6.7) : limite globale généreuse, resserrée
    // spécifiquement sur /auth/login et /auth/change-password via @Throttle.
    // Jest force NODE_ENV=test par défaut ; les suites e2e enchaînent
    // largement plus de requêtes/minute sur un même process serveur
    // (beforeAll partagé par fichier de test) — on desserre donc la limite
    // globale en test uniquement, jamais en production.
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: API_RATE_LIMIT_PER_MINUTE },
    ]),
    PrismaModule,
    AuditModule,
    AuthModule,
    ZonesModule,
    BoutiquesModule,
    CaissesModule,
    TransactionsModule,
    CrmModule,
    DevisModule,
    FacturesClientModule,
    ProduitsModule,
    VentesModule,
    FournisseursModule,
    AlertesModule,
    ReportingModule,
    StocksModule,
    InventairesModule,
    EntrepotsModule,
    EntrepriseModule,
    UsersModule,
    ShopModule,
    CommandesWebModule,
    AccountingAiModule,
    ImmobilisationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guards globaux : toute route est protégée par défaut (secure by
    // default). Utiliser @Public() pour une exception explicite, @Roles(...)
    // pour restreindre à des rôles précis (§6.2, §6.4).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeRequiredGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
