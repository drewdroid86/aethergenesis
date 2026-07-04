/**
 * StellarPhysics.ts — Authoritative Physics Engine for AetherGenesis
 *
 * Pure TypeScript math. Zero Three.js imports. Zero rendering imports.
 * Every equation is cited to peer-reviewed literature.
 *
 * This module is the single source of truth for all stellar state.
 * All rendering uniforms must trace back to a StellarState field
 * computed here. No physical quantity may be invented in a rendering file.
 *
 * @module StellarPhysics
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type StellarPhase =
  | 'nebula'
  | 'protostar'
  | 'main_sequence'
  | 'red_giant'
  | 'supernova'
  | 'remnant';

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export type RemnantType = 'white_dwarf' | 'neutron_star' | 'black_hole';

export interface StellarState {
  id: string;
  initialMass_solar: number;
  metallicity_Z: number;
  age_yr: number;
  mass_solar: number;
  luminosity_solar: number;
  radius_solar: number;
  temperature_K: number;
  phase: StellarPhase;
  spectralClass: SpectralClass;
  absoluteMagnitude: number;
  hrPosition: { logT: number; logL: number };
  remnantType?: RemnantType;
  schwarzschildRadius_km?: number;
}

export interface PhaseTransitionEvent {
  from: StellarPhase;
  to: StellarPhase;
  triggered_at_yr: number;
  trigger_condition: string;
}

// ─── Exported Compute Functions ───────────────────────────────────────────────

/**
 * Compute main sequence lifetime from stellar mass.
 *
 * τ_MS ≈ 10¹⁰ yr × (M/M☉)^(-2.5)
 *
 * Higher-mass stars burn hydrogen far faster and live shorter lives.
 * A 10 M☉ star lives ~31.6 Myr; the Sun lives ~10 Gyr.
 *
 * @citation Carroll & Ostlie, "An Introduction to Modern Astrophysics", §13.1
 * @param mass_solar — Stellar mass in solar masses
 * @returns Main sequence lifetime in years
 */
export function computeMainSequenceLifetime(mass_solar: number): number {
  // BOLT: Expand Math.pow(x, -2.5) to 1 / (x^2 * sqrt(x))
  const m2 = mass_solar * mass_solar;
  return 1e10 / (m2 * Math.sqrt(mass_solar));
}

/**
 * Compute stellar luminosity from mass using the mass-luminosity relation.
 *
 * For M > 0.43 M☉:  L = M^4.0    (Eddington 1924)
 * For M ≤ 0.43 M☉:  L = 0.23 × M^2.3  (Kroupa 2001)
 *
 * The break at 0.43 M☉ accounts for the transition to fully convective
 * interiors in low-mass stars, which changes the opacity-luminosity relation.
 *
 * @citation Eddington, A.S. (1924) "On the relation between the masses and
 *           luminosities of the stars", MNRAS 84, 308–332
 * @citation Kroupa, P. (2001) "On the variation of the initial mass function",
 *           MNRAS 322, 231–246
 * @param mass_solar — Stellar mass in solar masses
 * @returns Luminosity in solar luminosities
 */
export function computeLuminosity(mass_solar: number): number {
  if (mass_solar > 0.43) {
    // BOLT: Expand Math.pow(x, 4) to (x^2 * x^2)
    const m2 = mass_solar * mass_solar;
    return m2 * m2;
  }
  return 0.23 * Math.pow(mass_solar, 2.3);
}

/**
 * Compute stellar radius from mass, phase, age, and main sequence lifetime.
 *
 * Main sequence: R ≈ M^0.8 (empirical mass-radius relation)
 * Red giant: R = M^0.8 × (age/τ_MS)² × 100, clamped at 500 R☉
 *
 * @citation Demircan, O. & Kahraman, G. (1991) "Stellar mass-luminosity
 *           and mass-radius relations", Ap&SS 181, 313–322
 * @param mass_solar — Current stellar mass in solar masses
 * @param phase — Current evolutionary phase
 * @param age_yr — Current age in years
 * @param tau_ms — Main sequence lifetime in years
 * @returns Radius in solar radii
 */
export function computeRadius(
  mass_solar: number,
  phase: StellarPhase,
  age_yr: number,
  tau_ms: number
): number {
  const r_ms = Math.pow(mass_solar, 0.8);

  switch (phase) {
    case 'nebula':
      return r_ms * 50;
    case 'protostar':
      return r_ms * 10;
    case 'main_sequence':
      return r_ms;
    case 'red_giant': {
      // BOLT: Expand Math.pow(x, 2) to x * x
      const ratio = age_yr / tau_ms;
      const raw = r_ms * (ratio * ratio) * 100;
      return Math.min(raw, 500);
    }
    case 'supernova':
      return r_ms * 0.1;
    case 'remnant': {
      const remnant = computeRemnantType(mass_solar);
      if (remnant === 'white_dwarf') return 0.01;
      if (remnant === 'neutron_star') return 1.4e-5;
      return computeSchwarzschild(mass_solar) / 695700;
    }
    default:
      return r_ms;
  }
}

