import { Routes, Route, Navigate } from 'react-router-dom';
import { AlertesPage } from './routes/AlertesPage';
import { CaissesPage } from './routes/CaissesPage';
import { CrmClientsPage } from './routes/CrmClientsPage';
import { DashboardPage } from './routes/DashboardPage';
import { EntreprisePage } from './routes/EntreprisePage';
import { FournisseursPage } from './routes/FournisseursPage';
import { LitigesPage } from './routes/LitigesPage';
import { LoginPage } from './routes/LoginPage';
import { PosPage } from './routes/PosPage';
import { ProduitsPage } from './routes/ProduitsPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { StocksPage } from './routes/StocksPage';
import { TransactionsPage } from './routes/TransactionsPage';
import { TresoreriePage } from './routes/TresoreriePage';
import './App.css';

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
        <Route path="/produits" element={<ProduitsPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/fournisseurs" element={<FournisseursPage />} />
        <Route path="/entreprise" element={<EntreprisePage />} />
        <Route path="/pos" element={<PosPage />} />
      </Route>
    </Routes>
  );
}

export default App;
