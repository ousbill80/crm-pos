import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ShopCatalogueService } from './shop-catalogue.service';
import { ShopPanierService } from './shop-panier.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { ShopCompteService } from './shop-compte.service';
import { ShopAvisService } from './shop-avis.service';
import { ShopPspService } from './psp/shop-psp.service';
import { ShopAarrrService } from './shop-aarrr.service';
import { ShopFunnelEventDto } from './dto/shop-funnel.dto';
import { ModeReglementCommandeWeb } from '@caisse-crm/shared';
import {
  CheckoutShopDto,
  UpdatePanierLignesDto,
} from './dto/shop-checkout.dto';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';

class SoumettreAvisDto {
  @IsInt()
  @Min(1)
  @Max(5)
  note!: number;

  @IsOptional()
  @IsString()
  commentaire?: string;
}

const PANIER_COOKIE = 'shop_panier';

function sessionShop(req: Request): string {
  const h = req.headers['x-shop-session'];
  const raw = Array.isArray(h) ? h[0] : h;
  if (raw && /^[A-Za-z0-9_-]{8,64}$/.test(raw)) return raw;
  return `srv${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

@Public()
@Controller('shop')
export class ShopController {
  private readonly logger = new Logger(ShopController.name);

  constructor(
    private readonly catalogue: ShopCatalogueService,
    private readonly panier: ShopPanierService,
    private readonly checkoutService: ShopCheckoutService,
    private readonly compte: ShopCompteService,
    private readonly avis: ShopAvisService,
    private readonly psp: ShopPspService,
    private readonly aarrr: ShopAarrrService,
  ) {}

  @Get('decouverte')
  listDecouverte(
    @Req() req: Request,
    @Query('sessionId') sessionId?: string,
  ) {
    let compteClientId: string | undefined;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        compteClientId = this.compte.verifyToken(auth.slice(7)).sub;
      } catch {
        compteClientId = undefined;
      }
    }
    const sid =
      sessionId && /^[A-Za-z0-9_-]{8,64}$/.test(sessionId)
        ? sessionId
        : sessionShop(req);
    return this.aarrr.decouverte({ sessionId: sid, compteClientId });
  }

  @Get('catalogue')
  listCatalogue(
    @Query('categorie') categorie?: string,
    @Query('recherche') recherche?: string,
    @Query('marque') marque?: string,
    @Query('tri') tri?: 'prix_asc' | 'prix_desc' | 'designation',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalogue.listCatalogue({
      categorie,
      recherche,
      marque,
      tri,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('catalogue/produit/:slug')
  getProduit(@Param('slug') slug: string) {
    return this.catalogue.getBySlug(slug);
  }

  @Get('retrait/boutiques')
  listBoutiquesRetrait() {
    return this.catalogue.listBoutiquesRetrait();
  }

  @Get('livraison/zones')
  listZones() {
    return this.catalogue.listZonesLivraison();
  }

  /** Modes de paiement proposés en caisse web (PLAN-E-COMMERCE paiement différé). */
  @Get('reglements')
  getReglements() {
    return this.checkoutService.getModesReglement();
  }

  @Post('evenements')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async evenementFunnel(@Req() req: Request, @Body() dto: ShopFunnelEventDto) {
    let compteClientId: string | undefined;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        compteClientId = this.compte.verifyToken(auth.slice(7)).sub;
      } catch {
        compteClientId = undefined;
      }
    }
    return this.aarrr.ingestPublic(dto, compteClientId);
  }

  @Post('panier')
  async creerPanier(@Res({ passthrough: true }) res: Response) {
    const { token } = await this.panier.creerPanier();
    res.cookie(PANIER_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return this.panier.getPanier(token);
  }

  @Get('panier')
  getPanier(@Req() req: Request) {
    return this.panier.getPanier(req.cookies?.[PANIER_COOKIE] as string);
  }

  @Patch('panier/lignes')
  async updateLignes(@Req() req: Request, @Body() dto: UpdatePanierLignesDto) {
    const panier = await this.panier.updateLignes(
      req.cookies?.[PANIER_COOKIE] as string,
      dto.lignes,
    );
    const premiere = dto.lignes.find((l) => l.quantite > 0);
    if (premiere) {
      try {
        await this.aarrr.ingestServeur({
          action: 'ADD_CART',
          sessionId: sessionShop(req),
          produitId: premiere.produitId,
        });
      } catch {
        // Funnel non bloquant
      }
    }
    return panier;
  }

  @Post('checkout')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async checkout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: CheckoutShopDto,
  ) {
    let compteClientId: string | undefined;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        compteClientId = this.compte.verifyToken(auth.slice(7)).sub;
      } catch {
        // Invité : token absent ou invalide — checkout anonyme OK
      }
    }
    const commande = await this.checkoutService.checkout(
      req.cookies?.[PANIER_COOKIE] as string,
      dto,
      compteClientId,
    );

    try {
      await this.aarrr.enregistrerCommande({
        sessionId: sessionShop(req),
        compteClientId,
        commandeWebId: commande.id,
        statut: commande.statut,
      });
    } catch {
      // Funnel non bloquant
    }

    try {
      const { token } = await this.panier.creerPanier();
      res.cookie(PANIER_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    } catch {
      // Panier suivant optionnel — la commande est déjà créée.
    }

    if (dto.modeReglement !== ModeReglementCommandeWeb.PREPAYE_PSP) {
      return commande;
    }
    try {
      const pay = await this.psp.initierPaiement(
        commande.id,
        dto.providerPsp ?? 'PAYSTACK',
      );
      return {
        ...commande,
        authorizationUrl: pay.authorizationUrl,
        sandbox: pay.sandbox === true,
      };
    } catch (err) {
      this.logger.warn(
        `Init Paystack checkout ${commande.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  @Get('commandes/:id/statut')
  getStatut(@Param('id') id: string) {
    return this.checkoutService.getStatut(id);
  }

  @Get('suivi/:token')
  getSuivi(@Param('token') token: string) {
    return this.checkoutService.getSuivi(token);
  }

  @Get('avis/:token')
  getAvis(@Param('token') token: string) {
    return this.avis.getByToken(token);
  }

  @Post('avis/:token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  soumettreAvis(@Param('token') token: string, @Body() dto: SoumettreAvisDto) {
    return this.avis.soumettre(token, dto);
  }
}
