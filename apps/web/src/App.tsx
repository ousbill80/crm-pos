import { Routes, Route, Navigate } from 'react-router-dom';
import { AlertesPage } from './routes/AlertesPage';
import { AuditPage } from './routes/AuditPage';
import { ChangePasswordPage } from './routes/ChangePasswordPage';
import { UtilisateurDetailPage } from './routes/UtilisateurDetailPage';
import { ProfilsPage } from './routes/ProfilsPage';
import { UtilisateursPage } from './routes/UtilisateursPage';
import { CaissesPage } from './routes/CaissesPage';
import { CaisseDetailPage } from './routes/CaisseDetailPage';
import { ClientDetailPage } from './routes/ClientDetailPage';
import { CrmClientsPage } from './routes/CrmClientsPage';
import { CrmCampagnesPage } from './routes/CrmCampagnesPage';
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
import './App.css';
import './pos-screen.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/alertes" element={<AlertesPage />} />
        <Route path="/tresorerie" element={<TresoreriePage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/ventes" element={<VentesPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/transactions/:transactionId" element={<TransactionDetailPage />} />
        <Route path="/caisses" element={<CaissesPage />} />
        <Route path="/caisses/:caisseId" element={<CaisseDetailPage />} />
        <Route path="/litiges" element={<LitigesPage />} />
        <Route path="/clients" element={<CrmClientsPage />} />
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
        <Route path="/achats/factures" element={<FacturesFournisseurPage />} />
        <Route path="/achats/factures/:factureId" element={<FactureFournisseurDetailPage />} />
        <Route path="/entreprise" element={<EntreprisePage />} />
        <Route path="/utilisateurs" element={<UtilisateursPage />} />
        <Route path="/utilisateurs/:userId" element={<UtilisateurDetailPage />} />
        <Route path="/profils" element={<ProfilsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/changer-mot-de-passe" element={<ChangePasswordPage />} />
        <Route path="/pos" element={<PosPage />} />
      </Route>
    </Routes>
  );
}

export default App;
