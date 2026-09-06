import assert from 'node:assert';
import { AstrobiologyEngine, HABITABILITY_CONFIG } from '../src/simulation/AstrobiologyEngine.ts';
import { createStellarState } from '../src/simulation/StellarPhysics.ts';

console.log('--- Verification: AstrobiologyEngine HABITABILITY_CONFIG & Features ---');

// 1. Verify Configuration Structure & Values
assert.strictEqual(HABITABILITY_CONFIG.hz.innerFlux, 1.1);
assert.strictEqual(HABITABILITY_CONFIG.hz.outerFlux, 0.53);
assert.strictEqual(HABITABILITY_CONFIG.water.minK, 273);
assert.strictEqual(HABITABILITY_CONFIG.water.maxK, 373);
assert.strictEqual(HABITABILITY_CONFIG.water.falloffK, 50);
assert.strictEqual(HABITABILITY_CONFIG.climate.snowballEnterK, 233);
assert.strictEqual(HABITABILITY_CONFIG.climate.snowballExitK, 245);
assert.strictEqual(HABITABILITY_CONFIG.climate.greenhouseEnterK, 340);
assert.strictEqual(HABITABILITY_CONFIG.climate.greenhouseExitK, 328);
assert.strictEqual(HABITABILITY_CONFIG.atmosphere.jeansFactor, 6);
assert.strictEqual(HABITABILITY_CONFIG.life.minScore, 0.5);
assert.strictEqual(HABITABILITY_CONFIG.life.sustainScore, 0.65);
assert.strictEqual(HABITABILITY_CONFIG.life.delayYr, 500e6);
assert.strictEqual(HABITABILITY_CONFIG.life.matureYr, 1e9);
assert.strictEqual(HABITABILITY_CONFIG.civ.planetaryYr, 20e6);
assert.strictEqual(HABITABILITY_CONFIG.civ.stellarYr, 100e6);
assert.strictEqual(HABITABILITY_CONFIG.civ.galacticYr, 200e6);
assert.strictEqual(HABITABILITY_CONFIG.weights.thermal, 1.5);
assert.strictEqual(HABITABILITY_CONFIG.greenhouseByType.rocky, 25);
console.log('✅ HABITABILITY_CONFIG full schema and tunables verified');

// 2. Canonical key generator and prefix clearHistory
const key = AstrobiologyEngine.key('star_1', 'planet_a');
assert.strictEqual(key, 'star_1:planet_a');

const engine = new AstrobiologyEngine();
const sun = createStellarState('sun', 1.0, 0.0134, 4.6e9);
const planetId = AstrobiologyEngine.key('sun', 'earth');

// 3. Earth baseline at 1.0 AU
let state = engine.evaluatePlanet(planetId, 1.0, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
console.log(`Earth baseline: T=${state.surfaceTemperature_K.toFixed(1)}K, composite=${state.compositeScore.toFixed(3)}, climate=${state.climateState}`);
assert.strictEqual(state.climateState, 'habitable');
assert.strictEqual(state.extinctionRiskLevel, 'none');
assert.strictEqual(state.isInHabitableZone, true);
assert.strictEqual(state.hasLiquidWater, true);
assert.ok(state.compositeScore > 0.8, 'Earth composite habitability score should be > 0.8');

// 4. Snowball entry & hysteresis
state = engine.evaluatePlanet(planetId, 2.0, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
assert.strictEqual(state.climateState, 'snowball');
assert.strictEqual(state.extinctionRiskLevel, 'snowball');

state = engine.evaluatePlanet(planetId, 1.43, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
assert.ok(state.surfaceTemperature_K >= 233 && state.surfaceTemperature_K < 245);
assert.strictEqual(state.climateState, 'snowball', 'Hysteresis: must remain in snowball');

state = engine.evaluatePlanet(planetId, 1.2, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
assert.ok(state.surfaceTemperature_K >= 245);
assert.strictEqual(state.climateState, 'habitable', 'Thawed: returns to habitable');

// 5. Moist greenhouse entry & hysteresis
state = engine.evaluatePlanet(planetId, 0.5, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
assert.strictEqual(state.climateState, 'moist_greenhouse');
assert.strictEqual(state.extinctionRiskLevel, 'greenhouse');

state = engine.evaluatePlanet(planetId, 0.68, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
assert.ok(state.surfaceTemperature_K > 328 && state.surfaceTemperature_K <= 340);
assert.strictEqual(state.climateState, 'moist_greenhouse', 'Hysteresis: must remain in moist greenhouse');

state = engine.evaluatePlanet(planetId, 0.8, 5.97e24, 6.371e6, 0.3, sun, 1e6, 'rocky');
assert.ok(state.surfaceTemperature_K <= 328);
assert.strictEqual(state.climateState, 'habitable', 'Recovered: returns to habitable');

// 6. Atmosphere loss & sterilization
const deadStar = createStellarState('dead', 15.0, 0.02, 1.6e7);
const deadPlanet = engine.evaluatePlanet(planetId, 1.0, 5.97e24, 6.371e6, 0.3, deadStar, 1e6, 'rocky');
assert.strictEqual(deadPlanet.climateState, 'barren');
assert.strictEqual(deadPlanet.extinctionRiskLevel, 'sterilized');
assert.strictEqual(deadPlanet.compositeScore, 0.0, 'Supernova/remnant must drop compositeScore to 0.0');

// 7. Life & civilization progression
const lifePlanetId = AstrobiologyEngine.key('sun', 'life_world');
engine.clearHistory('sun');

// Step 600 Myr in HZ (exceeds delayYr 500 Myr)
for (let i = 0; i < 6; i++) {
  state = engine.evaluatePlanet(lifePlanetId, 1.0, 5.97e24, 6.371e6, 0.3, sun, 100e6, 'ocean');
}
assert.ok(state.biomass > 0, 'Biomass should emerge after 500 Myr');
console.log(`Emergent life: biomass=${state.biomass.toFixed(2)}, tier=${state.civilizationTier}`);

// Step to 1.5 Gyr total in HZ (matureYr reaches 1.0 biomass)
for (let i = 0; i < 9; i++) {
  state = engine.evaluatePlanet(lifePlanetId, 1.0, 5.97e24, 6.371e6, 0.3, sun, 100e6, 'ocean');
}
assert.strictEqual(state.biomass, 1.0, 'Biomass should reach 1.0 at maturity');

// Advance civilization tiers (25 Myr -> tier 1, 105 Myr -> tier 2, 205 Myr -> tier 3)
state = engine.evaluatePlanet(lifePlanetId, 1.0, 5.97e24, 6.371e6, 0.3, sun, 25e6, 'ocean');
assert.strictEqual(state.civilizationTier, 1, 'Should reach Tier 1 Planetary civilization');

state = engine.evaluatePlanet(lifePlanetId, 1.0, 5.97e24, 6.371e6, 0.3, sun, 80e6, 'ocean'); // total 105 Myr
assert.strictEqual(state.civilizationTier, 2, 'Should reach Tier 2 Stellar civilization');

state = engine.evaluatePlanet(lifePlanetId, 1.0, 5.97e24, 6.371e6, 0.3, sun, 100e6, 'ocean'); // total 205 Myr
assert.strictEqual(state.civilizationTier, 3, 'Should reach Tier 3 Galactic civilization');
console.log(`Civilization progression verified: Tier ${state.civilizationTier}`);

console.log('✅ All AstrobiologyEngine verification checks passed successfully!');
