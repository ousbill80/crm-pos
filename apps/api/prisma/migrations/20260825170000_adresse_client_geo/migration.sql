-- Point GPS du carnet d’adresses shop (même contrat que adresseLivraisonJson.lat/lng).
ALTER TABLE "adresse_client" ADD COLUMN "lat" DECIMAL(10,7);
ALTER TABLE "adresse_client" ADD COLUMN "lng" DECIMAL(10,7);
