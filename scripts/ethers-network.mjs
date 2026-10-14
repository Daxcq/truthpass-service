import { FetchRequest } from "ethers";

let configured = false;

/**
 * Make ethers use Node's native fetch when a local HTTPS proxy is configured.
 * Node 24 fetch honours NODE_USE_ENV_PROXY/HTTPS_PROXY, while the default
 * ethers transport uses https.request and does not read the Windows proxy.
 */
export function configureEthersNetwork() {
  if (configured) return;
  configured = true;
  const proxy = process.env.TRUTHPASS_HTTPS_PROXY;
  if (!proxy) return;

  process.env.NODE_USE_ENV_PROXY = "1";
  process.env.HTTPS_PROXY = proxy;
  if (!process.env.HTTP_PROXY) process.env.HTTP_PROXY = proxy;

  FetchRequest.registerGetUrl(async (request, signal) => {
    const controller = new AbortController();
    signal?.addListener(() => controller.abort());
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? Buffer.from(request.body) : undefined,
      signal: controller.signal,
    });
    const body = new Uint8Array(await response.arrayBuffer());
    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers,
      body,
    };
  });
}
