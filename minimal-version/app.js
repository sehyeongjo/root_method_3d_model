import * as THREE from "../vendor/three.module.js";
import * as XLSX from "../vendor/xlsx.mjs";
import { MINIMAL_VERSION_PARAMETERS } from "./parameters.js";

const DATA_FILE = "../clean roots rhizovision output.csv";
const TARGET_TREATMENTS = new Set(["1", "2"]);

const ROOT_COLUMNS = {
  treatmentId: "treatment_id",
  plotId: "plot_id",
  depthIntervalCm: "depth_interval_cm",
  depthCm: "avg_depth_cm",
  lengthMm: "Total.Root.Length.mm",
  tips: "Number.of.Root.Tips",
  branchPoints: "Number.of.Branch.Points",
  rldCmPerCm3: "RLDcm/cm3",
  branchingFrequencyPerMm: "Branching.frequency.per.mm",
  networkAreaMm2: "Network.Area.mm2",
  averageDiameterMm: "Average.Diameter.mm",
  medianDiameterMm: "Median.Diameter.mm",
  maximumDiameterMm: "Maximum.Diameter.mm",
  surfaceAreaMm2: "Surface.Area.mm2",
  volumeMm3: "Volume.mm3",
};

const DIAMETER_RANGE_COLUMNS = Array.from(
  { length: 10 },
  (_, index) => `Root.Length.Diameter.Range.${index + 1}.mm`,
);

const USED_VARIABLE_GROUPS = [
  "depth",
  "total root length",
  "RLD",
  "tips and branch points",
  "branching frequency",
  "average/median/maximum diameter",
  "diameter range profile",
  "network/surface/volume",
];

const viewers = [];
const grid = document.querySelector("#minimalVersionGrid");
const summary = document.querySelector("#modelSummary");
const clock = new THREE.Clock();

init();

async function init() {
  try {
    const rows = await loadCsvRows();
    const samples = buildRootSamples(rows);
    const ranges = buildDataRanges(samples);
    renderSummary(samples);
    renderSamples(samples, ranges);
    animate();
  } catch (error) {
    summary.textContent = `Could not load minimal version: ${error.message}`;
  }
}

