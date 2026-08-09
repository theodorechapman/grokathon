type CommandArgs<TCommand extends new (..._args: any) => any> = ConstructorParameters<TCommand>[0];
type Telemetry = {
    /**
     * Upstash-Telemetry-Sdk
     * @example @upstash/redis@v1.1.1
     */
    sdk?: string;
    /**
     * Upstash-Telemetry-Platform
     * @example cloudflare
     */
    platform?: string;
    /**
     * Upstash-Telemetry-Runtime
     * @example node@v18
     */
    runtime?: string;
};
type RedisOptions = {
    /**
     * Automatically try to deserialize the returned data from upstash using `JSON.deserialize`
     *
     * @default true
     */
    automaticDeserialization?: boolean;
    latencyLogging?: boolean;
    enableTelemetry?: boolean;
    enableAutoPipelining?: boolean;
    readYourWrites?: boolean;
};

type CacheSetting = "default" | "force-cache" | "no-cache" | "no-store" | "only-if-cached" | "reload";
type UpstashRequest = {
    path?: string[];
    /**
     * Request body will be serialized to json
     */
    body?: unknown;
    /**
     * Additional headers for the request
     */
    headers?: Record<string, string>;
    upstashSyncToken?: string;
    /**
     * Callback for handling streaming messages
     */
    onMessage?: (data: string) => void;
    /**
     * Whether this request expects a streaming response
     */
    isStreaming?: boolean;
    /**
     * Abort signal for the request
     */
    signal?: AbortSignal;
};
type UpstashResponse<TResult> = {
    result?: TResult;
    error?: string;
};
interface Requester {
    /**
     * When this flag is enabled, any subsequent commands issued by this client are guaranteed to observe the effects of all earlier writes submitted by the same client.
     */
    readYourWrites?: boolean;
    /**
     * This token is used to ensure that the client is in sync with the server. On each request, we send this token in the header, and the server will return a new token.
     */
    upstashSyncToken?: string;
    request: <TResult = unknown>(req: UpstashRequest) => Promise<UpstashResponse<TResult>>;
}
type RetryConfig = false | {
    /**
     * The number of retries to attempt before giving up.
     *
     * @default 5
     */
    retries?: number;
    /**
     * A backoff function receives the current retry count and returns a number in milliseconds to wait before retrying.
     *
     * @default
     * ```ts
     * Math.exp(retryCount) * 50
     * ```
     */
    backoff?: (retryCount: number) => number;
};
type Options$1 = {
    backend?: string;
};
type RequesterConfig = {
    /**
     * Configure the retry behaviour in case of network errors
     */
    retry?: RetryConfig;
    /**
     * Due to the nature of dynamic and custom data, it is possible to write data to redis that is not
     * valid json and will therefore cause errors when deserializing. This used to happen very
     * frequently with non-utf8 data, such as emojis.
     *
     * By default we will therefore encode the data as base64 on the server, before sending it to the
     * client. The client will then decode the base64 data and parse it as utf8.
     *
     * For very large entries, this can add a few milliseconds, so if you are sure that your data is
     * valid utf8, you can disable this behaviour by setting this option to false.
     *
     * Here's what the response body looks like:
     *
     * ```json
     * {
     *  result?: "base64-encoded",
     *  error?: string
     * }
     * ```
     *
     * @default "base64"
     */
    responseEncoding?: false | "base64";
    /**
     * Configure the cache behaviour
     * @default "no-store"
     */
    cache?: CacheSetting;
};
type HttpClientConfig = {
    headers?: Record<string, string>;
    baseUrl: string;
    options?: Options$1;
    retry?: RetryConfig;
    agent?: any;
    signal?: AbortSignal | (() => AbortSignal);
    keepAlive?: boolean;
    /**
     * When this flag is enabled, any subsequent commands issued by this client are guaranteed to observe the effects of all earlier writes submitted by the same client.
     */
    readYourWrites?: boolean;
} & RequesterConfig;

type Serialize = (data: unknown) => string | number | boolean;
type Deserialize<TResult, TData> = (result: TResult) => TData;
type CommandOptions<TResult, TData> = {
    /**
     * Custom deserializer
     */
    deserialize?: (result: TResult) => TData;
    /**
     * Automatically try to deserialize the returned data from upstash using `JSON.deserialize`
     *
     * @default true
     */
    automaticDeserialization?: boolean;
    latencyLogging?: boolean;
    /**
     * Additional headers to be sent with the request
     */
    headers?: Record<string, string>;
    /**
     * Path to append to the URL
     */
    path?: string[];
    /**
     * Options for streaming requests, mainly used for subscribe, monitor commands
     **/
    streamOptions?: {
        /**
         * Callback to be called when a message is received
         */
        onMessage?: (data: string) => void;
        /**
         * Whether the request is streaming
         */
        isStreaming?: boolean;
        /**
         * Signal to abort the request
         */
        signal?: AbortSignal;
    };
};
/**
 * Command offers default (de)serialization and the exec method to all commands.
 *
 * TData represents what the user will enter or receive,
 * TResult is the raw data returned from upstash, which may need to be transformed or parsed.
 */
declare class Command<TResult, TData> {
    readonly command: (string | number | boolean)[];
    readonly serialize: Serialize;
    readonly deserialize: Deserialize<TResult, TData>;
    protected readonly headers?: Record<string, string>;
    protected readonly path?: string[];
    protected readonly onMessage?: (data: string) => void;
    protected readonly isStreaming: boolean;
    protected readonly signal?: AbortSignal;
    /**
     * Create a new command instance.
     *
     * You can define a custom `deserialize` function. By default we try to deserialize as json.
     */
    constructor(command: (string | boolean | number | unknown)[], opts?: CommandOptions<TResult, TData>);
    /**
     * Execute the command using a client.
     */
    exec(client: Requester): Promise<TData>;
}

type Type = "string" | "list" | "set" | "zset" | "hash" | "none";
/**
 * @see https://redis.io/commands/type
 */
declare class TypeCommand extends Command<Type, Type> {
    constructor(cmd: [key: string], opts?: CommandOptions<Type, Type>);
}

declare const FIELD_TYPES: readonly ["TEXT", "U64", "I64", "F64", "BOOL", "DATE", "KEYWORD", "FACET"];
type FieldType = (typeof FIELD_TYPES)[number];
type TextField = {
    type: "TEXT";
    noTokenize?: boolean;
    noStem?: boolean;
    from?: string;
};
type NumericField = {
    type: "U64" | "I64" | "F64";
    fast: true;
    from?: string;
};
type BoolField = {
    type: "BOOL";
    fast?: boolean;
    from?: string;
};
type DateField = {
    type: "DATE";
    fast?: boolean;
    from?: string;
};
type KeywordField = {
    type: "KEYWORD";
};
type FacetField = {
    type: "FACET";
};
type DetailedField = TextField | NumericField | BoolField | DateField | KeywordField | FacetField;
type NestedIndexSchema = {
    [key: string]: FieldType | DetailedField | NestedIndexSchema;
};
type FlatIndexSchema = {
    [key: string]: FieldType | DetailedField;
};
type SchemaPaths<T, Prefix extends string = ""> = {
    [K in keyof T]: K extends string ? T[K] extends FieldType | DetailedField ? Prefix extends "" ? K : `${Prefix}${K}` : T[K] extends object ? SchemaPaths<T[K], `${Prefix}${K}.`> : never : never;
}[keyof T];
type ExtractFieldType<T> = T extends FieldType ? T : T extends {
    type: infer U;
} ? U extends FieldType ? U : never : never;
type GetFieldAtPath<TSchema, Path extends string> = Path extends `${infer First}.${infer Rest}` ? First extends keyof TSchema ? GetFieldAtPath<TSchema[First], Rest> : never : Path extends keyof TSchema ? TSchema[Path] : never;
type FieldValueType<T extends FieldType> = T extends "TEXT" ? string : T extends "U64" | "I64" | "F64" ? number : T extends "BOOL" ? boolean : T extends "DATE" ? string : T extends "KEYWORD" ? string : T extends "FACET" ? string : never;
type GetFieldValueType<TSchema, Path extends string> = GetFieldAtPath<TSchema, Path> extends infer Field ? Field extends FieldType | DetailedField ? FieldValueType<ExtractFieldType<Field>> : never : never;
type HasFrom<T> = T extends {
    from: string;
} ? true : false;
type InferSchemaDataField<T> = T extends FieldType ? FieldValueType<T> : T extends DetailedField ? FieldValueType<ExtractFieldType<T>> : T extends NestedIndexSchema ? InferSchemaData<T> : unknown;
type IsDefaultSchema<T> = [T] extends [NestedIndexSchema | FlatIndexSchema] ? [NestedIndexSchema | FlatIndexSchema] extends [T] ? true : false : false;
type AsAnyIfUnknown<T> = unknown extends T ? any : T;
type InferSchemaData<TSchema> = IsDefaultSchema<TSchema> extends true ? any : {
    [K in keyof TSchema as TSchema[K] extends DetailedField ? HasFrom<TSchema[K]> extends true ? never : K : K]: AsAnyIfUnknown<InferSchemaDataField<TSchema[K]>>;
};
type QueryOptions<TSchema extends NestedIndexSchema | FlatIndexSchema> = IsDefaultSchema<TSchema> extends true ? {
    filter?: Record<string, any>;
    limit?: number;
    offset?: number;
    select?: Record<string, true>;
    highlight?: {
        fields: string[];
        preTag?: string;
        postTag?: string;
    };
    orderBy?: Record<string, "ASC" | "DESC">;
    scoreFunc?: ScoreBy<string>;
} : {
    filter?: RootQueryFilter<TSchema>;
    /** Maximum number of results to return */
    limit?: number;
    /** Number of results to skip */
    offset?: number;
    select?: Partial<{
        [K in SchemaPaths<TSchema>]: true;
    }>;
    highlight?: {
        fields: SchemaPaths<TSchema>[];
        preTag?: string;
        postTag?: string;
    };
} & QueryOrderOption<TSchema>;
type CombineMode = "multiply" | "sum";
type ScoreMode = "multiply" | "sum" | "replace";
type ScoreModifier = "none" | "log" | "log1p" | "log2p" | "ln" | "ln1p" | "ln2p" | "square" | "sqrt" | "reciprocal";
type ScoreBy<TSchemaPaths extends string> = ScoreByField<false, TSchemaPaths> | {
    fields: ScoreByField<true, TSchemaPaths>[];
    combineMode?: CombineMode;
    scoreMode?: ScoreMode;
};
type ScoreByField<TMultiple extends boolean, TSchemaPaths extends string> = {
    field: TSchemaPaths;
    modifier?: ScoreModifier;
    factor?: number;
    missing?: number;
    scoreMode?: TMultiple extends true ? never : ScoreMode;
} | TSchemaPaths;
type QueryOrderOption<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    orderBy?: {
        [K in SchemaPaths<TSchema>]: {
            [P in K]: "ASC" | "DESC";
        };
    }[SchemaPaths<TSchema>];
} | {
    scoreFunc?: ScoreBy<SchemaPaths<TSchema>>;
};
/**
 * Converts dot notation paths to nested object structure type
 * e.g. "content.title" | "content.author" becomes { content: { title: ..., author: ... } }
 */
type PathToNestedObject<TSchema, Path extends string, Value> = Path extends `${infer First}.${infer Rest}` ? {
    [K in First]: PathToNestedObject<TSchema, Rest, Value>;
} : {
    [K in Path]: Value;
};
/**
 * Merges intersection of objects into a single object type with proper nesting
 */
type DeepMerge<T> = T extends object ? {
    [K in keyof T]: T[K] extends object ? DeepMerge<T[K]> : T[K];
} : T;
/**
 * Build nested result type from selected paths
 */