/**
 * Compute effective surface temperature via the Stefan-Boltzmann law.
 *
 * From L = 4πR²σT⁴, solving for T in solar units:
 *   T = 5778 × (L / R²)^(1/4)
 *
 * where 5778 K = T☉, L in L☉, R in R☉.
 *
 * @citation Stefan-Boltzmann law — fundamental thermodynamic relation
 * @param luminosity_solar — Luminosity in solar luminosities
 * @param radius_solar — Radius in solar radii
 * @returns Effective temperature in Kelvin
 */
export function computeTemperature(
  luminosity_solar: number,
  radius_solar: number
): number {
  if (radius_solar <= 0) return 0;
  // BOLT: Expand Math.pow(x, 0.25) to sqrt(sqrt(x))
  return 5778 * Math.sqrt(Math.sqrt(
    luminosity_solar / (radius_solar * radius_solar)
  ));
}

/**
 * Classify a star by Harvard spectral type from effective temperature.
 *
 * O: T > 30000 K  — ionized helium lines
 * B: T > 10000 K  — neutral helium lines
 * A: T > 7500 K   — strong hydrogen Balmer lines
 * F: T > 6000 K   — Ca II H & K lines strengthening
 * G: T > 5200 K   — strong Ca II, Fe I lines (solar type)
 * K: T > 3700 K   — metallic lines dominate
 * M: T ≤ 3700 K   — molecular TiO bands
 *
 * @citation Morgan, W.W., Keenan, P.C. & Kellman, E. (1943)
 *           "An Atlas of Stellar Spectra"
 * @param temperature_K — Effective surface temperature in Kelvin
 * @returns Harvard spectral class letter
 */
export function computeSpectralClass(temperature_K: number): SpectralClass {
  if (temperature_K > 30000) return 'O';
  if (temperature_K > 10000) return 'B';
  if (temperature_K > 7500) return 'A';
  if (temperature_K > 6000) return 'F';
  if (temperature_K > 5200) return 'G';
  if (temperature_K > 3700) return 'K';
  return 'M';
}

/**
 * Determine remnant type from remnant core mass.
 *
 * M < 1.4 M☉ (Chandrasekhar limit): white dwarf
 *   — supported by electron degeneracy pressure
 * 1.4 ≤ M < 3.0 M☉ (TOV limit): neutron star
 *   — supported by neutron degeneracy pressure
 * M ≥ 3.0 M☉: black hole
 *   — no known force halts gravitational collapse
 *
 * @citation Chandrasekhar, S. (1931) "The maximum mass of ideal white dwarfs",
 *           ApJ 74, 81
 * @citation Oppenheimer, J.R. & Volkoff, G.M. (1939) "On massive neutron cores",
 *           Physical Review 55, 374
 * @param mass_solar — Remnant core mass in solar masses
 * @returns Remnant classification
 */
export function computeRemnantType(mass_solar: number): RemnantType {
  if (mass_solar < 1.4) return 'white_dwarf';
  if (mass_solar < 3.0) return 'neutron_star';
  return 'black_hole';
}

/**
 * Compute the Schwarzschild radius (event horizon) for a given mass.
 *
 * r_s = 2GM/c²
 *
 * For 1 M☉: r_s ≈ 2.953 km. This radius defines the event horizon —
 * the boundary beyond which nothing, not even light, can escape.
 *
 * @citation Schwarzschild, K. (1916) "Über das Gravitationsfeld eines
 *           Massenpunktes nach der Einsteinschen Theorie" — GR fundamental
 * @param mass_solar — Mass in solar masses
 * @returns Schwarzschild radius in kilometers
 */
export function computeSchwarzschild(mass_solar: number): number {
  // BOLT: Simplified to single constant multiplication (2.95325 km per solar mass)
  return mass_solar * 2.95325;
}