async function loadCsvRows() {
  const response = await fetch(DATA_FILE, { cache: "no-store" });
  if (!response.ok) throw new Error(DATA_FILE);

  const workbook = XLSX.read(await response.text(), { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function buildRootSamples(rows) {
  const rowsBySample = new Map();

  rows.forEach((row) => {
    const treatmentId = textValue(row, ROOT_COLUMNS.treatmentId);
    const plotId = textValue(row, ROOT_COLUMNS.plotId);
    if (!TARGET_TREATMENTS.has(treatmentId) || !plotId) return;

    const key = sampleKey(treatmentId, plotId);
    if (!rowsBySample.has(key)) rowsBySample.set(key, []);
    rowsBySample.get(key).push(row);
  });

  return [...rowsBySample.entries()]
    .sort(([keyA], [keyB]) => sampleSortKey(keyA).localeCompare(sampleSortKey(keyB)))
    .map(([key, sampleRows]) => createRootSample(key, sampleRows));
}

function createRootSample(key, rows) {
  const segments = rows
    .map(createDepthSegment)
    .sort((segmentA, segmentB) => segmentA.depthCm - segmentB.depthCm);
  const [treatmentId, plotId] = key.split("-");

  return {
    treatmentId,
    plotId,
    key,
    segments,
    totals: {
      lengthCm: sumBy(segments, (segment) => segment.lengthCm),
      tips: sumBy(segments, (segment) => segment.tips),
      branchPoints: sumBy(segments, (segment) => segment.branchPoints),
      branchScore: sumBy(segments, (segment) => segment.branchScore),
      surfaceAreaMm2: sumBy(segments, (segment) => segment.surfaceAreaMm2),
      volumeMm3: sumBy(segments, (segment) => segment.volumeMm3),
      averageDiameterMm: weightedAverageBy(
        segments,
        (segment) => segment.averageDiameterMm,
        (segment) => segment.lengthCm,
      ),
      medianDiameterMm: weightedAverageBy(
        segments,
        (segment) => segment.medianDiameterMm,
        (segment) => segment.lengthCm,
      ),
      maximumDiameterMm: Math.max(...segments.map((segment) => segment.maximumDiameterMm)),
      maxDepthCm: Math.max(...segments.map((segment) => segment.depthCm)),
      fineShare: weightedAverageBy(
        segments,
        (segment) => segment.diameterProfile.fineShare,
        (segment) => segment.lengthCm,
      ),
      mediumShare: weightedAverageBy(
        segments,
        (segment) => segment.diameterProfile.mediumShare,
        (segment) => segment.lengthCm,
      ),
      thickShare: weightedAverageBy(
        segments,
        (segment) => segment.diameterProfile.thickShare,
        (segment) => segment.lengthCm,
      ),
      networkAreaMm2: weightedAverageBy(
        segments,
        (segment) => segment.networkAreaMm2,
        (segment) => segment.lengthCm,
      ),
    },
  };
}

function createDepthSegment(row) {
  const averageDiameterMm = numberValue(row, ROOT_COLUMNS.averageDiameterMm);
  const medianDiameterMm = numberValue(row, ROOT_COLUMNS.medianDiameterMm) || averageDiameterMm;
  const maximumDiameterMm = numberValue(row, ROOT_COLUMNS.maximumDiameterMm) || averageDiameterMm;
  const tips = numberValue(row, ROOT_COLUMNS.tips);
  const branchPoints = numberValue(row, ROOT_COLUMNS.branchPoints);

  return {
    depthIntervalCm: textValue(row, ROOT_COLUMNS.depthIntervalCm),
    depthCm: numberValue(row, ROOT_COLUMNS.depthCm),
    lengthCm: numberValue(row, ROOT_COLUMNS.lengthMm) / 10,
    tips,
    branchPoints,
    branchScore: Math.sqrt(tips + branchPoints),
    rldCmPerCm3: optionalNumberValue(row, ROOT_COLUMNS.rldCmPerCm3),
    branchingFrequencyPerMm: numberValue(row, ROOT_COLUMNS.branchingFrequencyPerMm),
    networkAreaMm2: numberValue(row, ROOT_COLUMNS.networkAreaMm2),
    averageDiameterMm,
    medianDiameterMm,
    maximumDiameterMm,
    surfaceAreaMm2: numberValue(row, ROOT_COLUMNS.surfaceAreaMm2),
    volumeMm3: numberValue(row, ROOT_COLUMNS.volumeMm3),
    diameterProfile: readDiameterProfile(row, averageDiameterMm, medianDiameterMm),
  };
}

function readDiameterProfile(row, averageDiameterMm, medianDiameterMm) {
  const lengths = DIAMETER_RANGE_COLUMNS.map((column) => numberValue(row, column));
  const totalLength = sumBy(lengths, (value) => value);
  if (!totalLength) {
    return {
      fineShare: 1,
      mediumShare: 0,
      thickShare: 0,
      coarseShare: 0,
      weightedDiameterMm: averageDiameterMm || medianDiameterMm || 0.25,
    };
  }

  const weightedDiameterMm =
    lengths.reduce((total, value, index) => total + value * ((index + 0.5) * 0.5), 0) / totalLength;

  return {
    fineShare: lengths[0] / totalLength,
    mediumShare: (lengths[1] + lengths[2]) / totalLength,
    thickShare: lengths.slice(2).reduce((total, value) => total + value, 0) / totalLength,
    coarseShare: lengths.slice(3).reduce((total, value) => total + value, 0) / totalLength,
    weightedDiameterMm: THREE.MathUtils.lerp(
      averageDiameterMm || medianDiameterMm || weightedDiameterMm,
      weightedDiameterMm,
      0.28,
    ),
  };
}

function buildDataRanges(samples) {
  const segments = samples.flatMap((sample) => sample.segments);
  const rldValues = segments
    .map((segment) => segment.rldCmPerCm3)
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    maxDepthCm: Math.max(...samples.map((sample) => sample.totals.maxDepthCm)),
    sampleLengthCm: bounds(samples.map((sample) => sample.totals.lengthCm)),
    sampleBranchScore: bounds(samples.map((sample) => sample.totals.branchScore)),
    segmentLengthCm: bounds(segments.map((segment) => segment.lengthCm)),
    segmentBranchScore: bounds(segments.map((segment) => segment.branchScore)),
    rldLog: rldValues.length ? bounds(rldValues.map((value) => Math.log1p(value))) : [0, 1],
    branchingFrequencyPerMm: bounds(segments.map((segment) => segment.branchingFrequencyPerMm)),
    networkAreaMm2: bounds(segments.map((segment) => segment.networkAreaMm2)),
    surfaceAreaMm2: bounds(segments.map((segment) => segment.surfaceAreaMm2)),
    volumeMm3: bounds(segments.map((segment) => segment.volumeMm3)),
    diameterMm: bounds([
      ...segments.map((segment) => segment.averageDiameterMm),
      ...segments.map((segment) => segment.medianDiameterMm),
      ...segments.map((segment) => segment.maximumDiameterMm),
    ]),
  };
}

function renderSummary(samples) {
  summary.textContent =
    `${samples.length} samples. Minimal version: estimated form, not a reconstruction. ` +
    `Variables: ${USED_VARIABLE_GROUPS.join(", ")}. ` +
    "Parameters control visual translation, including gravity-driven branch sag.";
}

function renderSamples(samples, ranges) {
  samples.forEach((sample, index) => {
    const panel = document.createElement("article");
    panel.className = "sample-panel";

    const stage = document.createElement("div");
    stage.className = "sample-stage";

    const footer = document.createElement("footer");
    footer.className = "sample-footer";

    const title = document.createElement("div");
    title.className = "sample-title";
    title.textContent = `Treatment ${sample.treatmentId} / Plot ${sample.plotId}`;

    const stats = document.createElement("div");
    stats.className = "sample-stats";
    stats.innerHTML =
      `<span>${formatNumber(sample.totals.maxDepthCm)} cm</span>` +
      `<span>${formatNumber(sample.totals.lengthCm, 1)} cm length</span>` +
      `<span>${formatNumber(sample.totals.tips)} tips</span>`;

    footer.append(title, stats);
    panel.append(stage, footer);
    grid.append(panel);

    viewers.push(createViewer(stage, sample, ranges, index));
  });
}

function createViewer(container, sample, ranges, index) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f8faf8");

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.04, MINIMAL_VERSION_PARAMETERS.scene.cameraZ);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x96a39e, 2.55));

  const sideLight = new THREE.DirectionalLight(0xffffff, 1.45);
  sideLight.position.set(2.4, 3.2, 3);
  scene.add(sideLight);

  const root = buildEstimatedRoot(sample, ranges, index);
  scene.add(root);
  scene.add(buildDepthAxis(root, sample.totals.maxDepthCm));

  const controls = createControls(container, root, camera);
  const resizeObserver = new ResizeObserver(() => resizeRenderer(container, renderer, camera));
  resizeObserver.observe(container);
  resizeRenderer(container, renderer, camera);

  return { scene, camera, renderer, controls, root, sample };
}

