import { Routes, Route, Navigate } from 'react-router-dom';
import { PwaHost } from './components/PwaHost';
import { AlertesPage } from './routes/AlertesPage';
import { AuditPage } from './routes/AuditPage';
import { ControleCoherencePage } from './routes/ControleCoherencePage';
import { ChangePasswordPage } from './routes/ChangePasswordPage';
import { UtilisateurDetailPage } from './routes/UtilisateurDetailPage';
import { ProfilsPage } from './routes/ProfilsPage';
import { UtilisateursPage } from './routes/UtilisateursPage';
import { CaissesPage } from './routes/CaissesPage';
import { CaisseDetailPage } from './routes/CaisseDetailPage';
import { ClientDetailPage } from './routes/ClientDetailPage';
import { CrmClientsPage } from './routes/CrmClientsPage';
import { CrmCampagnesPage } from './routes/CrmCampagnesPage';
import { CrmFidelitePage } from './routes/CrmFidelitePage';
import { CrmSegmentationPage } from './routes/CrmSegmentationPage';
import { CrmInteractionsPage } from './routes/CrmInteractionsPage';
import { DashboardPage } from './routes/DashboardPage';
import { EntreprisePage } from './routes/EntreprisePage';
import { FournisseursPage } from './routes/FournisseursPage';
import { FournisseurDetailPage } from './routes/FournisseurDetailPage';
import { CommandesAchatsPage } from './routes/CommandesAchatsPage';
import { CommandeAchatDetailPage } from './routes/CommandeAchatDetailPage';
import { FacturesFournisseurPage } from './routes/FacturesFournisseurPage';
import { FactureFournisseurDetailPage } from './routes/FactureFournisseurDetailPage';
import { FinancePage } from './routes/FinancePage';
import { LitigesPage } from './routes/LitigesPage';
import { InventairesPage } from './routes/InventairesPage';
import { InventaireDetailPage } from './routes/InventaireDetailPage';
import { OperationsStockPage } from './routes/OperationsStockPage';
import { BonStockDetailPage } from './routes/BonStockDetailPage';
import { ManuelCaissePage } from './routes/ManuelCaissePage';
import { LoginPage } from './routes/LoginPage';
import { PosPage } from './routes/PosPage';
import { ProduitsPage } from './routes/ProduitsPage';
import { ProduitDetailPage } from './routes/ProduitDetailPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { StocksPage } from './routes/StocksPage';
import { EntrepotDetailPage } from './routes/EntrepotDetailPage';
import { MouvementStockDetailPage } from './routes/MouvementStockDetailPage';
import { TransactionsPage } from './routes/TransactionsPage';
import { TransactionDetailPage } from './routes/TransactionDetailPage';
import { TresoreriePage } from './routes/TresoreriePage';
import { VentesPage } from './routes/VentesPage';
import { VentesTicketsPage } from './routes/VentesTicketsPage';
import { VentesReportingPage } from './routes/VentesReportingPage';
import { DevisPage } from './routes/DevisPage';
import { DevisDetailPage } from './routes/DevisDetailPage';
import { FacturesClientPage } from './routes/FacturesClientPage';
import { FactureClientDetailPage } from './routes/FactureClientDetailPage';
import CommandesWebPage from './routes/CommandesWebPage';
import CommandeWebDetailPage from './routes/CommandeWebDetailPage';
import PosCommandeWebScanPage from './routes/PosCommandeWebScanPage';
import ParametresShopPage from './routes/ParametresShopPage';
import ZonesLivraisonPage from './routes/ZonesLivraisonPage';
import { CrmPilotagePage } from './routes/CrmPilotagePage';
import { CrmCroissancePage } from './routes/CrmCroissancePage';
import { CrmParametresPage } from './routes/CrmParametresPage';
import { BordereauxPage, ReceptionCentralePage } from './routes/TresorerieFilesPage';
import { P2pPlanningPage } from './routes/P2pPlanningPage';
import { P2pReceiptsPage } from './routes/P2pReceiptsPage';
import { P2pReceiptDetailPage } from './routes/P2pReceiptDetailPage';
import { P2pAccountingPage } from './routes/P2pAccountingPage';
import { AccountingAiPage } from './routes/AccountingAiPage';
import './App.css';
import './pos-screen.css';

