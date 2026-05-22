import * as THREE from "./vendor/three.module.js";
import * as XLSX from "./vendor/xlsx.mjs";

const DEFAULT_CAMERA_Z = 6.8;
const MIN_CAMERA_Z = 3.7;
const MAX_CAMERA_Z = 9.2;
const MM_PER_CM = 10;
const DIAMETER_VISUAL_MAGNIFICATION = 24;
const USE_RLD = false;
const DIAMETER_RANGE_WIDTH_MM = 0.5;
const DIAMETER_RANGE_COLUMNS = Array.from({ length: 11 }, (_, index) => `Root.Length.Diameter.Range.${index + 1}.mm`);

const DATA_FILES = {
  workbook: "./cleaned_root_data_april.xlsx",
  cleanCsv: "./clean roots rhizovision output.csv",
};

const TARGET_TREATMENTS = new Set(["1", "2"]);

let ROOT_DATA = [];
let LIMITS = null;

const viewers = [];
const grid = document.querySelector("#rootGrid");
const clock = new THREE.Clock();

init();

async function init() {
  ROOT_DATA = await loadRootData();
  LIMITS = buildLimits(ROOT_DATA);

  ROOT_DATA.forEach((item, index) => {
    const model = document.createElement("section");
    model.className = "root-model";

    const stage = document.createElement("div");
    stage.className = "root-stage";

    const label = document.createElement("div");
    label.className = "root-label";
    label.textContent = `Treatment ${item.treatment} / Plot ${item.plot}`;

    model.append(stage, label);
    grid.append(model);
    viewers.push(createViewer(stage, item, index));
  });

  animate();
}

