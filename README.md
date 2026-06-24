# Root Method 3D Model Demo

This demo is associated with the Root Methods PhD course held at Aarhus University, Viborg (AU Viborg), from 18–22 May 2026. Related course material is available on [Zenodo](https://zenodo.org/records/20542454).

## Root Model Composition

The model does not directly classify CSV rows as central roots, lateral roots, dicot roots, or monocot roots. Instead, it uses the CSV measurements to procedurally generate a root system from sample-level summaries and depth-level segments.

This code applies visual and structural limitations to maintain a basic root-system form. It should be understood as a data-driven visualization model that interprets CSV summary statistics as a 3D root shape, rather than as a reconstruction of the exact biological root topology.

1. Root crown

   The root crown is a small sphere that represents the starting point or crown area of the root system. It is created by [`addRootCrown`](./app.js#L748). Its size changes slightly according to the normalized biomass value, so samples with higher biomass can appear with a larger crown.

2. Central root

   The central root is not generated from each CSV row. Instead, one main tube is created from sample-level representative values. In [`addCentralRoot`](./app.js#L761), four control points are placed from the top of the model toward the bottom and connected with `TubeGeometry`.

   Its thickness is calculated by blending sample-level diameter information, including average diameter, median diameter, maximum diameter, and the diameter range profile. The overall depth and height of the central structure are based on the sample's `maxDepthCm`.

3. Basal roots

   Basal roots are thicker roots that spread outward from the upper central area. They are created by [`addBasalRoots`](./app.js#L806). Their count is approximately in the range of 6 to 11, and it changes according to sample-level values such as `Total.Root.Length.mm`, biomass, and fine root share.

   These roots are not read as separate basal-root rows from the CSV. They are generated from the overall sample shape.

4. Lateral branches

   Lateral branches are the part most directly connected to the CSV depth rows. Each `depth_interval_cm` row becomes one depth segment, and lateral branches are generated for each segment by [`addDepthSegmentBranches`](./app.js#L856).

   In [`createDepthSegmentShape`](./app.js#L899), `avg_depth_cm` is converted into the vertical `y` position of that segment. Segment-level values such as `Total.Root.Length.mm`, `Number.of.Root.Tips`, `Number.of.Branch.Points`, `Branching.frequency.per.mm`, `Surface.Area.mm2`, `Volume.mm3`, `Network.Area.mm2`, and the diameter profile are used to determine:

   - how many lateral branches appear at that depth
   - how far they extend
   - how thick they are
   - how many fine roots are attached

## Minimal Version

The [`minimal-version`](./minimal-version/) folder contains a separate reduced-parameter estimated root model. The main demo is also CSV/data driven; the difference is that the minimal version uses a smaller subset of the cleaned Rhizovision CSV variables and does not use the workbook biomass values or the larger `root-visual-parameters.js` visual-parameter system.

- [`minimal-version/index.html`](./minimal-version/index.html) opens the minimal version page.
- [`minimal-version/app.js`](./minimal-version/app.js) loads `clean roots rhizovision output.csv`, groups rows by treatment and plot, and builds one estimated root system for each selected sample.
- [`minimal-version/parameters.js`](./minimal-version/parameters.js) contains the minimal version's visual translation parameters, including gravity-driven branch sag.
- [`minimal-version/styles.css`](./minimal-version/styles.css) contains the layout and responsive styling for the minimal version.

The minimal version should be read as an estimated/procedural root architecture, not as a reconstruction of the exact scanned root topology. It is meant to show how much root-like structure can be generated when the parameter set is reduced, while still using CSV summary measurements.

The main inputs are:

- depth information from `depth_interval_cm` and `avg_depth_cm`
- root quantity from `Total.Root.Length.mm` and `RLDcm/cm3`
- branching signal from `Number.of.Root.Tips`, `Number.of.Branch.Points`, and `Branching.frequency.per.mm`
- diameter structure from `Average.Diameter.mm`, `Median.Diameter.mm`, `Maximum.Diameter.mm`, and `Root.Length.Diameter.Range.*.mm`
- size/complexity cues from `Network.Area.mm2`, `Surface.Area.mm2`, and `Volume.mm3`

The minimal version translates these values into a central root, basal roots, depth-based lateral branches, and fine roots. Its parameters control the visual translation from CSV summary statistics into a plausible root form; they do not add measured topology that is absent from the CSV. The gravity parameters make longer, deeper, finer branches sag more strongly, which gives the estimated architecture a more physical downward tendency without changing the underlying data.

## Third-Party Open Source Software

This project uses the following open-source libraries:

* **Three.js** - Licensed under the [MIT License](https://github.com/mrdoob/three.js). Copyright © 2010-2026 three.js authors.
* **SheetJS** - Licensed under the [Apache License 2.0](https://github.com/sheetjs/sheetjs). Copyright (C) 2012-present SheetJS LLC.
