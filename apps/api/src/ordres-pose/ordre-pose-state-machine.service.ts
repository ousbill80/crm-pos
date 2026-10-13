import { BadRequestException, Injectable } from '@nestjs/common';
import { StatutOrdrePose, TRANSITIONS_ORDRE_POSE } from '@caisse-crm/shared';

// Objet de domaine unique portant la machine à états de l'OrdreDePose
// (extension validée par l'utilisateur, hors MCD §6.5 d'origine — même
// statut que l'extension "Achats" déjà documentée dans
// packages/shared/src/enums.ts) :
//
//   EN_ATTENTE -> EN_COURS -> TERMINEE
//                          -> ANNULEE
//
// Même pattern que TransactionStateMachineService (§6.4) : toute action
// d'OrdresPoseService qui fait évoluer le statut d'un OrdreDePose DOIT
// passer par ce service — aucune logique de transition ne doit être
// dupliquée ailleurs. Toute transition non prévue lève une exception
// explicite et typée.
@Injectable()
export class OrdrePoseStateMachineService {
  assertTransitionAutorisee(
    depuis: StatutOrdrePose,
    vers: StatutOrdrePose,
  ): void {
    const transitionsPermises = TRANSITIONS_ORDRE_POSE[depuis] ?? [];

    if (!transitionsPermises.includes(vers)) {
      throw new BadRequestException(
        `Transition "${depuis}" -> "${vers}" non autorisée pour un OrdreDePose.`,
      );
    }
  }

  transitionsPermises(depuis: StatutOrdrePose): StatutOrdrePose[] {
    return TRANSITIONS_ORDRE_POSE[depuis] ?? [];
  }
}
