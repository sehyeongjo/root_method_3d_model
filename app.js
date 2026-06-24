import * as THREE from "./vendor/three.module.js";
import * as XLSX from "./vendor/xlsx.mjs";
import { ROOT_VISUAL_PARAMETERS } from "./root-visual-parameters.js";

const {
  camera: CAMERA_PARAMS,
  units: UNIT_PARAMS,
  rootLengthDensity: RLD_PARAMS,
  diameterProfile: DIAMETER_PROFILE_PARAMS,
  diameterSceneRadius: DIAMETER_SCENE_RADIUS_PARAMS,
  rootShape: ROOT_SHAPE_PARAMS,
  modelPlacement: MODEL_PLACEMENT_PARAMS,
  crown: CROWN_PARAMS,
  centralRoot: CENTRAL_ROOT_PARAMS,
  basalRoots: BASAL_ROOT_PARAMS,
  depthSegment: DEPTH_SEGMENT_PARAMS,
  lateralBranch: LATERAL_BRANCH_PARAMS,
  fineRoots: FINE_ROOT_PARAMS,
  diameterSampling: DIAMETER_SAMPLING_PARAMS,
} = ROOT_VISUAL_PARAMETERS;

const DIAMETER_RANGE_COLUMNS = Array.from(
  { length: DIAMETER_PROFILE_PARAMS.rangeColumnCount },
  (_, index) => `Root.Length.Diameter.Range.${index + 1}.mm`,
);

const DATA_FILES = {
  workbook: "./cleaned_root_data_april.xlsx",
  cleanCsv: "./clean roots rhizovision output.csv",
};

const ROOT_COLUMNS = {
  treatmentId: "treatment_id",
  plotId: "plot_id",
  depthIntervalCm: "depth_interval_cm",
  depthCm: "avg_depth_cm",
  lengthMm: "Total.Root.Length.mm",
  tips: "Number.of.Root.Tips",
  branchPoints: "Number.of.Branch.Points",
  averageDiameterMm: "Average.Diameter.mm",
  medianDiameterMm: "Median.Diameter.mm",
  maximumDiameterMm: "Maximum.Diameter.mm",
  rldCmPerCm3: "RLDcm/cm3",
  branchingFrequencyPerMm: "Branching.frequency.per.mm",
  networkAreaMm2: "Network.Area.mm2",
  perimeterMm: "Perimeter.mm",
  surfaceAreaMm2: "Surface.Area.mm2",
  volumeMm3: "Volume.mm3",
};

const BIOMASS_COLUMNS = {
  depthIntervalCm: "depth_interval_cm",
  rootBiomassG: "root_biomass_g",
};

const TARGET_TREATMENTS = new Set(["1", "2"]);

let ROOT_SAMPLES = [];
let DATA_RANGES = null;

const viewers = [];
const grid = document.querySelector("#rootGrid");
const clock = new THREE.Clock();

init();

async function init() {
  ROOT_SAMPLES = await loadRootSamples();
  DATA_RANGES = buildDataRanges(ROOT_SAMPLES);
  renderRootSamples(ROOT_SAMPLES);
  animate();
}

function renderRootSamples(samples) {
  samples.forEach((sample, index) => {
    const model = document.createElement("section");
    model.className = "root-model";

    const stage = document.createElement("div");
    stage.className = "root-stage";

    const label = document.createElement("div");
    label.className = "root-label";
    label.textContent = `Treatment ${sample.treatmentId} / Plot ${sample.plotId}`;

    model.append(stage, label);
    grid.append(model);
    viewers.push(createViewer(stage, sample, index));
  });
}

