export const ROOT_VISUAL_PARAMETERS = {
  camera: {
    // Starting camera distance and the min/max zoom stops in scene units.
    defaultZ: 6.8,
    minZ: 3.7,
    maxZ: 9.2,
    // Small camera offset so the rendered root is not perfectly flat-centered.
    initialX: 0.05,
    initialY: 0.1,
  },

  units: {
    // Unit conversion used when turning measured diameters into scene radii.
    mmPerCm: 10,
  },

  rootLengthDensity: {
    // When enabled, RLD affects branch count and fine-root density.
    enabled: false,
  },

  diameterProfile: {
    // Number of Root.Length.Diameter.Range.N.mm columns to inspect.
    rangeColumnCount: 11,
    // Width of each diameter histogram bin in millimeters.
    rangeWidthMm: 0.5,
    // Converts a bin index to its center value: (index + 0.5) * bin width.
    rangeCenterOffset: 0.5,
    // Pulls average/median diameter toward the histogram-derived diameter.
    histogramBlend: 0.3,
    // Fallback used when a row has no usable diameter histogram.
    fallbackWeightedDiameterMm: 0.25,
    fallbackShares: { fine: 1, medium: 0, thick: 0, coarse: 0 },
    // Histogram bin grouping used to estimate fine/medium/thick/coarse shares.
    fineBinIndex: 0,
    mediumBinStart: 1,
    mediumBinEndExclusive: 3,
    thickBinStart: 2,
    coarseBinStart: 3,
  },

  diameterSceneRadius: {
    // Real root diameters are too thin to see, so radii are visually magnified.
    visualMagnification: 24,
    // Prevents roots from disappearing or becoming visually dominant.
    clamp: { min: 0.0025, max: 0.034 },
  },

  rootShape: {
    // Depth scale is rounded upward so models with similar depths align.
    depthScaleMinCm: 20,
    depthScaleRoundStepCm: 20,
    // Medium/thick diameter shares are blended into a structural diameter.
    structuralMediumWeight: 0.45,
    structuralThickWeight: 3.2,
    structuralMixClamp: { min: 0, max: 0.48 },
    // Maximum depth is compressed into this scene-height range.
    heightRange: { min: 2.2, max: 3.15 },
    heightDepthStartCm: 100,
    heightDepthSpanCm: 100,
    // Controls how wide the whole root system appears.
    spreadByLength: { min: 0.42, max: 0.88 },
    spreadNetworkMultiplier: { min: 0.9, max: 1.12 },
    spreadBiomassBonus: 0.1,
    // Top/bottom anchors as fractions of scene height.
    topHeightFraction: 0.48,
    bottomHeightFraction: -0.52,
    // Blends sample average diameter toward length-weighted median diameter.
    typicalDiameterMedianBlend: 0.55,
    baseRadiusMultiplier: 0.7,
  },

  modelPlacement: {
    // Gives each sample a slightly different starting angle in the grid.
    sampleRotationStep: 0.42,
    randomRotationJitter: 0.8,
    // Lowers the centered model slightly to leave visual space above the crown.
    centerLowering: 0.12,
  },

  crown: {
    // Root crown sphere size and biomass-driven growth in scene units.
    baseRadius: 0.055,
    biomassRadiusBonus: 0.045,
    yOffset: 0.04,
    widthSegments: 18,
    heightSegments: 12,
  },

  centralRoot: {
    // Control points for the primary downward root curve.
    topJitter: 0.026,
    upperJitter: 0.045,
    lowerJitter: 0.06,
    tipJitter: 0.08,
    upperDepthFraction: 0.24,
    lowerDepthFraction: 0.58,
    tipBottomLift: { min: 0.04, max: 0.16 },
    // Keeps the central root closer to typical diameter than max diameter.
    diameterStructuralBlend: 0.28,
    radiusBiomassMultiplier: { min: 0.42, max: 0.58 },
    tubularSegments: 20,
    radialSegments: 8,
  },

  basalRoots: {
    // Approximate number of upper basal roots, scaled by sample-level traits.
    countByLength: { min: 6, max: 11 },
    countBiomassMultiplier: { min: 0.92, max: 1.08 },
    countFineShareMultiplier: { min: 0.96, max: 1.08 },
    angleJitter: 0.34,
    endSpreadMultiplier: { min: 0.18, max: 0.58 },
    endYTopDepthFraction: 0.28,
    endYBottomLiftFraction: 0.16,
    startJitter: 0.04,
    startDepthFraction: 0.02,
    firstSpreadFraction: 0.22,
    firstDepthFraction: 0.16,
    secondSpreadFraction: 0.62,
    secondYBlend: 0.52,
    secondYJitter: 0.055,
    endYJitter: 0.05,
    radiusMultiplier: { min: 0.42, max: 0.68 },
    tubularSegments: 12,
    radialSegments: 6,
  },

  depthSegment: {
    // Converts avg_depth_cm into a vertical scene position.
    yTopInsetFraction: 0.07,
    yBottomLiftFraction: 0.04,
    // Diameter blending for lateral branches at this depth.
    typicalDiameterMedianBlend: 0.65,
    typicalDiameterProfileBlend: 0.18,
    structuralMediumWeight: 0.55,
    structuralThickWeight: 3.6,
    structuralMixClamp: { min: 0, max: 0.52 },
    // Base branch count per depth segment, mainly driven by segment length.
    branchCountByLength: { min: 3, max: 17 },
    branchPointCountMultiplier: { min: 0.86, max: 1.12 },
    tipCountMultiplier: { min: 0.9, max: 1.08 },
    depthCountMultiplier: { min: 1.06, max: 0.94 },
    rldCountMultiplier: { min: 0.55, max: 1.72 },
    branchFrequencyCountMultiplier: { min: 0.84, max: 1.18 },
    fineShareCountMultiplier: { min: 0.86, max: 1.12 },
    surfaceCountMultiplier: { min: 0.9, max: 1.08 },
    // Length and thickness adjustments from segment-level measurements.
    rldLengthScale: { min: 0.84, max: 1.21 },
    volumeRadiusScale: 0.026,
    // Fine-root density and length controls.
    fineRootBaseMultiplier: 1.05,
    fineRootRldMultiplier: { min: 0.55, max: 1.85 },
    fineRootFineShareMultiplier: { min: 0.9, max: 1.22 },
    fineRootSurfaceMultiplier: { min: 0.88, max: 1.14 },
    fineRootMedianDiameterMultiplier: { min: 1.18, max: 0.82 },
    fineRootBranchFrequencyMultiplier: { min: 0.72, max: 1.55 },
    fineRootLengthSurfaceMultiplier: { min: 0.86, max: 1.12 },
    fineRootLengthVolumeMultiplier: { min: 1.08, max: 0.9 },
  },

  lateralBranch: {
    // Branch starts near the central axis, then extends outward.
    startRadiusSpreadFraction: 0.13,
    randomLength: { min: 0.12, max: 0.62 },
    lengthBySegmentLength: { min: 0.54, max: 1.16 },
    lengthNetworkMultiplier: { min: 0.86, max: 1.14 },
    lengthThickShareMultiplier: { min: 1.04, max: 0.78 },
    lengthBranchFrequencyMultiplier: { min: 1.09, max: 0.83 },
    // Downward bend and horizontal twist of each lateral root.
    droop: { min: 0.045, max: 0.32 },
    droopDepthBase: 0.62,
    droopDepthScale: 0.82,
    twistBase: 0.46,
    twistPerimeterMultiplier: { min: 0.72, max: 1.24 },
    midLengthFraction: 0.52,
    midTwistFraction: 0.45,
    midDroopFraction: 0.35,
    startYJitter: 0.05,
    midYJitter: 0.04,
    endYJitter: 0.05,
    tubeRadiusMultiplier: { min: 0.52, max: 0.74 },
    tubularSegments: 8,
    radialSegments: 5,
  },

  fineRoots: {
    // Compresses large tip/branch counts into a drawable number of fine roots.
    tipsBranchesSqrtDivisor: 24,
    countClamp: { min: 1, max: 8 },
    randomCountMultiplier: { min: 0.55, max: 1.08 },
    // Fine roots attach along the outer 75% of a lateral branch.
    attachmentT: { min: 0.25, max: 1 },
    length: { min: 0.026, max: 0.12 },
    yDrop: { min: 0.02, max: 0.12 },
  },

  diameterSampling: {
    // Converts diameter-profile shares into probabilities for branch diameter.
    thickChanceScale: 0.75,
    thickChanceClamp: { min: 0, max: 0.22 },
    mediumChanceScale: 0.55,
    mediumChanceClamp: { min: 0, max: 0.36 },
    thickDiameterBlend: { min: 0.38, max: 0.74 },
    mediumDiameterBlend: { min: 0.14, max: 0.38 },
  },
};
