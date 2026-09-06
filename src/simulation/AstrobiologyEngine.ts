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
  hasLiquidWater: boolean;
  surfaceTemperature_K: number;
  extinctionRiskLevel: string; // 'none', 'snowball', 'greenhouse', 'atmosphere_loss', 'sterilized'
  climateState: 'snowball' | 'moist_greenhouse' | 'habitable' | 'barren';
  
  triggered_at_yr: number | null;
  biomass: number; // 0.0 to 1.0
  civilizationTier: number; // 0: None, 1: Planetary, 2: Stellar (Dyson), 3: Galactic
}

// All tunables in one place — easier to balance and to expose in the Physics panel
export const HABITABILITY_CONFIG = {
  hz: { innerFlux: 1.1, outerFlux: 0.53 },
  water: { minK: 273, maxK: 373, falloffK: 50 },
  climate: {
    snowballEnterK: 233, snowballExitK: 245,     // hysteresis pair
    greenhouseEnterK: 340, greenhouseExitK: 328,
  },
  atmosphere: { jeansFactor: 6 },                // v_esc > 6 * v_thermal keeps H2O for Gyr
  life: { minScore: 0.5, sustainScore: 0.65, delayYr: 500e6, matureYr: 1e9 },
  civ: { planetaryYr: 20e6, stellarYr: 100e6, galacticYr: 200e6 },
  weights: { orbital: 1.0, thermal: 1.5, atmosphere: 1.0, stellar: 1.0, age: 0.5 },
  greenhouseByType: {
    lava: 150, ocean: 40, jungle: 35, gas_giant: 75, ice: 15, desert: 20, rocky: 25,
  } as Record<string, number>,
} as const;

const C = {
  TWO_G: 2 * 6.67430e-11,
  THREE_KB_OVER_MH2O: (3 * 1.380649e-23) / 2.99e-26,
};

interface PlanetRecord {
  timeInHz_yr: number;
  highestScore: number;
  civEmergenceTime: number;
  prevClimate: HabitabilityState['climateState'];
}

export class AstrobiologyEngine {
  private history = new Map<string, PlanetRecord>();

  /** Build the canonical key so clearHistory() prefix matching actually works. */
  public static key(starId: string, planetId: string) {
    return `${starId}:${planetId}`;
  }

  public clearHistory(starPhysicsId?: string): void {
    if (!starPhysicsId) {
      this.history.clear();
      return;
    }
    const prefix = `${starPhysicsId}:`;
    for (const k of this.history.keys()) {
      if (k.startsWith(prefix)) this.history.delete(k);
    }
  }

