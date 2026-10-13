import { IsDateString } from 'class-validator';

// Clôture journalière consolidée DAF (§6.3.4) — lecture seule, date obligatoire.
export class ClotureJournaliereQueryDto {
  @IsDateString()
  date!: string;
}
