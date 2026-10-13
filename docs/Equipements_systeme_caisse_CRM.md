# Équipements pour l’utilisation du système Caisses & CRM

Document destiné au client. Liste le matériel nécessaire pour exploiter le progiciel (caisse boutique, stock, commandes web, livraisons, caisse centrale).

Le logiciel s’utilise dans un navigateur (PC / tablette) ou sur mobile. Les périphériques ci-dessous sont les équipements physiques autour du poste de travail.

---

## 1. Kit caisse boutique (indispensable)

Un kit par caisse ouverte. Si une boutique a deux caisses, prévoir deux kits.

### 1.1 Ordinateur ou tablette tactile (poste caisse)

| Caractéristique | Spécification minimale | Recommandé |
|---|---|---|
| Type | PC Windows ou tablette Windows / Android 10"+ | PC tactile 15" type POS, ou PC + écran 15–21" |
| Système | Windows 10/11, ou navigateur Chrome / Edge à jour | Windows 11 Pro |
| Processeur | Intel i3 / équivalent | Intel i5 ou supérieur |
| Mémoire | 8 Go RAM | 16 Go RAM |
| Stockage | SSD 256 Go | SSD 512 Go |
| Ports | 3× USB-A, HDMI, RJ45 | + USB-C, lecteur carte (option) |
| Réseau | Wi-Fi 5 + Ethernet | Wi-Fi 6 + Ethernet |
| Écran | 14" Full HD | 15" tactile capacitif, 1024×768 ou plus |
| Autonomie (tablette) | 6 h | 8 h + dock / alimentation secteur |

**Rôle :** ouvrir la caisse, encaisser, consulter le stock, le client et les commandes.

---

### 1.2 Imprimante ticket / reçu de caisse

| Caractéristique | Spécification |
|---|---|
| Type | Thermique directe (sans encre) |
| Largeur papier | **80 mm** (obligatoire — éviter 58 mm) |
| Vitesse | ≥ 150 mm/s |
| Résolution | ≥ 203 dpi |
| Coupe | Coupe automatique (auto-cutter) |
| Connexion | USB + Bluetooth et/ou Ethernet |
| Protocole | ESC/POS (Epson, Star, Xprinter, Rongta…) |
| Alimentation | Secteur 24 V (fournie) |
| Ouverture tiroir | Port RJ11 / RJ12 (kick-out tiroir-caisse) |
| Température / usage | Usage intensif boutique, 8–12 h / jour |
| Modèles de référence | Epson TM-T20III, Epson TM-T88, Star TSP143, Xprinter XP-N160II |

**Rôle :** ticket client, justificatif de vente, éventuellement bon de retrait.

**Consommable :** bobine thermique 80 mm × 80 m (ou 80 × 70), âme 12 mm, **sans BPA** de préférence.

---

### 1.3 Douchette / lecteur code-barres (caisse)

| Caractéristique | Spécification |
|---|---|
| Type | Douchette filaire USB (HID clavier) — prioritaire à la caisse |
| Lecture | **2D** : EAN-13, EAN-8, Code 128, Code 39, QR, DataMatrix |
| Distance de lecture | 0–25 cm (codes papier) |
| Capteur | Imageur 2D (pas seulement laser 1D) |
| Connexion | USB-A, mode HID (aucune installation driver) |
| Robustesse | Chute 1,5 m, usage comptoir |
| Alimentation | Via USB |
| Option | Modèle Bluetooth / sans-fil pour allée ou réserve |
| Modèles de référence | Honeywell Voyager 1450g / 1470g, Zebex, Datalogic QuickScan, Honeywell HH400 |

**Rôle :** scanner l’article à l’encaissement (plus rapide, moins d’erreurs que la saisie).

**Prérequis :** les articles doivent être **étiquetés** (voir § 2).

---

### 1.4 Tiroir-caisse

| Caractéristique | Spécification |
|---|---|
| Format | Standard POS 410 × 420 mm environ (4–5 cases billets) |
| Compartiments | 4–5 billets + 8 monnaies |
| Ouverture | Électrique via imprimante ticket (RJ11 / RJ12, 12–24 V) |
| Verrou | Clé mécanique + ouverture manuelle d’urgence |
| Matériau | Acier, rail à billes |
| Compatibilité | Branché sur le port « DK » / cash drawer de l’imprimante 80 mm |