function buildEstimatedRoot(sample, ranges, index) {
  const rng = mulberry32(hashString(sample.key));
  const shape = createSampleShape(sample, ranges);
  const palette = treatmentPalette();
  const root = new THREE.Group();
  const centralPoints = createCentralRootPoints(shape, rng);
  const fineRootPositions = [];

  root.rotation.y = index * 0.23 + rng() * 0.42;
  addRootCrown(root, centralPoints[0], shape, palette);
  addCentralRoot(root, centralPoints, shape, palette);
  addBasalRoots(root, centralPoints, shape, ranges, rng, palette);

  sample.segments.forEach((segment, segmentIndex) => {
    addDepthSegmentBranches(root, fineRootPositions, centralPoints, segment, segmentIndex, shape, ranges, rng, palette);
  });

  addFineRootGeometry(root, fineRootPositions, palette);
  centerRoot(root);
  root.scale.setScalar(0.82);
  return root;
}

function createSampleShape(sample, ranges) {
  const lengthNormalized = normalize(sample.totals.lengthCm, ranges.sampleLengthCm);
  const branchScoreNormalized = normalize(sample.totals.branchScore, ranges.sampleBranchScore);
  const networkNormalized = normalize(sample.totals.networkAreaMm2, ranges.networkAreaMm2);
  const depthScaleMaxCm = Math.max(
    MINIMAL_VERSION_PARAMETERS.scene.depthRoundStepCm,
    Math.ceil(sample.totals.maxDepthCm / MINIMAL_VERSION_PARAMETERS.scene.depthRoundStepCm) *
      MINIMAL_VERSION_PARAMETERS.scene.depthRoundStepCm,
  );
  const depthNormalized = THREE.MathUtils.clamp(depthScaleMaxCm / ranges.maxDepthCm, 0, 1);
  const height = THREE.MathUtils.lerp(
    MINIMAL_VERSION_PARAMETERS.scene.heightMin,
    MINIMAL_VERSION_PARAMETERS.scene.heightMax,
    depthNormalized,
  );
  const top = height * MINIMAL_VERSION_PARAMETERS.shape.topFraction;
  const bottom = height * MINIMAL_VERSION_PARAMETERS.shape.bottomFraction;
  const spread =
    lerpRange(MINIMAL_VERSION_PARAMETERS.shape.spreadRange, lengthNormalized) *
    lerpRange(MINIMAL_VERSION_PARAMETERS.shape.networkSpreadMultiplier, networkNormalized);
  const typicalDiameterMm = THREE.MathUtils.lerp(
    sample.totals.averageDiameterMm,
    sample.totals.medianDiameterMm,
    0.55,
  );
  const structuralMix = clampRange(
    sample.totals.mediumShare * MINIMAL_VERSION_PARAMETERS.diameter.mediumWeight +
      sample.totals.thickShare * MINIMAL_VERSION_PARAMETERS.diameter.thickWeight,
    MINIMAL_VERSION_PARAMETERS.shape.structuralMixClamp,
  );
  const structuralDiameterMm = THREE.MathUtils.lerp(
    typicalDiameterMm,
    sample.totals.maximumDiameterMm,
    structuralMix,
  );

  return {
    sample,
    lengthNormalized,
    branchScoreNormalized,
    networkNormalized,
    depthScaleMaxCm,
    height,
    top,
    bottom,
    spread,
    fineShare: sample.totals.fineShare,
    mediumShare: sample.totals.mediumShare,
    thickShare: sample.totals.thickShare,
    typicalDiameterMm,
    structuralDiameterMm,
    baseRadius: diameterToSceneRadius(typicalDiameterMm, ranges),
  };
}

