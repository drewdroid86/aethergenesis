import { createStellarState, advanceStellarState, computeMainSequenceLifetime } from '../src/simulation/StellarPhysics'

function assert(condition: any, message: string) {
    if (!condition) {
        console.error(`Assertion Failed: ${message}`);
        process.exit(1);
    }
}

// Test 1: Sun-like star (at 4.6 Gyr, mid-main-sequence)
const sun = createStellarState('sun', 1.0, 0.0134, 4.6e9)
console.log('Sun luminosity (expect ~1.0):', sun.luminosity_solar)
console.log('Sun temperature (expect ~5778K):', sun.temperature_K)
console.log('Sun spectral (expect G):', sun.spectralClass)
console.log('Sun lifetime (expect ~10Gyr):', computeMainSequenceLifetime(1.0))
assert(Math.abs(sun.luminosity_solar - 1.0) < 0.1, 'Luminosity mismatch');
assert(Math.abs(sun.temperature_K - 5778) < 100, 'Temperature mismatch');
assert(sun.spectralClass.startsWith('G'), 'Spectral class mismatch');

// Test 2: Massive star (at 2 Myr, mid-main-sequence)
const massive = createStellarState('massive', 20.0, 0.008, 2e6)
console.log('20M star luminosity (expect >>1):', massive.luminosity_solar)
console.log('20M star spectral (expect O):', massive.spectralClass)
console.log('20M lifetime (expect ~3-5Myr):', computeMainSequenceLifetime(20.0))
assert(massive.luminosity_solar > 10000, 'Luminosity too low');
assert(massive.spectralClass.startsWith('O') || massive.spectralClass.startsWith('B'), 'Spectral class mismatch');

// Test 3: Phase transition
const state = createStellarState('test', 1.0, 0.02, 0)
const tau = computeMainSequenceLifetime(1.0)
const advanced = advanceStellarState(state, tau * 1.1)
console.log('Phase after tau_MS (expect red_giant):', advanced.state.phase)
console.log('Transition event:', advanced.event?.trigger_condition)
assert(advanced.state.phase === 'red_giant', 'Phase transition mismatch');

// Test 4: Black hole branch
const bhStar = createStellarState('bh', 25.0, 0.006, 0)
const postSN = advanceStellarState(bhStar, computeMainSequenceLifetime(25.0) * 1.6)
console.log('Remnant type (expect black_hole):', postSN.state.remnantType)
console.log('Schwarzschild radius km:', postSN.state.schwarzschildRadius_km)
assert(postSN.state.remnantType === 'black_hole', 'Remnant type mismatch');
assert(postSN.state.schwarzschildRadius_km && postSN.state.schwarzschildRadius_km > 0, 'Invalid Schwarzschild radius');