**Rôle :** espèces, ouverture automatique à la fin de la vente.

---

### 1.5 Onduleur (UPS)

| Caractéristique | Spécification |
|---|---|
| Puissance | 600–1000 VA |
| Autonomie | ≥ 10 minutes (PC + imprimante ticket) |
| Prises | 2–4 prises protégées |
| Type | Line-interactive, régulation de tension (AVR) |
| Usage | Coupure CIE : terminer le ticket, ne pas corrompre la caisse |

---

### 1.6 Connexion réseau

| Caractéristique | Spécification |
|---|---|
| Accès | Fibre ou 4G/5G stable |
| Débit minimum | 10 Mbps descendant / 2 Mbps montant |
| Wi-Fi | Box + répéteur si la caisse est loin de la box |
| Adresse | IP fixe ou DHCP réservé pour l’imprimante Ethernet (si utilisée) |
| Mode dégradé | Le logiciel gère une file hors-ligne ; la sync reprend à la reconnexion |

---

## 2. Étiquettes produit / code-barres (stock & rayon)

Sans ces étiquettes, la douchette en caisse ne sert à rien.

### 2.1 Imprimante d’étiquettes code-barres

| Caractéristique | Spécification |
|---|---|
| Type | Thermique **transfert** (ruban) — tenue en rayon / chaleur |
| Alternative entrée de gamme | Thermique directe (étiquettes courte durée) |
| Largeur d’impression | 50–104 mm (4") |
| Résolution | **203 dpi** minimum, 300 dpi si petits codes |
| Vitesse | ≥ 100 mm/s |
| Mandrin | 25 mm ou 38 mm selon le modèle |
| Connexion | USB + Ethernet (partage entre postes) |
| Langage | ZPL (Zebra) ou TSPL (TSC) — à confirmer à l’installation |
| Capacité | Usage quotidien étiquetage réception / réassort |
| Modèles de référence | Zebra ZD421, Zebra ZT411 (volume), TSC TE200 / TE300 |

**Rôle :** étiquette prix + référence + code-barres (EAN / interne) sur chaque article.

**Formats d’étiquettes utiles :**

| Usage | Format | Matière |
|---|---|---|
| Prix rayon / accessoire | 50 × 30 mm ou 40 × 25 mm | Papier transfert ou PP |
| Produit volumineux | 70 × 40 mm | Papier transfert |
| Bijou / petit accessoire | 30 × 20 mm (300 dpi) | Papier ou film |

**Consommables :** étiquettes compatibles + ruban transfert cire/résine (si transfert).

---

### 2.2 Douchette ou terminal d’inventaire (hors caisse)

| Caractéristique | Spécification |
|---|---|
| Mini | Même douchette USB 2D qu’en caisse, sur un PC réserve |
| Recommandé hub | PDA / terminal portable Android, scan 2D, Wi-Fi |
| Batterie (PDA) | ≥ 8 h |
| Usage | Réception fournisseur, inventaire, réétiquetage, picking |

---

## 3. Étiquettes de livraison / expédition

Pour les commandes web, le click & collect préparé en colis, et les transferts inter-boutiques.

### 3.1 Imprimante d’étiquettes logistiques

| Caractéristique | Spécification |
|---|---|
| Type | Thermique directe (pas d’encre) |
| Format étiquette | **100 × 150 mm** (colis) ou **100 × 100 mm** |
| Résolution | 203 dpi |
| Connexion | USB + Bluetooth (et Ethernet si poste partagé) |
| Volume | 1 au hub / caisse centrale ; 1 extra si une boutique expédie beaucoup |
| Contenu imprimé | Destinataire, téléphone, adresse, n° suivi, référence commande |
| Modèles de référence | Imprimante 4×6" type Rollo / analogie 100×150, Zebra ZD421 4", Xprinter XP-420B |

**Rôle :** étiquette collée sur le colis (livraison ou retrait).

**Consommables :** bobines 100 × 150 mm (ou 100 × 100), mandrin selon imprimante ; pochettes plastique colis.

---

### 3.2 Balance colis (option)

| Caractéristique | Spécification |
|---|---|
| Portée | 1 g – 30 kg |
| Précision | 1–5 g |
| Plateau | ≥ 20 × 20 cm |
| Connexion | USB (si liaison future au logiciel) |
| Usage | Poids pour tarif transporteur / zone |

---

## 4. Caisse centrale, entrepôt, Direction / DAF

| Équipement | Caractéristiques | Rôle |
|---|---|---|
| PC bureau | i5, 8–16 Go, SSD, écran 22–24" | Réception versements, validation, CRM, commandes web |
| Imprimante A4 | Laser mono ou jet d’encre, USB / réseau, recto A4 | Bordereaux, factures, états |
| Imprimante étiquettes code-barres | Voir § 2.1 | Réception, réétiquetage, préparation |
| Imprimante étiquettes livraison | Voir § 3.1 | Colis e-commerce et transferts |
| Douchette(s) / PDA | 2D USB ou PDA Wi-Fi | Réception, picking, inventaire |
| Scanner A4 (option) | Recto, 300 dpi, USB | Factures fournisseurs, pièces à classer |

---

## 5. Café-Market (si caisse restauration / épicerie)

Même kit que la boutique (§ 1), plus :

| Équipement | Caractéristiques | Rôle |
|---|---|---|
| 2e imprimante ticket 80 mm | ESC/POS, USB ou Ethernet, même caractéristique que § 1.2 | Ticket cuisine / bar si préparation déportée |
| Douchette 2D | Identique § 1.3 | Articles emballés (boissons, épicerie) |

---

## 6. Quantités indicatives (10 boutiques + Café-Market + hub)

| Poste | Quantité |
|---|---|
| Kit caisse (PC + ticket 80 mm + douchette + tiroir + onduleur) | 1 par caisse ouverte (**11** si une caisse par site) |
| Imprimante étiquettes code-barres | 1 au hub + 1 dans les boutiques à fort étiquetage |
| Imprimante étiquettes livraison 100×150 | **1 au hub** (+ 1 si une boutique expédie) |
| Douchette / PDA inventaire extra | 1–2 au hub, 1 par zone si inventaires fréquents |
| PC Direction / DAF / Contrôle | 1 chacun (souvent déjà en place) |
| Imprimante A4 | 1 au siège / DAF |

---

## 7. Consommables à prévoir en stock

| Consommable | Caractéristique | Où |
|---|---|---|
| Bobines ticket | Thermique 80 mm × 80 m | Chaque caisse |
| Étiquettes rayon | 50 × 30 mm (ou 40 × 25), transfert | Hub + boutiques qui étiquettent |
| Ruban transfert | Cire ou cire/résine, largeur selon imprimante | Avec l’imprimante étiquettes produit |
| Étiquettes colis | 100 × 150 mm (ou 100 × 100) | Hub / expédition |
| Pochettes colis | Plastique adhésive, format A6 / A5 | Expédition |

---

## 8. Ce qu’il ne faut pas acheter

- Caisse enregistreuse « fermée » (firmware Sharp / Panasonic, etc.) — le logiciel est **web**
- Imprimante ticket **58 mm** comme seul format
- Lecteur **1D uniquement** si les QR (suivi commande, avis) doivent être lus
- Imprimante A4 pour les tickets de caisse (lent, coûteux, inadapté)

---

## 9. Ordre d’équipement (mise en service)

1. **Kit caisse** — PC + ticket 80 mm + douchette + tiroir + Internet + onduleur → encaissement possible  
2. **Imprimante étiquettes code-barres** + consommables → le scan en caisse devient fluide  
3. **Imprimante étiquettes livraison** au hub → commandes web et colis  
4. PDA inventaire et 2e kit si double caisse  

---

## 10. Récapitulatif par type d’imprimante

| Imprimante | Format | Technologie | Où | Ce qu’elle imprime |
|---|---|---|---|---|
| Ticket / reçu de caisse | 80 mm (bobine continue) | Thermique directe | Chaque caisse | Reçu client |
| Étiquettes code-barres | 40×25 à 70×40 mm | Transfert (recommandé) | Hub + boutiques concernées | Prix, SKU, EAN |
| Étiquettes livraison | 100×150 mm (ou 100×100) | Thermique directe | Hub / expédition | Adresse, suivi, n° commande |
| Bureau A4 | A4 | Laser / jet d’encre | Siège, DAF | Factures, bordereaux, états |

---

*Référence projet : progiciel Caisses & CRM — Marché des Accessoires / MAJOR AUTO PARTS. Les modèles cités sont des références de compatibilité (ESC/POS, HID USB, ZPL/TSPL), pas une obligation d’achat d’une marque.*