function createCentralRootPoints(shape, rng) {
  const sway = lerpRange(MINIMAL_VERSION_PARAMETERS.shape.centralSway, shape.lengthNormalized);

  return [
    new THREE.Vector3(jitter(rng, sway * 0.28), shape.top, jitter(rng, sway * 0.28)),
    new THREE.Vector3(jitter(rng, sway), THREE.MathUtils.lerp(shape.top, shape.bottom, 0.31), jitter(rng, sway)),
    new THREE.Vector3(
      jitter(rng, sway * 1.35),
      THREE.MathUtils.lerp(shape.top, shape.bottom, 0.68),
      jitter(rng, sway * 1.35),
    ),
    new THREE.Vector3(jitter(rng, sway * 1.7), shape.bottom, jitter(rng, sway * 1.7)),
  ];
}

function addRootCrown(root, topPoint, shape, palette) {
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(
      MINIMAL_VERSION_PARAMETERS.crown.baseRadius + shape.lengthNormalized * MINIMAL_VERSION_PARAMETERS.crown.lengthBonus,
      18,
      12,
    ),
    new THREE.MeshStandardMaterial({ color: palette.crown, roughness: 0.8 }),
  );
  crown.position.copy(topPoint);
  crown.position.y += 0.034;
  root.add(crown);
}

function addCentralRoot(root, centralPoints, shape, palette) {
  addTube(root, centralPoints, shape.baseRadius * 1.35, palette.main, 22, 8, shape.structuralDiameterMm);
}

