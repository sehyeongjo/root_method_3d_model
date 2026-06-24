export const MINIMAL_VERSION_PARAMETERS = {
  scene: {
    heightMin: 2.35,
    heightMax: 3.45,
    cameraZ: 5.55,
    depthRoundStepCm: 20,
  },

  shape: {
    spreadRange: { min: 0.42, max: 1.08 },
    networkSpreadMultiplier: { min: 0.92, max: 1.14 },
    topFraction: 0.48,
    bottomFraction: -0.52,
    centralSway: { min: 0.035, max: 0.11 },
    structuralMixClamp: { min: 0, max: 0.62 },
  },

  diameter: {
    minRadius: 0.008,
    maxRadius: 0.035,
    visibleMagnification: 1.0,
    mediumWeight: 0.32,
    thickWeight: 1.18,
  },

  crown: {
    baseRadius: 0.045,
    lengthBonus: 0.03,
  },

  basal: {
    countRange: { min: 4, max: 8 },
    lengthRange: { min: 0.44, max: 0.92 },
    radiusMultiplier: 0.78,
  },

  lateral: {
    countByLength: { min: 3, max: 14 },
    branchFrequencyMultiplier: { min: 0.82, max: 1.22 },
    rldMultiplier: { min: 0.84, max: 1.36 },
    tipBranchMultiplier: { min: 0.86, max: 1.28 },
    fineShareMultiplier: { min: 0.92, max: 1.2 },
    lengthBySegment: { min: 0.18, max: 1.16 },
    rldLengthMultiplier: { min: 0.9, max: 1.16 },
    depthLengthMultiplier: { min: 1.03, max: 0.78 },
    networkLengthMultiplier: { min: 0.92, max: 1.12 },
    droopByDepth: { min: 0.035, max: 0.22 },
    radiusMultiplier: { min: 0.52, max: 0.78 },
  },

  fineRoots: {
    countByTipBranchScore: 95,
    densityMultiplier: { min: 0.75, max: 1.45 },
    fineShareMultiplier: { min: 0.9, max: 1.35 },
    surfaceMultiplier: { min: 0.85, max: 1.3 },
    lengthRange: { min: 0.034, max: 0.13 },
    yDropRange: { min: 0.018, max: 0.09 },
  },

  gravity: {
    enabled: true,
    // Root segments with longer reach, finer diameters, and deeper placement sag more.
    strength: 0.9,
    branchDroopScale: 0.075,
    lengthWeight: 0.58,
    depthWeight: 0.24,
    fineShareWeight: 0.18,
    thinDiameterMultiplier: { min: 0.78, max: 1.22 },
    fineRootDropMultiplier: { min: 1.02, max: 1.46 },
  },
};
