import { Routes, Route, Navigate } from 'react-router-dom';
import { CaissesPage } from './routes/CaissesPage';
import { DashboardPage } from './routes/DashboardPage';
import { LoginPage } from './routes/LoginPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { TransactionsPage } from './routes/TransactionsPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/caisses" element={<CaissesPage />} />
      </Route>
    </Routes>
  );
}

export default App;
