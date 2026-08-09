import { ca as NumericField, cb as NestedIndexSchema, R as Redis$1, H as HttpClientConfig, a as RedisOptions, b as RequesterConfig, b4 as Requester } from './error-8y4qG0W2.mjs';
export { A as AppendCommand, B as BitCountCommand, c as BitOpCommand, d as BitPosCommand, C as ClientSetInfoAttribute, e as ClientSetInfoCommand, f as CopyCommand, cc as CreateIndexParameters, D as DBSizeCommand, g as DecrByCommand, h as DecrCommand, i as DelCommand, E as EchoCommand, j as EvalCommand, k as EvalROCommand, l as EvalshaCommand, m as EvalshaROCommand, n as ExistsCommand, o as ExpireAtCommand, p as ExpireCommand, q as ExpireOption, cd as FlatIndexSchema, F as FlushAllCommand, r as FlushDBCommand, G as GeoAddCommand, s as GeoAddCommandOptions, t as GeoDistCommand, u as GeoHashCommand, v as GeoMember, w as GeoPosCommand, x as GeoSearchCommand, y as GeoSearchStoreCommand, z as GetBitCommand, I as GetCommand, J as GetDelCommand, K as GetExCommand, L as GetRangeCommand, M as GetSetCommand, N as HDelCommand, O as HExistsCommand, P as HExpireAtCommand, Q as HExpireCommand, S as HExpireTimeCommand, T as HGetAllCommand, U as HGetCommand, V as HGetDelCommand, W as HGetExCommand, X as HIncrByCommand, Y as HIncrByFloatCommand, Z as HKeysCommand, _ as HLenCommand, $ as HMGetCommand, a0 as HMSetCommand, a1 as HPExpireAtCommand, a2 as HPExpireCommand, a3 as HPExpireTimeCommand, a4 as HPTtlCommand, a5 as HPersistCommand, a6 as HRandFieldCommand, a7 as HScanCommand, a8 as HSetCommand, a9 as HSetExCommand, aa as HSetNXCommand, ab as HStrLenCommand, ac as HTtlCommand, ad as HValsCommand, ae as IncrByCommand, af as IncrByFloatCommand, ag as IncrCommand, ce as InferFilterFromSchema, ah as JsonArrAppendCommand, ai as JsonArrIndexCommand, aj as JsonArrInsertCommand, ak as JsonArrLenCommand, al as JsonArrPopCommand, am as JsonArrTrimCommand, an as JsonClearCommand, ao as JsonDelCommand, ap as JsonForgetCommand, aq as JsonGetCommand, ar as JsonMGetCommand, as as JsonMergeCommand, at as JsonNumIncrByCommand, au as JsonNumMultByCommand, av as JsonObjKeysCommand, aw as JsonObjLenCommand, ax as JsonRespCommand, ay as JsonSetCommand, az as JsonStrAppendCommand, aA as JsonStrLenCommand, aB as JsonToggleCommand, aC as JsonTypeCommand, aD as KeysCommand, aE as LIndexCommand, aF as LInsertCommand, aG as LLenCommand, aH as LMoveCommand, aI as LPopCommand, aJ as LPushCommand, aK as LPushXCommand, aL as LRangeCommand, aM as LRemCommand, aN as LSetCommand, aO as LTrimCommand, aP as MGetCommand, aQ as MSetCommand, aR as MSetNXCommand, aS as PExpireAtCommand, aT as PExpireCommand, aU as PSetEXCommand, aV as PTtlCommand, aW as PersistCommand, aX as PingCommand, aY as Pipeline, aZ as PublishCommand, cf as QueryResult, a_ as RPopCommand, a$ as RPushCommand, b0 as RPushXCommand, b1 as RandomKeyCommand, b2 as RenameCommand, b3 as RenameNXCommand, b5 as SAddCommand, b6 as SCardCommand, b7 as SDiffCommand, b8 as SDiffStoreCommand, b9 as SInterCardCommand, ba as SInterCommand, bb as SInterStoreCommand, bc as SIsMemberCommand, bd as SMIsMemberCommand, be as SMembersCommand, bf as SMoveCommand, bg as SPopCommand, bh as SRandMemberCommand, bi as SRemCommand, bj as SScanCommand, bk as SUnionCommand, bl as SUnionStoreCommand, bm as ScanCommand, bn as ScanCommandOptions, bo as ScoreMember, bp as ScriptExistsCommand, bq as ScriptFlushCommand, br as ScriptLoadCommand, cg as SearchIndex, ch as SearchIndexParameters, bs as SetBitCommand, bt as SetCommand, bu as SetCommandOptions, bv as SetExCommand, bw as SetNxCommand, bx as SetRangeCommand, by as StrLenCommand, bz as TimeCommand, bA as TouchCommand, bB as TtlCommand, bC as Type, bD as TypeCommand, bE as UnlinkCommand, bF as UpstashRequest, bG as UpstashResponse, bH as XAckDelCommand, bI as XAddCommand, bJ as XDelExCommand, bK as XRangeCommand, bL as ZAddCommand, bM as ZAddCommandOptions, bN as ZCardCommand, bO as ZCountCommand, bP as ZDiffStoreCommand, bQ as ZIncrByCommand, bR as ZInterStoreCommand, bS as ZInterStoreCommandOptions, bT as ZLexCountCommand, bU as ZMScoreCommand, bV as ZPopMaxCommand, bW as ZPopMinCommand, bX as ZRangeCommand, bY as ZRangeCommandOptions, bZ as ZRankCommand, b_ as ZRemCommand, b$ as ZRemRangeByLexCommand, c0 as ZRemRangeByRankCommand, c1 as ZRemRangeByScoreCommand, c2 as ZRevRankCommand, c3 as ZScanCommand, c4 as ZScoreCommand, c5 as ZUnionCommand, c6 as ZUnionCommandOptions, c7 as ZUnionStoreCommand, c8 as ZUnionStoreCommandOptions, c9 as errors } from './error-8y4qG0W2.mjs';