type BuildNestedResult<TSchema, TFields> = IsDefaultSchema<TSchema> extends true ? DeepMerge<UnionToIntersection<{
    [Path in keyof TFields & string]: PathToNestedObject<any, Path, any>;
}[keyof TFields & string]>> : DeepMerge<UnionToIntersection<{
    [Path in keyof TFields & SchemaPaths<TSchema>]: PathToNestedObject<TSchema, Path & string, AsAnyIfUnknown<GetFieldValueType<TSchema, Path & string>>>;
}[keyof TFields & SchemaPaths<TSchema>]>>;
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type QueryResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TOptions extends QueryOptions<TSchema> | undefined = undefined> = TOptions extends {
    select: infer TFields;
} ? {} extends TFields ? {
    key: string;
    score: number;
} : {
    key: string;
    score: number;
    data: BuildNestedResult<TSchema, TFields>;
} : {
    key: string;
    score: number;
    data: InferSchemaData<TSchema>;
};
type PublicQueryResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TSelectFields extends SchemaPaths<TSchema>[] | undefined = undefined> = QueryResult<TSchema, TSelectFields extends SchemaPaths<TSchema>[] ? {
    select: {
        [K in TSelectFields[number]]: true;
    };
} : undefined>;
type StringOperationMap<T extends string> = {
    $eq: T;
    $in: T[];
    $fuzzy: T | {
        value: T;
        distance?: number;
        transpositionCostOne?: boolean;
        prefix?: boolean;
    };
    $phrase: T | {
        value: T;
    } | {
        value: T;
        slop: number;
        prefix?: never;
    } | {
        value: T;
        prefix: boolean;
        slop?: never;
    };
    $regex: T;
    $smart: T;
};
type NumberOperationMap<T extends number> = {
    $eq: T;
    $in: T[];
    $gt: T;
    $gte: T;
    $lt: T;
    $lte: T;
};
type KeywordOperationMap<T extends string> = {
    $eq: T;
    $in: T[];
    $gt: T;
    $gte: T;
    $lt: T;
    $lte: T;
};
type BooleanOperationMap<T extends boolean> = {
    $eq: T;
    $in: T[];
};
type DateOperationMap<T extends string | Date> = {
    $eq: T;
    $in: T[];
    $gt: T;
    $gte: T;
    $lte: T;
    $lt: T;
};
type FacetOperationMap<T extends string> = {
    $eq: T;
    $in: T[];
};
type StringOperations = {
    [K in keyof StringOperationMap<string>]: {
        [P in K]: StringOperationMap<string>[K];
    } & {
        $boost?: number;
    };
}[keyof StringOperationMap<string>];
type NumberOperations = {
    [K in keyof NumberOperationMap<number>]: {
        [P in K]: NumberOperationMap<number>[K];
    } & {
        $boost?: number;
    };
}[keyof NumberOperationMap<number>];
type BooleanOperations = {
    [K in keyof BooleanOperationMap<boolean>]: {
        [P in K]: BooleanOperationMap<boolean>[K];
    } & {
        $boost?: number;
    };
}[keyof BooleanOperationMap<boolean>];
type DateOperations = {
    [K in keyof DateOperationMap<string | Date>]: {
        [P in K]: DateOperationMap<string | Date>[K];
    } & {
        $boost?: number;
    };
}[keyof DateOperationMap<string | Date>];
type KeywordOperations = {
    [K in keyof KeywordOperationMap<string>]: {
        [P in K]: KeywordOperationMap<string>[K];
    } & {
        $boost?: number;
    };
}[keyof KeywordOperationMap<string>];
type FacetOperations = {
    [K in keyof FacetOperationMap<string>]: {
        [P in K]: FacetOperationMap<string>[K];
    } & {
        $boost?: number;
    };
}[keyof FacetOperationMap<string>];
type OperationsForFieldType<T extends FieldType> = T extends "TEXT" ? StringOperations : T extends "U64" | "I64" | "F64" ? NumberOperations : T extends "BOOL" ? BooleanOperations : T extends "DATE" ? DateOperations : T extends "KEYWORD" ? KeywordOperations : T extends "FACET" ? FacetOperations : never;
type PathOperations<TSchema, TPath extends string> = GetFieldAtPath<TSchema, TPath> extends infer Field ? Field extends FieldType | DetailedField ? OperationsForFieldType<ExtractFieldType<Field>> | FieldValueType<ExtractFieldType<Field>> : never : never;
type QueryLeaf<TSchema> = {
    [K in SchemaPaths<TSchema>]?: PathOperations<TSchema, K>;
} & {
    $and?: never;
    $or?: never;
    $must?: never;
    $should?: never;
    $mustNot?: never;
    $boost?: number;
};
type BoolBase<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    [P in SchemaPaths<TSchema>]?: PathOperations<TSchema, P>;
};
type AndNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $and: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $or?: never;
    $must?: never;
    $should?: never;
    $mustNot?: never;
};
type OrNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $or: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $must?: never;
    $should?: never;
    $mustNot?: never;
};
type MustNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $must: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $or?: never;
    $should?: never;
    $mustNot?: never;
};
type ShouldNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $should: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $or?: never;
    $must?: never;
    $mustNot?: never;
};
type MustShouldNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $must: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $should: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $and?: never;
    $or?: never;
};
type NotNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $mustNot: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $or?: never;
    $must?: never;
    $should?: never;
};
type AndNotNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $and: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $mustNot: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $or?: never;
    $must?: never;
    $should?: never;
};
type OrNotNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $or: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $mustNot: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $must?: never;
    $should?: never;
};
type ShouldNotNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $should: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $mustNot: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $or?: never;
    $must?: never;
};
type MustNotNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $must: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $mustNot: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $or?: never;
    $should?: never;
};
type BoolNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = BoolBase<TSchema> & {
    $must: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $should: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $mustNot: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $or?: never;
};
type QueryFilter<TSchema extends NestedIndexSchema | FlatIndexSchema> = IsDefaultSchema<TSchema> extends true ? Record<string, any> : QueryLeaf<TSchema> | AndNode<TSchema> | OrNode<TSchema> | MustNode<TSchema> | ShouldNode<TSchema> | MustShouldNode<TSchema> | NotNode<TSchema> | AndNotNode<TSchema> | OrNotNode<TSchema> | ShouldNotNode<TSchema> | MustNotNode<TSchema> | BoolNode<TSchema>;
type RootQueryFilter<TSchema extends NestedIndexSchema | FlatIndexSchema> = IsDefaultSchema<TSchema> extends true ? Record<string, any> : QueryLeaf<TSchema> | AndNode<TSchema> | RootOrNode<TSchema> | MustNode<TSchema> | ShouldNode<TSchema> | MustShouldNode<TSchema> | AndNotNode<TSchema> | ShouldNotNode<TSchema> | BoolNode<TSchema>;
type RootOrNode<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    [P in SchemaPaths<TSchema>]?: never;
} & {
    $or: QueryFilter<TSchema> | QueryFilter<TSchema>[];
    $boost?: number;
    $and?: never;
    $must?: never;
    $should?: never;
    $mustNot?: QueryFilter<TSchema> | QueryFilter<TSchema>[];
};
type DescribeFieldInfo = {
    type: FieldType;
    noTokenize?: boolean;
    noStem?: boolean;
    fast?: boolean;
    from?: string;
};
type IndexDescription<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    name: string;
    dataType: "hash" | "string" | "json";
    prefixes: string[];
    language?: Language;
    schema: IsDefaultSchema<TSchema> extends true ? Record<string, DescribeFieldInfo> : Record<SchemaPaths<TSchema>, DescribeFieldInfo>;
};
type Language = "english" | "arabic" | "danish" | "dutch" | "finnish" | "french" | "german" | "greek" | "hungarian" | "italian" | "norwegian" | "portuguese" | "romanian" | "russian" | "spanish" | "swedish" | "tamil" | "turkish";
type FacetPaths<T, Prefix extends string = ""> = {
    [K in keyof T]: K extends string ? T[K] extends "FACET" | {
        type: "FACET";
    } ? Prefix extends "" ? K : `${Prefix}${K}` : T[K] extends FieldType | DetailedField ? never : T[K] extends object ? FacetPaths<T[K], `${Prefix}${K}.`> : never : never;
}[keyof T];
type AggregateOptions<TSchema extends NestedIndexSchema | FlatIndexSchema> = IsDefaultSchema<TSchema> extends true ? {
    filter?: Record<string, any>;
    aggregations: {
        [key: string]: Record<string, any>;
    };
} : {
    filter?: RootQueryFilter<TSchema>;
    aggregations: {
        [key: string]: Aggregation<TSchema>;
    };
};
type Aggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = IsDefaultSchema<TSchema> extends true ? Record<string, any> : TermsAggregation<TSchema> | RangeAggregation<TSchema> | HistogramAggregation<TSchema> | StatsAggregation<TSchema> | AvgAggregation<TSchema> | SumAggregation<TSchema> | MinAggregation<TSchema> | MaxAggregation<TSchema> | CountAggregation<TSchema> | ExtendedStatsAggregation<TSchema> | PercentilesAggregation<TSchema> | CardinalityAggregation<TSchema> | FacetAggregation<TSchema>;
type BaseAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    $aggs?: {
        [key: string]: Aggregation<TSchema>;
    };
};
type TermsAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $terms: {
        field: SchemaPaths<TSchema>;
        size?: number;
    };
};
type RangeAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $range: {
        field: SchemaPaths<TSchema>;
        ranges: {
            from?: number;
            to?: number;
        }[];
    };
};
type HistogramAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $histogram: {
        field: SchemaPaths<TSchema>;
        interval: number;
    };
};
type StatsAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $stats: {
        field: SchemaPaths<TSchema>;
        missing?: number;
    };
};
type AvgAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $avg: {
        field: SchemaPaths<TSchema>;
        missing?: number;
    };
};
type SumAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $sum: {
        field: SchemaPaths<TSchema>;
        missing?: number;
    };
};
type MinAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $min: {
        field: SchemaPaths<TSchema>;
        missing?: number;
    };
};
type MaxAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $max: {
        field: SchemaPaths<TSchema>;
        missing?: number;
    };
};
type CountAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $count: {
        field: SchemaPaths<TSchema>;
    };
};
type ExtendedStatsAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $extendedStats: {
        field: SchemaPaths<TSchema>;
        sigma?: number;
        missing?: number;
    };
};
type PercentilesAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $percentiles: {
        field: SchemaPaths<TSchema>;
        percents?: number[];
        keyed?: boolean;
        missing?: number;
    };
};
type CardinalityAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $cardinality: {
        field: SchemaPaths<TSchema>;
    };
};
type FacetAggregation<TSchema extends NestedIndexSchema | FlatIndexSchema> = BaseAggregation<TSchema> & {
    $facet: {
        field: FacetPaths<TSchema>;
        path: string;
        depth?: number;
        size?: number;
        minDocCount?: number;
        order?: {
            count: "desc" | "asc";
        };
    };
};
type AggregateResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TOpts extends AggregateOptions<TSchema>> = IsDefaultSchema<TSchema> extends true ? Record<string, any> : BuildAggregateResult<TSchema, Extract<TOpts["aggregations"], {
    [key: string]: Aggregation<TSchema>;
}>>;
type BuildAggregateResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TAggs extends {
    [key: string]: Aggregation<TSchema>;
}> = {
    [K in keyof TAggs]: TAggs[K] extends TermsAggregation<TSchema> ? TermsResult<TSchema, TAggs[K]> : TAggs[K] extends RangeAggregation<TSchema> ? RangeResult<TSchema, TAggs[K]> : TAggs[K] extends HistogramAggregation<TSchema> ? HistogramResult<TSchema, TAggs[K]> : TAggs[K] extends StatsAggregation<TSchema> ? StatsResult : TAggs[K] extends AvgAggregation<TSchema> ? MetricValueResult : TAggs[K] extends SumAggregation<TSchema> ? MetricValueResult : TAggs[K] extends MinAggregation<TSchema> ? MetricValueResult : TAggs[K] extends MaxAggregation<TSchema> ? MetricValueResult : TAggs[K] extends CountAggregation<TSchema> ? MetricValueResult : TAggs[K] extends CardinalityAggregation<TSchema> ? MetricValueResult : TAggs[K] extends ExtendedStatsAggregation<TSchema> ? ExtendedStatsResult<TAggs[K]> : TAggs[K] extends PercentilesAggregation<TSchema> ? PercentilesResult<TAggs[K]> : TAggs[K] extends FacetAggregation<TSchema> ? FacetResult : never;
};
type Bucket<T> = {
    key: T;
    docCount: number;
    from?: number;
    to?: number;
};
type TermsResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TAgg extends TermsAggregation<TSchema>> = TAgg["$aggs"] extends {
    [key: string]: Aggregation<TSchema>;
} ? {
    buckets: (Bucket<GetFieldValueType<TSchema, TAgg["$terms"]["field"]>> & BuildAggregateResult<TSchema, TAgg["$aggs"]>)[];
    sumOtherDocCount: number;
    docCountErrorUpperBound: number;
} : {
    buckets: Bucket<GetFieldValueType<TSchema, TAgg["$terms"]["field"]>>[];
    sumOtherDocCount: number;
    docCountErrorUpperBound: number;
};
type RangeResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TAgg extends RangeAggregation<TSchema>> = TAgg["$aggs"] extends {
    [key: string]: Aggregation<TSchema>;
} ? {
    buckets: (Bucket<string> & BuildAggregateResult<TSchema, TAgg["$aggs"]>)[];
} : {
    buckets: Bucket<string>[];
};
type HistogramResult<TSchema extends NestedIndexSchema | FlatIndexSchema, TAgg extends HistogramAggregation<TSchema>> = TAgg["$aggs"] extends {
    [key: string]: Aggregation<TSchema>;
} ? {
    buckets: (Bucket<number> & BuildAggregateResult<TSchema, TAgg["$aggs"]>)[];
} : {
    buckets: Bucket<number>[];
};
type MetricValueResult = {
    value: number;
};
type StatsResult = {
    count: number;
    min: number;
    max: number;
    sum: number;
    avg: number;
};
type ExtendedStatsResult<_TAgg> = {
    count: number;
    min: number;
    max: number;
    avg: number;
    sum: number;
    sumOfSquares: number;
    variance: number;
    variancePopulation: number;
    varianceSampling: number;
    stdDeviation: number;
    stdDeviationPopulation: number;
    stdDeviationSampling: number;
    stdDeviationBounds: {
        upper: number;
        lower: number;
        upperSampling: number;
        lowerSampling: number;
        upperPopulation: number;
        lowerPopulation: number;
    };
};
type PercentilesResult<TAgg> = TAgg extends {
    $percentiles: {
        keyed: false;
    };
} ? {
    values: Array<{
        key: number;
        value: number;
    }>;
} : {
    values: {
        [key: string]: number;
    };
};
type FacetChildNode = {
    path: string;
    docCount: number;
    sumOtherDocCount: number;
    children?: FacetChildNode[];
};
type FacetResult = {
    path: string;
    sumOtherDocCount: number;
    children: FacetChildNode[];
};

type CreateIndexParameters<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    name: string;
    prefix: string | string[];
    language?: Language;
    skipInitialScan?: boolean;
    existsOk?: boolean;
} & ({
    dataType: "string";
    schema: TSchema extends NestedIndexSchema ? TSchema : never;
} | {
    dataType: "json";
    schema: TSchema extends NestedIndexSchema ? TSchema : never;
} | {
    dataType: "hash";
    schema: TSchema extends FlatIndexSchema ? TSchema : never;
});
type InitIndexParameters<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    name: string;
    schema?: TSchema;
};
type SearchIndexParameters<TSchema extends NestedIndexSchema | FlatIndexSchema> = {
    name: string;
    client: Requester;
    schema?: TSchema;
};
declare class SearchIndex<TSchema extends NestedIndexSchema | FlatIndexSchema> {
    readonly name: SearchIndexParameters<TSchema>["name"];
    readonly schema?: TSchema;
    private client;
    constructor({ name, schema, client }: SearchIndexParameters<TSchema>);
    waitIndexing(): Promise<0 | 1>;
    describe(): Promise<IndexDescription<TSchema> | null>;
    query<TOpts extends QueryOptions<TSchema>>(options?: TOpts): Promise<QueryResult<TSchema, TOpts>[]>;
    aggregate<TOpts extends AggregateOptions<TSchema>>(options: TOpts): Promise<AggregateResult<TSchema, TOpts>>;
    count({ filter }: {
        filter: RootQueryFilter<TSchema>;
    }): Promise<{
        count: number;
    }>;
    drop(): Promise<1 | 0>;
    addAlias({ alias }: {
        alias: string;
    }): Promise<1>;
}
type InferFilterFromSchema<TSchema extends NestedIndexSchema | FlatIndexSchema> = NonNullable<NonNullable<Parameters<SearchIndex<TSchema>["query"]>[0]>["filter"]>;

type FunctionListArgs = {
    /**
     * Pattern for matching library names. Supports glob patterns.
     *
     * Example: "my_library_*"
     */
    libraryName?: string;
    /**
     * Includes the library source code in the response.
     *
     * @default false
     */
    withCode?: boolean;
};

type FunctionLoadArgs = {
    /**
     * The Lua code to load.
     *
     * Example:
     * ```lua
     * #!lua name=mylib
     * redis.register_function('myfunc', function() return 'ok' end)
     * ```
     */
    code: string;
    /**
     * If true, the library will replace the existing library with the same name.
     *
     * @default false
     */
    replace?: boolean;
};

/**
 * @see https://redis.io/commands/append
 */
declare class AppendCommand extends Command<number, number> {
    constructor(cmd: [key: string, value: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/bitcount
 */
declare class BitCountCommand extends Command<number, number> {
    constructor(cmd: [key: string, start?: never, end?: never], opts?: CommandOptions<number, number>);
    constructor(cmd: [key: string, start: number, end: number], opts?: CommandOptions<number, number>);
}

type SubCommandArgs<TRest extends unknown[] = []> = [
    encoding: string,
    offset: number | string,
    ...rest: TRest
];
/**
 * @see https://redis.io/commands/bitfield
 */
declare class BitFieldCommand<T = Promise<number[]>> {
    private client;
    private opts?;
    private execOperation;
    private command;
    constructor(args: [key: string], client: Requester, opts?: CommandOptions<number[], number[]> | undefined, execOperation?: (command: Command<number[], number[]>) => T);
    private chain;
    get(...args: SubCommandArgs): this;
    set(...args: SubCommandArgs<[value: number]>): this;
    incrby(...args: SubCommandArgs<[increment: number]>): this;
    overflow(overflow: "WRAP" | "SAT" | "FAIL"): this;
    exec(): T;
}

/**
 * @see https://redis.io/commands/bitop
 */
declare class BitOpCommand extends Command<number, number> {
    constructor(cmd: [op: "and" | "or" | "xor", destinationKey: string, ...sourceKeys: string[]], opts?: CommandOptions<number, number>);
    constructor(cmd: [op: "not", destinationKey: string, sourceKey: string], opts?: CommandOptions<number, number>);
    constructor(cmd: [op: "diff" | "diff1" | "andor", destinationKey: string, x: string, ...y: string[]], opts?: CommandOptions<number, number>);
    constructor(cmd: [op: "one", destinationKey: string, ...sourceKeys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/bitpos
 */
declare class BitPosCommand extends Command<number, number> {
    constructor(cmd: [key: string, bit: 0 | 1, start?: number, end?: number], opts?: CommandOptions<number, number>);
}

type ClientSetInfoAttribute = "LIB-NAME" | "lib-name" | "LIB-VER" | "lib-ver";
/**
 * @see https://redis.io/commands/client-setinfo
 */
declare class ClientSetInfoCommand extends Command<string, string> {
    constructor([attribute, value]: [attribute: ClientSetInfoAttribute, value: string], opts?: CommandOptions<string, string>);
}

/**
 * @see https://redis.io/commands/copy
 */
declare class CopyCommand extends Command<number, "COPIED" | "NOT_COPIED"> {
    constructor([key, destinationKey, opts]: [key: string, destinationKey: string, opts?: {
        replace: boolean;
    }], commandOptions?: CommandOptions<number, "COPIED" | "NOT_COPIED">);
}

/**
 * @see https://redis.io/commands/dbsize
 */
declare class DBSizeCommand extends Command<number, number> {
    constructor(opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/decr
 */
declare class DecrCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/decrby
 */
declare class DecrByCommand extends Command<number, number> {
    constructor(cmd: [key: string, decrement: number], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/del
 */
declare class DelCommand extends Command<number, number> {
    constructor(cmd: [...keys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/echo
 */
declare class EchoCommand extends Command<string, string> {
    constructor(cmd: [message: string], opts?: CommandOptions<string, string>);
}

/**
 * @see https://redis.io/commands/eval_ro
 */
declare class EvalROCommand<TArgs extends unknown[], TData> extends Command<unknown, TData> {
    constructor([script, keys, args]: [script: string, keys: string[], args: TArgs], opts?: CommandOptions<unknown, TData>);
}

/**
 * @see https://redis.io/commands/eval
 */
declare class EvalCommand<TArgs extends unknown[], TData> extends Command<unknown, TData> {
    constructor([script, keys, args]: [script: string, keys: string[], args: TArgs], opts?: CommandOptions<unknown, TData>);
}

/**
 * @see https://redis.io/commands/evalsha_ro
 */
declare class EvalshaROCommand<TArgs extends unknown[], TData> extends Command<unknown, TData> {
    constructor([sha, keys, args]: [sha: string, keys: string[], args?: TArgs], opts?: CommandOptions<unknown, TData>);
}

/**
 * @see https://redis.io/commands/evalsha
 */
declare class EvalshaCommand<TArgs extends unknown[], TData> extends Command<unknown, TData> {
    constructor([sha, keys, args]: [sha: string, keys: string[], args?: TArgs], opts?: CommandOptions<unknown, TData>);
}

/**
 * @see https://redis.io/commands/exists
 */
declare class ExistsCommand extends Command<number, number> {
    constructor(cmd: [...keys: string[]], opts?: CommandOptions<number, number>);
}

type ExpireOption = "NX" | "nx" | "XX" | "xx" | "GT" | "gt" | "LT" | "lt";
declare class ExpireCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, seconds: number, option?: ExpireOption], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/expireat
 */
declare class ExpireAtCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, unix: number, option?: ExpireOption], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/flushall
 */
declare class FlushAllCommand extends Command<"OK", "OK"> {
    constructor(args?: [{
        async?: boolean;
    }], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/flushdb
 */
declare class FlushDBCommand extends Command<"OK", "OK"> {
    constructor([opts]: [opts?: {
        async?: boolean;
    }], cmdOpts?: CommandOptions<"OK", "OK">);
}

type GeoAddCommandOptions = {
    nx?: boolean;
    xx?: never;
} | ({
    nx?: never;
    xx?: boolean;
} & {
    ch?: boolean;
});
type GeoMember<TMemberType> = {
    latitude: number;
    longitude: number;
    member: TMemberType;
};
/**
 * @see https://redis.io/commands/geoadd
 */
declare class GeoAddCommand<TMemberType = string> extends Command<number | null, number | null> {
    constructor([key, arg1, ...arg2]: [
        string,
        GeoMember<TMemberType> | GeoAddCommandOptions,
        ...GeoMember<TMemberType>[]
    ], opts?: CommandOptions<number | null, number | null>);
}

/**
 * @see https://redis.io/commands/geodist
 */
declare class GeoDistCommand<TMemberType = string> extends Command<number | null, number | null> {
    constructor([key, member1, member2, unit]: [
        key: string,
        member1: TMemberType,
        member2: TMemberType,
        unit?: "M" | "KM" | "FT" | "MI"
    ], opts?: CommandOptions<number | null, number | null>);
}

/**
 * @see https://redis.io/commands/geohash
 */
declare class GeoHashCommand<TMember = string> extends Command<(string | null)[], (string | null)[]> {
    constructor(cmd: [string, ...TMember[]], opts?: CommandOptions<(string | null)[], (string | null)[]>);
}

type Coordinates = {
    lng: number;
    lat: number;
};
/**
 * @see https://redis.io/commands/geopos
 */
declare class GeoPosCommand<TMember = string> extends Command<(string | null)[][], Coordinates[]> {
    constructor(cmd: [string, ...(TMember[] | TMember[])], opts?: CommandOptions<(string | null)[][], Coordinates[]>);
}

type RadiusOptions$1 = "M" | "KM" | "FT" | "MI";
type CenterPoint$1<TMemberType> = {
    type: "FROMMEMBER" | "frommember";
    member: TMemberType;
} | {
    type: "FROMLONLAT" | "fromlonlat";
    coordinate: {
        lon: number;
        lat: number;
    };
};
type Shape$1 = {
    type: "BYRADIUS" | "byradius";
    radius: number;
    radiusType: RadiusOptions$1;
} | {
    type: "BYBOX" | "bybox";
    rect: {
        width: number;
        height: number;
    };
    rectType: RadiusOptions$1;
};
type GeoSearchCommandOptions$1 = {
    count?: {
        limit: number;
        any?: boolean;
    };
    withCoord?: boolean;
    withDist?: boolean;
    withHash?: boolean;
};
type OptionMappings = {
    withHash: "hash";
    withCoord: "coord";
    withDist: "dist";
};
type GeoSearchOptions<TOptions> = {
    [K in keyof TOptions as K extends keyof OptionMappings ? OptionMappings[K] : never]: K extends "withHash" ? string : K extends "withCoord" ? {
        long: number;
        lat: number;
    } : K extends "withDist" ? number : never;
};
type GeoSearchResponse<TOptions, TMemberType> = ({
    member: TMemberType;
} & GeoSearchOptions<TOptions>)[];
/**
 * @see https://redis.io/commands/geosearch
 */
declare class GeoSearchCommand<TMemberType = string, TOptions extends GeoSearchCommandOptions$1 = GeoSearchCommandOptions$1> extends Command<any[] | any[][], GeoSearchResponse<TOptions, TMemberType>> {
    constructor([key, centerPoint, shape, order, opts]: [
        key: string,
        centerPoint: CenterPoint$1<TMemberType>,
        shape: Shape$1,
        order: "ASC" | "DESC" | "asc" | "desc",
        opts?: TOptions
    ], commandOptions?: CommandOptions<any[] | any[][], GeoSearchResponse<TOptions, TMemberType>>);
}

type RadiusOptions = "M" | "KM" | "FT" | "MI";
type CenterPoint<TMemberType> = {
    type: "FROMMEMBER" | "frommember";
    member: TMemberType;
} | {
    type: "FROMLONLAT" | "fromlonlat";
    coordinate: {
        lon: number;
        lat: number;
    };
};
type Shape = {
    type: "BYRADIUS" | "byradius";
    radius: number;
    radiusType: RadiusOptions;
} | {
    type: "BYBOX" | "bybox";
    rect: {
        width: number;
        height: number;
    };
    rectType: RadiusOptions;
};
type GeoSearchCommandOptions = {
    count?: {
        limit: number;
        any?: boolean;
    };
    storeDist?: boolean;
};
/**
 * @see https://redis.io/commands/geosearchstore
 */
declare class GeoSearchStoreCommand<TMemberType = string, TOptions extends GeoSearchCommandOptions = GeoSearchCommandOptions> extends Command<any[] | any[][], number> {
    constructor([destination, key, centerPoint, shape, order, opts]: [
        destination: string,
        key: string,
        centerPoint: CenterPoint<TMemberType>,
        shape: Shape,
        order: "ASC" | "DESC" | "asc" | "desc",
        opts?: TOptions
    ], commandOptions?: CommandOptions<any[] | any[][], number>);
}

/**
 * @see https://redis.io/commands/get
 */
declare class GetCommand<TData = string> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string], opts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * @see https://redis.io/commands/getbit
 */
declare class GetBitCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, offset: number], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/getdel
 */
declare class GetDelCommand<TData = string> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string], opts?: CommandOptions<unknown | null, TData | null>);
}

type GetExCommandOptions = {
    ex: number;
    px?: never;
    exat?: never;
    pxat?: never;
    persist?: never;
} | {
    ex?: never;
    px: number;
    exat?: never;
    pxat?: never;
    persist?: never;
} | {
    ex?: never;
    px?: never;
    exat: number;
    pxat?: never;
    persist?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat: number;
    persist?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    persist: true;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    persist?: never;
};
/**
 * @see https://redis.io/commands/getex
 */
declare class GetExCommand<TData = string> extends Command<unknown | null, TData | null> {
    constructor([key, opts]: [key: string, opts?: GetExCommandOptions], cmdOpts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * @see https://redis.io/commands/getrange
 */
declare class GetRangeCommand extends Command<string, string> {
    constructor(cmd: [key: string, start: number, end: number], opts?: CommandOptions<string, string>);
}

/**
 * @see https://redis.io/commands/getset
 */
declare class GetSetCommand<TData = string> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string, value: TData], opts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * @see https://redis.io/commands/hdel
 */
declare class HDelCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, ...fields: string[]], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/hexists
 */
declare class HExistsCommand extends Command<number, number> {
    constructor(cmd: [key: string, field: string], opts?: CommandOptions<number, number>);
}

declare class HExpireCommand extends Command<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]> {
    constructor(cmd: [
        key: string,
        fields: (string | number) | (string | number)[],
        seconds: number,
        option?: ExpireOption
    ], opts?: CommandOptions<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]>);
}

declare class HExpireAtCommand extends Command<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]> {
    constructor(cmd: [
        key: string,
        fields: (string | number) | (string | number)[],
        timestamp: number,
        option?: ExpireOption
    ], opts?: CommandOptions<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]>);
}

declare class HExpireTimeCommand extends Command<number[], number[]> {
    constructor(cmd: [key: string, fields: (string | number) | (string | number)[]], opts?: CommandOptions<number[], number[]>);
}

declare class HPersistCommand extends Command<(-2 | -1 | 1)[], (-2 | -1 | 1)[]> {
    constructor(cmd: [key: string, fields: (string | number) | (string | number)[]], opts?: CommandOptions<(-2 | -1 | 1)[], (-2 | -1 | 1)[]>);
}

declare class HPExpireCommand extends Command<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]> {
    constructor(cmd: [
        key: string,
        fields: (string | number) | (string | number)[],
        milliseconds: number,
        option?: ExpireOption
    ], opts?: CommandOptions<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]>);
}

declare class HPExpireAtCommand extends Command<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]> {
    constructor(cmd: [
        key: string,
        fields: (string | number) | (string | number)[],
        timestamp: number,
        option?: ExpireOption
    ], opts?: CommandOptions<(-2 | 0 | 1 | 2)[], (-2 | 0 | 1 | 2)[]>);
}

declare class HPExpireTimeCommand extends Command<number[], number[]> {
    constructor(cmd: [key: string, fields: (string | number) | (string | number)[]], opts?: CommandOptions<number[], number[]>);
}

declare class HPTtlCommand extends Command<number[], number[]> {
    constructor(cmd: [key: string, fields: (string | number) | (string | number)[]], opts?: CommandOptions<number[], number[]>);
}

/**
 * @see https://redis.io/commands/hget
 */
declare class HGetCommand<TData> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string, field: string], opts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * @see https://redis.io/commands/hgetall
 */
