import { AsyncLocalStorage } from "node:async_hooks";
import { installRegistryContextProvider, type RegistryContext } from "@ggd/shared/sim/content/registryContext";

const storage = new AsyncLocalStorage<RegistryContext>();
installRegistryContextProvider(() => storage.getStore());

/** Async room setup, socket callbacks and timers inherit one immutable context. */
export function withRoomContent<T>(context: RegistryContext, action: () => T): T {
  return storage.run(context, action);
}
