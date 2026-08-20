import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage } from './routes/DashboardPage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  );
}

export default App;
