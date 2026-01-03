import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

interface Env {
  TRAIN_SERVER: DurableObjectNamespace<TrainServerContainer>;
  NETWORK_RAIL_USERNAME: string;
  NETWORK_RAIL_PASSWORD: string;
}

export class TrainServerContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "720h";

  envVars = {
    NETWORK_RAIL_USERNAME: (env as unknown as Env).NETWORK_RAIL_USERNAME || "",
    NETWORK_RAIL_PASSWORD: (env as unknown as Env).NETWORK_RAIL_PASSWORD || "",
    PORT: "8080",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/ws" || url.pathname.startsWith("/api/")) {
      const container = getContainer(env.TRAIN_SERVER);
      return container.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
