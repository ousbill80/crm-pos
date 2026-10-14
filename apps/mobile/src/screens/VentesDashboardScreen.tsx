import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ApiError } from '../api';
import { getDashboard, getVentesQuotidiennes } from '../api/reporting';
import { getClassementProduits } from '../api/produits';
import { formatFcfa } from '../circuit/actions';
import { Banner, Money, ScreenHeader, StatusPill } from '../components/ScreenChrome';
import { SessionBanner } from '../components/SessionBanner';
import type {
  ClassementProduitsDto,
  ReportingDashboardDto,
  VenteQuotidienneDto,
} from '../navigation/types';
import { colors, ui } from '../ui';

const JOURS_TENDANCE = 14;

function labelJour(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
}

export function VentesDashboardScreen() {
  const [dashboard, setDashboard] = useState<ReportingDashboardDto | null>(null);
  const [tendance, setTendance] = useState<VenteQuotidienneDto[]>([]);
  const [classement, setClassement] = useState<ClassementProduitsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setError(null);
    const [dash, jours, top] = await Promise.all([
      getDashboard(),
      getVentesQuotidiennes(JOURS_TENDANCE),
      getClassementProduits(),
    ]);
    setDashboard(dash);
    setTendance(jours);
    setClassement(top);
    setLoading(false);
  }, []);

  useEffect(() => {
    void charger().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Ventes inaccessibles.');
      setLoading(false);
    });
  }, [charger]);

  const nombreVentes = tendance.reduce((acc, j) => acc + j.nombre, 0);
  const totalTendance = tendance.reduce((acc, j) => acc + Number(j.total), 0);
  const panierMoyen = nombreVentes > 0 ? totalTendance / nombreVentes : 0;
  const maxJour = Math.max(1, ...tendance.map((j) => Number(j.total)));
  const topBoutiques = dashboard
    ? [...dashboard.chiffreAffaires.parBoutique]
        .sort((a, b) => Number(b.montant) - Number(a.montant))
        .slice(0, 5)
    : [];

  if (loading) {
    return (
      <View style={ui.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={ui.wrap}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            setLoading(true);
            void charger();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <SessionBanner />
      <ScreenHeader
        title="Ventes"
        subtitle="Réseau entier — consultation (§6.3.4), aucune saisie."
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <View style={[ui.card, { gap: 4 }]}>
        <Text style={ui.sectionLabel}>Chiffre d'affaires — période</Text>
        <Text style={ui.kpiLg}>
          {formatFcfa(dashboard?.chiffreAffaires.total ?? 0)}
        </Text>
        <View style={[ui.row, { marginTop: 6 }]}>
          <View style={{ gap: 2 }}>
            <Text style={ui.muted}>Ventes ({JOURS_TENDANCE} j)</Text>
            <Text style={{ fontWeight: '800', color: colors.text }}>
              {nombreVentes}
            </Text>
          </View>
          <View style={{ gap: 2, alignItems: 'flex-end' }}>
            <Text style={ui.muted}>Panier moyen</Text>
            <Text style={{ fontWeight: '800', color: colors.text }}>
              {formatFcfa(panierMoyen)}
            </Text>
          </View>
        </View>
      </View>

      {dashboard && dashboard.versements.enRetard24h > 0 ? (
        <Banner tone="warning">
          {dashboard.versements.enRetard24h} versement(s) en retard &gt; 24 h
        </Banner>
      ) : null}
      {dashboard && dashboard.ecarts.nombreLitiges > 0 ? (
        <Banner tone="danger">
          {dashboard.ecarts.nombreLitiges} litige(s) ouvert(s) ·{' '}
          {formatFcfa(dashboard.ecarts.montantEcartsAbsolus)} d'écart cumulé
        </Banner>
      ) : null}

      <View style={[ui.card, { gap: 10 }]}>
        <Text style={ui.sectionLabel}>Tendance {JOURS_TENDANCE} jours</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 4,
            height: 90,
          }}
        >
          {tendance.map((j) => {
            const h = Math.max(4, (Number(j.total) / maxJour) * 82);
            return (
              <View key={j.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: '100%',
                    height: h,
                    borderRadius: 4,
                    backgroundColor:
                      Number(j.total) > 0 ? colors.accent : colors.surfaceMuted,
                  }}
                />
                <Text style={{ fontSize: 9, color: colors.muted }}>
                  {labelJour(j.date)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.sectionLabel}>Top boutiques</Text>
        {topBoutiques.length === 0 ? (
          <Banner tone="info">Aucune vente sur la période.</Banner>
        ) : (
          topBoutiques.map((b, i) => (
            <View key={b.boutiqueId} style={[ui.card, ui.row]}>
              <StatusPill label={`#${i + 1}`} tone={i === 0 ? 'ok' : 'neutral'} />
              <Text
                style={{ flex: 1, fontWeight: '700', color: colors.text }}
                numberOfLines={1}
              >
                {b.nomBoutique}
              </Text>
              <Money value={formatFcfa(b.montant)} size="sm" />
            </View>
          ))
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={ui.sectionLabel}>
          Top produits vendus{classement ? ` (${classement.fenetreJours} j)` : ''}
        </Text>
        {!classement || classement.meilleuresVentes.length === 0 ? (
          <Banner tone="info">Aucune vente de produit sur la période.</Banner>
        ) : (
          classement.meilleuresVentes.map((v, i) => (
            <View key={v.produit.id} style={[ui.card, ui.row]}>
              <StatusPill label={`#${i + 1}`} tone={i === 0 ? 'ok' : 'neutral'} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ fontWeight: '700', color: colors.text }}
                  numberOfLines={1}
                >
                  {v.produit.designation}
                </Text>
                <Text style={ui.muted} numberOfLines={1}>
                  {v.quantiteVendue} unité(s)
                  {v.produit.categorie ? ` · ${v.produit.categorie}` : ''}
                </Text>
              </View>
              <Money value={formatFcfa(v.chiffreAffaires)} size="sm" />
            </View>
          ))
        )}
      </View>

      {dashboard && dashboard.chiffreAffaires.parModePaiement.length > 0 ? (
        <View style={{ gap: 8, paddingBottom: 40 }}>
          <Text style={ui.sectionLabel}>Répartition par mode de paiement</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {dashboard.chiffreAffaires.parModePaiement.map((m) => (
              <View key={m.modePaiement} style={[ui.card, { gap: 2 }]}>
                <Text style={ui.muted}>{m.modePaiement}</Text>
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  {formatFcfa(m.montant)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
