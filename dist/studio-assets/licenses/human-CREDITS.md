# Human base data: sources and licences (CHAR-02)

Our bake (`bake.ts`, `anime-style.ts`, our own code) reads these data files; no MakeHuman / MPFB program code is
used or copied. Raw files are downloaded by `fetch.mjs` into `source/` (Git-ignored) from the MPFB 2 repository
(github.com/makehumancommunity/mpfb2, commit d0a32e57a7f915cb2f2b95410e2117648c7bbb7e). Only the baked
`platform/apps/web/public/human/human-base.bin` and the generated joint table are committed.

Repository licence (LICENSE.md section C): the assets (base mesh and proxies, targets and modifiers, rigs, JSON
mesh data) are released under CC0 1.0 Universal (LICENSE.ASSETS.md); the program code is GPL-3 and is not used.

| File | Licence |
|---|---|
| `3dobjs/base.obj` (base mesh: body and tights helper) | CC0 1.0 (MPFB 2 assets) |
| `mesh_metadata/basemesh_vertex_groups.json` | CC0 1.0 (MPFB 2 assets) |
| `rigs/standard/rig.mixamo.json` (joint vertex sets) | CC0 1.0 (MPFB 2 assets) |
| `rigs/standard/weights.mixamo.json` (skin weights) | CC0 1.0; the file itself states `"license": "CC0"` |
| `targets/macrodetails/caucasian-male-young.target.gz`, `caucasian-male-child.target.gz` | CC0 1.0 (MPFB 2 assets) |
| `targets/macrodetails/universal-male-{young,child}-averagemuscle-minweight.target.gz` | CC0 1.0 (MPFB 2 assets) |
| `targets/macrodetails/universal-male-{young,child}-{max,min}muscle-minweight`, `-averagemuscle-maxweight` (muscle and fat) | CC0 1.0 (MPFB 2 assets) |
| `targets/{arms,legs,torso,stomach,buttocks,hip,neck,head,cheek}/*` listed in `build-targets.mjs` (muscle groups, fat regions) | CC0 1.0 (MPFB 2 assets) |

Credit: MakeHuman team (www.makehumancommunity.org). Credit appears only in licence and credits files (naming rule).
| `targets/{eyes,eyebrows,nose,mouth,cheek,chin,head}/*` listed in `build-targets.mjs` `FACE_TARGETS` (face controls, FACE-01) | CC0 1.0 (MPFB 2 assets) |
