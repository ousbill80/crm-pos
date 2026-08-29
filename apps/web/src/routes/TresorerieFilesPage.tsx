import { TransactionsPage } from './TransactionsPage';
import { StatutTransaction, TypeTransaction } from '@caisse-crm/shared';

export function BordereauxPage() {
  return (
    <TransactionsPage
      titre="Bordereaux"
      typeDefaut={TypeTransaction.SORTIE_FONDS}
    />
  );
}

export function ReceptionCentralePage() {
  return (
    <TransactionsPage
      titre="Réception DAF / Caissier central"
      typeDefaut={TypeTransaction.SORTIE_FONDS}
      statutDefaut={StatutTransaction.EN_TRANSIT}
    />
  );
}
