import type { CSSProperties } from 'react';
import {
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Phone,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CanalInteraction } from '@caisse-crm/shared';
import { CRM_KPI } from './crm-kpi-accents';

export const LIBELLE_CANAL: Record<CanalInteraction, string> = {
  [CanalInteraction.APPEL]: 'Appel',
  [CanalInteraction.SMS]: 'SMS',
  [CanalInteraction.WHATSAPP]: 'WhatsApp',
  [CanalInteraction.VISITE]: 'Visite',
  [CanalInteraction.CAMPAGNE]: 'Campagne',
  [CanalInteraction.EMAIL]: 'E-mail',
};

export const CANAL_META: Record<
  CanalInteraction,
  { icon: LucideIcon; accent: string; hint: string }
> = {
  [CanalInteraction.APPEL]: {
    icon: Phone,
    accent: CRM_KPI.appel,
    hint: 'Appels téléphoniques',
  },
  [CanalInteraction.SMS]: {
    icon: MessageSquare,
    accent: CRM_KPI.sms,
    hint: 'Messages SMS',
  },
  [CanalInteraction.WHATSAPP]: {
    icon: MessageCircle,
    accent: CRM_KPI.whatsapp,
    hint: 'Conversations WhatsApp',
  },
  [CanalInteraction.VISITE]: {
    icon: UserRound,
    accent: CRM_KPI.visite,
    hint: 'Visites en boutique',
  },
  [CanalInteraction.CAMPAGNE]: {
    icon: Megaphone,
    accent: CRM_KPI.campagneCanal,
    hint: 'Relances campagne',
  },
  [CanalInteraction.EMAIL]: {
    icon: Mail,
    accent: CRM_KPI.email,
    hint: 'Courriels',
  },
};

export function badgeCanal(canal: CanalInteraction) {
  const meta = CANAL_META[canal];
  return (
    <span
      className="crm-interaction-canal-badge"
      style={{ '--canal-accent': meta.accent } as CSSProperties}
    >
      {LIBELLE_CANAL[canal]}
    </span>
  );
}

export function statsParCanal(
  items: Array<{ canal: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ix of items) {
    counts[ix.canal] = (counts[ix.canal] ?? 0) + 1;
  }
  return counts;
}