declare class HGetAllCommand<TData extends Record<string, unknown>> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string], opts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * HGETDEL returns the values of the specified fields and then atomically deletes them from the hash
 * The field values are returned as an object like this:
 * ```ts
 * {[fieldName: string]: T | null}
 * ```
 *
 * In case all fields are non-existent or the hash doesn't exist, `null` is returned
 *
 * @see https://redis.io/commands/hgetdel
 */
declare class HGetDelCommand<TData extends Record<string, unknown>> extends Command<(string | null)[], TData | null> {
    constructor([key, ...fields]: [key: string, ...fields: (string | number)[]], opts?: CommandOptions<(string | null)[], TData | null>);
}

type HGetExCommandOptions = {
    ex: number;
    px?: never;
    exat?: never;
    pxat?: never;
    persist?: never;
} | {
    ex?: never;
    px: number;
    exat?: never;
    pxat?: never;
    persist?: never;
} | {
    ex?: never;
    px?: never;
    exat: number;
    pxat?: never;
    persist?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat: number;
    persist?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    persist: true;
};
/**
 * HGETEX returns the values of the specified fields and optionally sets their expiration time or TTL
 * The field values are returned as an object like this:
 * ```ts
 * {[fieldName: string]: T | null}
 * ```
 *
 * In case all fields are non-existent or the hash doesn't exist, `null` is returned
 *
 * @see https://redis.io/commands/hgetex
 */
declare class HGetExCommand<TData extends Record<string, unknown>> extends Command<(string | null)[], TData | null> {
    constructor([key, opts, ...fields]: [
        key: string,
        opts: HGetExCommandOptions,
        ...fields: (string | number)[]
    ], cmdOpts?: CommandOptions<(string | null)[], TData | null>);
}

/**
 * @see https://redis.io/commands/hincrby
 */
declare class HIncrByCommand extends Command<number, number> {
    constructor(cmd: [key: string, field: string, increment: number], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/hincrbyfloat
 */
declare class HIncrByFloatCommand extends Command<number, number> {
    constructor(cmd: [key: string, field: string, increment: number], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/hkeys
 */
declare class HKeysCommand extends Command<string[], string[]> {
    constructor([key]: [key: string], opts?: CommandOptions<string[], string[]>);
}

/**
 * @see https://redis.io/commands/hlen
 */
declare class HLenCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * hmget returns an object of all requested fields from a hash
 * The field values are returned as an object like this:
 * ```ts
 * {[fieldName: string]: T | null}
 * ```
 *
 * In case the hash does not exist or all fields are empty `null` is returned
 *
 * @see https://redis.io/commands/hmget
 */
declare class HMGetCommand<TData extends Record<string, unknown>> extends Command<(string | null)[], TData | null> {
    constructor([key, ...fields]: [key: string, ...fields: string[]], opts?: CommandOptions<(string | null)[], TData | null>);
}

/**
 * @see https://redis.io/commands/hmset
 */
declare class HMSetCommand<TData> extends Command<"OK", "OK"> {
    constructor([key, kv]: [key: string, kv: Record<string, TData>], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/hrandfield
 */
declare class HRandFieldCommand<TData extends string | string[] | Record<string, unknown>> extends Command<string | string[], TData> {
    constructor(cmd: [key: string], opts?: CommandOptions<string, string>);
    constructor(cmd: [key: string, count: number], opts?: CommandOptions<string[], string[]>);
    constructor(cmd: [key: string, count: number, withValues: boolean], opts?: CommandOptions<string[], Partial<TData>>);
}

type ScanCommandOptionsStandard = {
    match?: string;
    count?: number;
    type?: string;
    withType?: false;
};
type ScanCommandOptionsWithType = {
    match?: string;
    count?: number;
    /**
     * Includes types of each key in the result
     *
     * @example
     * ```typescript
     * await redis.scan("0", { withType: true })
     * // ["0", [{ key: "key1", type: "string" }, { key: "key2", type: "list" }]]
     * ```
     */
    withType: true;
};
type ScanCommandOptions = ScanCommandOptionsStandard | ScanCommandOptionsWithType;
type ScanResultStandard = [string, string[]];
type ScanResultWithType = [string, {
    key: string;
    type: string;
}[]];
/**
 * @see https://redis.io/commands/scan
 */
declare class ScanCommand<TData = ScanResultStandard> extends Command<[string, string[]], TData> {
    constructor([cursor, opts]: [cursor: string | number, opts?: ScanCommandOptions], cmdOpts?: CommandOptions<[string, string[]], TData>);
}

/**
 * @see https://redis.io/commands/hscan
 */
declare class HScanCommand extends Command<[
    string,
    (string | number)[]
], [
    string,
    (string | number)[]
]> {
    constructor([key, cursor, cmdOpts]: [key: string, cursor: string | number, cmdOpts?: ScanCommandOptions], opts?: CommandOptions<[string, (string | number)[]], [string, (string | number)[]]>);
}

/**
 * @see https://redis.io/commands/hset
 */
declare class HSetCommand<TData> extends Command<number, number> {
    constructor([key, kv]: [key: string, kv: Record<string, TData>], opts?: CommandOptions<number, number>);
}

type HSetExConditionalOptions = "FNX" | "fnx" | "FXX" | "fxx";
type HSetExExpirationOptions = {
    ex: number;
    px?: never;
    exat?: never;
    pxat?: never;
    keepttl?: never;
} | {
    ex?: never;
    px: number;
    exat?: never;
    pxat?: never;
    keepttl?: never;
} | {
    ex?: never;
    px?: never;
    exat: number;
    pxat?: never;
    keepttl?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat: number;
    keepttl?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    keepttl: true;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    keepttl?: never;
};
type HSetExCommandOptions = {
    conditional?: HSetExConditionalOptions;
    expiration?: HSetExExpirationOptions;
};
/**
 * HSETEX sets the specified fields with their values and optionally sets their expiration time or TTL
 * Returns 1 on success and 0 otherwise.
 *
 * @see https://redis.io/commands/hsetex
 */
declare class HSetExCommand<TData> extends Command<number, number> {
    constructor([key, opts, kv]: [key: string, opts: HSetExCommandOptions, kv: Record<string, TData>], cmdOpts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/hsetnx
 */
declare class HSetNXCommand<TData> extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, field: string, value: TData], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/hstrlen
 */
declare class HStrLenCommand extends Command<number, number> {
    constructor(cmd: [key: string, field: string], opts?: CommandOptions<number, number>);
}

declare class HTtlCommand extends Command<number[], number[]> {
    constructor(cmd: [key: string, fields: (string | number) | (string | number)[]], opts?: CommandOptions<number[], number[]>);
}

/**
 * @see https://redis.io/commands/hvals
 */
declare class HValsCommand<TData extends unknown[]> extends Command<unknown[], TData> {
    constructor(cmd: [key: string], opts?: CommandOptions<unknown[], TData>);
}

/**
 * @see https://redis.io/commands/incr
 */
declare class IncrCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/incrby
 */
declare class IncrByCommand extends Command<number, number> {
    constructor(cmd: [key: string, value: number], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/incrbyfloat
 */
declare class IncrByFloatCommand extends Command<number, number> {
    constructor(cmd: [key: string, value: number], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/json.arrappend
 */
declare class JsonArrAppendCommand<TData extends unknown[]> extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path: string, ...values: TData], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.arrindex
 */
declare class JsonArrIndexCommand<TValue> extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path: string, value: TValue, start?: number, stop?: number], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.arrinsert
 */
declare class JsonArrInsertCommand<TData extends unknown[]> extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path: string, index: number, ...values: TData], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.arrlen
 */
declare class JsonArrLenCommand extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.arrpop
 */
declare class JsonArrPopCommand<TData> extends Command<(null | string)[], (TData | null)[]> {
    constructor(cmd: [key: string, path?: string, index?: number], opts?: CommandOptions<(null | string)[], (TData | null)[]>);
}

/**
 * @see https://redis.io/commands/json.arrtrim
 */
declare class JsonArrTrimCommand extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path?: string, start?: number, stop?: number], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.clear
 */
declare class JsonClearCommand extends Command<number, number> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/json.del
 */
declare class JsonDelCommand extends Command<number, number> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/json.forget
 */
declare class JsonForgetCommand extends Command<number, number> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/json.get
 */
declare class JsonGetCommand<TData extends (unknown | Record<string, unknown>) | (unknown | Record<string, unknown>)[]> extends Command<TData | null, TData | null> {
    constructor(cmd: [
        key: string,
        opts?: {
            indent?: string;
            newline?: string;
            space?: string;
        },
        ...path: string[]
    ] | [key: string, ...path: string[]], opts?: CommandOptions<TData | null, TData | null>);
}

/**
 * @see https://redis.io/commands/json.merge
 */
declare class JsonMergeCommand<TData extends string | number | Record<string, unknown> | Array<unknown>> extends Command<"OK" | null, "OK" | null> {
    constructor(cmd: [key: string, path: string, value: TData], opts?: CommandOptions<"OK" | null, "OK" | null>);
}

/**
 * @see https://redis.io/commands/json.mget
 */
declare class JsonMGetCommand<TData = unknown[]> extends Command<TData, TData> {
    constructor(cmd: [keys: string[], path: string], opts?: CommandOptions<TData, TData>);
}

/**
 * @see https://redis.io/commands/json.mset
 */
declare class JsonMSetCommand<TData extends number | string | boolean | Record<string, unknown> | (number | string | boolean | Record<string, unknown>)[]> extends Command<"OK" | null, "OK" | null> {
    constructor(cmd: {
        key: string;
        path: string;
        value: TData;
    }[], opts?: CommandOptions<"OK" | null, "OK" | null>);
}

/**
 * @see https://redis.io/commands/json.numincrby
 */
declare class JsonNumIncrByCommand extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path: string, value: number], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.nummultby
 */
declare class JsonNumMultByCommand extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path: string, value: number], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.objkeys
 */
declare class JsonObjKeysCommand extends Command<(string[] | null)[], (string[] | null)[]> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<(string[] | null)[], (string[] | null)[]>);
}

/**
 * @see https://redis.io/commands/json.objlen
 */
declare class JsonObjLenCommand extends Command<(number | null)[], (number | null)[]> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<(number | null)[], (number | null)[]>);
}

/**
 * @see https://redis.io/commands/json.resp
 */
declare class JsonRespCommand<TData extends unknown[]> extends Command<TData, TData> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<TData, TData>);
}

/**
 * @see https://redis.io/commands/json.set
 */
declare class JsonSetCommand<TData extends number | string | boolean | Record<string, unknown> | (number | string | boolean | Record<string, unknown>)[]> extends Command<"OK" | null, "OK" | null> {
    constructor(cmd: [
        key: string,
        path: string,
        value: TData,
        opts?: {
            nx: true;
            xx?: never;
        } | {
            nx?: never;
            xx: true;
        }
    ], opts?: CommandOptions<"OK" | null, "OK" | null>);
}

/**
 * @see https://redis.io/commands/json.strappend
 */
declare class JsonStrAppendCommand extends Command<(null | string)[], (null | number)[]> {
    constructor(cmd: [key: string, path: string, value: string], opts?: CommandOptions<(null | string)[], (null | number)[]>);
}

/**
 * @see https://redis.io/commands/json.strlen
 */
declare class JsonStrLenCommand extends Command<(number | null)[], (number | null)[]> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<(number | null)[], (number | null)[]>);
}

/**
 * @see https://redis.io/commands/json.toggle
 */
declare class JsonToggleCommand extends Command<number[], number[]> {
    constructor(cmd: [key: string, path: string], opts?: CommandOptions<number[], number[]>);
}

/**
 * @see https://redis.io/commands/json.type
 */
declare class JsonTypeCommand extends Command<string[], string[]> {
    constructor(cmd: [key: string, path?: string], opts?: CommandOptions<string[], string[]>);
}

/**
 * @see https://redis.io/commands/keys
 */
declare class KeysCommand extends Command<string[], string[]> {
    constructor(cmd: [pattern: string], opts?: CommandOptions<string[], string[]>);
}

declare class LIndexCommand<TData = string> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string, index: number], opts?: CommandOptions<unknown | null, TData | null>);
}

declare class LInsertCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, direction: "before" | "after", pivot: TData, value: TData], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/llen
 */
declare class LLenCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/lmove
 */
declare class LMoveCommand<TData = string> extends Command<TData, TData> {
    constructor(cmd: [
        source: string,
        destination: string,
        whereFrom: "left" | "right",
        whereTo: "left" | "right"
    ], opts?: CommandOptions<TData, TData>);
}

/**
 * @see https://redis.io/commands/lmpop
 */
declare class LmPopCommand<TValues> extends Command<[
    string,
    TValues[]
] | null, [
    string,
    TValues[]
] | null> {
    constructor(cmd: [numkeys: number, keys: string[], "LEFT" | "RIGHT", count?: number], opts?: CommandOptions<[string, TValues[]] | null, [string, TValues[]] | null>);
}

/**
 * @see https://redis.io/commands/lpop
 */
declare class LPopCommand<TData = string> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string, count?: number], opts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * @see https://redis.io/commands/lpos
 */
declare class LPosCommand<TData = number> extends Command<TData, TData> {
    constructor(cmd: [key: string, element: unknown, opts?: {
        rank?: number;
        count?: number;
        maxLen?: number;
    }], opts?: CommandOptions<TData, TData>);
}

/**
 * @see https://redis.io/commands/lpush
 */
declare class LPushCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, ...elements: TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/lpushx
 */
declare class LPushXCommand<TData> extends Command<number, number> {
    constructor(cmd: [key: string, ...elements: TData[]], opts?: CommandOptions<number, number>);
}

declare class LRangeCommand<TData = string> extends Command<unknown[], TData[]> {
    constructor(cmd: [key: string, start: number, end: number], opts?: CommandOptions<unknown[], TData[]>);
}

declare class LRemCommand<TData> extends Command<number, number> {
    constructor(cmd: [key: string, count: number, value: TData], opts?: CommandOptions<number, number>);
}

declare class LSetCommand<TData = string> extends Command<"OK", "OK"> {
    constructor(cmd: [key: string, index: number, data: TData], opts?: CommandOptions<"OK", "OK">);
}

