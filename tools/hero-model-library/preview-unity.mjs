import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, Color4, LoadAssetContainerAsync } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const canvas = document.querySelector('canvas');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(.10, .13, .18, 1);
const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.3, 4.2, new Vector3(0, .9, 0), scene);
camera.minZ = .01;
camera.attachControl(canvas, true);
new HemisphericLight('light', new Vector3(.3, 1, -.5), scene).intensity = 1.15;

try {
  const container = await LoadAssetContainerAsync('./body.glb', scene, { pluginExtension: '.glb' });
  container.addAllToScene();
  await scene.whenReadyAsync();
  scene.render();
  let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of container.meshes) {
    if (!mesh.getTotalVertices()) continue;
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, box.minimumWorld);
    max = Vector3.Maximize(max, box.maximumWorld);
  }
  camera.setTarget(Vector3.Center(min, max));
  camera.radius = Math.max(.1, max.subtract(min).length() * 1.2);
  document.querySelector('#proof').textContent = JSON.stringify({
    loaded: true, meshes: container.meshes.filter(m => m.getTotalVertices()).length,
    skeletons: container.skeletons.length, animations: container.animationGroups.length,
    bounds: { min: min.asArray(), max: max.asArray() },
  }, null, 2);
  document.querySelector('#front').onclick = () => { camera.alpha = Math.PI / 2; };
  document.querySelector('#back').onclick = () => { camera.alpha = -Math.PI / 2; };
  document.querySelector('#side').onclick = () => { camera.alpha = 0; };
  engine.runRenderLoop(() => scene.render());
} catch (error) {
  document.querySelector('#proof').textContent = String(error);
}