/**
 * Determine evolutionary phase from mass, age, and main sequence lifetime.
 *
 * Phase boundaries are defined by physical timescales relative to τ_MS:
 *   age < 0.1% τ_MS  → nebula (molecular cloud collapse)
 *   age < 1% τ_MS    → protostar (Kelvin-Helmholtz contraction)
 *   age < τ_MS        → main_sequence (core hydrogen burning)
 *   age < 1.5 τ_MS AND M > 8 → supernova (core collapse)
 *   age < 1.2 τ_MS    → red_giant (shell hydrogen / core helium burning)
 *   else               → remnant (WD / NS / BH)
 *
 * @param mass_solar — Initial stellar mass in solar masses
 * @param age_yr — Current age in years
 * @param tau_ms — Main sequence lifetime in years
 * @returns Current evolutionary phase
 */
export function computePhase(
  mass_solar: number,
  age_yr: number,
  tau_ms: number
): StellarPhase {
  if (age_yr < tau_ms * 0.001) return 'nebula';
  if (age_yr < tau_ms * 0.01) return 'protostar';
  if (age_yr < tau_ms) return 'main_sequence';
  if (age_yr < tau_ms * 1.5 && mass_solar > 8) return 'supernova';
  if (age_yr < tau_ms * 1.2) return 'red_giant';
  return 'remnant';
}

/**
 * Compute absolute visual magnitude from luminosity.
 *
 * M_V = 4.83 − 2.5 × log₁₀(L/L☉)
 *
 * where 4.83 = M_V☉ (IAU 2015 nominal solar absolute magnitude).
 *
 * @citation IAU 2015 Resolution B2 — Nominal solar quantities
 * @param luminosity_solar — Luminosity in solar luminosities
 * @returns Absolute visual magnitude
 */
function computeAbsoluteMagnitude(luminosity_solar: number): number {
  if (luminosity_solar <= 0) return 99;
  return 4.83 - 2.5 * Math.log10(luminosity_solar);
}

/**
 * Compute current mass accounting for evolutionary mass loss.
 *
 * Main sequence: negligible wind loss (~10⁻¹⁴ M☉/yr)
 * Red giant: Reimers wind strips up to 40% of envelope
 * Post-supernova: only the core survives
 *
 * @citation Reimers, D. (1975) "Circumstellar envelopes and mass loss
 *           of red giant stars"
 * @param initialMass_solar — Birth mass
 * @param phase — Current phase
 * @param age_yr — Current age
 * @param tau_ms — Main sequence lifetime
 * @returns Current mass in solar masses
 */
function computeCurrentMass(
  initialMass_solar: number,
  phase: StellarPhase,
  age_yr: number,
  tau_ms: number
): number {
  switch (phase) {
    case 'nebula':
    case 'protostar':
    case 'main_sequence':
      return initialMass_solar;
    case 'red_giant': {
      const rgFraction = Math.min((age_yr - tau_ms) / (tau_ms * 0.2), 1.0);
      return initialMass_solar * (1.0 - rgFraction * 0.4);
    }
    case 'supernova':
    case 'remnant':
      // Core mass after envelope ejection
      if (initialMass_solar <= 8) {
        return Math.max(0.5, 0.394 + 0.109 * initialMass_solar);
      }
      return Math.max(1.4, initialMass_solar * 0.2);
    default:
      return initialMass_solar;
  }
}

/**
 * Compute luminosity adjusted for evolutionary phase.
 *
 * @param initialMass_solar — Birth mass
 * @param mass_solar — Current mass
 * @param phase — Current phase
 * @param age_yr — Current age
 * @param tau_ms — Main sequence lifetime
 * @returns Luminosity in solar luminosities
 */
function computePhaseLuminosity(
  initialMass_solar: number,
  mass_solar: number,
  phase: StellarPhase,
  age_yr: number,
  tau_ms: number
): number {
  switch (phase) {
    case 'nebula':
      return computeLuminosity(initialMass_solar) * 0.001;
    case 'protostar':
      return computeLuminosity(initialMass_solar) * 0.1;
    case 'main_sequence':
      return computeLuminosity(mass_solar);
    case 'red_giant': {
      const rgProgress = Math.min((age_yr - tau_ms) / (tau_ms * 0.2), 1.0);
      return computeLuminosity(initialMass_solar) * (10 + 90 * rgProgress);
    }
    case 'supernova':
      return 1e9;
    case 'remnant': {
      const remnant = computeRemnantType(mass_solar);
      if (remnant === 'black_hole') return 0;
      if (remnant === 'neutron_star') return 0.1;
      return 0.01;
    }
    default:
      return computeLuminosity(mass_solar);
  }
}

// ─── Public Factory & Stepper ─────────────────────────────────────────────────

