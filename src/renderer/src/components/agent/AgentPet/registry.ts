import type { ComponentType } from 'react'
import type { ThemeId } from '../../../themes/themes'
import type { PetSkinProps } from './types'
import {
  BrutalistPet,
  EinkPet,
  MatrixPet,
  MidnightPet,
  NordPet,
  SolarizedPet,
  SynthwavePet,
  TerminalPet
} from './skins'

export const PET_SKINS: Record<ThemeId, ComponentType<PetSkinProps>> = {
  eink: EinkPet,
  midnight: MidnightPet,
  terminal: TerminalPet,
  matrix: MatrixPet,
  nord: NordPet,
  solarized: SolarizedPet,
  synthwave: SynthwavePet,
  brutalist: BrutalistPet
}