function buildDataRanges(samples) {
  const segments = samples.flatMap((sample) => sample.segments);
  const rldValues = segments.map((segment) => segment.rldCmPerCm3).filter(Number.isFinite);
  const hasRld = RLD_PARAMS.enabled && rldValues.some((value) => value > 0);

  return {
    sampleLengthMm: bounds(samples.map((sample) => sample.totals.lengthMm)),
    sampleTips: bounds(samples.map((sample) => sample.totals.tips)),
    sampleBranchPoints: bounds(samples.map((sample) => sample.totals.branchPoints)),
    sampleBiomassG: bounds(samples.map((sample) => sample.totals.biomassG)),
    segmentLengthMm: bounds(segments.map((segment) => segment.lengthMm)),
    hasRld,
    rldLog: hasRld ? bounds(rldValues.map((value) => Math.log1p(value))) : [0, 1],
    medianDiameterMm: bounds(segments.map((segment) => segment.medianDiameterMm)),
    maximumDiameterMm: bounds(segments.map((segment) => segment.maximumDiameterMm)),
    branchingFrequencyPerMm: bounds(segments.map((segment) => segment.branchingFrequencyPerMm)),
    networkAreaMm2: bounds(segments.map((segment) => segment.networkAreaMm2)),
    perimeterByLength: bounds(segments.map((segment) => segment.perimeterMm / Math.max(segment.lengthMm, 1))),
    surfaceAreaMm2: bounds(segments.map((segment) => segment.surfaceAreaMm2)),
    volumeMm3: bounds(segments.map((segment) => segment.volumeMm3)),
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

async function loadRootSamples() {
  const [cleanRows, biomassRows] = await Promise.all([loadCleanCsv(), loadRootBiomass()]);
  const biomassByDepth = buildBiomassLookup(biomassRows);

  return getSelectedSampleIds(cleanRows).flatMap(({ treatmentId, plotId }) => {
    const key = sampleKey(treatmentId, plotId);
    const rows = cleanRows
      .filter((row) => sampleKeyFromRow(row) === key)
      .sort((a, b) => numberValue(a, ROOT_COLUMNS.depthCm) - numberValue(b, ROOT_COLUMNS.depthCm));

    if (!rows.length) return [];

    const segments = rows.map((row) => createDepthSegment(row, key, biomassByDepth));
    return [createRootSample(treatmentId, plotId, segments)];
  });
}

function buildBiomassLookup(rows) {
  const biomassByDepth = new Map();

  rows.forEach((row) => {
    const key = sampleKeyFromRow(row);
    const depthInterval = textValue(row, BIOMASS_COLUMNS.depthIntervalCm);
    const biomass = numberValue(row, BIOMASS_COLUMNS.rootBiomassG);
    biomassByDepth.set(`${key}-${depthInterval}`, biomass);
  });

  return biomassByDepth;
}

function createDepthSegment(row, key, biomassByDepth) {
  const depthIntervalCm = textValue(row, ROOT_COLUMNS.depthIntervalCm);
  const averageDiameterMm = numberValue(row, ROOT_COLUMNS.averageDiameterMm);
  const medianDiameterMm = numberValue(row, ROOT_COLUMNS.medianDiameterMm) || averageDiameterMm;
  const maximumDiameterMm = numberValue(row, ROOT_COLUMNS.maximumDiameterMm) || averageDiameterMm;

  return {
    depthIntervalCm,
    depthCm: numberValue(row, ROOT_COLUMNS.depthCm),
    lengthMm: numberValue(row, ROOT_COLUMNS.lengthMm),
    tips: numberValue(row, ROOT_COLUMNS.tips),
    branchPoints: numberValue(row, ROOT_COLUMNS.branchPoints),
    averageDiameterMm,
    medianDiameterMm,
    maximumDiameterMm,
    biomassG: biomassByDepth.get(`${key}-${depthIntervalCm}`) || 0,
    rldCmPerCm3: optionalNumberValue(row, ROOT_COLUMNS.rldCmPerCm3),
    branchingFrequencyPerMm: numberValue(row, ROOT_COLUMNS.branchingFrequencyPerMm),
    networkAreaMm2: numberValue(row, ROOT_COLUMNS.networkAreaMm2),
    perimeterMm: numberValue(row, ROOT_COLUMNS.perimeterMm),
    surfaceAreaMm2: numberValue(row, ROOT_COLUMNS.surfaceAreaMm2),
    volumeMm3: numberValue(row, ROOT_COLUMNS.volumeMm3),
    diameterProfile: readDiameterProfile(row, averageDiameterMm, medianDiameterMm),
  };
}

function createRootSample(treatmentId, plotId, segments) {
  return {
    treatmentId,
    plotId,
    key: sampleKey(treatmentId, plotId),
    segments,
    totals: {
      lengthMm: sumBy(segments, (segment) => segment.lengthMm),
      tips: sumBy(segments, (segment) => segment.tips),
      branchPoints: sumBy(segments, (segment) => segment.branchPoints),
      biomassG: sumBy(segments, (segment) => segment.biomassG),
      averageDiameterMm: weightedAverageBy(
        segments,
        (segment) => segment.averageDiameterMm,
        (segment) => segment.lengthMm,
      ),
      maxDepthCm: Math.max(...segments.map((segment) => segment.depthCm)),
    },
  };
}

function getSelectedSampleIds(rows) {
  const samples = new Map();

  rows.forEach((row) => {
    const treatmentId = textValue(row, ROOT_COLUMNS.treatmentId);
    const plotId = textValue(row, ROOT_COLUMNS.plotId);
    if (TARGET_TREATMENTS.has(treatmentId) && plotId) {
      samples.set(sampleKey(treatmentId, plotId), { treatmentId, plotId });
    }
  });

  return [...samples.values()].sort((sampleA, sampleB) => {
    const treatmentDiff = Number(sampleA.treatmentId) - Number(sampleB.treatmentId);
    if (treatmentDiff !== 0) return treatmentDiff;
    return Number(sampleA.plotId) - Number(sampleB.plotId);
  });
}

async function loadCleanCsv() {
  const response = await fetchDataFile(DATA_FILES.cleanCsv);
  const workbook = XLSX.read(await response.text(), { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

async function loadRootBiomass() {
  const response = await fetchDataFile(DATA_FILES.workbook);
  const workbook = XLSX.read(await response.arrayBuffer());
  const sheet = workbook.Sheets["root biomass"];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

async function fetchDataFile(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load data file: ${path}`);
  }
  return response;
}

function sampleKeyFromRow(row) {
  return sampleKey(textValue(row, ROOT_COLUMNS.treatmentId), textValue(row, ROOT_COLUMNS.plotId));
}

function sampleKey(treatmentId, plotId) {
  return `${treatmentId}-${plotId}`;
}

function textValue(row, key) {
  const value = row[key];
  return value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(row, key) {
  const value = textValue(row, key).replace(/,/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumberValue(row, key) {
  const value = textValue(row, key).replace(/,/g, "");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDiameterProfile(row, averageDiameterMm, medianDiameterMm) {
  const lengths = DIAMETER_RANGE_COLUMNS.map((column) => numberValue(row, column));
  const totalLength = lengths.reduce((total, value) => total + value, 0);

  if (!totalLength) {
    return {
      totalLength: 0,
      fineShare: DIAMETER_PROFILE_PARAMS.fallbackShares.fine,
      mediumShare: DIAMETER_PROFILE_PARAMS.fallbackShares.medium,
      thickShare: DIAMETER_PROFILE_PARAMS.fallbackShares.thick,
      coarseShare: DIAMETER_PROFILE_PARAMS.fallbackShares.coarse,
      weightedDiameterMm:
        averageDiameterMm || medianDiameterMm || DIAMETER_PROFILE_PARAMS.fallbackWeightedDiameterMm,
    };
  }

  const weightedDiameterMm =
    lengths.reduce((total, value, index) => total + value * diameterRangeCenterMm(index), 0) / totalLength;

  return {
    totalLength,
    fineShare: lengths[DIAMETER_PROFILE_PARAMS.fineBinIndex] / totalLength,
    mediumShare:
      lengths
        .slice(DIAMETER_PROFILE_PARAMS.mediumBinStart, DIAMETER_PROFILE_PARAMS.mediumBinEndExclusive)
        .reduce((total, value) => total + value, 0) / totalLength,
    thickShare:
      lengths.slice(DIAMETER_PROFILE_PARAMS.thickBinStart).reduce((total, value) => total + value, 0) /
      totalLength,
    coarseShare:
      lengths.slice(DIAMETER_PROFILE_PARAMS.coarseBinStart).reduce((total, value) => total + value, 0) /
      totalLength,
    weightedDiameterMm: THREE.MathUtils.lerp(
      averageDiameterMm || medianDiameterMm || weightedDiameterMm,
      weightedDiameterMm,
      DIAMETER_PROFILE_PARAMS.histogramBlend,
    ),
  };
}

function diameterRangeCenterMm(index) {
  return (index + DIAMETER_PROFILE_PARAMS.rangeCenterOffset) * DIAMETER_PROFILE_PARAMS.rangeWidthMm;
}

function createViewer(container, sample, index) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f8f4");

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(CAMERA_PARAMS.initialX, CAMERA_PARAMS.initialY, CAMERA_PARAMS.defaultZ);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8b8172, 2.3));

  const root = buildRootSystem(sample, index);
  scene.add(root);
  scene.add(buildDepthAxis(root, sample.totals.maxDepthCm));
  const controls = createModelControls(renderer.domElement, container, root, camera);

  const side = new THREE.DirectionalLight(0xffffff, 2.2);
  side.position.set(2.5, 3, 4);
  scene.add(side);

  const back = new THREE.DirectionalLight(0xb7d3c8, 0.7);
  back.position.set(-3, 1.5, -3);
  scene.add(back);

  const resizeObserver = new ResizeObserver(() => resizeRenderer(container, renderer, camera));
  resizeObserver.observe(container);
  resizeRenderer(container, renderer, camera);

  return { scene, camera, renderer, controls, root };
}

function createModelControls(canvas, container, root, camera) {
  let dragging = false;
  let zoomDragging = false;
  let lastX = 0;
  let lastY = 0;
  const initialX = root.rotation.x;
  const initialY = root.rotation.y;
  let targetX = initialX;
  let targetY = initialY;
  let targetZoom = CAMERA_PARAMS.defaultZ;

  const zoomControl = document.createElement("div");
  zoomControl.className = "zoom-control";
  zoomControl.setAttribute("aria-label", "Zoom");

  const zoomTrack = document.createElement("div");
  zoomTrack.className = "zoom-track";

  const zoomKnob = document.createElement("button");
  zoomKnob.className = "zoom-knob";
  zoomKnob.type = "button";
  zoomKnob.setAttribute("aria-label", "Zoom");

  const diameterTooltip = document.createElement("div");
  diameterTooltip.className = "diameter-tooltip";

  const resetButton = document.createElement("button");
  resetButton.className = "reset-view";
  resetButton.type = "button";
  resetButton.setAttribute("aria-label", "Reset view");
  resetButton.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>';

  zoomControl.append(zoomTrack, zoomKnob);
  container.append(resetButton, zoomControl, diameterTooltip);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hoverTargets = [];
  root.traverse((object) => {
    if (object.userData.diameterMm) hoverTargets.push(object);
  });

  const stopUiEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const updateZoomKnob = () => {
    const progress = (targetZoom - CAMERA_PARAMS.minZ) / (CAMERA_PARAMS.maxZ - CAMERA_PARAMS.minZ);
    const top = 11 + progress * Math.max(1, zoomControl.clientHeight - 22);
    zoomKnob.style.top = `${top}px`;
  };

  const setZoomFromPointer = (event) => {
    const rect = zoomControl.getBoundingClientRect();
    const trackTop = rect.top + 11;
    const trackBottom = rect.bottom - 11;
    const progress = THREE.MathUtils.clamp((event.clientY - trackTop) / Math.max(1, trackBottom - trackTop), 0, 1);
    targetZoom = THREE.MathUtils.lerp(CAMERA_PARAMS.minZ, CAMERA_PARAMS.maxZ, progress);
    updateZoomKnob();
  };

  const hideDiameterTooltip = () => {
    diameterTooltip.classList.remove("is-visible");
  };

  const showDiameterTooltip = (event, diameterMm) => {
    const containerRect = container.getBoundingClientRect();
    diameterTooltip.textContent = `diam ${diameterMm.toFixed(3)} mm`;
    diameterTooltip.classList.add("is-visible");

    const tooltipWidth = diameterTooltip.offsetWidth || 82;
    const tooltipHeight = diameterTooltip.offsetHeight || 22;
    const left = THREE.MathUtils.clamp(event.clientX - containerRect.left + 10, 6, containerRect.width - tooltipWidth - 6);
    const top = THREE.MathUtils.clamp(event.clientY - containerRect.top - tooltipHeight - 8, 6, containerRect.height - tooltipHeight - 6);
    diameterTooltip.style.left = `${left}px`;
    diameterTooltip.style.top = `${top}px`;
  };

  const updateDiameterTooltip = (event) => {
    if (dragging || zoomDragging) {
      hideDiameterTooltip();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObjects(hoverTargets, false)[0];
    if (!hit) {
      hideDiameterTooltip();
      return;
    }

    showDiameterTooltip(event, hit.object.userData.diameterMm);
  };

  zoomControl.addEventListener("pointerdown", (event) => {
    stopUiEvent(event);
    hideDiameterTooltip();
    zoomDragging = true;
    setZoomFromPointer(event);
    zoomControl.setPointerCapture(event.pointerId);
  });

  zoomControl.addEventListener("pointermove", (event) => {
    if (!zoomDragging) return;
    stopUiEvent(event);
    setZoomFromPointer(event);
  });

  const stopZoom = (event) => {
    zoomDragging = false;
    if (zoomControl.hasPointerCapture(event.pointerId)) {
      zoomControl.releasePointerCapture(event.pointerId);
    }
  };

  zoomControl.addEventListener("pointerup", stopZoom);
  zoomControl.addEventListener("pointercancel", stopZoom);
  zoomControl.addEventListener("lostpointercapture", () => {
    zoomDragging = false;
  });

  resetButton.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  resetButton.addEventListener("click", (event) => {
    stopUiEvent(event);
    hideDiameterTooltip();
    targetX = initialX;
    targetY = initialY;
    targetZoom = CAMERA_PARAMS.defaultZ;
    updateZoomKnob();
  });

  canvas.addEventListener("pointerdown", (event) => {
    hideDiameterTooltip();
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    updateDiameterTooltip(event);
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    targetY += dx * 0.008;
    targetX = THREE.MathUtils.clamp(targetX + dy * 0.006, -0.58, 0.58);
  });

  const stopDragging = (event) => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  canvas.addEventListener("lostpointercapture", () => {
    dragging = false;
  });
  canvas.addEventListener("pointerleave", hideDiameterTooltip);

  const resizeObserver = new ResizeObserver(updateZoomKnob);
  resizeObserver.observe(zoomControl);
  updateZoomKnob();

  return {
    idleSpin(delta) {
      if (!dragging) targetY += delta * 0.12;
    },
    update() {
      root.rotation.x += (targetX - root.rotation.x) * 0.14;
      root.rotation.y += (targetY - root.rotation.y) * 0.14;
      camera.position.z += (targetZoom - camera.position.z) * 0.18;
    },
  };
}

function buildDepthAxis(root, maxDepthCm) {
  const box = new THREE.Box3().setFromObject(root);
  const top = box.max.y - 0.12;
  const bottom = box.min.y + 0.18;
  const axisMax = Math.max(20, Math.ceil(maxDepthCm / 20) * 20);
  const tickStep = axisMax <= 100 ? 20 : 50;
  const axisX = -1.72;
  const labelX = axisX + 0.28;
  const tickLength = 0.13;
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: "#6f7771",
    transparent: true,
    opacity: 0.82,
    depthTest: false,
  });

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(axisX, top, 0),
    new THREE.Vector3(axisX, bottom, 0),
  ]);
  const axisLine = new THREE.Line(lineGeometry, material);
  axisLine.renderOrder = 20;
  group.add(axisLine);

  for (let depth = 0; depth <= axisMax; depth += tickStep) {
    const y = THREE.MathUtils.lerp(top, bottom, depth / axisMax);
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(axisX, y, 0),
      new THREE.Vector3(axisX + tickLength, y, 0),
    ]);
    const tick = new THREE.Line(tickGeometry, material);
    tick.renderOrder = 20;
    group.add(tick);

    const label = makeTextSprite(String(depth), 54);
    label.position.set(labelX, y, 0);
    label.renderOrder = 21;
    group.add(label);
  }

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.1, 18),
    new THREE.MeshBasicMaterial({ color: "#6f7771", transparent: true, opacity: 0.82, depthTest: false }),
  );
  arrow.position.set(axisX, bottom - 0.06, 0);
  arrow.rotation.z = Math.PI;
  arrow.renderOrder = 20;
  group.add(arrow);

  return group;
}

function makeTextSprite(text, fontSize) {
  const padding = 18;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const metrics = context.measureText(text);
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = fontSize + padding * 2;

  context.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#2d3431";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  const scale = 0.16;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  return sprite;
}

function buildRootSystem(sample, index) {
  const rng = mulberry32(hashString(sample.key));
  const rootShape = createRootShape(sample);
  const materials = createRootMaterials();
  const root = new THREE.Group();
  root.rotation.y =
    index * MODEL_PLACEMENT_PARAMS.sampleRotationStep + rng() * MODEL_PLACEMENT_PARAMS.randomRotationJitter;

  addRootCrown(root, rootShape, materials.crown);
  addCentralRoot(root, rootShape, rng, materials.main);
  addBasalRoots(root, rootShape, rng, materials.main);

  const finePositions = [];
  sample.segments.forEach((segment) => {
    addDepthSegmentBranches(root, finePositions, segment, rootShape, rng, materials.main);
  });

  addFineRootGeometry(root, finePositions, materials.fine);
  centerRoot(root);
  return root;
}

function createRootShape(sample) {
  const lengthNormalized = normalize(sample.totals.lengthMm, DATA_RANGES.sampleLengthMm);
  const tipsNormalized = normalize(sample.totals.tips, DATA_RANGES.sampleTips);
  const branchPointsNormalized = normalize(sample.totals.branchPoints, DATA_RANGES.sampleBranchPoints);
  const biomassNormalized = normalize(sample.totals.biomassG, DATA_RANGES.sampleBiomassG);
  const medianDiameterMm = weightedAverageBy(
    sample.segments,
    (segment) => segment.medianDiameterMm,
    (segment) => segment.lengthMm,
  );
  const maximumDiameterMm = Math.max(...sample.segments.map((segment) => segment.maximumDiameterMm));
  const fineShare = weightedAverageBy(
    sample.segments,
    (segment) => segment.diameterProfile.fineShare,
    (segment) => segment.lengthMm,
  );
  const mediumShare = weightedAverageBy(
    sample.segments,
    (segment) => segment.diameterProfile.mediumShare,
    (segment) => segment.lengthMm,
  );
  const thickShare = weightedAverageBy(
    sample.segments,
    (segment) => segment.diameterProfile.thickShare,
    (segment) => segment.lengthMm,
  );
  const networkNormalized = normalize(
    weightedAverageBy(
      sample.segments,
      (segment) => segment.networkAreaMm2,
      (segment) => segment.lengthMm,
    ),
    DATA_RANGES.networkAreaMm2,
  );
  const structuralMix = clampRange(
    mediumShare * ROOT_SHAPE_PARAMS.structuralMediumWeight +
      thickShare * ROOT_SHAPE_PARAMS.structuralThickWeight,
    ROOT_SHAPE_PARAMS.structuralMixClamp,
  );
  const structuralDiameterMm = THREE.MathUtils.lerp(medianDiameterMm, maximumDiameterMm, structuralMix);
  const depthScaleMaxCm = Math.max(
    ROOT_SHAPE_PARAMS.depthScaleMinCm,
    Math.ceil(sample.totals.maxDepthCm / ROOT_SHAPE_PARAMS.depthScaleRoundStepCm) *
      ROOT_SHAPE_PARAMS.depthScaleRoundStepCm,
  );
  const height = lerpRange(
    ROOT_SHAPE_PARAMS.heightRange,
    THREE.MathUtils.clamp(
      (depthScaleMaxCm - ROOT_SHAPE_PARAMS.heightDepthStartCm) / ROOT_SHAPE_PARAMS.heightDepthSpanCm,
      0,
      1,
    ),
  );
  const cmToSceneScale = height / depthScaleMaxCm;
  const spread =
    lerpRange(ROOT_SHAPE_PARAMS.spreadByLength, lengthNormalized) *
      lerpRange(ROOT_SHAPE_PARAMS.spreadNetworkMultiplier, networkNormalized) +
    biomassNormalized * ROOT_SHAPE_PARAMS.spreadBiomassBonus;
  const top = height * ROOT_SHAPE_PARAMS.topHeightFraction;
  const bottom = height * ROOT_SHAPE_PARAMS.bottomHeightFraction;
  const typicalDiameterMm = THREE.MathUtils.lerp(
    sample.totals.averageDiameterMm,
    medianDiameterMm,
    ROOT_SHAPE_PARAMS.typicalDiameterMedianBlend,
  );
  const baseRadius = diameterMmToSceneRadius(
    typicalDiameterMm,
    cmToSceneScale,
    ROOT_SHAPE_PARAMS.baseRadiusMultiplier,
  );

  return {
    lengthNormalized,
    tipsNormalized,
    branchPointsNormalized,
    biomassNormalized,
    fineShare,
    structuralDiameterMm,
    depthScaleMaxCm,
    height,
    cmToSceneScale,
    spread,
    top,
    bottom,
    typicalDiameterMm,
    baseRadius,
  };
}

function createRootMaterials() {
  return {
    main: new THREE.MeshStandardMaterial({
      color: "#74624e",
      roughness: 0.86,
      metalness: 0.02,
    }),
    fine: new THREE.LineBasicMaterial({
      color: "#a4967b",
      transparent: true,
      opacity: 0.78,
    }),
    crown: new THREE.MeshStandardMaterial({
      color: "#596154",
      roughness: 0.8,
    }),
  };
}

function addRootCrown(root, rootShape, material) {
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(
      CROWN_PARAMS.baseRadius + rootShape.biomassNormalized * CROWN_PARAMS.biomassRadiusBonus,
      CROWN_PARAMS.widthSegments,
      CROWN_PARAMS.heightSegments,
    ),
    material,
  );
  crown.position.set(0, rootShape.top + CROWN_PARAMS.yOffset, 0);
  root.add(crown);
}

function addCentralRoot(root, rootShape, rng, material) {
  const points = [
    new THREE.Vector3(
      jitter(rng, CENTRAL_ROOT_PARAMS.topJitter),
      rootShape.top,
      jitter(rng, CENTRAL_ROOT_PARAMS.topJitter),
    ),
    new THREE.Vector3(
      jitter(rng, CENTRAL_ROOT_PARAMS.upperJitter),
      rootShape.top - rootShape.height * CENTRAL_ROOT_PARAMS.upperDepthFraction,
      jitter(rng, CENTRAL_ROOT_PARAMS.upperJitter),
    ),
    new THREE.Vector3(
      jitter(rng, CENTRAL_ROOT_PARAMS.lowerJitter),
      rootShape.top - rootShape.height * CENTRAL_ROOT_PARAMS.lowerDepthFraction,
      jitter(rng, CENTRAL_ROOT_PARAMS.lowerJitter),
    ),
    new THREE.Vector3(
      jitter(rng, CENTRAL_ROOT_PARAMS.tipJitter),
      rootShape.bottom + rootShape.height * lerpRange(CENTRAL_ROOT_PARAMS.tipBottomLift, rng()),
      jitter(rng, CENTRAL_ROOT_PARAMS.tipJitter),
    ),
  ];
  const diameterMm = THREE.MathUtils.lerp(
    rootShape.typicalDiameterMm,
    rootShape.structuralDiameterMm,
    CENTRAL_ROOT_PARAMS.diameterStructuralBlend,
  );
  const radius = diameterMmToSceneRadius(
    diameterMm,
    rootShape.cmToSceneScale,
    lerpRange(CENTRAL_ROOT_PARAMS.radiusBiomassMultiplier, rootShape.biomassNormalized),
  );

  addTube(
    root,
    points,
    radius,
    material,
    CENTRAL_ROOT_PARAMS.tubularSegments,
    CENTRAL_ROOT_PARAMS.radialSegments,
    diameterMm,
  );
}

function addBasalRoots(root, rootShape, rng, material) {
  const basalCount = Math.round(
    lerpRange(BASAL_ROOT_PARAMS.countByLength, rootShape.lengthNormalized) *
      lerpRange(BASAL_ROOT_PARAMS.countBiomassMultiplier, rootShape.biomassNormalized) *
      lerpRange(BASAL_ROOT_PARAMS.countFineShareMultiplier, rootShape.fineShare),
  );

  for (let i = 0; i < basalCount; i += 1) {
    const angle = (Math.PI * 2 * i) / basalCount + rng() * BASAL_ROOT_PARAMS.angleJitter;
    const endSpread = rootShape.spread * lerpRange(BASAL_ROOT_PARAMS.endSpreadMultiplier, rng());
    const endY = THREE.MathUtils.lerp(
      rootShape.top - rootShape.height * BASAL_ROOT_PARAMS.endYTopDepthFraction,
      rootShape.bottom + rootShape.height * BASAL_ROOT_PARAMS.endYBottomLiftFraction,
      rng(),
    );
    const points = [
      new THREE.Vector3(
        jitter(rng, BASAL_ROOT_PARAMS.startJitter),
        rootShape.top - rootShape.height * BASAL_ROOT_PARAMS.startDepthFraction,
        jitter(rng, BASAL_ROOT_PARAMS.startJitter),
      ),
      new THREE.Vector3(
        Math.cos(angle) * endSpread * BASAL_ROOT_PARAMS.firstSpreadFraction,
        rootShape.top - rootShape.height * BASAL_ROOT_PARAMS.firstDepthFraction,
        Math.sin(angle) * endSpread * BASAL_ROOT_PARAMS.firstSpreadFraction,
      ),
      new THREE.Vector3(
        Math.cos(angle) * endSpread * BASAL_ROOT_PARAMS.secondSpreadFraction,
        (rootShape.top + endY) * BASAL_ROOT_PARAMS.secondYBlend + jitter(rng, BASAL_ROOT_PARAMS.secondYJitter),
        Math.sin(angle) * endSpread * BASAL_ROOT_PARAMS.secondSpreadFraction,
      ),
      new THREE.Vector3(
        Math.cos(angle) * endSpread,
        endY + jitter(rng, BASAL_ROOT_PARAMS.endYJitter),
        Math.sin(angle) * endSpread,
      ),
    ];
    const radius = rootShape.baseRadius * lerpRange(BASAL_ROOT_PARAMS.radiusMultiplier, rng());
    addTube(
      root,
      points,
      radius,
      material,
      BASAL_ROOT_PARAMS.tubularSegments,
      BASAL_ROOT_PARAMS.radialSegments,
      rootShape.typicalDiameterMm,
    );
  }
}

function addDepthSegmentBranches(root, finePositions, segment, rootShape, rng, material) {
  const segmentShape = createDepthSegmentShape(segment, rootShape);

  for (let i = 0; i < segmentShape.branchCount; i += 1) {
    const points = createLateralBranchPoints(segment, segmentShape, rootShape, rng);
    const diameterMm = sampleDiameterFromProfile(
      segment.diameterProfile,
      segmentShape.typicalDiameterMm,
      segment.medianDiameterMm,
      segmentShape.structuralDiameterMm,
      rng,
    );
    const radius =
      diameterMmToSceneRadius(
        diameterMm,
        rootShape.cmToSceneScale,
        lerpRange(LATERAL_BRANCH_PARAMS.tubeRadiusMultiplier, rng()),
      ) +
      segmentShape.volumeRadius;

    addTube(
      root,
      points,
      radius,
      material,
      LATERAL_BRANCH_PARAMS.tubularSegments,
      LATERAL_BRANCH_PARAMS.radialSegments,
      diameterMm,
    );
    addFineRoots(
      finePositions,
      points[0],
      points[1],
      points[2],
      segment.tips,
      segment.branchPoints,
      rng,
      segmentShape.fineRootMultiplier,
      segmentShape.fineRootLengthScale,
    );
  }
}

function createDepthSegmentShape(segment, rootShape) {
  const depthNormalized = THREE.MathUtils.clamp(segment.depthCm / rootShape.depthScaleMaxCm, 0, 1);
  const y = THREE.MathUtils.lerp(
    rootShape.top - rootShape.height * DEPTH_SEGMENT_PARAMS.yTopInsetFraction,
    rootShape.bottom + rootShape.height * DEPTH_SEGMENT_PARAMS.yBottomLiftFraction,
    depthNormalized,
  );
  const lengthNormalized = normalize(segment.lengthMm, DATA_RANGES.segmentLengthMm);
  const hasRld = DATA_RANGES.hasRld && Number.isFinite(segment.rldCmPerCm3);
  const rldNormalized = hasRld ? normalize(Math.log1p(segment.rldCmPerCm3), DATA_RANGES.rldLog) : 0.5;
  const medianNormalized = normalize(segment.medianDiameterMm, DATA_RANGES.medianDiameterMm);
  const networkNormalized = normalize(segment.networkAreaMm2, DATA_RANGES.networkAreaMm2);
  const perimeterNormalized = normalize(segment.perimeterMm / Math.max(segment.lengthMm, 1), DATA_RANGES.perimeterByLength);
  const surfaceNormalized = normalize(segment.surfaceAreaMm2, DATA_RANGES.surfaceAreaMm2);
  const volumeNormalized = normalize(segment.volumeMm3, DATA_RANGES.volumeMm3);
  const branchFrequencyNormalized = normalize(segment.branchingFrequencyPerMm, DATA_RANGES.branchingFrequencyPerMm);
  const typicalDiameterMm = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(
      segment.averageDiameterMm,
      segment.medianDiameterMm,
      DEPTH_SEGMENT_PARAMS.typicalDiameterMedianBlend,
    ),
    segment.diameterProfile.weightedDiameterMm,
    DEPTH_SEGMENT_PARAMS.typicalDiameterProfileBlend,
  );
  const structuralMix = clampRange(
    segment.diameterProfile.mediumShare * DEPTH_SEGMENT_PARAMS.structuralMediumWeight +
      segment.diameterProfile.thickShare * DEPTH_SEGMENT_PARAMS.structuralThickWeight,
    DEPTH_SEGMENT_PARAMS.structuralMixClamp,
  );
  const structuralDiameterMm = THREE.MathUtils.lerp(typicalDiameterMm, segment.maximumDiameterMm, structuralMix);
  const baseBranchCount =
    lerpRange(DEPTH_SEGMENT_PARAMS.branchCountByLength, lengthNormalized) *
    lerpRange(DEPTH_SEGMENT_PARAMS.branchPointCountMultiplier, rootShape.branchPointsNormalized) *
    lerpRange(DEPTH_SEGMENT_PARAMS.tipCountMultiplier, rootShape.tipsNormalized);
  const branchCount = Math.round(
    baseBranchCount *
      lerpRange(DEPTH_SEGMENT_PARAMS.depthCountMultiplier, depthNormalized) *
      (hasRld ? lerpRange(DEPTH_SEGMENT_PARAMS.rldCountMultiplier, rldNormalized) : 1) *
      lerpRange(DEPTH_SEGMENT_PARAMS.branchFrequencyCountMultiplier, branchFrequencyNormalized) *
      lerpRange(DEPTH_SEGMENT_PARAMS.fineShareCountMultiplier, segment.diameterProfile.fineShare) *
      lerpRange(DEPTH_SEGMENT_PARAMS.surfaceCountMultiplier, surfaceNormalized),
  );

  return {
    depthNormalized,
    y,
    lengthNormalized,
    rldLengthScale: hasRld ? lerpRange(DEPTH_SEGMENT_PARAMS.rldLengthScale, rldNormalized) : 1,
    networkNormalized,
    perimeterNormalized,
    branchFrequencyNormalized,
    typicalDiameterMm,
    structuralDiameterMm,
    branchCount,
    volumeRadius: volumeNormalized * rootShape.cmToSceneScale * DEPTH_SEGMENT_PARAMS.volumeRadiusScale,
    fineRootMultiplier:
      DEPTH_SEGMENT_PARAMS.fineRootBaseMultiplier *
      (hasRld ? lerpRange(DEPTH_SEGMENT_PARAMS.fineRootRldMultiplier, rldNormalized) : 1) *
      lerpRange(DEPTH_SEGMENT_PARAMS.fineRootFineShareMultiplier, segment.diameterProfile.fineShare) *
      lerpRange(DEPTH_SEGMENT_PARAMS.fineRootSurfaceMultiplier, surfaceNormalized) *
      lerpRange(DEPTH_SEGMENT_PARAMS.fineRootMedianDiameterMultiplier, medianNormalized) *
      lerpRange(DEPTH_SEGMENT_PARAMS.fineRootBranchFrequencyMultiplier, branchFrequencyNormalized),
    fineRootLengthScale:
      lerpRange(DEPTH_SEGMENT_PARAMS.fineRootLengthSurfaceMultiplier, surfaceNormalized) *
      lerpRange(DEPTH_SEGMENT_PARAMS.fineRootLengthVolumeMultiplier, volumeNormalized),
  };
}

function createLateralBranchPoints(segment, segmentShape, rootShape, rng) {
  const angle = rng() * Math.PI * 2;
  const startRadius = rng() * rootShape.spread * LATERAL_BRANCH_PARAMS.startRadiusSpreadFraction;
  const sideLength =
    lerpRange(LATERAL_BRANCH_PARAMS.randomLength, rng()) *
    lerpRange(LATERAL_BRANCH_PARAMS.lengthBySegmentLength, segmentShape.lengthNormalized) *
    segmentShape.rldLengthScale *
    lerpRange(LATERAL_BRANCH_PARAMS.lengthNetworkMultiplier, segmentShape.networkNormalized) *
    lerpRange(LATERAL_BRANCH_PARAMS.lengthThickShareMultiplier, segment.diameterProfile.thickShare) *
    lerpRange(LATERAL_BRANCH_PARAMS.lengthBranchFrequencyMultiplier, segmentShape.branchFrequencyNormalized);
  const droop =
    lerpRange(LATERAL_BRANCH_PARAMS.droop, rng()) *
    (LATERAL_BRANCH_PARAMS.droopDepthBase + segmentShape.depthNormalized * LATERAL_BRANCH_PARAMS.droopDepthScale);
  const twist =
    (rng() - 0.5) *
    LATERAL_BRANCH_PARAMS.twistBase *
    lerpRange(LATERAL_BRANCH_PARAMS.twistPerimeterMultiplier, segmentShape.perimeterNormalized);
  const start = new THREE.Vector3(
    Math.cos(angle) * startRadius,
    segmentShape.y + jitter(rng, LATERAL_BRANCH_PARAMS.startYJitter),
    Math.sin(angle) * startRadius,
  );
  const mid = new THREE.Vector3(
    Math.cos(angle + twist * LATERAL_BRANCH_PARAMS.midTwistFraction) *
      (startRadius + sideLength * LATERAL_BRANCH_PARAMS.midLengthFraction),
    segmentShape.y - droop * LATERAL_BRANCH_PARAMS.midDroopFraction + jitter(rng, LATERAL_BRANCH_PARAMS.midYJitter),
    Math.sin(angle + twist * LATERAL_BRANCH_PARAMS.midTwistFraction) *
      (startRadius + sideLength * LATERAL_BRANCH_PARAMS.midLengthFraction),
  );
  const end = new THREE.Vector3(
    Math.cos(angle + twist) * (startRadius + sideLength),
    segmentShape.y - droop + jitter(rng, LATERAL_BRANCH_PARAMS.endYJitter),
    Math.sin(angle + twist) * (startRadius + sideLength),
  );

  return [start, mid, end];
}

function addFineRootGeometry(root, positions, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  root.add(new THREE.LineSegments(geometry, material));
}

function centerRoot(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y -= MODEL_PLACEMENT_PARAMS.centerLowering;
}

function addTube(group, points, radius, material, tubularSegments, radialSegments, diameterMm) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const mesh = new THREE.Mesh(geometry, material);
  if (diameterMm) {
    mesh.userData.diameterMm = diameterMm;
  }
  group.add(mesh);
}

function addFineRoots(positions, start, mid, end, tips, branches, rng, multiplier = 1, lengthScale = 1) {
  const count = Math.round(
    clampRange(Math.sqrt(tips + branches) / FINE_ROOT_PARAMS.tipsBranchesSqrtDivisor, FINE_ROOT_PARAMS.countClamp) *
      lerpRange(FINE_ROOT_PARAMS.randomCountMultiplier, rng()) *
      multiplier,
  );

  for (let i = 0; i < count; i += 1) {
    const t = lerpRange(FINE_ROOT_PARAMS.attachmentT, rng());
    const base = quadraticPoint(start, mid, end, t);
    const angle = rng() * Math.PI * 2;
    const length = lerpRange(FINE_ROOT_PARAMS.length, rng()) * lengthScale;
    const yDrop = lerpRange(FINE_ROOT_PARAMS.yDrop, rng());
    positions.push(base.x, base.y, base.z);
    positions.push(base.x + Math.cos(angle) * length, base.y - yDrop, base.z + Math.sin(angle) * length);
  }
}

function sampleDiameterFromProfile(profile, typicalDiameterMm, medianDiameterMm, structuralDiameterMm, rng) {
  const thickChance = clampRange(
    profile.thickShare * DIAMETER_SAMPLING_PARAMS.thickChanceScale,
    DIAMETER_SAMPLING_PARAMS.thickChanceClamp,
  );
  const mediumChance = clampRange(
    profile.mediumShare * DIAMETER_SAMPLING_PARAMS.mediumChanceScale,
    DIAMETER_SAMPLING_PARAMS.mediumChanceClamp,
  );
  const roll = rng();

  if (roll < thickChance) {
    return THREE.MathUtils.lerp(
      medianDiameterMm,
      structuralDiameterMm,
      lerpRange(DIAMETER_SAMPLING_PARAMS.thickDiameterBlend, rng()),
    );
  }

  if (roll < thickChance + mediumChance) {
    return THREE.MathUtils.lerp(
      typicalDiameterMm,
      structuralDiameterMm,
      lerpRange(DIAMETER_SAMPLING_PARAMS.mediumDiameterBlend, rng()),
    );
  }

  return THREE.MathUtils.lerp(typicalDiameterMm, medianDiameterMm, rng());
}

function quadraticPoint(a, b, c, t) {
  const inv = 1 - t;
  return new THREE.Vector3(
    inv * inv * a.x + 2 * inv * t * b.x + t * t * c.x,
    inv * inv * a.y + 2 * inv * t * b.y + t * t * c.y,
    inv * inv * a.z + 2 * inv * t * b.z + t * t * c.z,
  );
}

function resizeRenderer(container, renderer, camera) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
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

function sumBy(items, getValue) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function weightedAverageBy(items, getValue, getWeight) {
  const totalWeight = sumBy(items, getWeight) || 1;
  return items.reduce((total, item) => total + getValue(item) * getWeight(item), 0) / totalWeight;
}

function diameterMmToSceneRadius(diameterMm, cmToSceneScale, multiplier = 1) {
  const diameterCm = diameterMm / UNIT_PARAMS.mmPerCm;
  const radius =
    (diameterCm / 2) *
    cmToSceneScale *
    DIAMETER_SCENE_RADIUS_PARAMS.visualMagnification *
    multiplier;
  return clampRange(radius, DIAMETER_SCENE_RADIUS_PARAMS.clamp);
}

function jitter(rng, amount) {
  return (rng() - 0.5) * amount * 2;
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
