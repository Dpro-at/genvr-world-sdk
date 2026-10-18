# Core Library style coverage

The standalone source workspace keeps one catalog ID per item and declares the styles in which its look is available. The Studio and assistant filter that catalog by the current world style. Shared items may appear in several styles; Realistic-only models are omitted elsewhere.

The Island starter uses matching Realistic resources and an original wooden rowboat. The boat is an editable shore prop; driving and buoyancy are separate capabilities.

<!-- STYLE-COVERAGE:START -->
| Kind | Entries | blocky | voxel | anime | realistic | Why |
|---|---|---|---|---|---|---|
| 3d-models/parts | 4 | 4 shared | 4 shared | 4 shared | 4 shared | Plain shapes the builder sizes and colors: one look in every style. |
| 3d-models/nature | 44 | 5 own, 39 not needed | 5 own, 39 not needed | 39 not needed, 5 MISSING | 44 own | Each model has its own look per style (decision 101); real models only in Realistic (P2-38). |
| 3d-models/props-and-decor | 11 | 6 own, 5 not needed | 6 own, 5 not needed | 5 not needed, 6 MISSING | 7 own, 4 MISSING | Each model has its own look per style (decision 101); real models only in Realistic (P2-38). |
| 3d-models/structures | 8 | 3 own, 5 not needed | 3 own, 5 not needed | 5 not needed, 3 MISSING | 6 own, 2 MISSING | Each model has its own look per style (decision 101); real models only in Realistic (P2-38). |
| 3d-models/building-blocks | 1 | 1 shared | 1 shared | 1 shared | 1 shared | A plain grid block the builder colors: one look in every style. |
| 3d-models/gameplay | 4 | 4 shared | 4 shared | 4 shared | 4 shared | Game pieces are plain shapes: one look in every style. |
| 3d-models/walls | 1 | 1 own | 1 own | 1 shared | 1 shared | Drawn from its line: panels, and blocks in Voxel places (decision 102). |
| 3d-models/openings | 2 | 2 own | 2 own | 2 shared | 2 shared | Holes in a drawn wall: panels, and whole blocks in Voxel places (decision 102). |
| environment/water | 2 | 1 shared, 1 not needed | 1 shared, 1 not needed | 1 shared, 1 not needed | 2 shared | Pond tools share their listed styles; the ocean resource is Realistic-only with capability fallback. |
| environment/roads | 7 | 7 own | 7 own | 7 shared | 7 shared | Drawn from its line: a road surface, and blocks in Voxel places (decision 100). |
| environment/sky | 5 | 5 shared | 5 shared | 5 shared | 5 shared | One look in every style until skies per style (P2-31). |
| environment/weather | 6 | 6 shared | 6 shared | 6 shared | 6 shared | One look in every style until P2-32. |
| environment/surfaces | 6 | 6 shared | 6 shared | 6 shared | 6 shared | One look in every style until P2-32. |
| environment/ground | 59 | 59 not needed | 59 not needed | 59 not needed | 59 own | Real ground materials exist only in Realistic places; other styles draw the soil colors (P2-37). |
| environment/blocks | 12 | 12 not needed | 12 own | 12 not needed | 12 not needed | Ground blocks exist only in Voxel places (decision 99). |
| styles/style-packs | 4 | 1 own, 3 not needed | 1 own, 3 not needed | 1 own, 3 not needed | 1 own, 3 not needed | Each style pack is the look of one style. |
| avatar-appearance/animations | 27 | 27 shared | 27 shared | 27 shared | 27 shared | Moves are the same in every style (the skeleton does not change). |
| avatar-appearance/emotes | 11 | 11 shared | 11 shared | 11 shared | 11 shared | Moves are the same in every style (the skeleton does not change). |
| avatar-appearance/clothing | 8 | 8 own | 8 shared | 8 MISSING | 8 MISSING | Made per body fit; cube avatars in Voxel places wear the blocky fit (decision 104). |
| avatar-appearance/accessories | 9 | 9 own | 9 shared | 9 MISSING | 9 MISSING | Made per body fit; cube avatars in Voxel places wear the blocky fit (decision 104). |
| avatar-appearance/bodies | 8 | 8 shared | 8 shared | 8 shared | 8 shared | One body in every style; cube avatars change only the material (decision 104). |
<!-- STYLE-COVERAGE:END -->
