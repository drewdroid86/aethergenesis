import test from 'node:test';
import assert from 'node:assert';
const PORT = process.env.PORT || '3001';
const BASE_URL = `http://localhost:${PORT}`;

// ==========================================
// TIER 1: Feature Coverage
// ==========================================

test('F1-T1-1: Load TRAPPIST-1 Preset', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/presets`);
  assert.strictEqual(res.status, 200);
  const presets = await res.json();
  assert.ok(Array.isArray(presets), 'Presets should be an array');
  const trappist = presets.find((p: any) => p.name.toUpperCase().includes('TRAPPIST-1'));
  assert.ok(trappist, 'TRAPPIST-1 preset should exist');
  assert.ok(trappist.mass_solar < 0.1, 'TRAPPIST-1 should be a low mass star');
  assert.ok(trappist.planets && trappist.planets.length >= 1, 'TRAPPIST-1 should have planets');
});

test('F1-T1-2: Load Kepler-186 Preset', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/presets`);
  const presets = await res.json();
  const k186 = presets.find((p: any) => p.name.toUpperCase().includes('KEPLER-186'));
  assert.ok(k186, 'Kepler-186 preset should exist');
  assert.strictEqual(k186.spectral_class, 'M');
});

test('F1-T1-3: Load Kepler-22b Preset', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/presets`);
  const presets = await res.json();
  const k22b = presets.find((p: any) => p.name.toUpperCase().includes('KEPLER-22B') || p.name.toUpperCase().includes('KEPLER-22'));
  assert.ok(k22b, 'Kepler-22b preset should exist');
  assert.ok(k22b.temperature_K > 5000 && k22b.temperature_K < 6000, 'Kepler-22b star should be a G-type star');
});

test('F1-T1-4: Search Catalog by Spectral Class', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/search?spectral_class=G`);
  assert.strictEqual(res.status, 200);
  const results = await res.json();
  assert.ok(Array.isArray(results), 'Search results should be an array');
  if (results.length > 0) {
    assert.strictEqual(results[0].spectral_class[0], 'G', 'First result should be a G spectral class');
  }
});

test('F1-T1-5: Search Horizons for Small Body NAIF ID', async () => {
  const res = await fetch(`${BASE_URL}/api/horizons/search?body_id=1P`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body, 'Horizons search should return body data');
  assert.strictEqual(body.naif_id, '1P');
  assert.ok(body.semi_major_axis_au > 0, 'Should return semi-major axis');
});

// ==========================================
// TIER 2: Boundary & Corner Cases
// ==========================================

test('F1-T2-6: Search Catalog with empty parameters', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/search`);
  assert.strictEqual(res.status, 200);
  const results = await res.json();
  assert.ok(Array.isArray(results), 'Empty search should fallback to default library');
});

test('F1-T2-7: Search Catalog for non-existent star', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/search?name=NonExistentStarXYZ`);
  assert.strictEqual(res.status, 200);
  const results = await res.json();
  assert.ok(Array.isArray(results) && results.length === 0, 'Should return empty array');
});

test('F1-T2-8: Load Preset with invalid parameters', async () => {
  const res = await fetch(`${BASE_URL}/api/catalog/search?mass_min_solar=-5`);
  assert.strictEqual(res.status, 400, 'Invalid parameters should return status 400');
});

test('F1-T2-9: Search Horizons with invalid NAIF ID', async () => {
  const res = await fetch(`${BASE_URL}/api/horizons/search?body_id=InvalidBodyIDXYZ`);
  assert.ok(res.status === 400 || res.status === 404, 'Invalid body ID should return bad request or empty error');
});

test('F1-T2-10: Search Horizons with long query/SQL characters', async () => {
  const longQuery = "A".repeat(100) + "'; DROP TABLE stars; --";
  const res = await fetch(`${BASE_URL}/api/horizons/search?body_id=${encodeURIComponent(longQuery)}`);
  assert.ok(res.status === 400 || res.status === 414 || res.status === 200, 'Should be handled safely without crash');
});

// ==========================================
// TIER 3: Cross-Feature Combinations
// ==========================================

test('F1-T3-11: Load Preset in Discovery vs Science modes', async () => {
  // Verifies that loading a preset populates physical variables that map to sliders correctly in the UI state
  const res = await fetch(`${BASE_URL}/api/catalog/presets`);
  const presets = await res.json();
  const solarPreset = presets.find((p: any) => p.name.toUpperCase().includes('SUN') || p.name.toUpperCase().includes('SOLAR'));
  assert.ok(solarPreset);
  
  // Verify configuration properties map correctly
  assert.strictEqual(solarPreset.mass_solar, 1.0);
  assert.strictEqual(solarPreset.luminosity_solar, 1.0);
  assert.ok(solarPreset.literature_reference);
});

// ==========================================
// TIER 4: Real-World Application Scenarios
// ==========================================

test('F1-T4-12: Full Workload: Catalog Search -> Load Kepler-442 -> Check HZ and orbital elements', async () => {
  // 1. Search Kepler-442
  const searchRes = await fetch(`${BASE_URL}/api/catalog/search?name=Kepler-442`);
  assert.strictEqual(searchRes.status, 200);
  const searchResults = await searchRes.json();
  const k442 = searchResults.find((s: any) => s.name.includes('Kepler-442'));
  assert.ok(k442, 'Kepler-442 should be found in catalog search');

  // 2. Fetch full profiles
  const presetRes = await fetch(`${BASE_URL}/api/catalog/presets`);
  const presets = await presetRes.json();
  const system = presets.find((p: any) => p.name.includes('Kepler-442'));
  assert.ok(system, 'Kepler-442 preset details should load');

  // Verify HZ boundaries computed correctly
  assert.ok(system.habitable_zone_inner_au > 0, 'HZ inner bound must be positive');
  assert.ok(system.habitable_zone_outer_au > system.habitable_zone_inner_au, 'HZ outer bound > inner bound');
});
