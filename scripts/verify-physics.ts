import { createStellarState, advanceStellarState, computeMainSequenceLifetime } from '../src/simulation/StellarPhysics'

// Test 1: Sun-like star
const sun = createStellarState('sun', 1.0, 0.0134, 0)
console.log('Sun luminosity (expect ~1.0):', sun.luminosity_solar)
console.log('Sun temperature (expect ~5778K):', sun.temperature_K)
console.log('Sun spectral (expect G):', sun.spectralClass)
console.log('Sun lifetime (expect ~10Gyr):', computeMainSequenceLifetime(1.0))

// Test 2: Massive star
const massive = createStellarState('massive', 20.0, 0.008, 0)
console.log('20M star luminosity (expect >>1):', massive.luminosity_solar)
console.log('20M star spectral (expect O):', massive.spectralClass)
console.log('20M lifetime (expect ~3Myr):', computeMainSequenceLifetime(20.0))

// Test 3: Phase transition
let state = createStellarState('test', 1.0, 0.02, 0)
const tau = computeMainSequenceLifetime(1.0)
const advanced = advanceStellarState(state, tau * 1.1)
console.log('Phase after tau_MS (expect red_giant):', advanced.state.phase)
console.log('Transition event:', advanced.event?.trigger_condition)

// Test 4: Black hole branch
const bhStar = createStellarState('bh', 25.0, 0.006, 0)
const postSN = advanceStellarState(bhStar, computeMainSequenceLifetime(25.0) * 1.6)
console.log('Remnant type (expect black_hole):', postSN.state.remnantType)
console.log('Schwarzschild radius km:', postSN.state.schwarzschildRadius_km)
