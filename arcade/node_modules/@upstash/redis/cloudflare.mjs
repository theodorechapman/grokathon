import {
  HttpClient,
  Redis,
  VERSION,
  error_exports
} from "./chunk-K7RP6Y36.mjs";

// platforms/cloudflare.ts
var Redis2 = class _Redis extends Redis {
  /**
   * Create a new redis client
   *
   * @example
   * ```typescript
   * const redis = new Redis({
   *  url: "<UPSTASH_REDIS_REST_URL>",
   *  token: "<UPSTASH_REDIS_REST_TOKEN>",
   * });
   * ```
   */
  constructor(config, env) {
    if (!config.url) {
      console.warn(
        `[Upstash Redis] The 'url' property is missing or undefined in your Redis config. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis`
      );
    } else if (config.url.startsWith(" ") || config.url.endsWith(" ") || /\r|\n/.test(config.url)) {
      console.warn(
        "[Upstash Redis] The redis url contains whitespace or newline, which can cause errors!"
      );
    }
    if (!config.token) {
      console.warn(
        `[Upstash Redis] The 'token' property is missing or undefined in your Redis config. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis`
      );
    } else if (config.token.startsWith(" ") || config.token.endsWith(" ") || /\r|\n/.test(config.token)) {
      console.warn(
        "[Upstash Redis] The redis token contains whitespace or newline, which can cause errors!"
      );
    }
    const client = new HttpClient({
      retry: config.retry,
      baseUrl: config.url,
      headers: { authorization: `Bearer ${config.token}` },
      responseEncoding: config.responseEncoding,
      signal: config.signal,
      keepAlive: config.keepAlive,
      readYourWrites: config.readYourWrites
    });
    super(client, {
      enableTelemetry: config.enableTelemetry ?? !env?.UPSTASH_DISABLE_TELEMETRY,
      automaticDeserialization: config.automaticDeserialization,
      latencyLogging: config.latencyLogging,
      enableAutoPipelining: config.enableAutoPipelining
    });
    this.addTelemetry({
      platform: "cloudflare",
      sdk: `@upstash/redis@${VERSION}`
    });
    if (this.enableAutoPipelining) {
      return this.autoPipeline();
    }
  }
  /*
   * Create a new Upstash Redis instance from environment variables on cloudflare.
   *
   * This tries to load `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from
   * the global namespace
   *
   * If you are using a module worker, please pass in the `env` object.
   * ```ts
   * const redis = Redis.fromEnv(env)
   * ```
   */
  static fromEnv(env, opts) {
    const url = env?.UPSTASH_REDIS_REST_URL ?? // @ts-expect-error These will be defined by cloudflare
    (typeof UPSTASH_REDIS_REST_URL === "string" ? (
      // @ts-expect-error These will be defined by cloudflare
      UPSTASH_REDIS_REST_URL
    ) : void 0);
    const token = env?.UPSTASH_REDIS_REST_TOKEN ?? // @ts-expect-error These will be defined by cloudflare
    (typeof UPSTASH_REDIS_REST_TOKEN === "string" ? (
      // @ts-expect-error These will be defined by cloudflare
      UPSTASH_REDIS_REST_TOKEN
    ) : void 0);
    const missing = [];
    if (!url) missing.push("UPSTASH_REDIS_REST_URL");
    if (!token) missing.push("UPSTASH_REDIS_REST_TOKEN");
    if (missing.length > 0) {
      const plural = missing.length > 1;
      const names = missing.map((name) => `\`${name}\``).join(" and ");
      const commands = missing.map((name) => `\`wrangler secret put ${name}\``).join(" and ");
      console.warn(
        `[Upstash Redis] Unable to find environment variable${plural ? "s" : ""}: ${names}. Please add ${plural ? "them" : "it"} via ${commands} and provide ${plural ? "them as arguments" : "it as an argument"} to the \`Redis.fromEnv\` function. To create a database instantly (no signup needed), run: curl -X POST https://upstash.com/start-redis`
      );
    }
    return new _Redis({ ...opts, url, token }, env);
  }
};
export {
  Redis2 as Redis,
  error_exports as errors
};
