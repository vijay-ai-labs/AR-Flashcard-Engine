import * as THREE from "three";

export class PlacementManager {
  private placed = false;
  private deviceQuat = new THREE.Quaternion();
  private placementQuat = new THREE.Quaternion();
  private placedWorldPos = new THREE.Vector3();
  private placedWorldQuat = new THREE.Quaternion();
  private placedWorldScale = new THREE.Vector3(1, 1, 1);
  private listening = false;
  private boundHandler: (e: DeviceOrientationEvent) => void;

  constructor() {
    this.boundHandler = this.handleOrientation.bind(this);
  }

  startListening() {
    if (this.listening) return;
    window.addEventListener("deviceorientation", this.boundHandler);
    this.listening = true;
  }

  private handleOrientation(e: DeviceOrientationEvent) {
    if (e.alpha == null) return;
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(e.beta ?? 0),
      THREE.MathUtils.degToRad(e.alpha ?? 0),
      THREE.MathUtils.degToRad(-(e.gamma ?? 0)),
      "YXZ"
    );
    this.deviceQuat.setFromEuler(euler);
  }

  async requestPermissionAndPlace(
    root: THREE.Object3D,
    scene: THREE.Scene,
    anchorGroup: THREE.Group
  ): Promise<boolean> {
    // iOS 13+ requires explicit permission to read DeviceOrientation
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === "function"
    ) {
      try {
        const perm = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        if (perm !== "granted") return false;
      } catch {
        return false;
      }
    }
    this.startListening();
    this.place(root, scene, anchorGroup);
    return true;
  }

  private place(root: THREE.Object3D, scene: THREE.Scene, anchorGroup: THREE.Group) {
    // Push full matrix updates down the hierarchy before reading world transforms
    root.updateWorldMatrix(true, true);

    // Capture world transforms BEFORE detaching — anchor.group bakes in position/scale/rotation
    root.getWorldPosition(this.placedWorldPos);
    root.getWorldQuaternion(this.placedWorldQuat);
    root.getWorldScale(this.placedWorldScale);
    this.placementQuat.copy(this.deviceQuat);

    anchorGroup.remove(root);
    scene.add(root);

    // Restore exact world transforms in scene space
    root.position.copy(this.placedWorldPos);
    root.quaternion.copy(this.placedWorldQuat);
    root.scale.copy(this.placedWorldScale);

    // Force visible — onTargetLost may have fired during iOS permission dialog
    root.visible = true;

    this.placed = true;
  }

  update(root: THREE.Object3D) {
    if (!this.placed) return;

    // World-frame delta: Q1 * Q0^-1 (NOT Q0^-1 * Q1 which is phone-frame)
    const deltaReal = this.deviceQuat.clone().multiply(this.placementQuat.clone().invert());
    const invDelta = deltaReal.clone().invert();

    // Rotate placement position by invDelta — model appears world-fixed
    root.position.copy(this.placedWorldPos.clone().applyQuaternion(invDelta));
  }

  release(root: THREE.Object3D, scene: THREE.Scene, anchorGroup: THREE.Group) {
    if (!this.placed) return;
    scene.remove(root);
    anchorGroup.add(root);
    // Reset to anchor-local defaults so MindAR can reposition via anchor.group matrix
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.set(1, 1, 1);
    this.placed = false;
  }

  get isPlaced(): boolean {
    return this.placed;
  }
}
