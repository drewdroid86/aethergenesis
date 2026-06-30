import { StellarState } from './StellarPhysics';

export interface HabitabilityState {
  planet_id: string;
  compositeScore: number;
  orbitalScore: number;
  thermalScore: number;
  atmosphereScore: number;
  stellarActivityScore: number;
  ageScore: number;
  
  isInHabitableZone: boolean;
  surfaceTemperature_K: number;
  extinctionRiskLevel: string; // 'none', 'snowball', 'greenhouse', 'atmosphere_loss', 'sterilized'
  climateState: 'snowball' | 'moist_greenhouse' | 'habitable' | 'barren';
  
  triggered_at_yr: number | null;
  biomass: number; // 0.0 to 1.0
  civilizationTier: number; // 0: None, 1: Planetary, 2: Stellar (Dyson), 3: Galactic
}

const CONSTANTS = {
  // Physical constants
  G: 6.67430e-11, // m^3 kg^-1 s^-2
  k_B: 1.380649e-23, // J/K
  m_H2O: 2.99e-26, // kg
  M_sun: 1.989e30, // kg
  L_sun: 3.828e26, // W
  AU: 1.496e11, // m
  sigma: 5.670374419e-8, // W m^-2 K^-4
};

export class AstrobiologyEngine {
  private history: Map<string, { timeInHz_yr: number; highestScore: number; civEmergenceTime: number }> = new Map();

  public evaluatePlanet(
    planet_id: string,
    semiMajorAxis_au: number,
    planetMass_kg: number,
    planetRadius_m: number,
    planetAlbedo: number,
    stellarState: StellarState,
    delta_yr: number
  ): HabitabilityState {
    
    const L_star = Math.max(0.0001, stellarState.luminosity_solar);
    
    // 1. Orbital Score (Kopparapu et al. simplified HZ)
    const S_eff = L_star / (semiMajorAxis_au * semiMajorAxis_au);
    
    // Approximate boundaries for HZ
    const S_inner = 1.1; // Runaway greenhouse limit
    const S_outer = 0.53; // Maximum greenhouse limit
    
    const isInHabitableZone = S_eff < S_inner && S_eff > S_outer;
    const orbitalScore = isInHabitableZone ? 1.0 : Math.max(0, 1.0 - Math.min(Math.abs(S_eff - 1.0), 1.0));

    // 2. Thermal Score
    // T_eq = 278.5 * (L_star / d^2)^0.25 * (1 - albedo)^0.25
    // BOLT: Combine terms and replace Math.pow(x, 0.25) with Math.sqrt(Math.sqrt(x)) for performance
    const T_surface = 278.5 * Math.sqrt(Math.sqrt(S_eff * (1 - planetAlbedo)));
    // Add greenhouse effect roughly (+33K like Earth)
    const T_actual = T_surface + (planetMass_kg > 1e23 ? 33 : 0);
    
    const thermalScore = (T_actual >= 273 && T_actual <= 373)
      ? 1.0
      : Math.max(0, 1.0 - Math.min(Math.abs(T_actual - 273), Math.abs(T_actual - 373)) / 50.0);

    // 3. Atmosphere Score
    const v_esc = Math.sqrt((2 * CONSTANTS.G * planetMass_kg) / planetRadius_m);
    const v_thermal = Math.sqrt((3 * CONSTANTS.k_B * T_actual) / CONSTANTS.m_H2O);
    const atmosphereScore = v_esc > 6 * v_thermal ? 1.0 : Math.max(0, (v_esc / v_thermal) / 6.0);
    
    // 4. Stellar Activity Score
    let stellarActivityScore = 1.0;
    if (stellarState.phase === 'supernova' || stellarState.phase === 'remnant') {
      stellarActivityScore = 0.0;
    } else if (stellarState.spectralClass === 'O' || stellarState.spectralClass === 'B') {
      stellarActivityScore = 0.2; // Massive UV
    }
    
    // 5. Age Score
    const ageScore = stellarState.age_yr > 1e9 ? 1.0 : stellarState.age_yr / 1e9;
    
    const compositeScore = orbitalScore * thermalScore * atmosphereScore * stellarActivityScore * ageScore;

    // History tracking
    const record = this.history.get(planet_id) || { timeInHz_yr: 0, highestScore: 0, civEmergenceTime: 0 };
    if (compositeScore > 0.65) {
      record.timeInHz_yr += delta_yr;
    } else {
      record.timeInHz_yr = 0;
      record.civEmergenceTime = 0;
    }
    if (compositeScore > record.highestScore) record.highestScore = compositeScore;
    this.history.set(planet_id, record);

    // Event Thresholds
    let climateState: 'snowball' | 'moist_greenhouse' | 'habitable' | 'barren' = 'habitable';
    let extinctionRiskLevel = 'none';
    
    if (stellarState.phase === 'supernova') {
      extinctionRiskLevel = 'sterilized';
      climateState = 'barren';
    } else if (v_esc < 6 * v_thermal) {
      extinctionRiskLevel = 'atmosphere_loss';
      climateState = 'barren';
    } else if (T_actual < 233) {
      extinctionRiskLevel = 'snowball';
      climateState = 'snowball';
    } else if (T_actual > 340) {
      extinctionRiskLevel = 'greenhouse';
      climateState = 'moist_greenhouse';
    }
    
    // Life Emergence
    let biomass = 0;
    if (record.timeInHz_yr > 500e6 && compositeScore > 0.65) {
      biomass = Math.min(1.0, (record.timeInHz_yr - 500e6) / 1e9); 
    }
    
    // Civilization Emergence
    let civilizationTier = 0;
    if (biomass >= 1.0) {
      if (record.civEmergenceTime === 0) {
         record.civEmergenceTime = record.timeInHz_yr;
      }
      
      const timeSinceEmergence = record.timeInHz_yr - record.civEmergenceTime;
      
      if (timeSinceEmergence > 200e6) {
          civilizationTier = 3; // Galactic
      } else if (timeSinceEmergence > 100e6) {
          civilizationTier = 2; // Stellar (Dyson Swarm)
      } else if (timeSinceEmergence > 20e6) {
          civilizationTier = 1; // Planetary (City Lights)
      }
    } else {
       record.civEmergenceTime = 0;
    }

    return {
      planet_id,
      compositeScore,
      orbitalScore,
      thermalScore,
      atmosphereScore,
      stellarActivityScore,
      ageScore,
      isInHabitableZone,
      surfaceTemperature_K: T_actual,
      extinctionRiskLevel,
      climateState,
      triggered_at_yr: extinctionRiskLevel !== 'none' ? stellarState.age_yr : null,
      biomass,
      civilizationTier
    };
  }
}
