import { setConsoleFunction } from "three";

/**
 * @react-three/fiber 9.x builds its store clock with `new THREE.Clock()`, which three r183+
 * flags as deprecated on every Canvas mount. Nothing in our code uses Clock, and fiber only
 * moves to THREE.Timer in v10, so drop that one message and pass everything else through.
 */
const IGNORED = ["THREE.Clock: This module has been deprecated"];

setConsoleFunction((type, message, ...params) => {
  if (type === "warn" && IGNORED.some((prefix) => message.startsWith(prefix))) return;
  console[type](message, ...params);
});
