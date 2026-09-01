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

// Test 5: M-dwarf low-mass longevity (0.22 M☉ at 9.568 Gyr - b59a8e3)
const mDwarf = createStellarState('m_dwarf_b59a8e3', 0.22, 0.02, 9.568e9);
console.log('0.22M star phase (expect main_sequence):', mDwarf.phase);
console.log('0.22M star temperature (expect ~3000K):', mDwarf.temperature_K);
console.log('0.22M star luminosity (expect ~0.007L☉):', mDwarf.luminosity_solar);
assert(mDwarf.phase === 'main_sequence', 'M-dwarf at 9.568 Gyr must be main_sequence');
assert(mDwarf.temperature_K > 2500 && mDwarf.temperature_K < 4000, 'M-dwarf temperature must be in MS range (~3070K)');
assert(mDwarf.luminosity_solar > 0.001 && mDwarf.luminosity_solar < 0.1, 'M-dwarf luminosity must be in MS range');

// Test 6: Intermediate F-type star (1.51 M☉ at 0.94 Gyr - 651351)
const fStar = createStellarState('f_star_651351', 1.51, 0.02, 0.9369e9);
console.log('1.51M star phase (expect main_sequence):', fStar.phase);
console.log('1.51M star temperature (expect ~7000K):', fStar.temperature_K);
console.log('1.51M star luminosity (expect ~4.2L☉):', fStar.luminosity_solar);
assert(fStar.phase === 'main_sequence', '1.51M star at 0.94 Gyr must be main_sequence');
assert(fStar.temperature_K > 6000 && fStar.temperature_K < 8000, '1.51M star temperature must be MS range (~7040K), not nebula 723K');
assert(fStar.luminosity_solar > 2.0 && fStar.luminosity_solar < 8.0, '1.51M star luminosity must be MS range (~4.25L☉), not nebula 0.067L☉');

// Test 7: Ultra-low mass red dwarf longevity (0.16 M☉ at 5-13 Gyr - d70657)
const ultraCoolDwarf5 = createStellarState('d70657_5gyr', 0.16, 0.02, 5e9);
const ultraCoolDwarf13 = createStellarState('d70657_13gyr', 0.16, 0.02, 13.8e9);
console.log('0.16M star at 13.8 Gyr phase (expect main_sequence):', ultraCoolDwarf13.phase);
console.log('0.16M star temperature (expect ~2800K):', ultraCoolDwarf13.temperature_K);
console.log('0.16M star luminosity (expect ~0.003L☉):', ultraCoolDwarf13.luminosity_solar);
assert(ultraCoolDwarf5.phase === 'main_sequence', '0.16M star at 5 Gyr must be main_sequence');
assert(ultraCoolDwarf13.phase === 'main_sequence', '0.16M star at 13.8 Gyr must be main_sequence (cool dwarf, not red giant)');
assert(ultraCoolDwarf13.temperature_K > 2500 && ultraCoolDwarf13.temperature_K < 3500, '0.16M star temperature must be cool dwarf MS');
assert(ultraCoolDwarf13.luminosity_solar > 0.001 && ultraCoolDwarf13.luminosity_solar < 0.01, '0.16M star luminosity must be cool dwarf MS');


