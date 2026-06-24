# Root Method 3D Model Demo

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


## Third-Party Open Source Software

This project uses the following open-source libraries:

* **Three.js** - Licensed under the [MIT License](https://github.com/mrdoob/three.js). Copyright © 2010-2026 three.js authors.
* **SheetJS** - Licensed under the [Apache License 2.0](https://github.com/sheetjs/sheetjs). Copyright (C) 2012-present SheetJS LLC.
