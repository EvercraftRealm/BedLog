const mockUrl = new URL("./minecraft-server-mock.js", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@minecraft/server") {
    return { url: mockUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

