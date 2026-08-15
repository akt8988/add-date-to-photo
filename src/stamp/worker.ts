/// <reference lib="webworker" />
import { processImage } from "./processImage";
import type { ProcessRequest, ProcessResult } from "./types";

self.onmessage = async (event: MessageEvent<ProcessRequest>) => {
  const result: ProcessResult = await processImage(event.data);
  self.postMessage(result);
};
