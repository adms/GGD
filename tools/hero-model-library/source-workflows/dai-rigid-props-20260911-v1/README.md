# Dai rigid sword props

Converts two acquired Shinteo Daz V2 rigid props: `Sword of Dai` and `Sword of Dai Back`. The original ZIP is pinned to `b2f64413b3abe50773bc57b08ff19f7dbf28d76257801edd13524f9e0cb44434`. This is the JUMP FORCE-labelled Daz community adaptation, not an Infinity Strash extraction. No Genesis body, hero IDs, skeleton, animation, registration or default is created.

## Replay

Run `convert.py --source <original Shinteo intake> --output <new directory>` with Python 3.10+, NumPy/Pillow from requirements.txt. It requires a new output directory and retains the full ZIP plus every referenced source file. Native geometry is emitted with all source triangles and UV seam overrides, with the original node pivot at the component origin and centimeters converted to meters. Right-handed Y-up and native longitudinal axes are preserved; no arbitrary character sizing or external attachment transform is applied.

From a dependency-equipped GGD checkout, run:

```sh
node --import tsx <this-tool-directory>/normalize_validate.mts <GGD-checkout> <conversion-directory>
python3 <this-tool-directory>/verify_geometry.py <conversion-directory>
python3 <this-tool-directory>/render.py <conversion-directory>/outputs/handheld/component.glb <new-preview-directory> --repo <GGD-checkout>
```

Repeat the last command for the back component and each retained `intermediate/<prop>/source-materials.glb` when comparing texture reduction. The renderer is an isolated headless Chrome localhost server, never the user's browser session. It writes three actual Babylon WebGL camera views and material/texture receipts. Existing dependencies used: GGD's installed Babylon/esbuild/gltf-validator/tsx, system FFmpeg and Chrome. Validation pins exact shared contract source hashes and tool versions; no contract code is changed.

For deterministic proof, replay converter and normalization into a second new directory. `freeze_delivery.py <first-directory> --replay <second-directory>` verifies identical native and normalized GLB bytes, validates rendering receipts, compares 800px screenshots, freezes delivery metadata, and copies these scripts into local backup material. The current frozen delivery uses preview folders `webgl-handheld-256-r2`, `webgl-back-256`, `webgl-handheld-native`, `webgl-back-native`. The initial sandbox-denied preview attempt is retained separately.

## Material and validation scope

Two source-opaque material groups remain separate. The converter reads DUF scene overrides over original material-library channels. It preserves base-color and normal sources, packs grayscale roughness into G and metallic into B, and maps layered glossy weight and its texture to the allowed `KHR_materials_specular`. Source names containing “Glass” do not imply transparency: the actual source has Cutout Opacity 1 and Refraction Weight 0.

The native-resolution stage is intermediate. The final stage uses the actual GGD `normalizeUploadedModel`, `resizeImageWithFfmpeg`, `inspectModelUpload` and `heroModelBudgetIssues`. Current hard texture cap is read from the GGD contract (256 pixels), rather than weakened in the converter. Every geometry accessor byte and material JSON entry is checked for preservation across normalization. Independent checks compare every position/UV against the original DSF faces, plus unit normals and orthogonal tangents.

This is a portable PBR interpretation. Exact Daz Iray layered-gloss and tangent-space normal parity has not been established against a Daz source render. No body fit, attachment, runtime selection, deployment or full-character readiness is claimed. The source stores no explicit normals, so normals are reconstructed using the authored smoothing angle. These limitations must accompany any independent component admission.

## Primary format references

- [DSON units and coordinates](https://docs.daz3d.com/public/dson_spec/format_description/units_coordinate_systems/start)
- [DSON geometry](https://docs.daz3d.com/public/dson_spec/object_definitions/geometry/start)
- [DSON polygon](https://docs.daz3d.com/public/dson_spec/object_definitions/polygon/start)
- [DSON UV sets and per-polygon vertex overrides](https://docs.daz3d.com/public/dson_spec/object_definitions/uv_set/start)
- [Shinteo source page](https://www.patreon.com/posts/dai-for-g8m-and-66623597)