function addBasalRoots(root, centralPoints, shape, ranges, rng, palette) {
  const count = Math.round(
    lerpRange(MINIMAL_VERSION_PARAMETERS.basal.countRange, shape.lengthNormalized) *
      THREE.MathUtils.lerp(0.92, 1.14, shape.branchScoreNormalized),
  );
  const radius = shape.baseRadius * MINIMAL_VERSION_PARAMETERS.basal.radiusMultiplier;
  const start = centralPoints[0];

  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + jitter(rng, 0.24);
    const length = shape.spread * lerpRange(MINIMAL_VERSION_PARAMETERS.basal.lengthRange, rng());
    const endY = start.y - shape.height * (0.1 + rng() * 0.18);
    const points = [
      start.clone().add(new THREE.Vector3(jitter(rng, 0.018), -0.025, jitter(rng, 0.018))),
      new THREE.Vector3(Math.cos(angle) * length * 0.34, start.y - shape.height * 0.08, Math.sin(angle) * length * 0.34),
      new THREE.Vector3(Math.cos(angle) * length, endY, Math.sin(angle) * length),
    ];

    addTube(root, points, radius, palette.main, 12, 6, shape.typicalDiameterMm);
  }
}

function addDepthSegmentBranches(root, fineRootPositions, centralPoints, segment, segmentIndex, shape, ranges, rng, palette) {
  const segmentShape = createSegmentShape(segment, shape, ranges);
  const branchCount = segmentShape.branchCount;
  const baseAngle = segmentIndex * 0.58 + rng() * Math.PI * 2;

  for (let i = 0; i < branchCount; i += 1) {
    const points = createLateralBranchPoints(centralPoints, segmentShape, shape, baseAngle, i, branchCount, rng);
    const diameterMm = sampleDiameterFromProfile(
      segment.diameterProfile,
      segmentShape.typicalDiameterMm,
      segment.medianDiameterMm,
      segmentShape.structuralDiameterMm,
      rng,
    );
    const radius =
      diameterToSceneRadius(diameterMm, ranges) * lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.radiusMultiplier, rng()) +
      segmentShape.volumeRadius;

    addTube(root, points, radius, palette.lateral, 9, 5, diameterMm);
    addFineRoots(fineRootPositions, points, segment, segmentShape, rng);
  }
}