function buildLimits(rootData) {
  const segments = rootData.flatMap((item) => item.segments);
  const rldValues = rootData.flatMap((item) => item.segments.map((segment) => segment[6]).filter(Number.isFinite));
  const hasRld = USE_RLD && rldValues.some((value) => value > 0);

  return {
    length: bounds(rootData.map((item) => item.summary[0])),
    tips: bounds(rootData.map((item) => item.summary[1])),
    branches: bounds(rootData.map((item) => item.summary[2])),
    biomass: bounds(rootData.map((item) => item.summary[3])),
    segmentLength: bounds(segments.map((segment) => segment[1])),
    hasRld,
    rldLog: hasRld ? bounds(rldValues.map((value) => Math.log1p(value))) : [0, 1],
    medianDiameter: bounds(segments.map((segment) => segment[7])),
    maxDiameter: bounds(segments.map((segment) => segment[8])),
    branchFrequency: bounds(segments.map((segment) => segment[9])),
    networkArea: bounds(segments.map((segment) => segment[11])),
    perimeterRatio: bounds(segments.map((segment) => segment[12] / Math.max(segment[1], 1))),
    surfaceArea: bounds(segments.map((segment) => segment[13])),
    volume: bounds(segments.map((segment) => segment[14])),
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

async function loadRootData() {
  const [cleanRows, biomassRows] = await Promise.all([loadCleanCsv(), loadRootBiomass()]);
  const plotSelection = getPlotSelection(cleanRows);
  const biomassByDepth = new Map();

  biomassRows.forEach((row) => {
    const key = sampleKey(row);
    const depth = textValue(row, "depth_interval_cm");
    biomassByDepth.set(`${key}-${depth}`, numberValue(row, "root_biomass_g"));
  });

  return plotSelection.map(([treatment, plot]) => {
    const key = `${treatment}-${plot}`;
    const rows = cleanRows
      .filter((row) => sampleKey(row) === key)
      .sort((a, b) => numberValue(a, "avg_depth_cm") - numberValue(b, "avg_depth_cm"));

    const segments = rows.map((row) => {
      const depthInterval = textValue(row, "depth_interval_cm");
      const averageDiameter = numberValue(row, "Average.Diameter.mm");
      const medianDiameter = numberValue(row, "Median.Diameter.mm") || averageDiameter;
      const maxDiameter = numberValue(row, "Maximum.Diameter.mm") || averageDiameter;
      const diameterProfile = readDiameterProfile(row, averageDiameter, medianDiameter);
      return [
        numberValue(row, "avg_depth_cm"),
        numberValue(row, "Total.Root.Length.mm"),
        numberValue(row, "Number.of.Root.Tips"),
        numberValue(row, "Number.of.Branch.Points"),
        averageDiameter,
        biomassByDepth.get(`${key}-${depthInterval}`) || 0,
        optionalNumberValue(row, "RLDcm/cm3"),
        medianDiameter,
        maxDiameter,
        numberValue(row, "Branching.frequency.per.mm"),
        diameterProfile,
        numberValue(row, "Network.Area.mm2"),
        numberValue(row, "Perimeter.mm"),
        numberValue(row, "Surface.Area.mm2"),
        numberValue(row, "Volume.mm3"),
      ];
    });

    const totalLength = sum(segments, 1);
    return {
      treatment,
      plot,
      side: rows[0] ? textValue(rows[0], "side") : "",
      summary: [
        totalLength,
        sum(segments, 2),
        sum(segments, 3),
        sum(segments, 5),
        weightedAverage(
          segments.map((segment) => segment[4]),
          segments.map((segment) => segment[1]),
        ),
        Math.max(...segments.map((segment) => segment[0])),
      ],
      segments,
    };
  }).filter((item) => item.segments.length > 0);
}

function getPlotSelection(rows) {
  const pairs = new Map();
  rows.forEach((row) => {
    const treatment = textValue(row, "treatment_id");
    const plot = textValue(row, "plot_id");
    if (TARGET_TREATMENTS.has(treatment) && plot) {
      pairs.set(`${treatment}-${plot}`, [treatment, plot]);
    }
  });

  return [...pairs.values()].sort(([treatmentA, plotA], [treatmentB, plotB]) => {
    const treatmentDiff = Number(treatmentA) - Number(treatmentB);
    if (treatmentDiff !== 0) return treatmentDiff;
    return Number(plotA) - Number(plotB);
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

function sampleKey(row) {
  return `${textValue(row, "treatment_id")}-${textValue(row, "plot_id")}`;
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

function readDiameterProfile(row, averageDiameter, medianDiameter) {
  const lengths = DIAMETER_RANGE_COLUMNS.map((column) => numberValue(row, column));
  const totalLength = lengths.reduce((total, value) => total + value, 0);
  if (!totalLength) {
    return {
      totalLength: 0,
      fineShare: 1,
      mediumShare: 0,
      thickShare: 0,
      coarseShare: 0,
      weightedDiameterMm: averageDiameter || medianDiameter || 0.25,
    };
  }

  const weightedDiameterMm =
    lengths.reduce((total, value, index) => total + value * diameterRangeCenterMm(index), 0) / totalLength;

  return {
    totalLength,
    fineShare: lengths[0] / totalLength,
    mediumShare: (lengths[1] + lengths[2]) / totalLength,
    thickShare: lengths.slice(2).reduce((total, value) => total + value, 0) / totalLength,
    coarseShare: lengths.slice(3).reduce((total, value) => total + value, 0) / totalLength,
    weightedDiameterMm: THREE.MathUtils.lerp(averageDiameter || medianDiameter || weightedDiameterMm, weightedDiameterMm, 0.3),
  };
}

function diameterRangeCenterMm(index) {
  return (index + 0.5) * DIAMETER_RANGE_WIDTH_MM;
}

function sum(rows, index) {
  return rows.reduce((total, row) => total + row[index], 0);
}

function createViewer(container, item, index) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f7f8f4");

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0.05, 0.1, DEFAULT_CAMERA_Z);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8b8172, 2.3));

  const key = `${item.treatment}-${item.plot}`;
  const root = buildRootSystem(item, index, key);
  scene.add(root);
  scene.add(buildDepthAxis(root, item.summary[5]));
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
  let targetZoom = DEFAULT_CAMERA_Z;

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
    const progress = (targetZoom - MIN_CAMERA_Z) / (MAX_CAMERA_Z - MIN_CAMERA_Z);
    const top = 11 + progress * Math.max(1, zoomControl.clientHeight - 22);
    zoomKnob.style.top = `${top}px`;
  };

  const setZoomFromPointer = (event) => {
    const rect = zoomControl.getBoundingClientRect();
    const trackTop = rect.top + 11;
    const trackBottom = rect.bottom - 11;
    const progress = THREE.MathUtils.clamp((event.clientY - trackTop) / Math.max(1, trackBottom - trackTop), 0, 1);
    targetZoom = THREE.MathUtils.lerp(MIN_CAMERA_Z, MAX_CAMERA_Z, progress);
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
    targetZoom = DEFAULT_CAMERA_Z;
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

function buildDepthAxis(root, maxDepth) {
  const box = new THREE.Box3().setFromObject(root);
  const top = box.max.y - 0.12;
  const bottom = box.min.y + 0.18;
  const axisMax = Math.ceil(maxDepth / 20) * 20;
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

function buildRootSystem(item, index, key) {
  const rng = mulberry32(hashString(key));
  const [totalLength, totalTips, totalBranches, biomass, avgDiameter, maxDepth] = item.summary;
  const lengthN = normalize(totalLength, LIMITS.length);
  const tipsN = normalize(totalTips, LIMITS.tips);
  const branchesN = normalize(totalBranches, LIMITS.branches);
  const biomassN = normalize(biomass, LIMITS.biomass);
  const itemMedianDiameter = weightedAverage(
    item.segments.map((segment) => segment[7]),
    item.segments.map((segment) => segment[1]),
  );
  const itemMaxDiameter = Math.max(...item.segments.map((segment) => segment[8]));
  const itemFineShare = weightedAverage(
    item.segments.map((segment) => segment[10].fineShare),
    item.segments.map((segment) => segment[1]),
  );
  const itemMediumShare = weightedAverage(
    item.segments.map((segment) => segment[10].mediumShare),
    item.segments.map((segment) => segment[1]),
  );
  const itemThickShare = weightedAverage(
    item.segments.map((segment) => segment[10].thickShare),
    item.segments.map((segment) => segment[1]),
  );
  const itemNetworkN = normalize(
    weightedAverage(
      item.segments.map((segment) => segment[11]),
      item.segments.map((segment) => segment[1]),
    ),
    LIMITS.networkArea,
  );
  const structuralMix = THREE.MathUtils.clamp(itemMediumShare * 0.45 + itemThickShare * 3.2, 0, 0.48);
  const itemStructuralDiameter = THREE.MathUtils.lerp(itemMedianDiameter, itemMaxDiameter, structuralMix);
  const depthScaleMaxCm = Math.ceil(maxDepth / 20) * 20;
  const height = THREE.MathUtils.lerp(2.2, 3.15, THREE.MathUtils.clamp((depthScaleMaxCm - 100) / 100, 0, 1));
  const cmToSceneScale = height / depthScaleMaxCm;
  const spread =
    THREE.MathUtils.lerp(0.42, 0.88, lengthN) * THREE.MathUtils.lerp(0.9, 1.12, itemNetworkN) + biomassN * 0.1;
  const top = height * 0.48;
  const bottom = -height * 0.52;
  const typicalDiameter = THREE.MathUtils.lerp(avgDiameter, itemMedianDiameter, 0.55);
  const radiusBase = diameterMmToSceneRadius(typicalDiameter, cmToSceneScale, 0.7);

  const root = new THREE.Group();
  root.rotation.y = index * 0.42 + rng() * 0.8;

  const mainMaterial = new THREE.MeshStandardMaterial({
    color: "#74624e",
    roughness: 0.86,
    metalness: 0.02,
  });
  const fineMaterial = new THREE.LineBasicMaterial({
    color: "#a4967b",
    transparent: true,
    opacity: 0.78,
  });
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: "#596154",
    roughness: 0.8,
  });

  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.055 + biomassN * 0.045, 18, 12), crownMaterial);
  crown.position.set(0, top + 0.04, 0);
  root.add(crown);

  const centralPoints = [
    new THREE.Vector3(jitter(rng, 0.026), top, jitter(rng, 0.026)),
    new THREE.Vector3(jitter(rng, 0.045), top - height * 0.24, jitter(rng, 0.045)),
    new THREE.Vector3(jitter(rng, 0.06), top - height * 0.58, jitter(rng, 0.06)),
    new THREE.Vector3(jitter(rng, 0.08), bottom + height * THREE.MathUtils.lerp(0.04, 0.16, rng()), jitter(rng, 0.08)),
  ];
  addTube(
    root,
    centralPoints,
    diameterMmToSceneRadius(THREE.MathUtils.lerp(typicalDiameter, itemStructuralDiameter, 0.28), cmToSceneScale, THREE.MathUtils.lerp(0.42, 0.58, biomassN)),
    mainMaterial,
    20,
    8,
    THREE.MathUtils.lerp(typicalDiameter, itemStructuralDiameter, 0.28),
  );

  const basalCount = Math.round(
    THREE.MathUtils.lerp(6, 11, lengthN) *
      THREE.MathUtils.lerp(0.92, 1.08, biomassN) *
      THREE.MathUtils.lerp(0.96, 1.08, itemFineShare),
  );
  for (let i = 0; i < basalCount; i += 1) {
    const angle = (Math.PI * 2 * i) / basalCount + rng() * 0.34;
    const endSpread = spread * THREE.MathUtils.lerp(0.18, 0.58, rng());
    const endY = THREE.MathUtils.lerp(top - height * 0.28, bottom + height * 0.16, rng());
    const points = [
      new THREE.Vector3(jitter(rng, 0.04), top - height * 0.02, jitter(rng, 0.04)),
      new THREE.Vector3(Math.cos(angle) * endSpread * 0.22, top - height * 0.16, Math.sin(angle) * endSpread * 0.22),
      new THREE.Vector3(Math.cos(angle) * endSpread * 0.62, (top + endY) * 0.52 + jitter(rng, 0.055), Math.sin(angle) * endSpread * 0.62),
      new THREE.Vector3(Math.cos(angle) * endSpread, endY + jitter(rng, 0.05), Math.sin(angle) * endSpread),
    ];
    addTube(root, points, radiusBase * THREE.MathUtils.lerp(0.42, 0.68, rng()), mainMaterial, 12, 6, typicalDiameter);
  }

  const finePositions = [];
  item.segments.forEach((segment) => {
    const [
      depth,
      length,
      tips,
      branches,
      diameter,
      segmentBiomass,
      rld,
      medianDiameter,
      maxDiameter,
      branchFrequency,
      diameterProfile,
      networkArea,
      perimeter,
      surfaceArea,
      volume,
    ] = segment;
    const depthN = THREE.MathUtils.clamp(depth / depthScaleMaxCm, 0, 1);
    const y = THREE.MathUtils.lerp(top - height * 0.07, bottom + height * 0.04, depthN);
    const localLengthN = normalize(length, LIMITS.segmentLength);
    const hasSegmentRld = LIMITS.hasRld && Number.isFinite(rld);
    const localRldN = hasSegmentRld ? normalize(Math.log1p(rld), LIMITS.rldLog) : 0.5;
    const localBiomassN = normalize(segmentBiomass, [0, 0.16]);
    const localMedianN = normalize(medianDiameter, LIMITS.medianDiameter);
    const localNetworkN = normalize(networkArea, LIMITS.networkArea);
    const localPerimeterN = normalize(perimeter / Math.max(length, 1), LIMITS.perimeterRatio);
    const localSurfaceN = normalize(surfaceArea, LIMITS.surfaceArea);
    const localVolumeN = normalize(volume, LIMITS.volume);
    const branchFrequencyN = normalize(branchFrequency, LIMITS.branchFrequency);
    const localTypicalDiameter = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(diameter, medianDiameter, 0.65),
      diameterProfile.weightedDiameterMm,
      0.18,
    );
    const localStructuralMix = THREE.MathUtils.clamp(diameterProfile.mediumShare * 0.55 + diameterProfile.thickShare * 3.6, 0, 0.52);
    const localStructuralDiameter = THREE.MathUtils.lerp(localTypicalDiameter, maxDiameter, localStructuralMix);
    const baseBranchCount =
      THREE.MathUtils.lerp(3, 17, localLengthN) *
        THREE.MathUtils.lerp(0.86, 1.12, branchesN) *
        THREE.MathUtils.lerp(0.9, 1.08, tipsN);
    const branchDepthBias = THREE.MathUtils.lerp(1.06, 0.94, depthN);
    const rldDensity = hasSegmentRld ? THREE.MathUtils.lerp(0.55, 1.72, localRldN) : 1;
    const rldLengthScale = hasSegmentRld ? THREE.MathUtils.lerp(0.84, 1.21, localRldN) : 1;
    const fineRldDensity = hasSegmentRld ? THREE.MathUtils.lerp(0.55, 1.85, localRldN) : 1;
    const profileDensity =
      THREE.MathUtils.lerp(0.86, 1.12, diameterProfile.fineShare) *
      THREE.MathUtils.lerp(0.9, 1.08, localSurfaceN);
    const branchFrequencyDensity = THREE.MathUtils.lerp(0.84, 1.18, branchFrequencyN);
    const branchCount = Math.round(baseBranchCount * branchDepthBias * rldDensity * branchFrequencyDensity * profileDensity);
    const volumeRadius = localVolumeN * cmToSceneScale * 0.026;

    for (let i = 0; i < branchCount; i += 1) {
      const angle = rng() * Math.PI * 2;
      const startRadius = rng() * spread * 0.13;
      const networkLengthScale = THREE.MathUtils.lerp(0.86, 1.14, localNetworkN);
      const thickClassLengthScale = THREE.MathUtils.lerp(1.04, 0.78, diameterProfile.thickShare);
      const sideLength =
        THREE.MathUtils.lerp(0.12, 0.62, rng()) *
        THREE.MathUtils.lerp(0.54, 1.16, localLengthN) *
        rldLengthScale *
        networkLengthScale *
        thickClassLengthScale *
        THREE.MathUtils.lerp(1.09, 0.83, branchFrequencyN);
      const droop = THREE.MathUtils.lerp(0.045, 0.32, rng()) * (0.62 + depthN * 0.82);
      const twist = (rng() - 0.5) * 0.46 * THREE.MathUtils.lerp(0.72, 1.24, localPerimeterN);
      const start = new THREE.Vector3(Math.cos(angle) * startRadius, y + jitter(rng, 0.05), Math.sin(angle) * startRadius);
      const mid = new THREE.Vector3(
        Math.cos(angle + twist * 0.45) * (startRadius + sideLength * 0.52),
        y - droop * 0.35 + jitter(rng, 0.04),
        Math.sin(angle + twist * 0.45) * (startRadius + sideLength * 0.52),
      );
      const end = new THREE.Vector3(
        Math.cos(angle + twist) * (startRadius + sideLength),
        y - droop + jitter(rng, 0.05),
        Math.sin(angle + twist) * (startRadius + sideLength),
      );

      const branchDiameter = sampleDiameterFromProfile(diameterProfile, localTypicalDiameter, medianDiameter, localStructuralDiameter, rng);
      const branchRadius =
        diameterMmToSceneRadius(
          branchDiameter,
          cmToSceneScale,
          THREE.MathUtils.lerp(0.52, 0.74, rng()),
        ) +
        volumeRadius;
      addTube(root, [start, mid, end], branchRadius, mainMaterial, 8, 5, branchDiameter);
      addFineRoots(
        finePositions,
        start,
        mid,
        end,
        tips,
        branches,
        rng,
        1.05 *
          fineRldDensity *
          THREE.MathUtils.lerp(0.9, 1.22, diameterProfile.fineShare) *
          THREE.MathUtils.lerp(0.88, 1.14, localSurfaceN) *
          THREE.MathUtils.lerp(1.18, 0.82, localMedianN) *
          THREE.MathUtils.lerp(0.72, 1.55, branchFrequencyN),
        THREE.MathUtils.lerp(0.86, 1.12, localSurfaceN) * THREE.MathUtils.lerp(1.08, 0.9, localVolumeN),
      );
    }
  });

  const fineGeometry = new THREE.BufferGeometry();
  fineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(finePositions, 3));
  root.add(new THREE.LineSegments(fineGeometry, fineMaterial));

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y -= 0.12;
  return root;
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
    THREE.MathUtils.clamp(Math.sqrt(tips + branches) / 24, 1, 8) * THREE.MathUtils.lerp(0.55, 1.08, rng()) * multiplier,
  );

  for (let i = 0; i < count; i += 1) {
    const t = THREE.MathUtils.lerp(0.25, 1, rng());
    const base = quadraticPoint(start, mid, end, t);
    const angle = rng() * Math.PI * 2;
    const length = THREE.MathUtils.lerp(0.026, 0.12, rng()) * lengthScale;
    const yDrop = THREE.MathUtils.lerp(0.02, 0.12, rng());
    positions.push(base.x, base.y, base.z);
    positions.push(base.x + Math.cos(angle) * length, base.y - yDrop, base.z + Math.sin(angle) * length);
  }
}