function App() {
  return (
    <>
      <PwaHost />
      <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/alertes" element={<AlertesPage />} />
        <Route path="/tresorerie" element={<TresoreriePage />} />
        <Route path="/tresorerie/bordereaux" element={<BordereauxPage />} />
        <Route path="/tresorerie/reception" element={<ReceptionCentralePage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/ventes" element={<VentesPage />} />
        <Route path="/ventes/tickets" element={<VentesTicketsPage />} />
        <Route path="/ventes/reporting" element={<VentesReportingPage />} />
        <Route path="/ventes/devis" element={<DevisPage />} />
        <Route path="/ventes/devis/:devisId" element={<DevisDetailPage />} />
        <Route path="/ventes/factures" element={<FacturesClientPage />} />
        <Route path="/ventes/factures/:factureId" element={<FactureClientDetailPage />} />
        <Route path="/ventes/commandes-web" element={<CommandesWebPage />} />
        <Route
          path="/ventes/commandes-web/:commandeId"
          element={<CommandeWebDetailPage />}
        />
        <Route
          path="/ventes/commandes-web-scan"
          element={<PosCommandeWebScanPage />}
        />
        <Route path="/ventes/parametres-shop" element={<ParametresShopPage />} />
        <Route path="/ventes/zones-livraison" element={<ZonesLivraisonPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/transactions/:transactionId" element={<TransactionDetailPage />} />
        <Route path="/caisses" element={<CaissesPage />} />
        <Route path="/caisses/:caisseId" element={<CaisseDetailPage />} />
        <Route path="/litiges" element={<LitigesPage />} />
        <Route path="/clients" element={<CrmClientsPage />} />
        <Route path="/clients/pilotage" element={<CrmPilotagePage />} />
        <Route path="/clients/croissance" element={<CrmCroissancePage />} />
        <Route path="/clients/parametres" element={<CrmParametresPage />} />
        <Route path="/clients/fidelite" element={<CrmFidelitePage />} />
        <Route path="/clients/segmentation" element={<CrmSegmentationPage />} />
        <Route path="/clients/interactions" element={<CrmInteractionsPage />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="/campagnes" element={<CrmCampagnesPage />} />
        <Route path="/produits" element={<ProduitsPage />} />
        <Route path="/produits/:produitId" element={<ProduitDetailPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/stocks/operations" element={<OperationsStockPage />} />
        <Route path="/stocks/operations/:bonId" element={<BonStockDetailPage />} />
        <Route path="/stocks/emplacements" element={<OperationsStockPage />} />
        <Route path="/stocks/reappro" element={<OperationsStockPage />} />
        <Route path="/stocks/entrepots/:entrepotId" element={<EntrepotDetailPage />} />
        <Route path="/stocks/mouvements/:mouvementId" element={<MouvementStockDetailPage />} />
        <Route path="/inventaires" element={<InventairesPage />} />
        <Route path="/inventaires/:sessionId" element={<InventaireDetailPage />} />
        <Route path="/fournisseurs" element={<FournisseursPage />} />
        <Route path="/fournisseurs/:fournisseurId" element={<FournisseurDetailPage />} />
        <Route path="/achats/commandes" element={<CommandesAchatsPage />} />
        <Route path="/achats/commandes/:commandeId" element={<CommandeAchatDetailPage />} />
        <Route path="/achats/planning" element={<P2pPlanningPage />} />
        <Route path="/achats/consultations" element={<P2pPlanningPage />} />
        <Route path="/achats/receptions" element={<P2pReceiptsPage />} />
        <Route path="/achats/receptions/:receptionId" element={<P2pReceiptDetailPage />} />
        <Route path="/achats/factures" element={<FacturesFournisseurPage />} />
        <Route path="/achats/factures/:factureId" element={<FactureFournisseurDetailPage />} />
        <Route path="/finance/comptabilite" element={<P2pAccountingPage />} />
        <Route path="/finance/accounting-ai" element={<AccountingAiPage />} />
        <Route path="/entreprise" element={<EntreprisePage />} />
        <Route path="/utilisateurs" element={<UtilisateursPage />} />
        <Route path="/utilisateurs/:userId" element={<UtilisateurDetailPage />} />
        <Route path="/profils" element={<ProfilsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/audit/controle-coherence" element={<ControleCoherencePage />} />
        <Route path="/changer-mot-de-passe" element={<ChangePasswordPage />} />
        <Route path="/manuel-caisse" element={<ManuelCaissePage />} />
        <Route path="/pos" element={<PosPage />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