function createSegmentShape(segment, shape, ranges) {
  const depthNormalized = THREE.MathUtils.clamp(segment.depthCm / shape.depthScaleMaxCm, 0, 1);
  const y = THREE.MathUtils.lerp(shape.top - shape.height * 0.06, shape.bottom + shape.height * 0.04, depthNormalized);
  const lengthNormalized = normalize(segment.lengthCm, ranges.segmentLengthCm);
  const branchScoreNormalized = normalize(segment.branchScore, ranges.segmentBranchScore);
  const hasRld = Number.isFinite(segment.rldCmPerCm3) && segment.rldCmPerCm3 > 0;
  const rldNormalized = hasRld ? normalize(Math.log1p(segment.rldCmPerCm3), ranges.rldLog) : 0.5;
  const branchFrequencyNormalized = normalize(segment.branchingFrequencyPerMm, ranges.branchingFrequencyPerMm);
  const networkNormalized = normalize(segment.networkAreaMm2, ranges.networkAreaMm2);
  const surfaceNormalized = normalize(segment.surfaceAreaMm2, ranges.surfaceAreaMm2);
  const volumeNormalized = normalize(segment.volumeMm3, ranges.volumeMm3);
  const typicalDiameterMm = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(segment.averageDiameterMm, segment.medianDiameterMm, 0.55),
    segment.diameterProfile.weightedDiameterMm,
    0.26,
  );
  const structuralMix = clampRange(
    segment.diameterProfile.mediumShare * MINIMAL_VERSION_PARAMETERS.diameter.mediumWeight +
      segment.diameterProfile.thickShare * MINIMAL_VERSION_PARAMETERS.diameter.thickWeight,
    MINIMAL_VERSION_PARAMETERS.shape.structuralMixClamp,
  );
  const structuralDiameterMm = THREE.MathUtils.lerp(typicalDiameterMm, segment.maximumDiameterMm, structuralMix);
  const diameterNormalized = normalize(typicalDiameterMm, ranges.diameterMm);
  const gravityLoad = calculateGravityLoad(
    lengthNormalized,
    depthNormalized,
    diameterNormalized,
    segment.diameterProfile.fineShare,
  );
  const baseBranchCount =
    lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.countByLength, lengthNormalized) *
    lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.branchFrequencyMultiplier, branchFrequencyNormalized) *
    lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.rldMultiplier, rldNormalized) *
    lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.tipBranchMultiplier, branchScoreNormalized) *
    lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.fineShareMultiplier, segment.diameterProfile.fineShare);

  return {
    depthNormalized,
    y,
    lengthNormalized,
    branchScoreNormalized,
    rldNormalized,
    branchFrequencyNormalized,
    networkNormalized,
    surfaceNormalized,
    volumeNormalized,
    typicalDiameterMm,
    structuralDiameterMm,
    branchCount: Math.max(2, Math.round(baseBranchCount)),
    branchLengthScale:
      lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.lengthBySegment, Math.sqrt(lengthNormalized)) *
      lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.rldLengthMultiplier, rldNormalized) *
      lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.depthLengthMultiplier, depthNormalized) *
      lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.networkLengthMultiplier, networkNormalized),
    volumeRadius: volumeNormalized * 0.016,
    gravityLoad,
    gravityDroop: gravityLoad * shape.height * MINIMAL_VERSION_PARAMETERS.gravity.branchDroopScale,
    fineRootGravityMultiplier: MINIMAL_VERSION_PARAMETERS.gravity.enabled
      ? lerpRange(MINIMAL_VERSION_PARAMETERS.gravity.fineRootDropMultiplier, THREE.MathUtils.clamp(gravityLoad, 0, 1))
      : 1,
    fineRootCountMultiplier:
      lerpRange(MINIMAL_VERSION_PARAMETERS.fineRoots.densityMultiplier, branchScoreNormalized) *
      lerpRange(MINIMAL_VERSION_PARAMETERS.fineRoots.fineShareMultiplier, segment.diameterProfile.fineShare) *
      lerpRange(MINIMAL_VERSION_PARAMETERS.fineRoots.surfaceMultiplier, surfaceNormalized),
  };
}

function createLateralBranchPoints(centralPoints, segmentShape, shape, baseAngle, index, branchCount, rng) {
  const centralPoint = pointOnCentralAxis(centralPoints, segmentShape.depthNormalized);
  const angle = baseAngle + (Math.PI * 2 * index) / branchCount + jitter(rng, 0.24);
  const startRadius = rng() * shape.spread * 0.08;
  const length = shape.spread * segmentShape.branchLengthScale * (0.52 + rng() * 0.48);
  const baseDroop =
    lerpRange(MINIMAL_VERSION_PARAMETERS.lateral.droopByDepth, segmentShape.depthNormalized) * (0.74 + rng() * 0.78);
  const gravityDroop = segmentShape.gravityDroop * (0.55 + Math.sqrt(segmentShape.lengthNormalized) * 0.45);
  const droop = baseDroop + gravityDroop;
  const twist = jitter(rng, 0.42);
  const start = new THREE.Vector3(
    centralPoint.x + Math.cos(angle) * startRadius,
    segmentShape.y + jitter(rng, 0.035),
    centralPoint.z + Math.sin(angle) * startRadius,
  );
  const mid = new THREE.Vector3(
    centralPoint.x + Math.cos(angle + twist * 0.38) * (startRadius + length * 0.5),
    start.y - baseDroop * 0.36 - gravityDroop * 0.58 + jitter(rng, 0.025),
    centralPoint.z + Math.sin(angle + twist * 0.38) * (startRadius + length * 0.5),
  );
  const end = new THREE.Vector3(
    centralPoint.x + Math.cos(angle + twist) * (startRadius + length),
    start.y - droop,
    centralPoint.z + Math.sin(angle + twist) * (startRadius + length),
  );

  return [start, mid, end];
}

function addTube(root, points, radius, color, tubularSegments, radialSegments, diameterMm) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.84,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.diameterMm = diameterMm;
  root.add(mesh);
}