declare class LTrimCommand extends Command<"OK", "OK"> {
    constructor(cmd: [key: string, start: number, end: number], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/mget
 */
declare class MGetCommand<TData extends unknown[]> extends Command<(string | null)[], TData> {
    constructor(cmd: [string[]] | [...string[]], opts?: CommandOptions<(string | null)[], TData>);
}

/**
 * @see https://redis.io/commands/mset
 */
declare class MSetCommand<TData> extends Command<"OK", "OK"> {
    constructor([kv]: [kv: Record<string, TData>], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/msetnx
 */
declare class MSetNXCommand<TData = string> extends Command<number, number> {
    constructor([kv]: [kv: Record<string, TData>], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/persist
 */
declare class PersistCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/pexpire
 */
declare class PExpireCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, milliseconds: number, option?: ExpireOption], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/pexpireat
 */
declare class PExpireAtCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, unix: number, option?: ExpireOption], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/pfadd
 */
declare class PfAddCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [string, ...TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/pfcount
 */
declare class PfCountCommand extends Command<number, number> {
    constructor(cmd: [string, ...string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/pfmerge
 */
declare class PfMergeCommand extends Command<"OK", "OK"> {
    constructor(cmd: [destination_key: string, ...string[]], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/ping
 */
declare class PingCommand extends Command<string | "PONG", string | "PONG"> {
    constructor(cmd?: [message?: string], opts?: CommandOptions<string | "PONG", string | "PONG">);
}

/**
 * @see https://redis.io/commands/psetex
 */
declare class PSetEXCommand<TData = string> extends Command<string, string> {
    constructor(cmd: [key: string, ttl: number, value: TData], opts?: CommandOptions<string, string>);
}

/**
 * @see https://redis.io/commands/pttl
 */
declare class PTtlCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/publish
 */
declare class PublishCommand<TMessage = unknown> extends Command<number, number> {
    constructor(cmd: [channel: string, message: TMessage], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/randomkey
 */
declare class RandomKeyCommand extends Command<string | null, string | null> {
    constructor(opts?: CommandOptions<string | null, string | null>);
}

/**
 * @see https://redis.io/commands/rename
 */
declare class RenameCommand extends Command<"OK", "OK"> {
    constructor(cmd: [source: string, destination: string], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/renamenx
 */
declare class RenameNXCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [source: string, destination: string], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/rpop
 */
declare class RPopCommand<TData extends unknown | unknown[] = string> extends Command<unknown | null, TData | null> {
    constructor(cmd: [key: string, count?: number], opts?: CommandOptions<unknown | null, TData | null>);
}

/**
 * @see https://redis.io/commands/rpush
 */
declare class RPushCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, ...elements: TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/rpushx
 */
declare class RPushXCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, ...elements: TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/sadd
 */
declare class SAddCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, member: TData, ...members: TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/scard
 */
declare class SCardCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/script-exists
 */
declare class ScriptExistsCommand<T extends string[]> extends Command<string[], number[]> {
    constructor(hashes: T, opts?: CommandOptions<string[], number[]>);
}

type ScriptFlushCommandOptions = {
    sync: true;
    async?: never;
} | {
    sync?: never;
    async: true;
};
/**
 * @see https://redis.io/commands/script-flush
 */
declare class ScriptFlushCommand extends Command<"OK", "OK"> {
    constructor([opts]: [opts?: ScriptFlushCommandOptions], cmdOpts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/script-load
 */
declare class ScriptLoadCommand extends Command<string, string> {
    constructor(args: [script: string], opts?: CommandOptions<string, string>);
}

/**
 * @see https://redis.io/commands/sdiff
 */
declare class SDiffCommand<TData> extends Command<unknown[], TData[]> {
    constructor(cmd: [key: string, ...keys: string[]], opts?: CommandOptions<unknown[], TData[]>);
}

/**
 * @see https://redis.io/commands/sdiffstore
 */
declare class SDiffStoreCommand extends Command<number, number> {
    constructor(cmd: [destination: string, ...keys: string[]], opts?: CommandOptions<number, number>);
}

type SetCommandOptions = {
    get?: boolean;
} & ({
    ex: number;
    px?: never;
    exat?: never;
    pxat?: never;
    keepTtl?: never;
} | {
    ex?: never;
    px: number;
    exat?: never;
    pxat?: never;
    keepTtl?: never;
} | {
    ex?: never;
    px?: never;
    exat: number;
    pxat?: never;
    keepTtl?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat: number;
    keepTtl?: never;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    keepTtl: true;
} | {
    ex?: never;
    px?: never;
    exat?: never;
    pxat?: never;
    keepTtl?: never;
}) & ({
    nx: true;
    xx?: never;
} | {
    xx: true;
    nx?: never;
} | {
    xx?: never;
    nx?: never;
});
/**
 * @see https://redis.io/commands/set
 */
declare class SetCommand<TData, TResult = TData | "OK" | null> extends Command<TResult, TData | "OK" | null> {
    constructor([key, value, opts]: [key: string, value: TData, opts?: SetCommandOptions], cmdOpts?: CommandOptions<TResult, TData>);
}

/**
 * @see https://redis.io/commands/setbit
 */
declare class SetBitCommand extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, offset: number, value: 0 | 1], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/setex
 */
declare class SetExCommand<TData = string> extends Command<"OK", "OK"> {
    constructor(cmd: [key: string, ttl: number, value: TData], opts?: CommandOptions<"OK", "OK">);
}

/**
 * @see https://redis.io/commands/setnx
 */
declare class SetNxCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, value: TData], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/setrange
 */
declare class SetRangeCommand extends Command<number, number> {
    constructor(cmd: [key: string, offset: number, value: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/sinter
 */
declare class SInterCommand<TData = string> extends Command<unknown[], TData[]> {
    constructor(cmd: [key: string, ...keys: string[]], opts?: CommandOptions<unknown[], TData[]>);
}

/**
 * @see https://redis.io/commands/sintercard
 */
declare class SInterCardCommand extends Command<number, number> {
    constructor(cmd: [keys: string[], opts?: {
        limit?: number;
    }], cmdOpts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/sinterstore
 */
declare class SInterStoreCommand extends Command<number, number> {
    constructor(cmd: [destination: string, key: string, ...keys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/sismember
 */
declare class SIsMemberCommand<TData = string> extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [key: string, member: TData], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/smembers
 */
declare class SMembersCommand<TData extends unknown[] = string[]> extends Command<unknown[], TData> {
    constructor(cmd: [key: string], opts?: CommandOptions<unknown[], TData>);
}

/**
 * @see https://redis.io/commands/smismember
 */
declare class SMIsMemberCommand<TMembers extends unknown[]> extends Command<("0" | "1")[], (0 | 1)[]> {
    constructor(cmd: [key: string, members: TMembers], opts?: CommandOptions<("0" | "1")[], (0 | 1)[]>);
}

/**
 * @see https://redis.io/commands/smove
 */
declare class SMoveCommand<TData> extends Command<"0" | "1", 0 | 1> {
    constructor(cmd: [source: string, destination: string, member: TData], opts?: CommandOptions<"0" | "1", 0 | 1>);
}

/**
 * @see https://redis.io/commands/spop
 */
declare class SPopCommand<TData> extends Command<string | string[] | null, TData | null> {
    constructor([key, count]: [key: string, count?: number], opts?: CommandOptions<string | string[] | null, TData | null>);
}

/**
 * @see https://redis.io/commands/srandmember
 */
declare class SRandMemberCommand<TData> extends Command<string | null, TData | null> {
    constructor([key, count]: [key: string, count?: number], opts?: CommandOptions<string | null, TData | null>);
}

/**
 * @see https://redis.io/commands/srem
 */
declare class SRemCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, ...members: TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/sscan
 */
declare class SScanCommand extends Command<[
    string,
    (string | number)[]
], [
    string,
    (string | number)[]
]> {
    constructor([key, cursor, opts]: [key: string, cursor: string | number, opts?: ScanCommandOptions], cmdOpts?: CommandOptions<[string, (string | number)[]], [string, (string | number)[]]>);
}

/**
 * @see https://redis.io/commands/strlen
 */
declare class StrLenCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/sunion
 */
declare class SUnionCommand<TData> extends Command<string[], TData[]> {
    constructor(cmd: [key: string, ...keys: string[]], opts?: CommandOptions<string[], TData[]>);
}

/**
 * @see https://redis.io/commands/sunionstore
 */
declare class SUnionStoreCommand extends Command<number, number> {
    constructor(cmd: [destination: string, key: string, ...keys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/time
 */
declare class TimeCommand extends Command<[number, number], [number, number]> {
    constructor(opts?: CommandOptions<[number, number], [number, number]>);
}

/**
 * @see https://redis.io/commands/touch
 */
declare class TouchCommand extends Command<number, number> {
    constructor(cmd: [...keys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/ttl
 */
declare class TtlCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/unlink
 */
declare class UnlinkCommand extends Command<number, number> {
    constructor(cmd: [...keys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/xack
 */
declare class XAckCommand extends Command<number, number> {
    constructor([key, group, id]: [key: string, group: string, id: string | string[]], opts?: CommandOptions<number, number>);
}

type XAckDelOption = "KEEPREF" | "keepref" | "DELREF" | "delref" | "ACKED" | "acked";
/**
 * @see https://redis.io/commands/xackdel
 */
declare class XAckDelCommand extends Command<number[], number[]> {
    constructor([key, group, opts, ...ids]: [key: string, group: string, opts: XAckDelOption, ...ids: string[]], cmdOpts?: CommandOptions<number[], number[]>);
}

type XAddCommandOptions = {
    nomkStream?: boolean;
    trim?: ({
        type: "MAXLEN" | "maxlen";
        threshold: number;
    } | {
        type: "MINID" | "minid";
        threshold: string;
    }) & ({
        comparison: "~";
        limit?: number;
    } | {
        comparison: "=";
        limit?: never;
    });
};
/**
 * @see https://redis.io/commands/xadd
 *
 * Stream ID formats:
 * - "*" - Fully automatic ID generation
 * - "<ms>-<seq>" - Explicit ID (e.g., "1526919030474-55")
 * - "<ms>-*" - Auto-generate sequence number for the given millisecond timestamp (Redis 8+)
 */
declare class XAddCommand extends Command<string, string> {
    constructor([key, id, entries, opts]: [
        key: string,
        id: "*" | `${number}-*` | string,
        entries: Record<string, unknown>,
        opts?: XAddCommandOptions
    ], commandOptions?: CommandOptions<string, string>);
}

/**
 * @see https://redis.io/commands/xautoclaim
 */
declare class XAutoClaim extends Command<unknown[], unknown[]> {
    constructor([key, group, consumer, minIdleTime, start, options]: [
        key: string,
        group: string,
        consumer: string,
        minIdleTime: number,
        start: string,
        options?: {
            count?: number;
            justId?: boolean;
        }
    ], opts?: CommandOptions<unknown[], unknown[]>);
}

/**
 * @see https://redis.io/commands/xclaim
 */
declare class XClaimCommand extends Command<unknown[], unknown[]> {
    constructor([key, group, consumer, minIdleTime, id, options]: [
        key: string,
        group: string,
        consumer: string,
        minIdleTime: number,
        id: string | string[],
        options?: {
            idleMS?: number;
            timeMS?: number;
            retryCount?: number;
            force?: boolean;
            justId?: boolean;
            lastId?: number;
        }
    ], opts?: CommandOptions<unknown[], unknown[]>);
}

/**
 * @see https://redis.io/commands/xdel
 */
declare class XDelCommand extends Command<number, number> {
    constructor([key, ids]: [key: string, ids: string[] | string], opts?: CommandOptions<number, number>);
}

type XDelExOption = "KEEPREF" | "keepref" | "DELREF" | "delref" | "ACKED" | "acked";
/**
 * @see https://redis.io/commands/xdelex
 */
declare class XDelExCommand extends Command<number[], number[]> {
    constructor([key, opts, ...ids]: [key: string, opts?: XDelExOption, ...ids: string[]], cmdOpts?: CommandOptions<number[], number[]>);
}

type XGroupCommandType = {
    type: "CREATE";
    group: string;
    id: `$` | string;
    options?: {
        MKSTREAM?: boolean;
        ENTRIESREAD?: number;
    };
} | {
    type: "CREATECONSUMER";
    group: string;
    consumer: string;
} | {
    type: "DELCONSUMER";
    group: string;
    consumer: string;
} | {
    type: "DESTROY";
    group: string;
} | {
    type: "SETID";
    group: string;
    id: `$` | string;
    options?: {
        ENTRIESREAD?: number;
    };
};
type XGroupReturnType<T extends XGroupCommandType> = T["type"] extends "CREATE" ? string : T["type"] extends "CREATECONSUMER" ? 0 | 1 : T["type"] extends "DELCONSUMER" ? number : T["type"] extends "DESTROY" ? 0 | 1 : T["type"] extends "SETID" ? string : never;
/**
 * @see https://redis.io/commands/xgroup
 */
declare class XGroupCommand<TOptions extends XGroupCommandType = XGroupCommandType> extends Command<any, XGroupReturnType<TOptions>> {
    constructor([key, opts]: [key: string, opts: TOptions], commandOptions?: CommandOptions<any, any>);
}

type XInfoCommands = {
    type: "CONSUMERS";
    group: string;
} | {
    type: "GROUPS";
};
/**
 * @see https://redis.io/commands/xinfo
 */
declare class XInfoCommand extends Command<number, unknown[]> {
    constructor([key, options]: [key: string, options: XInfoCommands], opts?: CommandOptions<number, unknown[]>);
}

/**
 * @see https://redis.io/commands/xlen
 */
declare class XLenCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/xpending
 */
declare class XPendingCommand extends Command<unknown[], unknown[]> {
    constructor([key, group, start, end, count, options]: [
        key: string,
        group: string,
        start: string,
        end: string,
        count: number,
        options?: {
            idleTime?: number;
            consumer?: string | string[];
        }
    ], opts?: CommandOptions<unknown[], unknown[]>);
}

declare class XRangeCommand<TData extends Record<string, Record<string, unknown>>> extends Command<string[][], TData> {
    constructor([key, start, end, count]: [key: string, start: string, end: string, count?: number], opts?: CommandOptions<unknown[], TData[]>);
}

type XReadCommandOptions = [
    key: string | string[],
    id: string | string[],
    options?: {
        count?: number;
        /**
         * @deprecated block is not yet supported in Upstash Redis
         */
        blockMS?: number;
    }
];
type XReadOptions = XReadCommandOptions extends [infer K, infer I, ...any[]] ? K extends string ? I extends string ? [
    key: string,
    id: string,
    options?: {
        count?: number;
        /**
         * @deprecated block is not yet supported in Upstash Redis
         */
        blockMS?: number;
    }
] : never : K extends string[] ? I extends string[] ? [
    key: string[],
    id: string[],
    options?: {
        count?: number;
        /**
         * @deprecated block is not yet supported in Upstash Redis
         */
        blockMS?: number;
    }
] : never : never : never;
/**
 * @see https://redis.io/commands/xread
 */
declare class XReadCommand extends Command<number, unknown[]> {
    constructor([key, id, options]: XReadOptions, opts?: CommandOptions<number, unknown[]>);
}

type Options = {
    count?: number;
    /**
     * @deprecated block is not yet supported in Upstash Redis
     */
    blockMS?: number;
    NOACK?: boolean;
};
type XReadGroupCommandOptions = [
    group: string,
    consumer: string,
    key: string | string[],
    id: string | string[],
    options?: Options
];
type XReadGroupOptions = XReadGroupCommandOptions extends [
    string,
    string,
    infer TKey,
    infer TId,
    ...any[]
] ? TKey extends string ? TId extends string ? [group: string, consumer: string, key: string, id: string, options?: Options] : never : TKey extends string[] ? TId extends string[] ? [group: string, consumer: string, key: string[], id: string[], options?: Options] : never : never : never;
/**
 * @see https://redis.io/commands/xreadgroup
 */
declare class XReadGroupCommand extends Command<number, unknown[]> {
    constructor([group, consumer, key, id, options]: XReadGroupOptions, opts?: CommandOptions<number, unknown[]>);
}

declare class XRevRangeCommand<TData extends Record<string, Record<string, unknown>>> extends Command<string[][], TData> {
    constructor([key, end, start, count]: [key: string, end: string, start: string, count?: number], opts?: CommandOptions<unknown[], TData[]>);
}

/**
 * @see https://redis.io/commands/xtrim
 */
type XTrimOptions = {
    strategy: "MAXLEN" | "MINID";
    exactness?: "~" | "=";
    threshold: number | string;
    limit?: number;
};
declare class XTrimCommand extends Command<number, number> {
    constructor([key, options]: [key: string, options: XTrimOptions], opts?: CommandOptions<number, number>);
}

type NXAndXXOptions = {
    nx: true;
    xx?: never;
} | {
    nx?: never;
    xx: true;
} | {
    nx?: never;
    xx?: never;
};
type LTAndGTOptions = {
    lt: true;
    gt?: never;
} | {
    lt?: never;
    gt: true;
} | {
    lt?: never;
    gt?: never;
};
type ZAddCommandOptions = NXAndXXOptions & LTAndGTOptions & {
    ch?: true;
} & {
    incr?: true;
};
type Arg2<TData> = ScoreMember<TData> | ZAddCommandOptions;
type ScoreMember<TData> = {
    score: number;
    member: TData;
};
/**
 * @see https://redis.io/commands/zadd
 */
declare class ZAddCommand<TData = string> extends Command<number | null, number | null> {
    constructor([key, arg1, ...arg2]: [string, Arg2<TData>, ...ScoreMember<TData>[]], opts?: CommandOptions<number | null, number | null>);
}

/**
 * @see https://redis.io/commands/zcard
 */
declare class ZCardCommand extends Command<number, number> {
    constructor(cmd: [key: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zcount
 */
declare class ZCountCommand extends Command<number, number> {
    constructor(cmd: [key: string, min: number | string, max: number | string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zincrby
 */
declare class ZIncrByCommand<TData> extends Command<number, number> {
    constructor(cmd: [key: string, increment: number, member: TData], opts?: CommandOptions<number, number>);
}

type ZInterStoreCommandOptions = {
    aggregate?: "sum" | "min" | "max";
} & ({
    weight: number;
    weights?: never;
} | {
    weight?: never;
    weights: number[];
} | {
    weight?: never;
    weights?: never;
});
/**
 * @see https://redis.io/commands/zInterstore
 */
declare class ZInterStoreCommand extends Command<number, number> {
    constructor(cmd: [destination: string, numKeys: 1, key: string, opts?: ZInterStoreCommandOptions], cmdOpts?: CommandOptions<number, number>);
    constructor(cmd: [destination: string, numKeys: number, keys: string[], opts?: ZInterStoreCommandOptions], cmdOpts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zlexcount
 */
declare class ZLexCountCommand extends Command<number, number> {
    constructor(cmd: [key: string, min: string, max: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zpopmax
 */
declare class ZPopMaxCommand<TData> extends Command<string[], TData[]> {
    constructor([key, count]: [key: string, count?: number], opts?: CommandOptions<string[], TData[]>);
}

/**
 * @see https://redis.io/commands/zpopmin
 */
declare class ZPopMinCommand<TData> extends Command<string[], TData[]> {
    constructor([key, count]: [key: string, count?: number], opts?: CommandOptions<string[], TData[]>);
}

type ZRangeCommandOptions = {
    withScores?: boolean;
    rev?: boolean;
} & ({
    byScore: true;
    byLex?: never;
} | {
    byScore?: never;
    byLex: true;
} | {
    byScore?: never;
    byLex?: never;
}) & ({
    offset: number;
    count: number;
} | {
    offset?: never;
    count?: never;
});
/**
 * @see https://redis.io/commands/zrange
 */
declare class ZRangeCommand<TData extends unknown[]> extends Command<string[], TData> {
    constructor(cmd: [key: string, min: number, max: number, opts?: ZRangeCommandOptions], cmdOpts?: CommandOptions<string[], TData>);
    constructor(cmd: [
        key: string,
        min: `(${string}` | `[${string}` | "-" | "+",
        max: `(${string}` | `[${string}` | "-" | "+",
        opts: {
            byLex: true;
        } & ZRangeCommandOptions
    ], cmdOpts?: CommandOptions<string[], TData>);
    constructor(cmd: [
        key: string,
        min: number | `(${number}` | "-inf" | "+inf",
        max: number | `(${number}` | "-inf" | "+inf",
        opts: {
            byScore: true;
        } & ZRangeCommandOptions
    ], cmdOpts?: CommandOptions<string[], TData>);
}

/**
 *  @see https://redis.io/commands/zrank
 */
declare class ZRankCommand<TData> extends Command<number | null, number | null> {
    constructor(cmd: [key: string, member: TData], opts?: CommandOptions<number | null, number | null>);
}

/**
 * @see https://redis.io/commands/zrem
 */
declare class ZRemCommand<TData = string> extends Command<number, number> {
    constructor(cmd: [key: string, ...members: TData[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zremrangebylex
 */
declare class ZRemRangeByLexCommand extends Command<number, number> {
    constructor(cmd: [key: string, min: string, max: string], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zremrangebyrank
 */
declare class ZRemRangeByRankCommand extends Command<number, number> {
    constructor(cmd: [key: string, start: number, stop: number], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zremrangebyscore
 */
declare class ZRemRangeByScoreCommand extends Command<number, number> {
    constructor(cmd: [
        key: string,
        min: number | `(${number}` | "-inf" | "+inf",
        max: number | `(${number}` | "-inf" | "+inf"
    ], opts?: CommandOptions<number, number>);
}

/**
 *  @see https://redis.io/commands/zrevrank
 */
declare class ZRevRankCommand<TData> extends Command<number | null, number | null> {
    constructor(cmd: [key: string, member: TData], opts?: CommandOptions<number | null, number | null>);
}

/**
 * @see https://redis.io/commands/zscan
 */
declare class ZScanCommand extends Command<[
    string,
    (string | number)[]
], [
    string,
    (string | number)[]
]> {
    constructor([key, cursor, opts]: [key: string, cursor: string | number, opts?: ScanCommandOptions], cmdOpts?: CommandOptions<[string, (string | number)[]], [string, (string | number)[]]>);
}

/**
 * @see https://redis.io/commands/zscore
 */
declare class ZScoreCommand<TData> extends Command<string | null, number | null> {
    constructor(cmd: [key: string, member: TData], opts?: CommandOptions<string | null, number | null>);
}

type ZUnionCommandOptions = {
    withScores?: boolean;
    aggregate?: "sum" | "min" | "max";
} & ({
    weight: number;
    weights?: never;
} | {
    weight?: never;
    weights: number[];
} | {
    weight?: never;
    weights?: never;
});
/**
 * @see https://redis.io/commands/zunion
 */
declare class ZUnionCommand<TData extends unknown[]> extends Command<string[], TData> {
    constructor(cmd: [numKeys: 1, key: string, opts?: ZUnionCommandOptions], cmdOpts?: CommandOptions<string[], TData>);
    constructor(cmd: [numKeys: number, keys: string[], opts?: ZUnionCommandOptions], cmdOpts?: CommandOptions<string[], TData>);
}

type ZUnionStoreCommandOptions = {
    aggregate?: "sum" | "min" | "max";
} & ({
    weight: number;
    weights?: never;
} | {
    weight?: never;
    weights: number[];
} | {
    weight?: never;
    weights?: never;
});
/**
 * @see https://redis.io/commands/zunionstore
 */
declare class ZUnionStoreCommand extends Command<number, number> {
    constructor(cmd: [destination: string, numKeys: 1, key: string, opts?: ZUnionStoreCommandOptions], cmdOpts?: CommandOptions<number, number>);
    constructor(cmd: [destination: string, numKeys: number, keys: string[], opts?: ZUnionStoreCommandOptions], cmdOpts?: CommandOptions<number, number>);
}

type BaseMessageData<TMessage> = {
    channel: string;
    message: TMessage;
};
type PatternMessageData<TMessage> = BaseMessageData<TMessage> & {
    pattern: string;
};
type SubscriptionCountEvent = number;
type MessageEventMap<TMessage> = {
    message: BaseMessageData<TMessage>;
    subscribe: SubscriptionCountEvent;
    unsubscribe: SubscriptionCountEvent;
    pmessage: PatternMessageData<TMessage>;
    psubscribe: SubscriptionCountEvent;
    punsubscribe: SubscriptionCountEvent;
    error: Error;
    [key: `message:${string}`]: BaseMessageData<TMessage>;
    [key: `pmessage:${string}`]: PatternMessageData<TMessage>;
};
type EventType = keyof MessageEventMap<any>;
type Listener<TMessage, T extends EventType> = (event: MessageEventMap<TMessage>[T]) => void;
declare class Subscriber<TMessage = any> extends EventTarget {
    private subscriptions;
    private client;
    private listeners;
    private opts?;
    constructor(client: Requester, channels: string[], isPattern?: boolean, opts?: Pick<RedisOptions, "automaticDeserialization">);
    private subscribeToChannel;
    private subscribeToPattern;
    private handleMessage;
    private dispatchToListeners;
    on<T extends keyof MessageEventMap<TMessage>>(type: T, listener: Listener<TMessage, T>): void;
    removeAllListeners(): void;
    unsubscribe(channels?: string[]): Promise<void>;
    getSubscribedChannels(): string[];
}

/**
 * @see https://redis.io/commands/zdiffstore
 */
declare class ZDiffStoreCommand extends Command<number, number> {
    constructor(cmd: [destination: string, numkeys: number, ...keys: string[]], opts?: CommandOptions<number, number>);
}

/**
 * @see https://redis.io/commands/zmscore
 */
declare class ZMScoreCommand<TData> extends Command<string[] | null, number[] | null> {
    constructor(cmd: [key: string, members: TData[]], opts?: CommandOptions<string[] | null, number[] | null>);
}

type InferResponseData<T extends unknown[]> = {
    [K in keyof T]: T[K] extends Command<any, infer TData> ? TData : unknown;
};
interface ExecMethod<TCommands extends Command<any, any>[]> {
    /**
     * Send the pipeline request to upstash.
     *
     * Returns an array with the results of all pipelined commands.
     *
     * If all commands are statically chained from start to finish, types are inferred. You can still define a return type manually if necessary though:
     * ```ts
     * const p = redis.pipeline()
     * p.get("key")
     * const result = p.exec<[{ greeting: string }]>()
     * ```
     *
     * If one of the commands get an error, the whole pipeline fails. Alternatively, you can set the keepErrors option to true in order to get the errors individually.
     *
     * If keepErrors is set to true, a list of objects is returned where each object corresponds to a command and is of type: `{ result: unknown, error?: string }`.
     *
     * ```ts
     * const p = redis.pipeline()
     * p.get("key")
     *
     * const result = await p.exec({ keepErrors: true });
     * const getResult = result[0].result
     * const getError = result[0].error
     * ```
     */
    <TCommandResults extends unknown[] = [] extends TCommands ? unknown[] : InferResponseData<TCommands>>(): Promise<TCommandResults>;
    <TCommandResults extends unknown[] = [] extends TCommands ? unknown[] : InferResponseData<TCommands>>(options: {
        keepErrors: true;
    }): Promise<{
        [K in keyof TCommandResults]: UpstashResponse<TCommandResults[K]>;
    }>;
}
/**
 * Upstash REST API supports command pipelining to send multiple commands in
 * batch, instead of sending each command one by one and waiting for a response.
 * When using pipelines, several commands are sent using a single HTTP request,
 * and a single JSON array response is returned. Each item in the response array
 * corresponds to the command in the same order within the pipeline.
 *
 * **NOTE:**
 *
 * Execution of the pipeline is not atomic. Even though each command in
 * the pipeline will be executed in order, commands sent by other clients can
 * interleave with the pipeline.
 *
 * **Examples:**
 *
 * ```ts
 *  const p = redis.pipeline() // or redis.multi()
 * p.set("key","value")
 * p.get("key")
 * const res = await p.exec()
 * ```
 *
 * You can also chain commands together
 * ```ts
 * const p = redis.pipeline()
 * const res = await p.set("key","value").get("key").exec()
 * ```
 *
 * Return types are inferred if all commands are chained, but you can still
 * override the response type manually:
 * ```ts
 *  redis.pipeline()
 *   .set("key", { greeting: "hello"})
 *   .get("key")
 *   .exec<["OK", { greeting: string } ]>()
 *
 * ```
 */
declare class Pipeline<TCommands extends Command<any, any>[] = []> {
    private client;
    private commands;
    private commandOptions?;
    private multiExec;
    constructor(opts: {
        client: Requester;
        commandOptions?: CommandOptions<any, any>;
        multiExec?: boolean;
    });
    exec: ExecMethod<TCommands>;
    /**
     * Returns the length of pipeline before the execution
     */
    length(): number;
    /**
     * Pushes a command into the pipeline and returns a chainable instance of the
     * pipeline
     */
    private chain;
    /**
     * @see https://redis.io/commands/append
     */
    append: (...args: CommandArgs<typeof AppendCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/bitcount
     */
    bitcount: (...args: CommandArgs<typeof BitCountCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * Returns an instance that can be used to execute `BITFIELD` commands on one key.
     *
     * @example
     * ```typescript
     * redis.set("mykey", 0);
     * const result = await redis.pipeline()
     *   .bitfield("mykey")
     *   .set("u4", 0, 16)
     *   .incr("u4", "#1", 1)
     *   .exec();
     * console.log(result); // [[0, 1]]
     * ```
     *
     * @see https://redis.io/commands/bitfield
     */
    bitfield: (...args: CommandArgs<typeof BitFieldCommand>) => BitFieldCommand<Pipeline<[...TCommands, Command<any, number[]>]>>;
    /**
     * @see https://redis.io/commands/bitop
     */
    bitop: {
        (op: "and" | "or" | "xor", destinationKey: string, sourceKey: string, ...sourceKeys: string[]): Pipeline<[...TCommands, BitOpCommand]>;
        (op: "not", destinationKey: string, sourceKey: string): Pipeline<[...TCommands, BitOpCommand]>;
        (op: "diff" | "diff1" | "andor", destinationKey: string, x: string, ...y: string[]): Pipeline<[...TCommands, BitOpCommand]>;
        (op: "one", destinationKey: string, ...sourceKeys: string[]): Pipeline<[...TCommands, BitOpCommand]>;
    };
    /**
     * @see https://redis.io/commands/bitpos
     */
    bitpos: (...args: CommandArgs<typeof BitPosCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/client-setinfo
     */
    clientSetinfo: (...args: CommandArgs<typeof ClientSetInfoCommand>) => Pipeline<[...TCommands, Command<any, string>]>;
    /**
     * @see https://redis.io/commands/copy
     */
    copy: (...args: CommandArgs<typeof CopyCommand>) => Pipeline<[...TCommands, Command<any, "COPIED" | "NOT_COPIED">]>;
    /**
     * @see https://redis.io/commands/zdiffstore
     */
    zdiffstore: (...args: CommandArgs<typeof ZDiffStoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/dbsize
     */
    dbsize: () => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/decr
     */
    decr: (...args: CommandArgs<typeof DecrCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/decrby
     */
    decrby: (...args: CommandArgs<typeof DecrByCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/del
     */
    del: (...args: CommandArgs<typeof DelCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/echo
     */
    echo: (...args: CommandArgs<typeof EchoCommand>) => Pipeline<[...TCommands, Command<any, string>]>;
    /**
     * @see https://redis.io/commands/eval_ro
     */
    evalRo: <TArgs extends unknown[], TData = unknown>(...args: [script: string, keys: string[], args: TArgs]) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/eval
     */
    eval: <TArgs extends unknown[], TData = unknown>(...args: [script: string, keys: string[], args: TArgs]) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/evalsha_ro
     */
    evalshaRo: <TArgs extends unknown[], TData = unknown>(...args: [sha1: string, keys: string[], args: TArgs]) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/evalsha
     */
    evalsha: <TArgs extends unknown[], TData = unknown>(...args: [sha1: string, keys: string[], args: TArgs]) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/exists
     */
    exists: (...args: CommandArgs<typeof ExistsCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/expire
     */
    expire: (...args: CommandArgs<typeof ExpireCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/expireat
     */
    expireat: (...args: CommandArgs<typeof ExpireAtCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/flushall
     */
    flushall: (args?: CommandArgs<typeof FlushAllCommand>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/flushdb
     */
    flushdb: (...args: CommandArgs<typeof FlushDBCommand>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/geoadd
     */
    geoadd: <TData>(...args: CommandArgs<typeof GeoAddCommand<TData>>) => Pipeline<[...TCommands, Command<any, number | null>]>;
    /**
     * @see https://redis.io/commands/geodist
     */
    geodist: <TData>(...args: CommandArgs<typeof GeoDistCommand<TData>>) => Pipeline<[...TCommands, Command<any, number | null>]>;
    /**
     * @see https://redis.io/commands/geopos
     */
    geopos: <TData>(...args: CommandArgs<typeof GeoPosCommand<TData>>) => Pipeline<[...TCommands, Command<any, {
        lng: number;
        lat: number;
    }[]>]>;
    /**
     * @see https://redis.io/commands/geohash
     */
    geohash: <TData>(...args: CommandArgs<typeof GeoHashCommand<TData>>) => Pipeline<[...TCommands, Command<any, (string | null)[]>]>;
    /**
     * @see https://redis.io/commands/geosearch
     */
    geosearch: <TData>(...args: CommandArgs<typeof GeoSearchCommand<TData>>) => Pipeline<[...TCommands, Command<any, ({
        member: TData;
    } & {
        coord?: {
            long: number;
            lat: number;
        } | undefined;
        dist?: number | undefined;
        hash?: string | undefined;
    })[]>]>;
    /**
     * @see https://redis.io/commands/geosearchstore
     */
    geosearchstore: <TData>(...args: CommandArgs<typeof GeoSearchStoreCommand<TData>>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/get
     */
    get: <TData>(...args: CommandArgs<typeof GetCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/getbit
     */
    getbit: (...args: CommandArgs<typeof GetBitCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/getdel
     */
    getdel: <TData>(...args: CommandArgs<typeof GetDelCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/getex
     */
    getex: <TData>(...args: CommandArgs<typeof GetExCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/getrange
     */
    getrange: (...args: CommandArgs<typeof GetRangeCommand>) => Pipeline<[...TCommands, Command<any, string>]>;
    /**
     * @see https://redis.io/commands/getset
     */
    getset: <TData>(key: string, value: TData) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/hdel
     */
    hdel: (...args: CommandArgs<typeof HDelCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/hexists
     */
    hexists: (...args: CommandArgs<typeof HExistsCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hexpire
     */
    hexpire: (...args: CommandArgs<typeof HExpireCommand>) => Pipeline<[...TCommands, Command<any, (0 | 1 | 2 | -2)[]>]>;
    /**
     * @see https://redis.io/commands/hexpireat
     */
    hexpireat: (...args: CommandArgs<typeof HExpireAtCommand>) => Pipeline<[...TCommands, Command<any, (0 | 1 | 2 | -2)[]>]>;
    /**
     * @see https://redis.io/commands/hexpiretime
     */
    hexpiretime: (...args: CommandArgs<typeof HExpireTimeCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/httl
     */
    httl: (...args: CommandArgs<typeof HTtlCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/hpexpire
     */
    hpexpire: (...args: CommandArgs<typeof HPExpireCommand>) => Pipeline<[...TCommands, Command<any, (0 | 1 | 2 | -2)[]>]>;
    /**
     * @see https://redis.io/commands/hpexpireat
     */
    hpexpireat: (...args: CommandArgs<typeof HPExpireAtCommand>) => Pipeline<[...TCommands, Command<any, (0 | 1 | 2 | -2)[]>]>;
    /**
     * @see https://redis.io/commands/hpexpiretime
     */
    hpexpiretime: (...args: CommandArgs<typeof HPExpireTimeCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/hpttl
     */
    hpttl: (...args: CommandArgs<typeof HPTtlCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/hpersist
     */
    hpersist: (...args: CommandArgs<typeof HPersistCommand>) => Pipeline<[...TCommands, Command<any, (1 | -2 | -1)[]>]>;
    /**
     * @see https://redis.io/commands/hget
     */
    hget: <TData>(...args: CommandArgs<typeof HGetCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/hgetall
     */
    hgetall: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HGetAllCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/hgetdel
     */
    hgetdel: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HGetDelCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/hgetex
     */
    hgetex: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HGetExCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/hincrby
     */
    hincrby: (...args: CommandArgs<typeof HIncrByCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hincrbyfloat
     */
    hincrbyfloat: (...args: CommandArgs<typeof HIncrByFloatCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hkeys
     */
    hkeys: (...args: CommandArgs<typeof HKeysCommand>) => Pipeline<[...TCommands, Command<any, string[]>]>;
    /**
     * @see https://redis.io/commands/hlen
     */
    hlen: (...args: CommandArgs<typeof HLenCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hmget
     */
    hmget: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HMGetCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/hmset
     */
    hmset: <TData>(key: string, kv: Record<string, TData>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/hrandfield
     */
    hrandfield: <TData extends string | string[] | Record<string, unknown>>(key: string, count?: number, withValues?: boolean) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/hscan
     */
    hscan: (...args: CommandArgs<typeof HScanCommand>) => Pipeline<[...TCommands, Command<any, [string, (string | number)[]]>]>;
    /**
     * @see https://redis.io/commands/hset
     */
    hset: <TData>(key: string, kv: Record<string, TData>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hsetex
     */
    hsetex: <TData>(...args: CommandArgs<typeof HSetExCommand<TData>>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hsetnx
     */
    hsetnx: <TData>(key: string, field: string, value: TData) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/hstrlen
     */
    hstrlen: (...args: CommandArgs<typeof HStrLenCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/hvals
     */
    hvals: (...args: CommandArgs<typeof HValsCommand>) => Pipeline<[...TCommands, Command<any, any>]>;
    /**
     * @see https://redis.io/commands/incr
     */
    incr: (...args: CommandArgs<typeof IncrCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/incrby
     */
    incrby: (...args: CommandArgs<typeof IncrByCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/incrbyfloat
     */
    incrbyfloat: (...args: CommandArgs<typeof IncrByFloatCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/keys
     */
    keys: (...args: CommandArgs<typeof KeysCommand>) => Pipeline<[...TCommands, Command<any, string[]>]>;
    /**
     * @see https://redis.io/commands/lindex
     */
    lindex: (...args: CommandArgs<typeof LIndexCommand>) => Pipeline<[...TCommands, Command<any, any>]>;
    /**
     * @see https://redis.io/commands/linsert
     */
    linsert: <TData>(key: string, direction: "before" | "after", pivot: TData, value: TData) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/llen
     */
    llen: (...args: CommandArgs<typeof LLenCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/lmove
     */
    lmove: <TData = string>(...args: CommandArgs<typeof LMoveCommand>) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/lpop
     */
    lpop: <TData>(...args: CommandArgs<typeof LPopCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/lmpop
     */
    lmpop: <TData>(...args: CommandArgs<typeof LmPopCommand>) => Pipeline<[...TCommands, Command<any, [string, TData[]] | null>]>;
    /**
     * @see https://redis.io/commands/lpos
     */
    lpos: <TData>(...args: CommandArgs<typeof LPosCommand>) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/lpush
     */
    lpush: <TData>(key: string, ...elements: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/lpushx
     */
    lpushx: <TData>(key: string, ...elements: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/lrange
     */
    lrange: <TResult = string>(...args: CommandArgs<typeof LRangeCommand>) => Pipeline<[...TCommands, Command<any, TResult[]>]>;
    /**
     * @see https://redis.io/commands/lrem
     */
    lrem: <TData>(key: string, count: number, value: TData) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/lset
     */
    lset: <TData>(key: string, index: number, value: TData) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/ltrim
     */
    ltrim: (...args: CommandArgs<typeof LTrimCommand>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/mget
     */
    mget: <TData extends unknown[]>(...args: CommandArgs<typeof MGetCommand>) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/mset
     */
    mset: <TData>(kv: Record<string, TData>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/msetnx
     */
    msetnx: <TData>(kv: Record<string, TData>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/persist
     */
    persist: (...args: CommandArgs<typeof PersistCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/pexpire
     */
    pexpire: (...args: CommandArgs<typeof PExpireCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/pexpireat
     */
    pexpireat: (...args: CommandArgs<typeof PExpireAtCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/pfadd
     */
    pfadd: (...args: CommandArgs<typeof PfAddCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/pfcount
     */
    pfcount: (...args: CommandArgs<typeof PfCountCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/pfmerge
     */
    pfmerge: (...args: CommandArgs<typeof PfMergeCommand>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/ping
     */
    ping: (args?: CommandArgs<typeof PingCommand>) => Pipeline<[...TCommands, Command<any, string>]>;
    /**
     * @see https://redis.io/commands/psetex
     */
    psetex: <TData>(key: string, ttl: number, value: TData) => Pipeline<[...TCommands, Command<any, string>]>;
    /**
     * @see https://redis.io/commands/pttl
     */
    pttl: (...args: CommandArgs<typeof PTtlCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/publish
     */
    publish: (...args: CommandArgs<typeof PublishCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/randomkey
     */
    randomkey: () => Pipeline<[...TCommands, Command<any, string | null>]>;
    /**
     * @see https://redis.io/commands/rename
     */
    rename: (...args: CommandArgs<typeof RenameCommand>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/renamenx
     */
    renamenx: (...args: CommandArgs<typeof RenameNXCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/rpop
     */
    rpop: <TData = string>(...args: CommandArgs<typeof RPopCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/rpush
     */
    rpush: <TData>(key: string, ...elements: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/rpushx
     */
    rpushx: <TData>(key: string, ...elements: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/sadd
     */
    sadd: <TData>(key: string, member: TData, ...members: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/scan
     */
    scan: (...args: CommandArgs<typeof ScanCommand>) => Pipeline<[...TCommands, Command<any, any>]>;
    /**
     * @see https://redis.io/commands/scard
     */
    scard: (...args: CommandArgs<typeof SCardCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/script-exists
     */
    scriptExists: (...args: CommandArgs<typeof ScriptExistsCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/script-flush
     */
    scriptFlush: (...args: CommandArgs<typeof ScriptFlushCommand>) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/script-load
     */
    scriptLoad: (...args: CommandArgs<typeof ScriptLoadCommand>) => Pipeline<[...TCommands, Command<any, string>]>;
    sdiff: (...args: CommandArgs<typeof SDiffCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/sdiffstore
     */
    sdiffstore: (...args: CommandArgs<typeof SDiffStoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/set
     */
    set: <TData>(key: string, value: TData, opts?: SetCommandOptions) => Pipeline<[...TCommands, Command<any, "OK" | TData | null>]>;
    /**
     * @see https://redis.io/commands/setbit
     */
    setbit: (...args: CommandArgs<typeof SetBitCommand>) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/setex
     */
    setex: <TData>(key: string, ttl: number, value: TData) => Pipeline<[...TCommands, Command<any, "OK">]>;
    /**
     * @see https://redis.io/commands/setnx
     */
    setnx: <TData>(key: string, value: TData) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/setrange
     */
    setrange: (...args: CommandArgs<typeof SetRangeCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/sinter
     */
    sinter: (...args: CommandArgs<typeof SInterCommand>) => Pipeline<[...TCommands, Command<any, string[]>]>;
    /**
     * @see https://redis.io/commands/sintercard
     */
    sintercard: (...args: CommandArgs<typeof SInterCardCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/sinterstore
     */
    sinterstore: (...args: CommandArgs<typeof SInterStoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/sismember
     */
    sismember: <TData>(key: string, member: TData) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/smembers
     */
    smembers: <TData extends unknown[] = string[]>(...args: CommandArgs<typeof SMembersCommand>) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/smismember
     */
    smismember: <TMembers extends unknown[]>(key: string, members: TMembers) => Pipeline<[...TCommands, Command<any, (0 | 1)[]>]>;
    /**
     * @see https://redis.io/commands/smove
     */
    smove: <TData>(source: string, destination: string, member: TData) => Pipeline<[...TCommands, Command<any, 0 | 1>]>;
    /**
     * @see https://redis.io/commands/spop
     */
    spop: <TData>(...args: CommandArgs<typeof SPopCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/srandmember
     */
    srandmember: <TData>(...args: CommandArgs<typeof SRandMemberCommand>) => Pipeline<[...TCommands, Command<any, TData | null>]>;
    /**
     * @see https://redis.io/commands/srem
     */
    srem: <TData>(key: string, ...members: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/sscan
     */
    sscan: (...args: CommandArgs<typeof SScanCommand>) => Pipeline<[...TCommands, Command<any, [string, (string | number)[]]>]>;
    /**
     * @see https://redis.io/commands/strlen
     */
    strlen: (...args: CommandArgs<typeof StrLenCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/sunion
     */
    sunion: (...args: CommandArgs<typeof SUnionCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/sunionstore
     */
    sunionstore: (...args: CommandArgs<typeof SUnionStoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/time
     */
    time: () => Pipeline<[...TCommands, Command<any, [number, number]>]>;
    /**
     * @see https://redis.io/commands/touch
     */
    touch: (...args: CommandArgs<typeof TouchCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/ttl
     */
    ttl: (...args: CommandArgs<typeof TtlCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/type
     */
    type: (...args: CommandArgs<typeof TypeCommand>) => Pipeline<[...TCommands, Command<any, Type>]>;
    /**
     * @see https://redis.io/commands/unlink
     */
    unlink: (...args: CommandArgs<typeof UnlinkCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zadd
     */
    zadd: <TData>(...args: [key: string, scoreMember: ScoreMember<TData>, ...scoreMemberPairs: ScoreMember<TData>[]] | [key: string, opts: ZAddCommandOptions, ...scoreMemberPairs: [ScoreMember<TData>, ...ScoreMember<TData>[]]]) => Pipeline<[...TCommands, Command<any, number | null>]>;
    /**
     * @see https://redis.io/commands/xadd
     */
    xadd: (...args: CommandArgs<typeof XAddCommand>) => Pipeline<[...TCommands, Command<any, string>]>;
    /**
     * @see https://redis.io/commands/xack
     */
    xack: (...args: CommandArgs<typeof XAckCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/xackdel
     */
    xackdel: (...args: CommandArgs<typeof XAckDelCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/xdel
     */
    xdel: (...args: CommandArgs<typeof XDelCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/xdelex
     */
    xdelex: (...args: CommandArgs<typeof XDelExCommand>) => Pipeline<[...TCommands, Command<any, number[]>]>;
    /**
     * @see https://redis.io/commands/xgroup
     */
    xgroup: (...args: CommandArgs<typeof XGroupCommand>) => Pipeline<[...TCommands, Command<any, never>]>;
    /**
     * @see https://redis.io/commands/xread
     */
    xread: (...args: CommandArgs<typeof XReadCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/xreadgroup
     */
    xreadgroup: (...args: CommandArgs<typeof XReadGroupCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/xinfo
     */
    xinfo: (...args: CommandArgs<typeof XInfoCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/xlen
     */
    xlen: (...args: CommandArgs<typeof XLenCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/xpending
     */
    xpending: (...args: CommandArgs<typeof XPendingCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/xclaim
     */
    xclaim: (...args: CommandArgs<typeof XClaimCommand>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/xautoclaim
     */
    xautoclaim: (...args: CommandArgs<typeof XAutoClaim>) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
    /**
     * @see https://redis.io/commands/xtrim
     */
    xtrim: (...args: CommandArgs<typeof XTrimCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/xrange
     */
    xrange: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof XRangeCommand>) => Pipeline<[...TCommands, Command<any, Record<string, TData>>]>;
    /**
     * @see https://redis.io/commands/xrevrange
     */
    xrevrange: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof XRevRangeCommand>) => Pipeline<[...TCommands, Command<any, Record<string, TData>>]>;
    /**
     * @see https://redis.io/commands/zcard
     */
    zcard: (...args: CommandArgs<typeof ZCardCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zcount
     */
    zcount: (...args: CommandArgs<typeof ZCountCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zincrby
     */
    zincrby: <TData>(key: string, increment: number, member: TData) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zinterstore
     */
    zinterstore: (...args: CommandArgs<typeof ZInterStoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zlexcount
     */
    zlexcount: (...args: CommandArgs<typeof ZLexCountCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zmscore
     */
    zmscore: (...args: CommandArgs<typeof ZMScoreCommand>) => Pipeline<[...TCommands, Command<any, number[] | null>]>;
    /**
     * @see https://redis.io/commands/zpopmax
     */
    zpopmax: <TData>(...args: CommandArgs<typeof ZPopMaxCommand>) => Pipeline<[...TCommands, Command<any, TData[]>]>;
    /**
     * @see https://redis.io/commands/zpopmin
     */
    zpopmin: <TData>(...args: CommandArgs<typeof ZPopMinCommand>) => Pipeline<[...TCommands, Command<any, TData[]>]>;
    /**
     * @see https://redis.io/commands/zrange
     */
    zrange: <TData extends unknown[]>(...args: [key: string, min: number, max: number, opts?: ZRangeCommandOptions] | [key: string, min: `(${string}` | `[${string}` | "-" | "+", max: `(${string}` | `[${string}` | "-" | "+", opts: {
        byLex: true;
    } & ZRangeCommandOptions] | [key: string, min: number | `(${number}` | "-inf" | "+inf", max: number | `(${number}` | "-inf" | "+inf", opts: {
        byScore: true;
    } & ZRangeCommandOptions]) => Pipeline<[...TCommands, Command<any, TData>]>;
    /**
     * @see https://redis.io/commands/zrank
     */
    zrank: <TData>(key: string, member: TData) => Pipeline<[...TCommands, Command<any, number | null>]>;
    /**
     * @see https://redis.io/commands/zrem
     */
    zrem: <TData>(key: string, ...members: TData[]) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zremrangebylex
     */
    zremrangebylex: (...args: CommandArgs<typeof ZRemRangeByLexCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zremrangebyrank
     */
    zremrangebyrank: (...args: CommandArgs<typeof ZRemRangeByRankCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zremrangebyscore
     */
    zremrangebyscore: (...args: CommandArgs<typeof ZRemRangeByScoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zrevrank
     */
    zrevrank: <TData>(key: string, member: TData) => Pipeline<[...TCommands, Command<any, number | null>]>;
    /**
     * @see https://redis.io/commands/zscan
     */
    zscan: (...args: CommandArgs<typeof ZScanCommand>) => Pipeline<[...TCommands, Command<any, [string, (string | number)[]]>]>;
    /**
     * @see https://redis.io/commands/zscore
     */
    zscore: <TData>(key: string, member: TData) => Pipeline<[...TCommands, Command<any, number | null>]>;
    /**
     * @see https://redis.io/commands/zunionstore
     */
    zunionstore: (...args: CommandArgs<typeof ZUnionStoreCommand>) => Pipeline<[...TCommands, Command<any, number>]>;
    /**
     * @see https://redis.io/commands/zunion
     */
    zunion: (...args: CommandArgs<typeof ZUnionCommand>) => Pipeline<[...TCommands, Command<any, any>]>;
    /**
     * @see https://redis.io/commands/?group=json
     */
    get json(): {
        /**
         * @see https://redis.io/commands/json.arrappend
         */
        arrappend: (key: string, path: string, ...values: unknown[]) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.arrindex
         */
        arrindex: (key: string, path: string, value: unknown, start?: number | undefined, stop?: number | undefined) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.arrinsert
         */
        arrinsert: (key: string, path: string, index: number, ...values: unknown[]) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.arrlen
         */
        arrlen: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.arrpop
         */
        arrpop: (key: string, path?: string | undefined, index?: number | undefined) => Pipeline<[...TCommands, Command<any, unknown[]>]>;
        /**
         * @see https://redis.io/commands/json.arrtrim
         */
        arrtrim: (key: string, path?: string | undefined, start?: number | undefined, stop?: number | undefined) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.clear
         */
        clear: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, number>]>;
        /**
         * @see https://redis.io/commands/json.del
         */
        del: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, number>]>;
        /**
         * @see https://redis.io/commands/json.forget
         */
        forget: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, number>]>;
        /**
         * @see https://redis.io/commands/json.get
         */
        get: (...args: CommandArgs<typeof JsonGetCommand>) => Pipeline<[...TCommands, Command<any, any>]>;
        /**
         * @see https://redis.io/commands/json.merge
         */
        merge: (key: string, path: string, value: string | number | unknown[] | Record<string, unknown>) => Pipeline<[...TCommands, Command<any, "OK" | null>]>;
        /**
         * @see https://redis.io/commands/json.mget
         */
        mget: (keys: string[], path: string) => Pipeline<[...TCommands, Command<any, any>]>;
        /**
         * @see https://redis.io/commands/json.mset
         */
        mset: (...args: CommandArgs<typeof JsonMSetCommand>) => Pipeline<[...TCommands, Command<any, "OK" | null>]>;
        /**
         * @see https://redis.io/commands/json.numincrby
         */
        numincrby: (key: string, path: string, value: number) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.nummultby
         */
        nummultby: (key: string, path: string, value: number) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.objkeys
         */
        objkeys: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, (string[] | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.objlen
         */
        objlen: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.resp
         */
        resp: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, any>]>;
        /**
         * @see https://redis.io/commands/json.set
         */
        set: (key: string, path: string, value: string | number | boolean | Record<string, unknown> | (string | number | boolean | Record<string, unknown>)[], opts?: {
            nx: true;
            xx?: never;
        } | {
            nx?: never;
            xx: true;
        } | undefined) => Pipeline<[...TCommands, Command<any, "OK" | null>]>;
        /**
         * @see https://redis.io/commands/json.strappend
         */
        strappend: (key: string, path: string, value: string) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.strlen
         */
        strlen: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, (number | null)[]>]>;
        /**
         * @see https://redis.io/commands/json.toggle
         */
        toggle: (key: string, path: string) => Pipeline<[...TCommands, Command<any, number[]>]>;
        /**
         * @see https://redis.io/commands/json.type
         */
        type: (key: string, path?: string | undefined) => Pipeline<[...TCommands, Command<any, string[]>]>;
    };
    get functions(): {
        /**
         * @see https://redis.io/docs/latest/commands/function-load/
         */
        load: (args: FunctionLoadArgs) => Pipeline<[...TCommands, Command<any, string>]>;
        /**
         * @see https://redis.io/docs/latest/commands/function-list/
         */
        list: (args?: FunctionListArgs | undefined) => Pipeline<[...TCommands, Command<any, {
            libraryName: string;
            engine: string;
            functions: {
                name: string;
                description?: string;
                flags: string[];
            }[];
            libraryCode?: string;
        }[]>]>;
        /**
         * @see https://redis.io/docs/latest/commands/function-delete/
         */
        delete: (libraryName: string) => Pipeline<[...TCommands, Command<any, "OK">]>;
        /**
         * @see https://redis.io/docs/latest/commands/function-flush/
         */
        flush: () => Pipeline<[...TCommands, Command<any, "OK">]>;
        /**
         * @see https://redis.io/docs/latest/commands/function-stats/
         */
        stats: () => Pipeline<[...TCommands, Command<any, {
            engines: {
                [k: string]: {
                    librariesCount: any;
                    functionsCount: any;
                };
            };
        }>]>;
        /**
         * @see https://redis.io/docs/latest/commands/fcall/
         */
        call: <TData = unknown>(functionName: string, keys?: string[] | undefined, args?: string[] | undefined) => Pipeline<[...TCommands, Command<any, TData>]>;
        /**
         * @see https://redis.io/docs/latest/commands/fcall_ro/
         */
        callRo: <TData = unknown>(functionName: string, keys?: string[] | undefined, args?: string[] | undefined) => Pipeline<[...TCommands, Command<any, TData>]>;
    };
}

/**
 * Creates a new script.
 *
 * Scripts offer the ability to optimistically try to execute a script without having to send the
 * entire script to the server. If the script is loaded on the server, it tries again by sending
 * the entire script. Afterwards, the script is cached on the server.
 *
 * @example
 * ```ts
 * const redis = new Redis({...})
 *
 * const script = redis.createScript<string>("return ARGV[1];")
 * const arg1 = await script.eval([], ["Hello World"])
 * expect(arg1, "Hello World")
 * ```
 */
declare class Script<TResult = unknown> {
    readonly script: string;
    /**
     * @deprecated This property is initialized to an empty string and will be set in the init method
     * asynchronously. Do not use this property immidiately after the constructor.
     *
     * This property is only exposed for backwards compatibility and will be removed in the
     * future major release.
     */
    sha1: string;
    private initPromise;
    private readonly redis;
    constructor(redis: Redis, script: string);
    /**
     * Initialize the script by computing its SHA-1 hash.
     */
    private init;
    /**
     * Send an `EVAL` command to redis.
     */
    eval(keys: string[], args: string[]): Promise<TResult>;
    /**
     * Calculates the sha1 hash of the script and then calls `EVALSHA`.
     */
    evalsha(keys: string[], args: string[]): Promise<TResult>;
    /**
     * Optimistically try to run `EVALSHA` first.
     * If the script is not loaded in redis, it will fall back and try again with `EVAL`.
     *
     * Following calls will be able to use the cached script
     */
    exec(keys: string[], args: string[]): Promise<TResult>;
    /**
     * Compute the sha1 hash of the script and return its hex representation.
     */
    private digest;
}

/**
 * Creates a new script.
 *
 * Scripts offer the ability to optimistically try to execute a script without having to send the
 * entire script to the server. If the script is loaded on the server, it tries again by sending
 * the entire script. Afterwards, the script is cached on the server.
 *
 * @example
 * ```ts
 * const redis = new Redis({...})
 *
 * const script = redis.createScript<string>("return ARGV[1];", { readOnly: true })
 * const arg1 = await script.evalRo([], ["Hello World"])
 * expect(arg1, "Hello World")
 * ```
 */
declare class ScriptRO<TResult = unknown> {
    readonly script: string;
    /**
     * @deprecated This property is initialized to an empty string and will be set in the init method
     * asynchronously. Do not use this property immidiately after the constructor.
     *
     * This property is only exposed for backwards compatibility and will be removed in the
     * future major release.
     */
    sha1: string;
    private initPromise;
    private readonly redis;
    constructor(redis: Redis, script: string);
    private init;
    /**
     * Send an `EVAL_RO` command to redis.
     */
    evalRo(keys: string[], args: string[]): Promise<TResult>;
    /**
     * Calculates the sha1 hash of the script and then calls `EVALSHA_RO`.
     */
    evalshaRo(keys: string[], args: string[]): Promise<TResult>;
    /**
     * Optimistically try to run `EVALSHA_RO` first.
     * If the script is not loaded in redis, it will fall back and try again with `EVAL_RO`.
     *
     * Following calls will be able to use the cached script
     */
    exec(keys: string[], args: string[]): Promise<TResult>;
    /**
     * Compute the sha1 hash of the script and return its hex representation.
     */
    private digest;
}

/**
 * Serverless redis client for upstash.
 */
declare class Redis {
    protected client: Requester;
    protected opts?: CommandOptions<any, any>;
    protected enableTelemetry: boolean;
    protected enableAutoPipelining: boolean;
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
    constructor(client: Requester, opts?: RedisOptions);
    get readYourWritesSyncToken(): string | undefined;
    set readYourWritesSyncToken(session: string | undefined);
    get json(): {
        /**
         * @see https://redis.io/commands/json.arrappend
         */
        arrappend: (key: string, path: string, ...values: unknown[]) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.arrindex
         */
        arrindex: (key: string, path: string, value: unknown, start?: number | undefined, stop?: number | undefined) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.arrinsert
         */
        arrinsert: (key: string, path: string, index: number, ...values: unknown[]) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.arrlen
         */
        arrlen: (key: string, path?: string | undefined) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.arrpop
         */
        arrpop: (key: string, path?: string | undefined, index?: number | undefined) => Promise<unknown[]>;
        /**
         * @see https://redis.io/commands/json.arrtrim
         */
        arrtrim: (key: string, path?: string | undefined, start?: number | undefined, stop?: number | undefined) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.clear
         */
        clear: (key: string, path?: string | undefined) => Promise<number>;
        /**
         * @see https://redis.io/commands/json.del
         */
        del: (key: string, path?: string | undefined) => Promise<number>;
        /**
         * @see https://redis.io/commands/json.forget
         */
        forget: (key: string, path?: string | undefined) => Promise<number>;
        /**
         * @see https://redis.io/commands/json.get
         */
        get: <TData>(...args: CommandArgs<typeof JsonGetCommand>) => Promise<TData | null>;
        /**
         * @see https://redis.io/commands/json.merge
         */
        merge: (key: string, path: string, value: string | number | unknown[] | Record<string, unknown>) => Promise<"OK" | null>;
        /**
         * @see https://redis.io/commands/json.mget
         */
        mget: <TData>(keys: string[], path: string) => Promise<TData>;
        /**
         * @see https://redis.io/commands/json.mset
         */
        mset: (...args: CommandArgs<typeof JsonMSetCommand>) => Promise<"OK" | null>;
        /**
         * @see https://redis.io/commands/json.numincrby
         */
        numincrby: (key: string, path: string, value: number) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.nummultby
         */
        nummultby: (key: string, path: string, value: number) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.objkeys
         */
        objkeys: (key: string, path?: string | undefined) => Promise<(string[] | null)[]>;
        /**
         * @see https://redis.io/commands/json.objlen
         */
        objlen: (key: string, path?: string | undefined) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.resp
         */
        resp: (key: string, path?: string | undefined) => Promise<any>;
        /**
         * @see https://redis.io/commands/json.set
         */
        set: (key: string, path: string, value: string | number | boolean | Record<string, unknown> | (string | number | boolean | Record<string, unknown>)[], opts?: {
            nx: true;
            xx?: never;
        } | {
            nx?: never;
            xx: true;
        } | undefined) => Promise<"OK" | null>;
        /**
         * @see https://redis.io/commands/json.strappend
         */
        strappend: (key: string, path: string, value: string) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.strlen
         */
        strlen: (key: string, path?: string | undefined) => Promise<(number | null)[]>;
        /**
         * @see https://redis.io/commands/json.toggle
         */
        toggle: (key: string, path: string) => Promise<number[]>;
        /**
         * @see https://redis.io/commands/json.type
         */
        type: (key: string, path?: string | undefined) => Promise<string[]>;
    };
    get functions(): {
        /**
         * @see https://redis.io/docs/latest/commands/function-load/
         */
        load: (args: FunctionLoadArgs) => Promise<string>;
        /**
         * @see https://redis.io/docs/latest/commands/function-list/
         */
        list: (args?: FunctionListArgs | undefined) => Promise<{
            libraryName: string;
            engine: string;
            functions: {
                name: string;
                description?: string;
                flags: string[];
            }[];
            libraryCode?: string;
        }[]>;
        /**
         * @see https://redis.io/docs/latest/commands/function-delete/
         */
        delete: (libraryName: string) => Promise<"OK">;
        /**
         * @see https://redis.io/docs/latest/commands/function-flush/
         */
        flush: () => Promise<"OK">;
        /**
         * @see https://redis.io/docs/latest/commands/function-stats/
         *
         * Note: `running_script` field is not supported and therefore not included in the type.
         */
        stats: () => Promise<{
            engines: {
                [k: string]: {
                    librariesCount: any;
                    functionsCount: any;
                };
            };
        }>;
        /**
         * @see https://redis.io/docs/latest/commands/fcall/
         */
        call: <TData = unknown>(functionName: string, keys?: string[] | undefined, args?: string[] | undefined) => Promise<TData>;
        /**
         * @see https://redis.io/docs/latest/commands/fcall_ro/
         */
        callRo: <TData = unknown>(functionName: string, keys?: string[] | undefined, args?: string[] | undefined) => Promise<TData>;
    };
    /**
     * Wrap a new middleware around the HTTP client.
     */
    use: <TResult = unknown>(middleware: (r: UpstashRequest, next: <TResult_1 = unknown>(req: UpstashRequest) => Promise<UpstashResponse<TResult_1>>) => Promise<UpstashResponse<TResult>>) => void;
    /**
     * Technically this is not private, we can hide it from intellisense by doing this
     */
    protected addTelemetry: (telemetry: Telemetry) => void;
    /**
     * Creates a new script.
     *
     * Scripts offer the ability to optimistically try to execute a script without having to send the
     * entire script to the server. If the script is loaded on the server, it tries again by sending
     * the entire script. Afterwards, the script is cached on the server.
     *
     * @param script - The script to create
     * @param opts - Optional options to pass to the script `{ readonly?: boolean }`
     * @returns A new script
     *
     * @example
     * ```ts
     * const redis = new Redis({...})
     *
     * const script = redis.createScript<string>("return ARGV[1];")
     * const arg1 = await script.eval([], ["Hello World"])
     * expect(arg1, "Hello World")
     * ```
     * @example
     * ```ts
     * const redis = new Redis({...})
     *
     * const script = redis.createScript<string>("return ARGV[1];", { readonly: true })
     * const arg1 = await script.evalRo([], ["Hello World"])
     * expect(arg1, "Hello World")
     * ```
     */
    createScript<TResult = unknown, TReadonly extends boolean = false>(script: string, opts?: {
        readonly?: TReadonly;
    }): TReadonly extends true ? ScriptRO<TResult> : Script<TResult>;
    get search(): {
        createIndex: <TSchema extends NestedIndexSchema | FlatIndexSchema>(params: CreateIndexParameters<TSchema>) => Promise<SearchIndex<TSchema>>;
        index: <TSchema extends NestedIndexSchema | FlatIndexSchema>(params: InitIndexParameters<TSchema>) => SearchIndex<TSchema>;
        alias: {
            list: () => Promise<Record<string, string>>;
            add: ({ indexName, alias }: {
                indexName: string;
                alias: string;
            }) => Promise<1 | 2>;
            delete: ({ alias }: {
                alias: string;
            }) => Promise<0 | 1>;
        };
    };
    /**
     * Create a new pipeline that allows you to send requests in bulk.
     *
     * @see {@link Pipeline}
     */
    pipeline: () => Pipeline<[]>;
    protected autoPipeline: () => Redis;
    /**
     * Create a new transaction to allow executing multiple steps atomically.
     *
     * All the commands in a transaction are serialized and executed sequentially. A request sent by
     * another client will never be served in the middle of the execution of a Redis Transaction. This
     * guarantees that the commands are executed as a single isolated operation.
     *
     * @see {@link Pipeline}
     */
    multi: () => Pipeline<[]>;
    /**
     * Returns an instance that can be used to execute `BITFIELD` commands on one key.
     *
     * @example
     * ```typescript
     * redis.set("mykey", 0);
     * const result = await redis.bitfield("mykey")
     *   .set("u4", 0, 16)
     *   .incr("u4", "#1", 1)
     *   .exec();
     * console.log(result); // [0, 1]
     * ```
     *
     * @see https://redis.io/commands/bitfield
     */
    bitfield: (...args: CommandArgs<typeof BitFieldCommand>) => BitFieldCommand<Promise<number[]>>;
    /**
     * @see https://redis.io/commands/append
     */
    append: (...args: CommandArgs<typeof AppendCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/bitcount
     */
    bitcount: (...args: CommandArgs<typeof BitCountCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/bitop
     */
    bitop: {
        (op: "and" | "or" | "xor", destinationKey: string, sourceKey: string, ...sourceKeys: string[]): Promise<number>;
        (op: "not", destinationKey: string, sourceKey: string): Promise<number>;
        (op: "diff" | "diff1" | "andor", destinationKey: string, x: string, ...y: string[]): Promise<number>;
        (op: "one", destinationKey: string, ...sourceKeys: string[]): Promise<number>;
    };
    /**
     * @see https://redis.io/commands/bitpos
     */
    bitpos: (...args: CommandArgs<typeof BitPosCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/client-setinfo
     */
    clientSetinfo: (...args: CommandArgs<typeof ClientSetInfoCommand>) => Promise<string>;
    /**
     * @see https://redis.io/commands/copy
     */
    copy: (...args: CommandArgs<typeof CopyCommand>) => Promise<"COPIED" | "NOT_COPIED">;
    /**
     * @see https://redis.io/commands/dbsize
     */
    dbsize: () => Promise<number>;
    /**
     * @see https://redis.io/commands/decr
     */
    decr: (...args: CommandArgs<typeof DecrCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/decrby
     */
    decrby: (...args: CommandArgs<typeof DecrByCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/del
     */
    del: (...args: CommandArgs<typeof DelCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/echo
     */
    echo: (...args: CommandArgs<typeof EchoCommand>) => Promise<string>;
    /**
     * @see https://redis.io/commands/eval_ro
     */
    evalRo: <TArgs extends unknown[], TData = unknown>(...args: [script: string, keys: string[], args: TArgs]) => Promise<TData>;
    /**
     * @see https://redis.io/commands/eval
     */
    eval: <TArgs extends unknown[], TData = unknown>(...args: [script: string, keys: string[], args: TArgs]) => Promise<TData>;
    /**
     * @see https://redis.io/commands/evalsha_ro
     */
    evalshaRo: <TArgs extends unknown[], TData = unknown>(...args: [sha1: string, keys: string[], args: TArgs]) => Promise<TData>;
    /**
     * @see https://redis.io/commands/evalsha
     */
    evalsha: <TArgs extends unknown[], TData = unknown>(...args: [sha1: string, keys: string[], args: TArgs]) => Promise<TData>;
    /**
     * Generic method to execute any Redis command.
     */
    exec: <TResult>(args: [command: string, ...args: (string | number | boolean)[]]) => Promise<TResult>;
    /**
     * @see https://redis.io/commands/exists
     */
    exists: (...args: CommandArgs<typeof ExistsCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/expire
     */
    expire: (...args: CommandArgs<typeof ExpireCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/expireat
     */
    expireat: (...args: CommandArgs<typeof ExpireAtCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/flushall
     */
    flushall: (args?: CommandArgs<typeof FlushAllCommand>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/flushdb
     */
    flushdb: (...args: CommandArgs<typeof FlushDBCommand>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/geoadd
     */
    geoadd: <TData>(...args: CommandArgs<typeof GeoAddCommand<TData>>) => Promise<number | null>;
    /**
     * @see https://redis.io/commands/geopos
     */
    geopos: <TData>(...args: CommandArgs<typeof GeoPosCommand<TData>>) => Promise<{
        lng: number;
        lat: number;
    }[]>;
    /**
     * @see https://redis.io/commands/geodist
     */
    geodist: <TData>(...args: CommandArgs<typeof GeoDistCommand<TData>>) => Promise<number | null>;
    /**
     * @see https://redis.io/commands/geohash
     */
    geohash: <TData>(...args: CommandArgs<typeof GeoHashCommand<TData>>) => Promise<(string | null)[]>;
    /**
     * @see https://redis.io/commands/geosearch
     */
    geosearch: <TData>(...args: CommandArgs<typeof GeoSearchCommand<TData>>) => Promise<({
        member: TData;
    } & {
        coord?: {
            long: number;
            lat: number;
        } | undefined;
        dist?: number | undefined;
        hash?: string | undefined;
    })[]>;
    /**
     * @see https://redis.io/commands/geosearchstore
     */
    geosearchstore: <TData>(...args: CommandArgs<typeof GeoSearchStoreCommand<TData>>) => Promise<number>;
    /**
     * @see https://redis.io/commands/get
     */
    get: <TData>(...args: CommandArgs<typeof GetCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/getbit
     */
    getbit: (...args: CommandArgs<typeof GetBitCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/getdel
     */
    getdel: <TData>(...args: CommandArgs<typeof GetDelCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/getex
     */
    getex: <TData>(...args: CommandArgs<typeof GetExCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/getrange
     */
    getrange: (...args: CommandArgs<typeof GetRangeCommand>) => Promise<string>;
    /**
     * @see https://redis.io/commands/getset
     */
    getset: <TData>(key: string, value: TData) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/hdel
     */
    hdel: (...args: CommandArgs<typeof HDelCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/hexists
     */
    hexists: (...args: CommandArgs<typeof HExistsCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hexpire
     */
    hexpire: (...args: CommandArgs<typeof HExpireCommand>) => Promise<(0 | 1 | 2 | -2)[]>;
    /**
     * @see https://redis.io/commands/hexpireat
     */
    hexpireat: (...args: CommandArgs<typeof HExpireAtCommand>) => Promise<(0 | 1 | 2 | -2)[]>;
    /**
     * @see https://redis.io/commands/hexpiretime
     */
    hexpiretime: (...args: CommandArgs<typeof HExpireTimeCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/httl
     */
    httl: (...args: CommandArgs<typeof HTtlCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/hpexpire
     */
    hpexpire: (...args: CommandArgs<typeof HPExpireCommand>) => Promise<(0 | 1 | 2 | -2)[]>;
    /**
     * @see https://redis.io/commands/hpexpireat
     */
    hpexpireat: (...args: CommandArgs<typeof HPExpireAtCommand>) => Promise<(0 | 1 | 2 | -2)[]>;
    /**
     * @see https://redis.io/commands/hpexpiretime
     */
    hpexpiretime: (...args: CommandArgs<typeof HPExpireTimeCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/hpttl
     */
    hpttl: (...args: CommandArgs<typeof HPTtlCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/hpersist
     */
    hpersist: (...args: CommandArgs<typeof HPersistCommand>) => Promise<(1 | -2 | -1)[]>;
    /**
     * @see https://redis.io/commands/hget
     */
    hget: <TData>(...args: CommandArgs<typeof HGetCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/hgetall
     */
    hgetall: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HGetAllCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/hgetdel
     */
    hgetdel: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HGetDelCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/hgetex
     */
    hgetex: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HGetExCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/hincrby
     */
    hincrby: (...args: CommandArgs<typeof HIncrByCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hincrbyfloat
     */
    hincrbyfloat: (...args: CommandArgs<typeof HIncrByFloatCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hkeys
     */
    hkeys: (...args: CommandArgs<typeof HKeysCommand>) => Promise<string[]>;
    /**
     * @see https://redis.io/commands/hlen
     */
    hlen: (...args: CommandArgs<typeof HLenCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hmget
     */
    hmget: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof HMGetCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/hmset
     */
    hmset: <TData>(key: string, kv: Record<string, TData>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/hrandfield
     */
    hrandfield: {
        (key: string): Promise<string | null>;
        (key: string, count: number): Promise<string[]>;
        <TData extends Record<string, unknown>>(key: string, count: number, withValues: boolean): Promise<Partial<TData>>;
    };
    /**
     * @see https://redis.io/commands/hscan
     */
    hscan: (...args: CommandArgs<typeof HScanCommand>) => Promise<[string, (string | number)[]]>;
    /**
     * @see https://redis.io/commands/hset
     */
    hset: <TData>(key: string, kv: Record<string, TData>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hsetex
     */
    hsetex: <TData>(...args: CommandArgs<typeof HSetExCommand<TData>>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hsetnx
     */
    hsetnx: <TData>(key: string, field: string, value: TData) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/hstrlen
     */
    hstrlen: (...args: CommandArgs<typeof HStrLenCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/hvals
     */
    hvals: (...args: CommandArgs<typeof HValsCommand>) => Promise<any>;
    /**
     * @see https://redis.io/commands/incr
     */
    incr: (...args: CommandArgs<typeof IncrCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/incrby
     */
    incrby: (...args: CommandArgs<typeof IncrByCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/incrbyfloat
     */
    incrbyfloat: (...args: CommandArgs<typeof IncrByFloatCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/keys
     */
    keys: (...args: CommandArgs<typeof KeysCommand>) => Promise<string[]>;
    /**
     * @see https://redis.io/commands/lindex
     */
    lindex: (...args: CommandArgs<typeof LIndexCommand>) => Promise<any>;
    /**
     * @see https://redis.io/commands/linsert
     */
    linsert: <TData>(key: string, direction: "before" | "after", pivot: TData, value: TData) => Promise<number>;
    /**
     * @see https://redis.io/commands/llen
     */
    llen: (...args: CommandArgs<typeof LLenCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/lmove
     */
    lmove: <TData = string>(...args: CommandArgs<typeof LMoveCommand>) => Promise<TData>;
    /**
     * @see https://redis.io/commands/lpop
     */
    lpop: <TData>(...args: CommandArgs<typeof LPopCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/lmpop
     */
    lmpop: <TData>(...args: CommandArgs<typeof LmPopCommand>) => Promise<[string, TData[]] | null>;
    /**
     * @see https://redis.io/commands/lpos
     */
    lpos: <TData = number>(...args: CommandArgs<typeof LPosCommand>) => Promise<TData>;
    /**
     * @see https://redis.io/commands/lpush
     */
    lpush: <TData>(key: string, ...elements: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/lpushx
     */
    lpushx: <TData>(key: string, ...elements: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/lrange
     */
    lrange: <TResult = string>(...args: CommandArgs<typeof LRangeCommand>) => Promise<TResult[]>;
    /**
     * @see https://redis.io/commands/lrem
     */
    lrem: <TData>(key: string, count: number, value: TData) => Promise<number>;
    /**
     * @see https://redis.io/commands/lset
     */
    lset: <TData>(key: string, index: number, value: TData) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/ltrim
     */
    ltrim: (...args: CommandArgs<typeof LTrimCommand>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/mget
     */
    mget: <TData extends unknown[]>(...args: CommandArgs<typeof MGetCommand>) => Promise<TData>;
    /**
     * @see https://redis.io/commands/mset
     */
    mset: <TData>(kv: Record<string, TData>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/msetnx
     */
    msetnx: <TData>(kv: Record<string, TData>) => Promise<number>;
    /**
     * @see https://redis.io/commands/persist
     */
    persist: (...args: CommandArgs<typeof PersistCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/pexpire
     */
    pexpire: (...args: CommandArgs<typeof PExpireCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/pexpireat
     */
    pexpireat: (...args: CommandArgs<typeof PExpireAtCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/pfadd
     */
    pfadd: (...args: CommandArgs<typeof PfAddCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/pfcount
     */
    pfcount: (...args: CommandArgs<typeof PfCountCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/pfmerge
     */
    pfmerge: (...args: CommandArgs<typeof PfMergeCommand>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/ping
     */
    ping: (args?: CommandArgs<typeof PingCommand>) => Promise<string>;
    /**
     * @see https://redis.io/commands/psetex
     */
    psetex: <TData>(key: string, ttl: number, value: TData) => Promise<string>;
    /**
     * @see https://redis.io/commands/psubscribe
     */
    psubscribe: <TMessage>(patterns: string | string[]) => Subscriber<TMessage>;
    /**
     * @see https://redis.io/commands/pttl
     */
    pttl: (...args: CommandArgs<typeof PTtlCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/publish
     */
    publish: (...args: CommandArgs<typeof PublishCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/randomkey
     */
    randomkey: () => Promise<string | null>;
    /**
     * @see https://redis.io/commands/rename
     */
    rename: (...args: CommandArgs<typeof RenameCommand>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/renamenx
     */
    renamenx: (...args: CommandArgs<typeof RenameNXCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/rpop
     */
    rpop: <TData = string>(...args: CommandArgs<typeof RPopCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/rpush
     */
    rpush: <TData>(key: string, ...elements: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/rpushx
     */
    rpushx: <TData>(key: string, ...elements: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/sadd
     */
    sadd: <TData>(key: string, member: TData, ...members: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/scan
     */
    scan(cursor: string | number): Promise<ScanResultStandard>;
    scan<TOptions extends ScanCommandOptions>(cursor: string | number, opts: TOptions): Promise<TOptions extends {
        withType: true;
    } ? ScanResultWithType : ScanResultStandard>;
    /**
     * @see https://redis.io/commands/scard
     */
    scard: (...args: CommandArgs<typeof SCardCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/script-exists
     */
    scriptExists: (...args: CommandArgs<typeof ScriptExistsCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/script-flush
     */
    scriptFlush: (...args: CommandArgs<typeof ScriptFlushCommand>) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/script-load
     */
    scriptLoad: (...args: CommandArgs<typeof ScriptLoadCommand>) => Promise<string>;
    /**
     * @see https://redis.io/commands/sdiff
     */
    sdiff: (...args: CommandArgs<typeof SDiffCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/sdiffstore
     */
    sdiffstore: (...args: CommandArgs<typeof SDiffStoreCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/set
     */
    set: <TData>(key: string, value: TData, opts?: SetCommandOptions) => Promise<"OK" | TData | null>;
    /**
     * @see https://redis.io/commands/setbit
     */
    setbit: (...args: CommandArgs<typeof SetBitCommand>) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/setex
     */
    setex: <TData>(key: string, ttl: number, value: TData) => Promise<"OK">;
    /**
     * @see https://redis.io/commands/setnx
     */
    setnx: <TData>(key: string, value: TData) => Promise<number>;
    /**
     * @see https://redis.io/commands/setrange
     */
    setrange: (...args: CommandArgs<typeof SetRangeCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/sinter
     */
    sinter: (...args: CommandArgs<typeof SInterCommand>) => Promise<string[]>;
    /**
     * @see https://redis.io/commands/sintercard
     */
    sintercard: (...args: CommandArgs<typeof SInterCardCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/sinterstore
     */
    sinterstore: (...args: CommandArgs<typeof SInterStoreCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/sismember
     */
    sismember: <TData>(key: string, member: TData) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/smismember
     */
    smismember: <TMembers extends unknown[]>(key: string, members: TMembers) => Promise<(0 | 1)[]>;
    /**
     * @see https://redis.io/commands/smembers
     */
    smembers: <TData extends unknown[] = string[]>(...args: CommandArgs<typeof SMembersCommand>) => Promise<TData>;
    /**
     * @see https://redis.io/commands/smove
     */
    smove: <TData>(source: string, destination: string, member: TData) => Promise<0 | 1>;
    /**
     * @see https://redis.io/commands/spop
     */
    spop: <TData>(...args: CommandArgs<typeof SPopCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/srandmember
     */
    srandmember: <TData>(...args: CommandArgs<typeof SRandMemberCommand>) => Promise<TData | null>;
    /**
     * @see https://redis.io/commands/srem
     */
    srem: <TData>(key: string, ...members: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/sscan
     */
    sscan: (...args: CommandArgs<typeof SScanCommand>) => Promise<[string, (string | number)[]]>;
    /**
     * @see https://redis.io/commands/strlen
     */
    strlen: (...args: CommandArgs<typeof StrLenCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/subscribe
     */
    subscribe: <TMessage>(channels: string | string[]) => Subscriber<TMessage>;
    /**
     * @see https://redis.io/commands/sunion
     */
    sunion: (...args: CommandArgs<typeof SUnionCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/sunionstore
     */
    sunionstore: (...args: CommandArgs<typeof SUnionStoreCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/time
     */
    time: () => Promise<[number, number]>;
    /**
     * @see https://redis.io/commands/touch
     */
    touch: (...args: CommandArgs<typeof TouchCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/ttl
     */
    ttl: (...args: CommandArgs<typeof TtlCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/type
     */
    type: (...args: CommandArgs<typeof TypeCommand>) => Promise<Type>;
    /**
     * @see https://redis.io/commands/unlink
     */
    unlink: (...args: CommandArgs<typeof UnlinkCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/xadd
     */
    xadd: (...args: CommandArgs<typeof XAddCommand>) => Promise<string>;
    /**
     * @see https://redis.io/commands/xack
     */
    xack: (...args: CommandArgs<typeof XAckCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/xackdel
     */
    xackdel: (...args: CommandArgs<typeof XAckDelCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/xdel
     */
    xdel: (...args: CommandArgs<typeof XDelCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/xdelex
     */
    xdelex: (...args: CommandArgs<typeof XDelExCommand>) => Promise<number[]>;
    /**
     * @see https://redis.io/commands/xgroup
     */
    xgroup: (...args: CommandArgs<typeof XGroupCommand>) => Promise<never>;
    /**
     * @see https://redis.io/commands/xread
     */
    xread: (...args: CommandArgs<typeof XReadCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/xreadgroup
     */
    xreadgroup: (...args: CommandArgs<typeof XReadGroupCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/xinfo
     */
    xinfo: (...args: CommandArgs<typeof XInfoCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/xlen
     */
    xlen: (...args: CommandArgs<typeof XLenCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/xpending
     */
    xpending: (...args: CommandArgs<typeof XPendingCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/xclaim
     */
    xclaim: (...args: CommandArgs<typeof XClaimCommand>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/xautoclaim
     */
    xautoclaim: (...args: CommandArgs<typeof XAutoClaim>) => Promise<unknown[]>;
    /**
     * @see https://redis.io/commands/xtrim
     */
    xtrim: (...args: CommandArgs<typeof XTrimCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/xrange
     */
    xrange: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof XRangeCommand>) => Promise<Record<string, TData>>;
    /**
     * @see https://redis.io/commands/xrevrange
     */
    xrevrange: <TData extends Record<string, unknown>>(...args: CommandArgs<typeof XRevRangeCommand>) => Promise<Record<string, TData>>;
    /**
     * @see https://redis.io/commands/zadd
     */
    zadd: <TData>(...args: [key: string, scoreMember: ScoreMember<TData>, ...scoreMemberPairs: ScoreMember<TData>[]] | [key: string, opts: ZAddCommandOptions, ...scoreMemberPairs: [ScoreMember<TData>, ...ScoreMember<TData>[]]]) => Promise<number | null>;
    /**
     * @see https://redis.io/commands/zcard
     */
    zcard: (...args: CommandArgs<typeof ZCardCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zcount
     */
    zcount: (...args: CommandArgs<typeof ZCountCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zdiffstore
     */
    zdiffstore: (...args: CommandArgs<typeof ZDiffStoreCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zincrby
     */
    zincrby: <TData>(key: string, increment: number, member: TData) => Promise<number>;
    /**
     * @see https://redis.io/commands/zinterstore
     */
    zinterstore: (...args: CommandArgs<typeof ZInterStoreCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zlexcount
     */
    zlexcount: (...args: CommandArgs<typeof ZLexCountCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zmscore
     */
    zmscore: (...args: CommandArgs<typeof ZMScoreCommand>) => Promise<number[] | null>;
    /**
     * @see https://redis.io/commands/zpopmax
     */
    zpopmax: <TData>(...args: CommandArgs<typeof ZPopMaxCommand>) => Promise<TData[]>;
    /**
     * @see https://redis.io/commands/zpopmin
     */
    zpopmin: <TData>(...args: CommandArgs<typeof ZPopMinCommand>) => Promise<TData[]>;
    /**
     * @see https://redis.io/commands/zrange
     */
    zrange: <TData extends unknown[]>(...args: [key: string, min: number, max: number, opts?: ZRangeCommandOptions] | [key: string, min: `(${string}` | `[${string}` | "-" | "+", max: `(${string}` | `[${string}` | "-" | "+", opts: {
        byLex: true;
    } & ZRangeCommandOptions] | [key: string, min: number | `(${number}` | "-inf" | "+inf", max: number | `(${number}` | "-inf" | "+inf", opts: {
        byScore: true;
    } & ZRangeCommandOptions]) => Promise<TData>;
    /**
     * @see https://redis.io/commands/zrank
     */
    zrank: <TData>(key: string, member: TData) => Promise<number | null>;
    /**
     * @see https://redis.io/commands/zrem
     */
    zrem: <TData>(key: string, ...members: TData[]) => Promise<number>;
    /**
     * @see https://redis.io/commands/zremrangebylex
     */
    zremrangebylex: (...args: CommandArgs<typeof ZRemRangeByLexCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zremrangebyrank
     */
    zremrangebyrank: (...args: CommandArgs<typeof ZRemRangeByRankCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zremrangebyscore
     */
    zremrangebyscore: (...args: CommandArgs<typeof ZRemRangeByScoreCommand>) => Promise<number>;
    /**
     * @see https://redis.io/commands/zrevrank
     */
    zrevrank: <TData>(key: string, member: TData) => Promise<number | null>;
    /**
     * @see https://redis.io/commands/zscan
     */
    zscan: (...args: CommandArgs<typeof ZScanCommand>) => Promise<[string, (string | number)[]]>;
    /**
     * @see https://redis.io/commands/zscore
     */
    zscore: <TData>(key: string, member: TData) => Promise<number | null>;
    /**
     * @see https://redis.io/commands/zunion
     */
    zunion: (...args: CommandArgs<typeof ZUnionCommand>) => Promise<any>;
    /**
     * @see https://redis.io/commands/zunionstore
     */
    zunionstore: (...args: CommandArgs<typeof ZUnionStoreCommand>) => Promise<number>;
}

type UpstashErrorOptions = Pick<NonNullable<ConstructorParameters<typeof Error>[1]>, "cause">;
/**
 * Result of a bad request to upstash
 */
declare class UpstashError extends Error {
    constructor(message: string, options?: ErrorOptions);
}
declare class UrlError extends Error {
    constructor(url: string);
}
declare class UpstashJSONParseError extends UpstashError {
    constructor(body: string, options?: UpstashErrorOptions);
}

type error_UpstashError = UpstashError;
declare const error_UpstashError: typeof UpstashError;
type error_UpstashJSONParseError = UpstashJSONParseError;
declare const error_UpstashJSONParseError: typeof UpstashJSONParseError;
type error_UrlError = UrlError;
declare const error_UrlError: typeof UrlError;
declare namespace error {
  export { error_UpstashError as UpstashError, error_UpstashJSONParseError as UpstashJSONParseError, error_UrlError as UrlError };
}

export { HMGetCommand as $, AppendCommand as A, BitCountCommand as B, type ClientSetInfoAttribute as C, DBSizeCommand as D, EchoCommand as E, FlushAllCommand as F, GeoAddCommand as G, type HttpClientConfig as H, GetCommand as I, GetDelCommand as J, GetExCommand as K, GetRangeCommand as L, GetSetCommand as M, HDelCommand as N, HExistsCommand as O, HExpireAtCommand as P, HExpireCommand as Q, Redis as R, HExpireTimeCommand as S, HGetAllCommand as T, HGetCommand as U, HGetDelCommand as V, HGetExCommand as W, HIncrByCommand as X, HIncrByFloatCommand as Y, HKeysCommand as Z, HLenCommand as _, type RedisOptions as a, RPushCommand as a$, HMSetCommand as a0, HPExpireAtCommand as a1, HPExpireCommand as a2, HPExpireTimeCommand as a3, HPTtlCommand as a4, HPersistCommand as a5, HRandFieldCommand as a6, HScanCommand as a7, HSetCommand as a8, HSetExCommand as a9, JsonStrLenCommand as aA, JsonToggleCommand as aB, JsonTypeCommand as aC, KeysCommand as aD, LIndexCommand as aE, LInsertCommand as aF, LLenCommand as aG, LMoveCommand as aH, LPopCommand as aI, LPushCommand as aJ, LPushXCommand as aK, LRangeCommand as aL, LRemCommand as aM, LSetCommand as aN, LTrimCommand as aO, MGetCommand as aP, MSetCommand as aQ, MSetNXCommand as aR, PExpireAtCommand as aS, PExpireCommand as aT, PSetEXCommand as aU, PTtlCommand as aV, PersistCommand as aW, PingCommand as aX, Pipeline as aY, PublishCommand as aZ, RPopCommand as a_, HSetNXCommand as aa, HStrLenCommand as ab, HTtlCommand as ac, HValsCommand as ad, IncrByCommand as ae, IncrByFloatCommand as af, IncrCommand as ag, JsonArrAppendCommand as ah, JsonArrIndexCommand as ai, JsonArrInsertCommand as aj, JsonArrLenCommand as ak, JsonArrPopCommand as al, JsonArrTrimCommand as am, JsonClearCommand as an, JsonDelCommand as ao, JsonForgetCommand as ap, JsonGetCommand as aq, JsonMGetCommand as ar, JsonMergeCommand as as, JsonNumIncrByCommand as at, JsonNumMultByCommand as au, JsonObjKeysCommand as av, JsonObjLenCommand as aw, JsonRespCommand as ax, JsonSetCommand as ay, JsonStrAppendCommand as az, type RequesterConfig as b, ZRemRangeByLexCommand as b$, RPushXCommand as b0, RandomKeyCommand as b1, RenameCommand as b2, RenameNXCommand as b3, type Requester as b4, SAddCommand as b5, SCardCommand as b6, SDiffCommand as b7, SDiffStoreCommand as b8, SInterCardCommand as b9, TouchCommand as bA, TtlCommand as bB, type Type as bC, TypeCommand as bD, UnlinkCommand as bE, type UpstashRequest as bF, type UpstashResponse as bG, XAckDelCommand as bH, XAddCommand as bI, XDelExCommand as bJ, XRangeCommand as bK, ZAddCommand as bL, type ZAddCommandOptions as bM, ZCardCommand as bN, ZCountCommand as bO, ZDiffStoreCommand as bP, ZIncrByCommand as bQ, ZInterStoreCommand as bR, type ZInterStoreCommandOptions as bS, ZLexCountCommand as bT, ZMScoreCommand as bU, ZPopMaxCommand as bV, ZPopMinCommand as bW, ZRangeCommand as bX, type ZRangeCommandOptions as bY, ZRankCommand as bZ, ZRemCommand as b_, SInterCommand as ba, SInterStoreCommand as bb, SIsMemberCommand as bc, SMIsMemberCommand as bd, SMembersCommand as be, SMoveCommand as bf, SPopCommand as bg, SRandMemberCommand as bh, SRemCommand as bi, SScanCommand as bj, SUnionCommand as bk, SUnionStoreCommand as bl, ScanCommand as bm, type ScanCommandOptions as bn, type ScoreMember as bo, ScriptExistsCommand as bp, ScriptFlushCommand as bq, ScriptLoadCommand as br, SetBitCommand as bs, SetCommand as bt, type SetCommandOptions as bu, SetExCommand as bv, SetNxCommand as bw, SetRangeCommand as bx, StrLenCommand as by, TimeCommand as bz, BitOpCommand as c, ZRemRangeByRankCommand as c0, ZRemRangeByScoreCommand as c1, ZRevRankCommand as c2, ZScanCommand as c3, ZScoreCommand as c4, ZUnionCommand as c5, type ZUnionCommandOptions as c6, ZUnionStoreCommand as c7, type ZUnionStoreCommandOptions as c8, error as c9, type NumericField as ca, type NestedIndexSchema as cb, type CreateIndexParameters as cc, type FlatIndexSchema as cd, type InferFilterFromSchema as ce, type PublicQueryResult as cf, SearchIndex as cg, type SearchIndexParameters as ch, BitPosCommand as d, ClientSetInfoCommand as e, CopyCommand as f, DecrByCommand as g, DecrCommand as h, DelCommand as i, EvalCommand as j, EvalROCommand as k, EvalshaCommand as l, EvalshaROCommand as m, ExistsCommand as n, ExpireAtCommand as o, ExpireCommand as p, type ExpireOption as q, FlushDBCommand as r, type GeoAddCommandOptions as s, GeoDistCommand as t, GeoHashCommand as u, type GeoMember as v, GeoPosCommand as w, GeoSearchCommand as x, GeoSearchStoreCommand as y, GetBitCommand as z };
