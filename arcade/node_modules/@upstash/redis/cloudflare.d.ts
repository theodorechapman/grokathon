import { R as Redis$1, H as HttpClientConfig, a as RedisOptions, b as RequesterConfig } from './error-8y4qG0W2.js';
export { A as AppendCommand, B as BitCountCommand, c as BitOpCommand, d as BitPosCommand, C as ClientSetInfoAttribute, e as ClientSetInfoCommand, f as CopyCommand, D as DBSizeCommand, g as DecrByCommand, h as DecrCommand, i as DelCommand, E as EchoCommand, j as EvalCommand, k as EvalROCommand, l as EvalshaCommand, m as EvalshaROCommand, n as ExistsCommand, o as ExpireAtCommand, p as ExpireCommand, q as ExpireOption, F as FlushAllCommand, r as FlushDBCommand, G as GeoAddCommand, s as GeoAddCommandOptions, t as GeoDistCommand, u as GeoHashCommand, v as GeoMember, w as GeoPosCommand, x as GeoSearchCommand, y as GeoSearchStoreCommand, z as GetBitCommand, I as GetCommand, J as GetDelCommand, K as GetExCommand, L as GetRangeCommand, M as GetSetCommand, N as HDelCommand, O as HExistsCommand, P as HExpireAtCommand, Q as HExpireCommand, S as HExpireTimeCommand, T as HGetAllCommand, U as HGetCommand, V as HGetDelCommand, W as HGetExCommand, X as HIncrByCommand, Y as HIncrByFloatCommand, Z as HKeysCommand, _ as HLenCommand, $ as HMGetCommand, a0 as HMSetCommand, a1 as HPExpireAtCommand, a2 as HPExpireCommand, a3 as HPExpireTimeCommand, a4 as HPTtlCommand, a5 as HPersistCommand, a6 as HRandFieldCommand, a7 as HScanCommand, a8 as HSetCommand, a9 as HSetExCommand, aa as HSetNXCommand, ab as HStrLenCommand, ac as HTtlCommand, ad as HValsCommand, ae as IncrByCommand, af as IncrByFloatCommand, ag as IncrCommand, ah as JsonArrAppendCommand, ai as JsonArrIndexCommand, aj as JsonArrInsertCommand, ak as JsonArrLenCommand, al as JsonArrPopCommand, am as JsonArrTrimCommand, an as JsonClearCommand, ao as JsonDelCommand, ap as JsonForgetCommand, aq as JsonGetCommand, ar as JsonMGetCommand, as as JsonMergeCommand, at as JsonNumIncrByCommand, au as JsonNumMultByCommand, av as JsonObjKeysCommand, aw as JsonObjLenCommand, ax as JsonRespCommand, ay as JsonSetCommand, az as JsonStrAppendCommand, aA as JsonStrLenCommand, aB as JsonToggleCommand, aC as JsonTypeCommand, aD as KeysCommand, aE as LIndexCommand, aF as LInsertCommand, aG as LLenCommand, aH as LMoveCommand, aI as LPopCommand, aJ as LPushCommand, aK as LPushXCommand, aL as LRangeCommand, aM as LRemCommand, aN as LSetCommand, aO as LTrimCommand, aP as MGetCommand, aQ as MSetCommand, aR as MSetNXCommand, aS as PExpireAtCommand, aT as PExpireCommand, aU as PSetEXCommand, aV as PTtlCommand, aW as PersistCommand, aX as PingCommand, aY as Pipeline, aZ as PublishCommand, a_ as RPopCommand, a$ as RPushCommand, b0 as RPushXCommand, b1 as RandomKeyCommand, b2 as RenameCommand, b3 as RenameNXCommand, b4 as Requester, b5 as SAddCommand, b6 as SCardCommand, b7 as SDiffCommand, b8 as SDiffStoreCommand, b9 as SInterCardCommand, ba as SInterCommand, bb as SInterStoreCommand, bc as SIsMemberCommand, bd as SMIsMemberCommand, be as SMembersCommand, bf as SMoveCommand, bg as SPopCommand, bh as SRandMemberCommand, bi as SRemCommand, bj as SScanCommand, bk as SUnionCommand, bl as SUnionStoreCommand, bm as ScanCommand, bn as ScanCommandOptions, bo as ScoreMember, bp as ScriptExistsCommand, bq as ScriptFlushCommand, br as ScriptLoadCommand, bs as SetBitCommand, bt as SetCommand, bu as SetCommandOptions, bv as SetExCommand, bw as SetNxCommand, bx as SetRangeCommand, by as StrLenCommand, bz as TimeCommand, bA as TouchCommand, bB as TtlCommand, bC as Type, bD as TypeCommand, bE as UnlinkCommand, bF as UpstashRequest, bG as UpstashResponse, bH as XAckDelCommand, bI as XAddCommand, bJ as XDelExCommand, bK as XRangeCommand, bL as ZAddCommand, bM as ZAddCommandOptions, bN as ZCardCommand, bO as ZCountCommand, bP as ZDiffStoreCommand, bQ as ZIncrByCommand, bR as ZInterStoreCommand, bS as ZInterStoreCommandOptions, bT as ZLexCountCommand, bU as ZMScoreCommand, bV as ZPopMaxCommand, bW as ZPopMinCommand, bX as ZRangeCommand, bY as ZRangeCommandOptions, bZ as ZRankCommand, b_ as ZRemCommand, b$ as ZRemRangeByLexCommand, c0 as ZRemRangeByRankCommand, c1 as ZRemRangeByScoreCommand, c2 as ZRevRankCommand, c3 as ZScanCommand, c4 as ZScoreCommand, c5 as ZUnionCommand, c6 as ZUnionCommandOptions, c7 as ZUnionStoreCommand, c8 as ZUnionStoreCommandOptions, c9 as errors } from './error-8y4qG0W2.js';

type Env = {
    UPSTASH_DISABLE_TELEMETRY?: string;
};

/**
 * Connection credentials for upstash redis.
 * Get them from https://console.upstash.com/redis/<uuid>
 */
type RedisConfigCloudflare = {
    /**
     * UPSTASH_REDIS_REST_URL
     */
    url: string | undefined;
    /**
     * UPSTASH_REDIS_REST_TOKEN
     */
    token: string | undefined;
    /**
     * The signal will allow aborting requests on the fly.
     * For more check: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
     */
    signal?: HttpClientConfig["signal"];
    keepAlive?: boolean;
    /**
     * When this flag is enabled, any subsequent commands issued by this client are guaranteed to observe the effects of all earlier writes submitted by the same client.
     */
    readYourWrites?: boolean;
} & RedisOptions & RequesterConfig & Env;
/**
 * Serverless redis client for upstash.
 */
declare class Redis extends Redis$1 {
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
    constructor(config: RedisConfigCloudflare, env?: Env);
    static fromEnv(env?: {
        UPSTASH_REDIS_REST_URL: string;
        UPSTASH_REDIS_REST_TOKEN: string;
        UPSTASH_DISABLE_TELEMETRY?: string;
    }, opts?: Omit<RedisConfigCloudflare, "url" | "token">): Redis;
}

export { Redis, type RedisConfigCloudflare };