function addFineRoots(positions, points, segment, segmentShape, rng) {
  const count = Math.round(
    Math.sqrt(segment.tips + segment.branchPoints) / MINIMAL_VERSION_PARAMETERS.fineRoots.countByTipBranchScore *
      segmentShape.fineRootCountMultiplier,
  );

  for (let i = 0; i < count; i += 1) {
    const t = THREE.MathUtils.lerp(0.34, 0.97, rng());
    const base = quadraticPoint(points[0], points[1], points[2], t);
    const angle = rng() * Math.PI * 2;
    const length = lerpRange(MINIMAL_VERSION_PARAMETERS.fineRoots.lengthRange, rng());
    const yDrop =
      lerpRange(MINIMAL_VERSION_PARAMETERS.fineRoots.yDropRange, rng()) * segmentShape.fineRootGravityMultiplier;

    positions.push(base.x, base.y, base.z);
    positions.push(base.x + Math.cos(angle) * length, base.y - yDrop, base.z + Math.sin(angle) * length);
  }
}

function calculateGravityLoad(lengthNormalized, depthNormalized, diameterNormalized, fineShare) {
  const gravity = MINIMAL_VERSION_PARAMETERS.gravity;
  if (!gravity.enabled) return 0;

  const thinDiameterAmount = 1 - diameterNormalized;
  const thinDiameterMultiplier = lerpRange(gravity.thinDiameterMultiplier, thinDiameterAmount);
  const load =
    gravity.strength *
    (lengthNormalized * gravity.lengthWeight +
      depthNormalized * gravity.depthWeight +
      fineShare * gravity.fineShareWeight) *
    thinDiameterMultiplier;

  return THREE.MathUtils.clamp(load, 0, 1.5);
}

function addFineRootGeometry(root, positions, palette) {
  if (!positions.length) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: palette.fine,
    transparent: true,
    opacity: 0.58,
  });
  root.add(new THREE.LineSegments(geometry, material));
}

function sampleDiameterFromProfile(profile, typicalDiameterMm, medianDiameterMm, structuralDiameterMm, rng) {
  const thickChance = THREE.MathUtils.clamp(profile.thickShare * 0.48, 0, 0.3);
  const mediumChance = THREE.MathUtils.clamp(profile.mediumShare * 0.38, 0, 0.34);
  const roll = rng();

  if (roll < thickChance) {
    return THREE.MathUtils.lerp(medianDiameterMm, structuralDiameterMm, THREE.MathUtils.lerp(0.36, 0.72, rng()));
  }

  if (roll < thickChance + mediumChance) {
    return THREE.MathUtils.lerp(typicalDiameterMm, structuralDiameterMm, THREE.MathUtils.lerp(0.16, 0.38, rng()));
  }

  return THREE.MathUtils.lerp(typicalDiameterMm, medianDiameterMm, rng());
}

function buildDepthAxis(root, maxDepthCm) {
  const box = new THREE.Box3().setFromObject(root);
  const top = box.max.y;
  const bottom = box.min.y;
  const axisMax = Math.max(
    MINIMAL_VERSION_PARAMETERS.scene.depthRoundStepCm,
    Math.ceil(maxDepthCm / MINIMAL_VERSION_PARAMETERS.scene.depthRoundStepCm) *
      MINIMAL_VERSION_PARAMETERS.scene.depthRoundStepCm,
  );
  const axisX = -1.48;
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0x52615d,
    transparent: true,
    opacity: 0.45,
  });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(axisX, top, 0),
    new THREE.Vector3(axisX, bottom, 0),
  ]);
  group.add(new THREE.Line(geometry, material));

  const tickStep = axisMax > 120 ? 50 : 20;
  for (let depth = 0; depth <= axisMax; depth += tickStep) {
    const y = THREE.MathUtils.lerp(top, bottom, depth / axisMax);
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(axisX, y, 0),
      new THREE.Vector3(axisX + 0.1, y, 0),
    ]);
    group.add(new THREE.Line(tickGeometry, material));

    const label = makeTextSprite(String(depth));
    label.position.set(axisX - 0.15, y, 0);
    group.add(label);
  }

  return group;
}

function makeTextSprite(text) {
  const fontSize = 42;
  const padding = 14;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = context.measureText(text);
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = fontSize + padding * 2;

  context.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#2d3836";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  const scale = 0.13;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  return sprite;
}

