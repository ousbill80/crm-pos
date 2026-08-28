export interface TrialBalanceRow {
  numero: string;
  intitule: string;
  debit: string | number;
  credit: string | number;
  solde: string | number;
}

export interface StatementLine {
  numero: string;
  intitule: string;
  debit: string;
  credit: string;
  solde: string;
}

function money(value: number) {
  return value.toFixed(2);
}

export function classeCompte(numero: string): string {
  const digits = numero.replace(/\D/g, '');
  return digits[0] ?? '';
}

export function netSolde(row: TrialBalanceRow) {
  const debit = Number(row.debit);
  const credit = Number(row.credit);
  const solde = Number(row.solde);
  if (Number.isFinite(solde) && solde !== 0) return solde;
  return debit - credit;
}

export function buildSyscohadaStatements(rows: TrialBalanceRow[]) {
  const actif: StatementLine[] = [];
  const passif: StatementLine[] = [];
  const charges: StatementLine[] = [];
  const produits: StatementLine[] = [];
  let totalActif = 0;
  let totalPassif = 0;
  let totalCharges = 0;
  let totalProduits = 0;

  for (const row of rows) {
    const solde = netSolde(row);
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    if (debit === 0 && credit === 0) continue;
    const classe = classeCompte(row.numero);
    const line: StatementLine = {
      numero: row.numero,
      intitule: row.intitule,
      debit: money(debit),
      credit: money(credit),
      solde: money(solde),
    };
    if (classe === '6') {
      charges.push(line);
      totalCharges += solde;
      continue;
    }
    if (classe === '7') {
      produits.push(line);
      totalProduits += solde;
      continue;
    }
    if (
      classe === '2' ||
      classe === '3' ||
      classe === '5' ||
      (classe === '4' && solde > 0)
    ) {
      actif.push(line);
      totalActif += solde;
      continue;
    }
    if (classe === '1' || (classe === '4' && solde <= 0) || classe === '8') {
      passif.push(line);
      totalPassif += -solde;
    }
  }

  const resultat = -(totalProduits + totalCharges);
  // Pendant l’exercice, 6/7 restent au CR : on les reporte au bilan (RN)
  // pour que Actif = Passif. Après clôture, 6/7 sont soldés sur 13.
  if (Math.abs(resultat) >= 0.005) {
    if (resultat >= 0) {
      passif.push({
        numero: 'RN',
        intitule: 'Résultat de la période',
        debit: '0.00',
        credit: money(resultat),
        solde: money(-resultat),
      });
      totalPassif += resultat;
    } else {
      const perte = -resultat;
      actif.push({
        numero: 'RN',
        intitule: 'Résultat de la période (perte)',
        debit: money(perte),
        credit: '0.00',
        solde: money(perte),
      });
      totalActif += perte;
    }
  }
  return {
    bilan: {
      actif,
      passif,
      totalActif: money(totalActif),
      totalPassif: money(totalPassif),
      equilibre: Math.abs(totalActif - totalPassif) < 0.015,
    },
    compteResultat: {
      charges,
      produits,
      totalCharges: money(totalCharges),
      totalProduits: money(totalProduits),
      resultat: money(resultat),
      benefice: resultat >= 0,
    },
  };
}

export function buildVatReturn(rows: TrialBalanceRow[]) {
  let deductible = 0;
  let collected = 0;
  const lignes: StatementLine[] = [];
  for (const row of rows) {
    const numero = row.numero.replace(/\s/g, '');
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    if (debit === 0 && credit === 0) continue;
    if (numero.startsWith('4452')) {
      deductible += debit - credit;
      lignes.push({
        numero: row.numero,
        intitule: row.intitule,
        debit: money(debit),
        credit: money(credit),
        solde: money(debit - credit),
      });
    }
    if (numero.startsWith('4457')) {
      collected += credit - debit;
      lignes.push({
        numero: row.numero,
        intitule: row.intitule,
        debit: money(debit),
        credit: money(credit),
        solde: money(credit - debit),
      });
    }
  }
  const net = collected - deductible;
  return {
    deductible: money(deductible),
    collectee: money(collected),
    netAPayer: money(net),
    creditTva: net < 0,
    lignes,
  };
}
