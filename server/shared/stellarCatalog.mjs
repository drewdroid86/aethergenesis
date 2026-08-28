// Shared stellar catalog and utilities

const PRESETS = [
  {
    name: "Sun",
    spectral_class: "G2V",
    mass_solar: 1.0,
    luminosity_solar: 1.0,
    temperature_K: 5778,
    radius_solar: 1.0,
    metallicity_Z: 0.02,
    distance_ly: 0.0000158,
    age_gyr: 4.6,
    known_planets: 8,
    habitable_zone_inner_au: 0.95,
    habitable_zone_outer_au: 1.37,
    chandrasekhar_relevant: true,
    literature_reference: "Carroll & Ostlie §13.2",
    planets: [
      { name: "Mercury", distance_au: 0.39, mass_earth: 0.055, radius_earth: 0.383, type: "rocky" },
      { name: "Venus", distance_au: 0.72, mass_earth: 0.815, radius_earth: 0.949, type: "rocky" },
      { name: "Earth", distance_au: 1.0, mass_earth: 1.0, radius_earth: 1.0, type: "rocky" },
      { name: "Mars", distance_au: 1.52, mass_earth: 0.107, radius_earth: 0.532, type: "rocky" },
      { name: "Jupiter", distance_au: 5.2, mass_earth: 317.8, radius_earth: 11.2, type: "gas_giant" },
      { name: "Saturn", distance_au: 9.58, mass_earth: 95.2, radius_earth: 9.45, type: "gas_giant" },
      { name: "Uranus", distance_au: 19.2, mass_earth: 14.5, radius_earth: 4.0, type: "gas_giant" },
      { name: "Neptune", distance_au: 30.05, mass_earth: 17.1, radius_earth: 3.88, type: "gas_giant" }
    ]
  },
  {
    name: "Proxima Centauri",
    spectral_class: "M5Ve",
    mass_solar: 0.122,
    luminosity_solar: 0.0017,
    temperature_K: 3042,
    radius_solar: 0.154,
    metallicity_Z: 0.015,
    distance_ly: 4.246,
    age_gyr: 4.85,
    known_planets: 3,
    habitable_zone_inner_au: 0.04,
    habitable_zone_outer_au: 0.08,
    chandrasekhar_relevant: false,
    literature_reference: "Anglada-Escudé et al. 2016",
    planets: [
      { name: "Proxima Centauri b", distance_au: 0.0485, mass_earth: 1.17, radius_earth: 1.03, type: "rocky" },
      { name: "Proxima Centauri c", distance_au: 1.48, mass_earth: 7.0, radius_earth: 2.1, type: "rocky" },
      { name: "Proxima Centauri d", distance_au: 0.029, mass_earth: 0.26, radius_earth: 0.81, type: "rocky" }
    ]
  },
  {
    name: "Sirius A",
    spectral_class: "A1V",
    mass_solar: 2.063,
    luminosity_solar: 25.4,
    temperature_K: 9940,
    radius_solar: 1.711,
    metallicity_Z: 0.03,
    distance_ly: 8.60,
    age_gyr: 0.24,
    known_planets: 0,
    habitable_zone_inner_au: 4.8,
    habitable_zone_outer_au: 8.5,
    chandrasekhar_relevant: true,
    literature_reference: "Liebert et al. 2005"
  },
  {
    name: "Betelgeuse",
    spectral_class: "M2Iab",
    mass_solar: 16.5,
    luminosity_solar: 126000.0,
    temperature_K: 3600,
    radius_solar: 764.0,
    metallicity_Z: 0.02,
    distance_ly: 640.0,
    age_gyr: 0.0085,
    known_planets: 0,
    habitable_zone_inner_au: 350.0,
    habitable_zone_outer_au: 620.0,
    chandrasekhar_relevant: true,
    literature_reference: "Joyce et al. 2020"
  },
  {
    name: "Kepler-442",
    spectral_class: "K5V",
    mass_solar: 0.61,
    luminosity_solar: 0.12,
    temperature_K: 4402,
    radius_solar: 0.60,
    metallicity_Z: 0.012,
    distance_ly: 1206.0,
    age_gyr: 2.9,
    known_planets: 1,
    habitable_zone_inner_au: 0.35,
    habitable_zone_outer_au: 0.62,
    chandrasekhar_relevant: false,
    literature_reference: "Torres et al. 2015",
    planets: [
      { name: "Kepler-442b", distance_au: 0.409, mass_earth: 2.3, radius_earth: 1.34, type: "rocky" }
    ]
  },
  {
    name: "Eta Carinae",
    spectral_class: "LBV",
    mass_solar: 100.0,
    luminosity_solar: 5000000.0,
    temperature_K: 30000,
    radius_solar: 60.0,
    metallicity_Z: 0.04,
    distance_ly: 7500.0,
    age_gyr: 0.003,
    known_planets: 0,
    habitable_zone_inner_au: 2100.0,
    habitable_zone_outer_au: 3700.0,
    chandrasekhar_relevant: true,
    literature_reference: "Davidson & Humphreys 1997"
  },
  {
    name: "61 Cygni A",
    spectral_class: "K5V",
    mass_solar: 0.70,
    luminosity_solar: 0.156,
    temperature_K: 4526,
    radius_solar: 0.665,
    metallicity_Z: 0.016,
    distance_ly: 11.4,
    age_gyr: 6.0,
    known_planets: 0,
    habitable_zone_inner_au: 0.38,
    habitable_zone_outer_au: 0.67,
    chandrasekhar_relevant: false,
    literature_reference: "Kervella et al. 2008"
  },
  {
    name: "Tau Ceti",
    spectral_class: "G8V",
    mass_solar: 0.783,
    luminosity_solar: 0.52,
    temperature_K: 5344,
    radius_solar: 0.793,
    metallicity_Z: 0.01,
    distance_ly: 11.9,
    age_gyr: 5.8,
    known_planets: 4,
    habitable_zone_inner_au: 0.68,
    habitable_zone_outer_au: 1.2,
    chandrasekhar_relevant: false,
    literature_reference: "Teixeira et al. 2009",
    planets: [
      { name: "Tau Ceti b", distance_au: 0.105, mass_earth: 2.0, radius_earth: 1.2, type: "rocky" },
      { name: "Tau Ceti g", distance_au: 0.133, mass_earth: 1.75, radius_earth: 1.1, type: "rocky" },
      { name: "Tau Ceti h", distance_au: 0.243, mass_earth: 1.83, radius_earth: 1.1, type: "rocky" },
      { name: "Tau Ceti e", distance_au: 0.538, mass_earth: 3.93, radius_earth: 1.5, type: "rocky" },
      { name: "Tau Ceti f", distance_au: 1.334, mass_earth: 3.93, radius_earth: 1.5, type: "rocky" }
    ]
  },
  {
    name: "Vega",
    spectral_class: "A0V",
    mass_solar: 2.135,
    luminosity_solar: 40.12,
    temperature_K: 9602,
    radius_solar: 2.362,
    metallicity_Z: 0.014,
    distance_ly: 25.0,
    age_gyr: 0.455,
    known_planets: 0,
    habitable_zone_inner_au: 6.0,
    habitable_zone_outer_au: 10.7,
    chandrasekhar_relevant: true,
    literature_reference: "Yoon et al. 2010"
  },
  {
    name: "Rigel",
    spectral_class: "B8Ia",
    mass_solar: 21.0,
    luminosity_solar: 120000.0,
    temperature_K: 12100,
    radius_solar: 78.9,
    metallicity_Z: 0.02,
    distance_ly: 860.0,
    age_gyr: 0.008,
    known_planets: 0,
    habitable_zone_inner_au: 330.0,
    habitable_zone_outer_au: 590.0,
    chandrasekhar_relevant: true,
    literature_reference: "Przybilla et al. 2006"
  },
  {
    name: "TRAPPIST-1",
    spectral_class: "M8V",
    mass_solar: 0.089,
    luminosity_solar: 0.000553,
    temperature_K: 2566,
    radius_solar: 0.121,
    metallicity_Z: 0.02,
    distance_ly: 40.66,
    age_gyr: 7.6,
    known_planets: 7,
    habitable_zone_inner_au: 0.022,
    habitable_zone_outer_au: 0.038,
    chandrasekhar_relevant: false,
    literature_reference: "Gillon et al. 2017",
    planets: [
      { name: "TRAPPIST-1 b", distance_au: 0.0115, mass_earth: 1.374, radius_earth: 1.116, type: "rocky" },
      { name: "TRAPPIST-1 c", distance_au: 0.0158, mass_earth: 1.308, radius_earth: 1.097, type: "rocky" },
      { name: "TRAPPIST-1 d", distance_au: 0.0223, mass_earth: 0.388, radius_earth: 0.788, type: "rocky" },
      { name: "TRAPPIST-1 e", distance_au: 0.0293, mass_earth: 0.692, radius_earth: 0.920, type: "rocky" },
      { name: "TRAPPIST-1 f", distance_au: 0.0385, mass_earth: 1.039, radius_earth: 1.045, type: "rocky" },
      { name: "TRAPPIST-1 g", distance_au: 0.0469, mass_earth: 1.321, radius_earth: 1.129, type: "rocky" },
      { name: "TRAPPIST-1 h", distance_au: 0.0619, mass_earth: 0.326, radius_earth: 0.755, type: "rocky" }
    ]
  },
  {
    name: "Kepler-186",
    spectral_class: "M",
    mass_solar: 0.54,
    luminosity_solar: 0.055,
    temperature_K: 3788,
    radius_solar: 0.52,
    metallicity_Z: 0.015,
    distance_ly: 582.0,
    age_gyr: 4.0,
    known_planets: 5,
    habitable_zone_inner_au: 0.22,
    habitable_zone_outer_au: 0.43,
    chandrasekhar_relevant: false,
    literature_reference: "Quintana et al. 2014",
    planets: [
      { name: "Kepler-186f", distance_au: 0.432, mass_earth: 1.4, radius_earth: 1.17, type: "rocky" }
    ]
  },
  {
    name: "Kepler-22b",
    spectral_class: "G5V",
    mass_solar: 0.97,
    luminosity_solar: 0.79,
    temperature_K: 5518,
    radius_solar: 0.98,
    metallicity_Z: 0.02,
    distance_ly: 635.0,
    age_gyr: 4.0,
    known_planets: 1,
    habitable_zone_inner_au: 0.85,
    habitable_zone_outer_au: 1.2,
    chandrasekhar_relevant: true,
    literature_reference: "Borucki et al. 2012",
    planets: [
      { name: "Kepler-22b", distance_au: 0.849, mass_earth: 8.3, radius_earth: 2.4, type: "rocky" }
    ]
  }
];