function createControls(container, root, camera) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let targetX = -0.18;
  let targetY = root.rotation.y;
  let targetZoom = MINIMAL_VERSION_PARAMETERS.scene.cameraZ;

  root.rotation.x = targetX;

  container.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    container.setPointerCapture(event.pointerId);
  });

  container.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    targetY += dx * 0.008;
    targetX = THREE.MathUtils.clamp(targetX + dy * 0.006, -0.78, 0.78);
  });

  const stopDrag = (event) => {
    dragging = false;
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  };

  container.addEventListener("pointerup", stopDrag);
  container.addEventListener("pointercancel", stopDrag);
  container.addEventListener("lostpointercapture", () => {
    dragging = false;
  });
  container.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      targetZoom = THREE.MathUtils.clamp(targetZoom + event.deltaY * 0.0025, 3.7, 7.8);
    },
    { passive: false },
  );

  return {
    idleSpin(delta) {
      if (!dragging) targetY += delta * 0.075;
    },
    update() {
      root.rotation.x += (targetX - root.rotation.x) * 0.15;
      root.rotation.y += (targetY - root.rotation.y) * 0.15;
      camera.position.z += (targetZoom - camera.position.z) * 0.16;
    },
  };
}

function animate() {
  const delta = clock.getDelta();
  viewers.forEach((viewer) => {
    viewer.controls.idleSpin(delta);
    viewer.controls.update();
    viewer.renderer.render(viewer.scene, viewer.camera);
  });
  requestAnimationFrame(animate);
}

function treatmentPalette() {
  return {
    main: 0x74624e,
    lateral: 0x74624e,
    fine: 0xa4967b,
    crown: 0x596154,
  };
}

function pointOnCentralAxis(points, depthShare) {
  const curve = new THREE.CatmullRomCurve3(points);
  return curve.getPoint(THREE.MathUtils.clamp(depthShare, 0, 1));
}

function quadraticPoint(a, b, c, t) {
  const inv = 1 - t;
  return new THREE.Vector3(
    inv * inv * a.x + 2 * inv * t * b.x + t * t * c.x,
    inv * inv * a.y + 2 * inv * t * b.y + t * t * c.y,
    inv * inv * a.z + 2 * inv * t * b.z + t * t * c.z,
  );
}

function centerRoot(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
}

function resizeRenderer(container, renderer, camera) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function diameterToSceneRadius(diameterMm, ranges) {
  return (
    THREE.MathUtils.lerp(
      MINIMAL_VERSION_PARAMETERS.diameter.minRadius,
      MINIMAL_VERSION_PARAMETERS.diameter.maxRadius,
      normalize(diameterMm, ranges.diameterMm),
    ) * MINIMAL_VERSION_PARAMETERS.diameter.visibleMagnification
  );
}

function bounds(values) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return [0, 1];
  return [Math.min(...finiteValues), Math.max(...finiteValues)];
}

function normalize(value, [min, max]) {
  if (max === min) return 0.5;
  return THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
}

function lerpRange(range, amount) {
  return THREE.MathUtils.lerp(range.min, range.max, amount);
}

function clampRange(value, range) {
  return THREE.MathUtils.clamp(value, range.min, range.max);
}

function jitter(rng, amount) {
  return (rng() - 0.5) * amount * 2;
}

function sampleKey(treatmentId, plotId) {
  return `${treatmentId}-${plotId}`;
}

function sampleSortKey(key) {
  const [treatmentId, plotId] = key.split("-");
  return `${String(Number(treatmentId)).padStart(4, "0")}-${String(Number(plotId)).padStart(4, "0")}`;
}

function textValue(row, key) {
  const value = row[key];
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(row, key) {
  const parsed = Number(textValue(row, key).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumberValue(row, key) {
  const value = textValue(row, key).replace(/,/g, "");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumBy(items, getValue) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function weightedAverageBy(items, getValue, getWeight) {
  const totalWeight = sumBy(items, getWeight) || 1;
  return sumBy(items, (item) => getValue(item) * getWeight(item)) / totalWeight;
}

function formatNumber(value, digits = 0) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

window.MINIMAL_VERSION_ROOT_VIEWERS = viewers;