  public evaluatePlanet(
    planet_id: string,
    semiMajorAxis_au: number,
    planetMass_kg: number,
    planetRadius_m: number,
    planetAlbedo: number,
    stellarState: StellarState,
    delta_yr: number,
    bodyType: string = 'rocky',
  ): HabitabilityState {
    const cfg = HABITABILITY_CONFIG;
    const L_star = Math.max(1e-4, stellarState.luminosity_solar);
    const a = Math.max(1e-3, semiMajorAxis_au);

    // 1. Orbital — smooth falloff outside HZ instead of a kink at S_eff = 1
    const S_eff = L_star / (a * a);
    const isInHabitableZone = S_eff < cfg.hz.innerFlux && S_eff > cfg.hz.outerFlux;
    const orbitalScore = isInHabitableZone
      ? 1.0
      : S_eff >= cfg.hz.innerFlux
      ? Math.exp(-(S_eff - cfg.hz.innerFlux) * 2.0)
      : Math.exp(-(cfg.hz.outerFlux - S_eff) * 6.0);

    // 2. Thermal
    const T_eq = 278.5 * Math.sqrt(Math.sqrt(S_eff * (1 - planetAlbedo)));
    const greenhouse = planetMass_kg > 1e23 ? (cfg.greenhouseByType[bodyType] ?? cfg.greenhouseByType.rocky) : 0;
    const T_actual = T_eq + greenhouse;
    const { minK, maxK, falloffK } = cfg.water;
    const thermalScore = T_actual >= minK && T_actual <= maxK
      ? 1.0
      : Math.max(0, 1 - Math.min(Math.abs(T_actual - minK), Math.abs(T_actual - maxK)) / falloffK);

    // 3. Atmosphere (Jeans escape, squared to avoid sqrt)
    const v_esc_sq = (C.TWO_G * planetMass_kg) / planetRadius_m;
    const v_th_sq = C.THREE_KB_OVER_MH2O * T_actual;
    const jeans_sq = cfg.atmosphere.jeansFactor ** 2;
    const retainsAtmosphere = v_esc_sq > jeans_sq * v_th_sq;
    const atmosphereScore = retainsAtmosphere ? 1.0 : Math.sqrt(v_esc_sq / v_th_sq) / cfg.atmosphere.jeansFactor;

    // 4. Stellar activity — broader than O/B only
    let stellarActivityScore = 1.0;
    const { phase, spectralClass, age_yr } = stellarState;
    if (phase === 'supernova' || phase === 'remnant') {
      stellarActivityScore = 0.0;
    } else if (phase === 'red_giant' || (phase as string) === 'agb') {
      stellarActivityScore = 0.3; // HZ sweeps outward, stellar winds
    } else if (spectralClass === 'O' || spectralClass === 'B') {
      stellarActivityScore = 0.2;
    } else if (spectralClass === 'A') {
      stellarActivityScore = 0.6;
    } else if (spectralClass === 'M') {
      stellarActivityScore = age_yr < 1e9 ? 0.4 : 0.8; // young M-dwarfs flare hard
    }

    // 5. Age — smooth ramp
    const ageScore = 1 - Math.exp(-age_yr / 7e8);

    // Weighted geometric mean — a single weak factor no longer zeroes everything
    // If sterilized (supernova/remnant) or zero stellar activity, habitability drops to 0.0
    const w = cfg.weights;
    const wSum = w.orbital + w.thermal + w.atmosphere + w.stellar + w.age;
    const eps = 1e-6;
    const compositeScore = stellarActivityScore === 0.0 ? 0.0 : Math.exp((
      w.orbital    * Math.log(orbitalScore + eps) +
      w.thermal    * Math.log(thermalScore + eps) +
      w.atmosphere * Math.log(atmosphereScore + eps) +
      w.stellar    * Math.log(stellarActivityScore + eps) +
      w.age        * Math.log(ageScore + eps)
    ) / wSum);

    // History
    const rec = this.history.get(planet_id) ?? {
      timeInHz_yr: 0,
      highestScore: 0,
      civEmergenceTime: 0,
      prevClimate: 'habitable',
    };
    if (compositeScore > cfg.life.sustainScore) {
      rec.timeInHz_yr += delta_yr;
    } else {
      rec.timeInHz_yr = Math.max(0, rec.timeInHz_yr - delta_yr * 2);
      if (rec.timeInHz_yr < cfg.life.delayYr) rec.civEmergenceTime = 0;
    }
    rec.highestScore = Math.max(rec.highestScore, compositeScore);

    // Climate state with hysteresis
    let climateState = rec.prevClimate;
    let extinctionRiskLevel = 'none';
    const cl = cfg.climate;
    if (phase === 'supernova' || phase === 'remnant') {
      climateState = 'barren';
      extinctionRiskLevel = 'sterilized';
    } else if (!retainsAtmosphere) {
      climateState = 'barren';
      extinctionRiskLevel = 'atmosphere_loss';
    } else if (T_actual < (climateState === 'snowball' ? cl.snowballExitK : cl.snowballEnterK)) {
      climateState = 'snowball';
      extinctionRiskLevel = 'snowball';
    } else if (T_actual > (climateState === 'moist_greenhouse' ? cl.greenhouseExitK : cl.greenhouseEnterK)) {
      climateState = 'moist_greenhouse';
      extinctionRiskLevel = 'greenhouse';
    } else {
      climateState = 'habitable';
    }
    rec.prevClimate = climateState;

    // Life & civilization
    let biomass = 0;
    if (rec.timeInHz_yr > cfg.life.delayYr && compositeScore > cfg.life.minScore) {
      biomass = Math.min(1, (rec.timeInHz_yr - cfg.life.delayYr) / cfg.life.matureYr);
    }
    let civilizationTier = 0;
    if (biomass >= 1) {
      if (rec.civEmergenceTime === 0) rec.civEmergenceTime = rec.timeInHz_yr;
      const t = rec.timeInHz_yr - rec.civEmergenceTime;
      civilizationTier = t > cfg.civ.galacticYr ? 3 : t > cfg.civ.stellarYr ? 2 : t > cfg.civ.planetaryYr ? 1 : 0;
    } else {
      rec.civEmergenceTime = 0;
    }

    this.history.set(planet_id, rec);

    return {
      planet_id,
      compositeScore,
      orbitalScore,
      thermalScore,
      atmosphereScore,
      stellarActivityScore,
      ageScore,
      isInHabitableZone,
      hasLiquidWater: T_actual >= minK && T_actual <= maxK,
      surfaceTemperature_K: T_actual,
      extinctionRiskLevel,
      climateState,
      triggered_at_yr: extinctionRiskLevel !== 'none' ? age_yr : null,
      biomass,
      civilizationTier,
    };
  }
}