function sampleDiameterFromProfile(profile, averageDiameter, medianDiameter, structuralDiameter, rng) {
  const thickChance = THREE.MathUtils.clamp(profile.thickShare * 0.75, 0, 0.22);
  const mediumChance = THREE.MathUtils.clamp(profile.mediumShare * 0.55, 0, 0.36);
  const roll = rng();

  if (roll < thickChance) {
    return THREE.MathUtils.lerp(medianDiameter, structuralDiameter, THREE.MathUtils.lerp(0.38, 0.74, rng()));
  }

  if (roll < thickChance + mediumChance) {
    return THREE.MathUtils.lerp(averageDiameter, structuralDiameter, THREE.MathUtils.lerp(0.14, 0.38, rng()));
  }

  return THREE.MathUtils.lerp(averageDiameter, medianDiameter, rng());
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
  return [Math.min(...values), Math.max(...values)];
}

function normalize(value, [min, max]) {
  if (max === min) return 0.5;
  return THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
}

function weightedAverage(values, weights) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return values.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight;
}

function diameterMmToSceneRadius(diameterMm, cmToSceneScale, multiplier = 1) {
  const diameterCm = diameterMm / MM_PER_CM;
  const radius = (diameterCm / 2) * cmToSceneScale * DIAMETER_VISUAL_MAGNIFICATION * multiplier;
  return THREE.MathUtils.clamp(radius, 0.0025, 0.034);
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
