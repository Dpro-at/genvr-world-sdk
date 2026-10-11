import "./chunk-NSBPE2FW.js";

// ../../apps/web/lib/script-worker-handler.ts
function engineHandler(post, load) {
  let engine = null;
  let queue = Promise.resolve();
  return (event) => {
    const { id, op, input } = event.data;
    queue = queue.then(async () => {
      try {
        engine ??= load().catch((error) => {
          engine = null;
          throw error;
        });
        const script = await engine;
        post({ id, started: true });
        const value = op === "compile" ? await script.compileCheck(input) : await script.dryRun(input);
        post({ id, ok: true, value });
      } catch (error) {
        post({ id, ok: false, message: error instanceof Error ? error.message : "the script engine failed" });
      }
    });
  };
}

// ../../apps/web/lib/script-worker.ts
var scope = self;
scope.onmessage = engineHandler(
  (reply) => scope.postMessage(reply),
  () => import("./dist-KRXVT3SG.js")
);
//# sourceMappingURL=script-worker.js.map