type TextFieldBuild<TNoTokenize extends Record<"noTokenize", boolean>, TNoStem extends Record<"noStem", boolean>, TFrom extends Record<"from", string | null>> = TNoTokenize["noTokenize"] extends true ? {
    type: "TEXT";
    noTokenize: true;
} & (TNoStem["noStem"] extends true ? {
    noStem: true;
} : {}) & (TFrom["from"] extends string ? {
    from: TFrom["from"];
} : {}) : TNoStem["noStem"] extends true ? {
    type: "TEXT";
    noStem: true;
} & (TFrom["from"] extends string ? {
    from: TFrom["from"];
} : {}) : TFrom["from"] extends string ? {
    type: "TEXT";
    from: TFrom["from"];
} : {
    type: "TEXT";
};
declare const BUILD: unique symbol;
declare class TextFieldBuilder<TNoTokenize extends Record<"noTokenize", boolean> = {
    noTokenize: false;
}, TNoStem extends Record<"noStem", boolean> = {
    noStem: false;
}, TFrom extends Record<"from", string | null> = {
    from: null;
}> {
    private _noTokenize;
    private _noStem;
    private _from;
    constructor(noTokenize?: TNoTokenize, noStem?: TNoStem, from?: TFrom);
    noTokenize(): TextFieldBuilder<{
        noTokenize: true;
    }, TNoStem, TFrom>;
    noStem(): TextFieldBuilder<TNoTokenize, {
        noStem: true;
    }, TFrom>;
    from(field: string): TextFieldBuilder<TNoTokenize, TNoStem, {
        from: string;
    }>;
    [BUILD](): TextFieldBuild<TNoTokenize, TNoStem, TFrom>;
}
declare class NumericFieldBuilder<T extends NumericField["type"], TFrom extends Record<"from", string | null> = {
    from: null;
}> {
    private type;
    private _from;
    constructor(type: T, from?: TFrom);
    from(field: string): NumericFieldBuilder<T, {
        from: string;
    }>;
    [BUILD](): TFrom["from"] extends string ? {
        type: T;
        fast: true;
        from: TFrom["from"];
    } : {
        type: T;
        fast: true;
    };
}
declare class BoolFieldBuilder<Fast extends Record<"fast", boolean> = {
    fast: false;
}, TFrom extends Record<"from", string | null> = {
    from: null;
}> {
    private _fast;
    private _from;
    constructor(fast?: Fast, from?: TFrom);
    fast(): BoolFieldBuilder<{
        fast: true;
    }, TFrom>;
    from(field: string): BoolFieldBuilder<Fast, {
        from: string;
    }>;
    [BUILD](): Fast extends {
        fast: true;
    } ? TFrom["from"] extends string ? {
        type: "BOOL";
        fast: true;
        from: TFrom["from"];
    } : {
        type: "BOOL";
        fast: true;
    } : TFrom["from"] extends string ? {
        type: "BOOL";
        from: TFrom["from"];
    } : {
        type: "BOOL";
    };
}
declare class DateFieldBuilder<Fast extends Record<"fast", boolean> = {
    fast: false;
}, TFrom extends Record<"from", string | null> = {
    from: null;
}> {
    private _fast;
    private _from;
    constructor(fast?: Fast, from?: TFrom);
    fast(): DateFieldBuilder<{
        fast: true;
    }, TFrom>;
    from(field: string): DateFieldBuilder<Fast, {
        from: string;
    }>;
    [BUILD](): Fast extends {
        fast: true;
    } ? TFrom["from"] extends string ? {
        type: "DATE";
        fast: true;
        from: TFrom["from"];
    } : {
        type: "DATE";
        fast: true;
    } : TFrom["from"] extends string ? {
        type: "DATE";
        from: TFrom["from"];
    } : {
        type: "DATE";
    };
}
declare class KeywordFieldBuilder {
    [BUILD](): {
        type: "KEYWORD";
    };
}
declare class FacetFieldBuilder {
    [BUILD](): {
        type: "FACET";
    };
}
type FieldBuilder = TextFieldBuilder<{
    noTokenize: boolean;
}, {
    noStem: boolean;
}, {
    from: string | null;
}> | NumericFieldBuilder<NumericField["type"], {
    from: string | null;
}> | BoolFieldBuilder<{
    fast: boolean;
}, {
    from: string | null;
}> | DateFieldBuilder<{
    fast: boolean;
}, {
    from: string | null;
}> | KeywordFieldBuilder | FacetFieldBuilder;
declare const s: {
    string(): TextFieldBuilder;
    number<T extends NumericField["type"] = "F64">(type?: T): NumericFieldBuilder<T>;
    boolean(): BoolFieldBuilder;
    date(): DateFieldBuilder;
    keyword(): KeywordFieldBuilder;
    facet(): FacetFieldBuilder;
    object<T extends ObjectFieldRecord<T>>(fields: T): { [K in keyof T]: T[K] extends FieldBuilder ? ReturnType<T[K][typeof BUILD]> : T[K]; };
};
type ObjectFieldRecord<T> = {
    [K in keyof T]: K extends string ? K extends `${infer _}.${infer _}` ? never : T[K] extends FieldBuilder | NestedIndexSchema ? T[K] : never : never;
};

