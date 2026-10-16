/**
 * Shared JPL Horizons orbital-elements parser and disambiguation helpers.
 * Used by both `server.ts` and `server/mcp/nasa-horizons.mjs` (AUD-04).
 */

/**
 * Parses plain-text elements block from a JPL Horizons response.
 * @param {string} text
 */
export function parseOrbitalElements(text) {
  const soeIdx = text.indexOf('$$SOE');
  const eoeIdx = text.indexOf('$$EOE');
  if (soeIdx === -1 || eoeIdx === -1) {
    throw new Error('Could not find $$SOE or $$EOE markers in Horizons response');
  }
  const dataBlock = text.substring(soeIdx + 5, eoeIdx).trim();

  // Parse elements using word boundaries to prevent suffix collisions (e.g. TA vs A)
  const ecMatch = dataBlock.match(/\bEC\s*=\s*([0-9E.+-]+)/i);
  const qrMatch = dataBlock.match(/\bQR\s*=\s*([0-9E.+-]+)/i);
  const inMatch = dataBlock.match(/\bIN\s*=\s*([0-9E.+-]+)/i);
  const omMatch = dataBlock.match(/\bOM\s*=\s*([0-9E.+-]+)/i);
  const wMatch = dataBlock.match(/\bW\s*=\s*([0-9E.+-]+)/i);
  const maMatch = dataBlock.match(/\bMA\s*=\s*([0-9E.+-]+)/i);
  const aMatch = dataBlock.match(/\bA\s*=\s*([0-9E.+-]+)/i);
  const adMatch = dataBlock.match(/\bAD\s*=\s*([0-9E.+-]+)/i);
  const prMatch = dataBlock.match(/\bPR\s*=\s*([0-9E.+-]+)/i);

  const eccentricity = ecMatch ? parseFloat(ecMatch[1]) : 0;
  let perihelion_au = qrMatch ? parseFloat(qrMatch[1]) : 0;
  const inclination_deg = inMatch ? parseFloat(inMatch[1]) : 0;
  const longitude_ascending_node_deg = omMatch ? parseFloat(omMatch[1]) : 0;
  const argument_perihelion_deg = wMatch ? parseFloat(wMatch[1]) : 0;
  const mean_anomaly_deg = maMatch ? parseFloat(maMatch[1]) : 0;

  let semi_major_axis_au = aMatch ? parseFloat(aMatch[1]) : 0;
  if (!semi_major_axis_au && eccentricity < 1) {
    semi_major_axis_au = perihelion_au / (1 - eccentricity);
  }

  let aphelion_au = adMatch ? parseFloat(adMatch[1]) : 0;
  if (!aphelion_au && eccentricity < 1) {
    aphelion_au = semi_major_axis_au * (1 + eccentricity);
  }

  // Detect and convert from kilometers if values are extremely large (common for comets in ELEMENTS mode)
  if (perihelion_au > 1000) {
    const kmToAu = 149597870.7;
    perihelion_au = perihelion_au / kmToAu;
    semi_major_axis_au = semi_major_axis_au / kmToAu;
    aphelion_au = aphelion_au / kmToAu;
  }

  let period_yr = null;
  if (prMatch) {
    // PR is usually in days, convert to years. If it's too large (e.g. in seconds), fall back to Kepler's 3rd Law.
    const rawPr = parseFloat(prMatch[1]);
    const parsedPrYr = rawPr / 365.25;
    if (parsedPrYr > 10000 && eccentricity < 1 && semi_major_axis_au > 0) {
      period_yr = Math.pow(semi_major_axis_au, 1.5);
    } else {
      period_yr = parsedPrYr;
    }
  } else if (eccentricity < 1 && semi_major_axis_au > 0) {
    period_yr = Math.pow(semi_major_axis_au, 1.5);
  }

  return {
    semi_major_axis_au,
    eccentricity,
    inclination_deg,
    longitude_ascending_node_deg,
    argument_perihelion_deg,
    mean_anomaly_deg,
    period_yr,
    aphelion_au,
    perihelion_au,
  };
}

/**
 * Wrong-body guard for JPL Horizons lookups.
 *
 * Horizons resolves COMMAND fuzzily, so a designation like '1P' can come back
 * as a multi-record disambiguation list (or even a directly-resolved unrelated
 * body). A returned record only corresponds to the request when its
 * designation/name matches the requested body_id case-insensitively, allowing
 * Horizons naming variants such as '1P/Halley' for a '1P' query.
 *
 * @param {string} targetName
 * @param {string} requestedBodyId
 * @returns {boolean}
 */
export function horizonsRecordMatchesRequest(targetName, requestedBodyId) {
  const record = String(targetName ?? '').toLowerCase();
  const requested = String(requestedBodyId ?? '').trim().toLowerCase();
  if (!requested) return false;
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Boundary-aware containment in either direction: '1p' matches '1p/halley'
  // but not '21p/...' (preceded by an alphanumeric) nor 'kerberos (904)'.
  const boundaryContains = (haystack, needle) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(haystack);
  if (boundaryContains(record, requested)) return true;
  if (boundaryContains(requested, record)) return true;
  // Token overlap for multi-word names: any significant shared token, e.g.
  // request 'halley' vs record '1p/halley'.
  const tokens = (s) => s.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const recordTokens = new Set(tokens(record));
  if (recordTokens.size === 0) return false;
  return tokens(requested).some((t) => recordTokens.has(t));
}

/**
 * Parse DASTCOM small-body index rows ("<record> <epoch-yr> <match-desig> ...")
 * from a Horizons disambiguation listing.
 *
 * @param {string} resultText
 * @returns {Array<{ record: string, label: string, desigKey: string, epochYear: number | null }>}
 */
export function parseHorizonsIndexCandidates(resultText) {
  const candidates = [];
  for (const line of String(resultText ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!/^(\d+)\s+(-?\d+)\s+/.test(trimmed)) continue;
    const tokens = trimmed.split(/\s+/);
    const epochYear = tokens.length > 1 ? parseInt(tokens[1], 10) : NaN;
    const desigKey = tokens.length > 4
      ? `${tokens[2]}|${tokens[3]}|${tokens.slice(4).join(' ')}`.toLowerCase()
      : trimmed.toLowerCase();
    candidates.push({
      record: tokens[0],
      label: trimmed,
      desigKey,
      epochYear: Number.isNaN(epochYear) ? null : epochYear,
    });
  }
  return candidates;
}