/**
 * Estimates stellar physical properties based on spectral class.
 */
function estimateParams(spType) {
  let mass = 1.0;
  let temp = 5778;
  let rad = 1.0;
  let lum = 1.0;
  let metallicity = 0.02;

  if (!spType) return { mass_solar: mass, temperature_K: temp, radius_solar: rad, luminosity_solar: lum, metallicity_Z: metallicity };

  const cleanSp = spType.trim().toUpperCase();
  const match = cleanSp.match(/^([OBAFGKM])([0-9])?/);
  if (match) {
    const letter = match[1];
    const num = match[2] ? parseInt(match[2], 10) : 5;

    const tempMap = {
      O: [50000, 30000],
      B: [30000, 10000],
      A: [10000, 7500],
      F: [7500, 6000],
      G: [6000, 5200],
      K: [5200, 3700],
      M: [3700, 2400]
    };
    const range = tempMap[letter];
    temp = range[1] + (range[0] - range[1]) * ((10 - num) / 10);

    const massMap = {
      O: [60, 16],
      B: [16, 2.1],
      A: [2.1, 1.4],
      F: [1.4, 1.04],
      G: [1.04, 0.8],
      K: [0.8, 0.45],
      M: [0.45, 0.08]
    };
    const mRange = massMap[letter];
    mass = mRange[1] + (mRange[0] - mRange[1]) * ((10 - num) / 10);

    const radMap = {
      O: [15, 6.6],
      B: [6.6, 1.8],
      A: [1.8, 1.4],
      F: [1.4, 1.15],
      G: [1.15, 0.96],
      K: [0.96, 0.7],
      M: [0.7, 0.1]
    };
    const rRange = radMap[letter];
    rad = rRange[1] + (rRange[0] - rRange[1]) * ((10 - num) / 10);

    // Morgan-Keenan luminosity classes:
    // I / Ia / Ib: Supergiants (x100 rad, x10 mass)
    // II: Bright Giants (x25 rad, x4 mass)
    // III: Giants (x10 rad, x1.5 mass)
    // IV: Subgiants (x2 rad, x1.2 mass)
    // V: Main Sequence (default 1x)
    // VI: Subdwarfs (x0.8 rad, x0.9 mass)
    // VII: White Dwarfs (x0.01 rad)
    if (/\bVII\b/.test(cleanSp)) {
      rad = rad * 0.01;
      mass = mass * 0.6;
    } else if (/\bVI\b/.test(cleanSp)) {
      rad = rad * 0.8;
      mass = mass * 0.9;
    } else if (/\bIV\b/.test(cleanSp)) {
      rad = rad * 2;
      mass = mass * 1.2;
    } else if (/\bIII\b/.test(cleanSp)) {
      rad = rad * 10;
      mass = mass * 1.5;
    } else if (/\bII\b/.test(cleanSp)) {
      rad = rad * 25;
      mass = mass * 4;
    } else if (/\bI[AB]\b|\bIAB\b|\bI\b|(?<![IV])I(?![IV])/i.test(cleanSp) && !/\b(II|III|IV|VI|VII)\b/.test(cleanSp)) {
      rad = rad * 100;
      mass = mass * 10;
    }

    const T_sun = 5778;
    lum = (rad * rad) * Math.pow(temp / T_sun, 4);
  }

  return {
    mass_solar: Number(mass.toFixed(2)),
    temperature_K: Math.round(temp),
    radius_solar: Number(rad.toFixed(2)),
    luminosity_solar: Number(lum.toFixed(4)),
    metallicity_Z: metallicity
  };
}

export { PRESETS, estimateParams };