/**
 * Connection credentials for upstash redis.
 * Get them from https://console.upstash.com/redis/<uuid>
 */
type RedisConfigNodejs = {
    /**
     * UPSTASH_REDIS_REST_URL
     */
    url: string | undefined;
    /**
     * UPSTASH_REDIS_REST_TOKEN
     */
    token: string | undefined;
    /**
     * An agent allows you to reuse connections to reduce latency for multiple sequential requests.
     *
     * This is a node specific implementation and is not supported in various runtimes like Vercel
     * edge functions.
     *
     * @example
     * ```ts
     * import https from "https"
     *
     * const options: RedisConfigNodejs = {
     *  agent: new https.Agent({ keepAlive: true })
     * }
     * ```
     */
    /**
     * The signal will allow aborting requests on the fly.
     * For more check: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
     */
    signal?: HttpClientConfig["signal"];
    latencyLogging?: boolean;
    agent?: unknown;
    keepAlive?: boolean;
    /**
     * When this flag is enabled, any subsequent commands issued by this client are guaranteed to observe the effects of all earlier writes submitted by the same client.
     */
    readYourWrites?: boolean;
} & RedisOptions & RequesterConfig;
/**
 * Serverless redis client for upstash.
 */
declare class Redis extends Redis$1 {
    /**
     * Create a new redis client by providing the url and token
     *
     * @example
     * ```typescript
     * const redis = new Redis({
     *  url: "<UPSTASH_REDIS_REST_URL>",
     *  token: "<UPSTASH_REDIS_REST_TOKEN>",
     * });
     * ```
     */
    constructor(config: RedisConfigNodejs);
    /**
     * Create a new redis client by providing a custom `Requester` implementation
     */
    constructor(requester: Requester);
    /**
     * Create a new Upstash Redis instance from environment variables.
     *
     * Use this to automatically load connection secrets from your environment
     * variables. For instance when using the Vercel integration.
     *
     * This tries to load connection details from your environment using `process.env`:
     * - URL: `UPSTASH_REDIS_REST_URL` or fallback to `KV_REST_API_URL`
     * - Token: `UPSTASH_REDIS_REST_TOKEN` or fallback to `KV_REST_API_TOKEN`
     *
     * The fallback variables provide compatibility with Vercel KV and other platforms
     * that may use different naming conventions.
     */
    static fromEnv(config?: Omit<RedisConfigNodejs, "url" | "token">): Redis;
}

export { NestedIndexSchema, Redis, type RedisConfigNodejs, Requester, s };