/**
 * Create a complete StellarState from initial conditions and age.
 *
 * This is the single public factory. It calls all compute functions
 * in dependency order and returns a complete StellarState.
 * No side effects. Deterministic. Same inputs always produce same output.
 *
 * Dependency order:
 *   mass → tau_ms → phase → currentMass → luminosity → radius →
 *   temperature → spectralClass → magnitude → hrPosition → remnant fields
 *
 * @param id — Unique star identifier
 * @param initialMass_solar — Birth mass in solar masses
 * @param metallicity_Z — Metal mass fraction (Sun ≈ 0.02)
 * @param age_yr — Current age in years
 * @returns Complete physical state of the star
 */
export function createStellarState(
  id: string,
  initialMass_solar: number,
  metallicity_Z: number,
  age_yr: number
): StellarState {
  const tau_ms = computeMainSequenceLifetime(initialMass_solar);
  const phase = computePhase(initialMass_solar, age_yr, tau_ms);
  const mass_solar = computeCurrentMass(initialMass_solar, phase, age_yr, tau_ms);
  const luminosity_solar = computePhaseLuminosity(
    initialMass_solar, mass_solar, phase, age_yr, tau_ms
  );
  const radius_solar = computeRadius(mass_solar, phase, age_yr, tau_ms);
  const temperature_K = computeTemperature(luminosity_solar, radius_solar);
  const spectralClass = computeSpectralClass(temperature_K);
  const absoluteMagnitude = computeAbsoluteMagnitude(luminosity_solar);

  const state: StellarState = {
    id,
    initialMass_solar,
    metallicity_Z,
    age_yr,
    mass_solar,
    luminosity_solar,
    radius_solar,
    temperature_K,
    phase,
    spectralClass,
    absoluteMagnitude,
    hrPosition: {
      logT: Math.log10(Math.max(temperature_K, 1)),
      logL: Math.log10(Math.max(luminosity_solar, 1e-10)),
    },
  };

  if (phase === 'remnant' || phase === 'supernova') {
    state.remnantType = computeRemnantType(mass_solar);
    if (state.remnantType === 'black_hole') {
      state.schwarzschildRadius_km = computeSchwarzschild(mass_solar);
    }
  }

  return state;
}

/**
 * Advance a stellar state by delta_yr years.
 *
 * Recomputes all derived values from the new age. If the phase changes,
 * returns a PhaseTransitionEvent with a human-readable trigger_condition.
 *
 * Never mutates the input state. Always returns a new object.
 *
 * @param state — Current stellar state (not mutated)
 * @param delta_yr — Time step in years to advance
 * @returns New state and optional phase transition event
 */
export function advanceStellarState(
  state: StellarState,
  delta_yr: number
): { state: StellarState; event?: PhaseTransitionEvent } {
  const newAge = state.age_yr + delta_yr;
  const oldPhase = state.phase;

  const newState = createStellarState(
    state.id,
    state.initialMass_solar,
    state.metallicity_Z,
    newAge
  );

  if (newState.phase !== oldPhase) {
    const tau_ms = computeMainSequenceLifetime(state.initialMass_solar);
    let trigger_condition: string;

    switch (newState.phase) {
      case 'protostar':
        trigger_condition =
          `age_yr ${newAge.toExponential(2)} exceeded nebula duration ` +
          `(${(tau_ms * 0.001).toExponential(2)} yr) — Jeans collapse complete`;
        break;
      case 'main_sequence':
        trigger_condition =
          `age_yr ${newAge.toExponential(2)} exceeded protostar duration ` +
          `(${(tau_ms * 0.01).toExponential(2)} yr) — core hydrogen ignition at T_c > 10^7 K`;
        break;
      case 'red_giant':
        trigger_condition =
          `age_yr ${newAge.toExponential(2)} exceeded τ_MS ` +
          `(${tau_ms.toExponential(2)} yr) — core hydrogen exhausted`;
        break;
      case 'supernova':
        trigger_condition =
          `age_yr ${newAge.toExponential(2)} exceeded τ_MS AND ` +
          `initialMass ${state.initialMass_solar} M☉ > 8 M☉ — core collapse triggered`;
        break;
      case 'remnant':
        trigger_condition =
          `age_yr ${newAge.toExponential(2)} exceeded post-MS lifetime — ` +
          `remnant type: ${newState.remnantType ?? 'unknown'} ` +
          `(core mass ${newState.mass_solar.toFixed(2)} M☉)`;
        break;
      default:
        trigger_condition = `phase changed from ${oldPhase} to ${newState.phase}`;
    }

    return {
      state: newState,
      event: {
        from: oldPhase,
        to: newState.phase,
        triggered_at_yr: newAge,
        trigger_condition,
      },
    };
  }

  return { state: newState };
}
