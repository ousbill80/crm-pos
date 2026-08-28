import {
  Body,
  Controller,
  Get,
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
import { ModeReglementCommandeWeb } from '@caisse-crm/shared';
import {
  CheckoutShopDto,
  UpdatePanierLignesDto,
} from './dto/shop-checkout.dto';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

@Public()
@Controller('shop')
export class ShopController {
  constructor(
    private readonly catalogue: ShopCatalogueService,
    private readonly panier: ShopPanierService,
    private readonly checkoutService: ShopCheckoutService,
    private readonly compte: ShopCompteService,
    private readonly avis: ShopAvisService,
    private readonly psp: ShopPspService,
  ) {}

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
  updateLignes(@Req() req: Request, @Body() dto: UpdatePanierLignesDto) {
    return this.panier.updateLignes(
      req.cookies?.[PANIER_COOKIE] as string,
      dto.lignes,
    );
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

    if (
      dto.modeReglement === ModeReglementCommandeWeb.PREPAYE_PSP &&
      dto.providerPsp &&
      this.psp.doitUtiliserSandbox(dto.providerPsp)
    ) {
      try {
        const pay = await this.psp.initierPaiement(
          commande.id,
          dto.providerPsp,
        );
        return {
          ...commande,
          authorizationUrl: pay.authorizationUrl,
          sandbox: pay.sandbox === true,
        };
      } catch {
        return commande;
      }
    }
    return commande;
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
