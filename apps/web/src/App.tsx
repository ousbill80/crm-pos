import { Routes, Route, Navigate } from 'react-router-dom';
import { AlertesPage } from './routes/AlertesPage';
import { CaissesPage } from './routes/CaissesPage';
import { ClientDetailPage } from './routes/ClientDetailPage';
import { CrmClientsPage } from './routes/CrmClientsPage';
import { DashboardPage } from './routes/DashboardPage';
import { EntreprisePage } from './routes/EntreprisePage';
import { FournisseursPage } from './routes/FournisseursPage';
import { CommandesAchatsPage } from './routes/CommandesAchatsPage';
import { FacturesFournisseurPage } from './routes/FacturesFournisseurPage';
import { LitigesPage } from './routes/LitigesPage';
import { InventairesPage } from './routes/InventairesPage';
import { InventaireDetailPage } from './routes/InventaireDetailPage';
import { OperationsStockPage } from './routes/OperationsStockPage';
import { LoginPage } from './routes/LoginPage';
import { PosPage } from './routes/PosPage';
import { ProduitsPage } from './routes/ProduitsPage';
import { ProduitDetailPage } from './routes/ProduitDetailPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { StocksPage } from './routes/StocksPage';
import { EntrepotDetailPage } from './routes/EntrepotDetailPage';
import { MouvementStockDetailPage } from './routes/MouvementStockDetailPage';
import { TransactionsPage } from './routes/TransactionsPage';
import { TresoreriePage } from './routes/TresoreriePage';
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
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/caisses" element={<CaissesPage />} />
        <Route path="/litiges" element={<LitigesPage />} />
        <Route path="/clients" element={<CrmClientsPage />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="/produits" element={<ProduitsPage />} />
        <Route path="/produits/:produitId" element={<ProduitDetailPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/stocks/operations" element={<OperationsStockPage />} />
        <Route path="/stocks/emplacements" element={<OperationsStockPage />} />
        <Route path="/stocks/reappro" element={<OperationsStockPage />} />
        <Route path="/stocks/entrepots/:entrepotId" element={<EntrepotDetailPage />} />
        <Route path="/stocks/mouvements/:mouvementId" element={<MouvementStockDetailPage />} />
        <Route path="/inventaires" element={<InventairesPage />} />
        <Route path="/inventaires/:sessionId" element={<InventaireDetailPage />} />
        <Route path="/fournisseurs" element={<FournisseursPage />} />
        <Route path="/achats/commandes" element={<CommandesAchatsPage />} />
        <Route path="/achats/factures" element={<FacturesFournisseurPage />} />
        <Route path="/entreprise" element={<EntreprisePage />} />
        <Route path="/pos" element={<PosPage />} />
      </Route>
    </Routes>
  );
}

export default App;
