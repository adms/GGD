import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Color4, LoadAssetContainerAsync, Camera } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas = document.querySelector('canvas');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const save = async (name, data) => {
  const response = await fetch('/save/' + name, { method: 'POST', body: JSON.stringify(data) });
  if (!response.ok) throw new Error('failed to save ' + name);
};
const safeName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

try {
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(.15, .18, .23, 1);
  const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2, 5, new Vector3(0, .9, 0), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = .001;
  camera.maxZ = 100;
  const light = new HemisphericLight('key', new Vector3(.25, 1, .4), scene);
  light.intensity = 1.3;
  light.groundColor.set(.4, .4, .4);
  const container = await LoadAssetContainerAsync('/body.glb', scene, { pluginExtension: '.glb', pluginOptions: { gltf: { animationStartMode: 0 } } });
  container.addAllToScene();
  await scene.whenReadyAsync();
  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices());
  const retargeted = container.animationGroups.filter((group) => group.name.startsWith('retargeted_ANP3_'));
  if (retargeted.length !== 162) throw new Error('expected 162 retargeted animation groups; got ' + retargeted.length);
  const sampleIndexes = [0, 16, 50, 90, 130, 161];
  const shots = [];
  for (const index of sampleIndexes) {
    const clip = retargeted[index];
    for (const other of container.animationGroups) other.stop();
    clip.start(false);
    clip.pause();
    for (const fraction of [0, .5, 1]) {
      clip.goToFrame(clip.from + (clip.to - clip.from) * fraction);
      for (const node of scene.transformNodes) node.computeWorldMatrix(true);
      for (const skeleton of container.skeletons) skeleton.prepare(true);
      scene.render();
      let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity), finite = true;
      for (const mesh of meshes) {
        const positions = mesh.getPositionData(true, true), world = mesh.computeWorldMatrix(true);
        for (let offset = 0; offset < positions.length; offset += 3) {
          const point = Vector3.TransformCoordinates(new Vector3(positions[offset], positions[offset + 1], positions[offset + 2]), world);
          finite &&= point.asArray().every(Number.isFinite);
          min = Vector3.Minimize(min, point);
          max = Vector3.Maximize(max, point);
        }
      }
      if (!finite) throw new Error('non-finite posed vertices for ' + clip.name + ' at ' + fraction);
      const span = Math.max(max.y - min.y, max.x - min.x, max.z - min.z, 1.8), size = span * .62;
      camera.setTarget(min.add(max).scale(.5));
      camera.orthoLeft = -size; camera.orthoRight = size; camera.orthoTop = size; camera.orthoBottom = -size;
      for (const [view, angle] of [Math.PI / 2, 0].entries()) {
        camera.alpha = angle;
        scene.render();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        scene.render();
        const name = safeName(clip.name) + '-' + Math.round(fraction * 100) + '-' + view + '.png';
        await save(name, { png: canvas.toDataURL('image/png').split(',')[1] });
        shots.push({ name, animationIndex: index, clip: clip.name, fraction, view, finite, bounds: { min: min.asArray(), max: max.asArray() } });
      }
    }
  }
  await save('proof.json', { schema: 'ggd-mai-anp3-retarget-webgl-proof@1', method: 'Actual Babylon WebGL skin-deformation render; six evenly distributed unnamed ANP3 clips at start, midpoint, and endpoint from front and side', babylonVersion: Engine.Version, expectedRetargetedClipCount: 162, sampledAnimationIndexes: sampleIndexes, meshCount: meshes.length, bones: container.skeletons.map((skeleton) => skeleton.bones.length), textures: scene.textures.map((texture) => ({ name: texture.name, ready: texture.isReady(), size: texture.getSize() })), shots, nativeMotion: false, gameplayAcceptance: false });
  scene.dispose();
  engine.dispose();
  await fetch('/done', { method: 'POST' });
} catch (error) {
  await save('error.json', { message: String(error), stack: error.stack });
  await fetch('/done', { method: 'POST' });
}
