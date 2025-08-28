
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model BalanceReading
 * 
 */
export type BalanceReading = $Result.DefaultSelection<Prisma.$BalanceReadingPayload>
/**
 * Model AuditTrail
 * 
 */
export type AuditTrail = $Result.DefaultSelection<Prisma.$AuditTrailPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more BalanceReadings
 * const balanceReadings = await prisma.balanceReading.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more BalanceReadings
   * const balanceReadings = await prisma.balanceReading.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.balanceReading`: Exposes CRUD operations for the **BalanceReading** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more BalanceReadings
    * const balanceReadings = await prisma.balanceReading.findMany()
    * ```
    */
  get balanceReading(): Prisma.BalanceReadingDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.auditTrail`: Exposes CRUD operations for the **AuditTrail** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AuditTrails
    * const auditTrails = await prisma.auditTrail.findMany()
    * ```
    */
  get auditTrail(): Prisma.AuditTrailDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.14.0
   * Query Engine version: 717184b7b35ea05dfa71a3236b7af656013e1e49
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    BalanceReading: 'BalanceReading',
    AuditTrail: 'AuditTrail'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "balanceReading" | "auditTrail"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      BalanceReading: {
        payload: Prisma.$BalanceReadingPayload<ExtArgs>
        fields: Prisma.BalanceReadingFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BalanceReadingFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BalanceReadingFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>
          }
          findFirst: {
            args: Prisma.BalanceReadingFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BalanceReadingFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>
          }
          findMany: {
            args: Prisma.BalanceReadingFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>[]
          }
          create: {
            args: Prisma.BalanceReadingCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>
          }
          createMany: {
            args: Prisma.BalanceReadingCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BalanceReadingCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>[]
          }
          delete: {
            args: Prisma.BalanceReadingDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>
          }
          update: {
            args: Prisma.BalanceReadingUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>
          }
          deleteMany: {
            args: Prisma.BalanceReadingDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BalanceReadingUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.BalanceReadingUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>[]
          }
          upsert: {
            args: Prisma.BalanceReadingUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BalanceReadingPayload>
          }
          aggregate: {
            args: Prisma.BalanceReadingAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBalanceReading>
          }
          groupBy: {
            args: Prisma.BalanceReadingGroupByArgs<ExtArgs>
            result: $Utils.Optional<BalanceReadingGroupByOutputType>[]
          }
          count: {
            args: Prisma.BalanceReadingCountArgs<ExtArgs>
            result: $Utils.Optional<BalanceReadingCountAggregateOutputType> | number
          }
        }
      }
      AuditTrail: {
        payload: Prisma.$AuditTrailPayload<ExtArgs>
        fields: Prisma.AuditTrailFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AuditTrailFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AuditTrailFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>
          }
          findFirst: {
            args: Prisma.AuditTrailFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AuditTrailFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>
          }
          findMany: {
            args: Prisma.AuditTrailFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>[]
          }
          create: {
            args: Prisma.AuditTrailCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>
          }
          createMany: {
            args: Prisma.AuditTrailCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AuditTrailCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>[]
          }
          delete: {
            args: Prisma.AuditTrailDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>
          }
          update: {
            args: Prisma.AuditTrailUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>
          }
          deleteMany: {
            args: Prisma.AuditTrailDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AuditTrailUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AuditTrailUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>[]
          }
          upsert: {
            args: Prisma.AuditTrailUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditTrailPayload>
          }
          aggregate: {
            args: Prisma.AuditTrailAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAuditTrail>
          }
          groupBy: {
            args: Prisma.AuditTrailGroupByArgs<ExtArgs>
            result: $Utils.Optional<AuditTrailGroupByOutputType>[]
          }
          count: {
            args: Prisma.AuditTrailCountArgs<ExtArgs>
            result: $Utils.Optional<AuditTrailCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    balanceReading?: BalanceReadingOmit
    auditTrail?: AuditTrailOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model BalanceReading
   */

  export type AggregateBalanceReading = {
    _count: BalanceReadingCountAggregateOutputType | null
    _min: BalanceReadingMinAggregateOutputType | null
    _max: BalanceReadingMaxAggregateOutputType | null
  }

  export type BalanceReadingMinAggregateOutputType = {
    id: string | null
    instrument: string | null
    command: string | null
    result: string | null
    createdAt: Date | null
    userId: string | null
  }

  export type BalanceReadingMaxAggregateOutputType = {
    id: string | null
    instrument: string | null
    command: string | null
    result: string | null
    createdAt: Date | null
    userId: string | null
  }

  export type BalanceReadingCountAggregateOutputType = {
    id: number
    instrument: number
    command: number
    result: number
    createdAt: number
    userId: number
    _all: number
  }


  export type BalanceReadingMinAggregateInputType = {
    id?: true
    instrument?: true
    command?: true
    result?: true
    createdAt?: true
    userId?: true
  }

  export type BalanceReadingMaxAggregateInputType = {
    id?: true
    instrument?: true
    command?: true
    result?: true
    createdAt?: true
    userId?: true
  }

  export type BalanceReadingCountAggregateInputType = {
    id?: true
    instrument?: true
    command?: true
    result?: true
    createdAt?: true
    userId?: true
    _all?: true
  }

  export type BalanceReadingAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BalanceReading to aggregate.
     */
    where?: BalanceReadingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BalanceReadings to fetch.
     */
    orderBy?: BalanceReadingOrderByWithRelationInput | BalanceReadingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BalanceReadingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BalanceReadings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BalanceReadings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned BalanceReadings
    **/
    _count?: true | BalanceReadingCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BalanceReadingMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BalanceReadingMaxAggregateInputType
  }

  export type GetBalanceReadingAggregateType<T extends BalanceReadingAggregateArgs> = {
        [P in keyof T & keyof AggregateBalanceReading]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBalanceReading[P]>
      : GetScalarType<T[P], AggregateBalanceReading[P]>
  }




  export type BalanceReadingGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BalanceReadingWhereInput
    orderBy?: BalanceReadingOrderByWithAggregationInput | BalanceReadingOrderByWithAggregationInput[]
    by: BalanceReadingScalarFieldEnum[] | BalanceReadingScalarFieldEnum
    having?: BalanceReadingScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BalanceReadingCountAggregateInputType | true
    _min?: BalanceReadingMinAggregateInputType
    _max?: BalanceReadingMaxAggregateInputType
  }

  export type BalanceReadingGroupByOutputType = {
    id: string
    instrument: string
    command: string
    result: string
    createdAt: Date
    userId: string | null
    _count: BalanceReadingCountAggregateOutputType | null
    _min: BalanceReadingMinAggregateOutputType | null
    _max: BalanceReadingMaxAggregateOutputType | null
  }

  type GetBalanceReadingGroupByPayload<T extends BalanceReadingGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BalanceReadingGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BalanceReadingGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BalanceReadingGroupByOutputType[P]>
            : GetScalarType<T[P], BalanceReadingGroupByOutputType[P]>
        }
      >
    >


  export type BalanceReadingSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    instrument?: boolean
    command?: boolean
    result?: boolean
    createdAt?: boolean
    userId?: boolean
  }, ExtArgs["result"]["balanceReading"]>

  export type BalanceReadingSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    instrument?: boolean
    command?: boolean
    result?: boolean
    createdAt?: boolean
    userId?: boolean
  }, ExtArgs["result"]["balanceReading"]>

  export type BalanceReadingSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    instrument?: boolean
    command?: boolean
    result?: boolean
    createdAt?: boolean
    userId?: boolean
  }, ExtArgs["result"]["balanceReading"]>

  export type BalanceReadingSelectScalar = {
    id?: boolean
    instrument?: boolean
    command?: boolean
    result?: boolean
    createdAt?: boolean
    userId?: boolean
  }

  export type BalanceReadingOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "instrument" | "command" | "result" | "createdAt" | "userId", ExtArgs["result"]["balanceReading"]>

  export type $BalanceReadingPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "BalanceReading"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      instrument: string
      command: string
      result: string
      createdAt: Date
      userId: string | null
    }, ExtArgs["result"]["balanceReading"]>
    composites: {}
  }

  type BalanceReadingGetPayload<S extends boolean | null | undefined | BalanceReadingDefaultArgs> = $Result.GetResult<Prisma.$BalanceReadingPayload, S>

  type BalanceReadingCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<BalanceReadingFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: BalanceReadingCountAggregateInputType | true
    }

  export interface BalanceReadingDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['BalanceReading'], meta: { name: 'BalanceReading' } }
    /**
     * Find zero or one BalanceReading that matches the filter.
     * @param {BalanceReadingFindUniqueArgs} args - Arguments to find a BalanceReading
     * @example
     * // Get one BalanceReading
     * const balanceReading = await prisma.balanceReading.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BalanceReadingFindUniqueArgs>(args: SelectSubset<T, BalanceReadingFindUniqueArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one BalanceReading that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BalanceReadingFindUniqueOrThrowArgs} args - Arguments to find a BalanceReading
     * @example
     * // Get one BalanceReading
     * const balanceReading = await prisma.balanceReading.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BalanceReadingFindUniqueOrThrowArgs>(args: SelectSubset<T, BalanceReadingFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BalanceReading that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingFindFirstArgs} args - Arguments to find a BalanceReading
     * @example
     * // Get one BalanceReading
     * const balanceReading = await prisma.balanceReading.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BalanceReadingFindFirstArgs>(args?: SelectSubset<T, BalanceReadingFindFirstArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BalanceReading that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingFindFirstOrThrowArgs} args - Arguments to find a BalanceReading
     * @example
     * // Get one BalanceReading
     * const balanceReading = await prisma.balanceReading.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BalanceReadingFindFirstOrThrowArgs>(args?: SelectSubset<T, BalanceReadingFindFirstOrThrowArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more BalanceReadings that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all BalanceReadings
     * const balanceReadings = await prisma.balanceReading.findMany()
     * 
     * // Get first 10 BalanceReadings
     * const balanceReadings = await prisma.balanceReading.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const balanceReadingWithIdOnly = await prisma.balanceReading.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BalanceReadingFindManyArgs>(args?: SelectSubset<T, BalanceReadingFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a BalanceReading.
     * @param {BalanceReadingCreateArgs} args - Arguments to create a BalanceReading.
     * @example
     * // Create one BalanceReading
     * const BalanceReading = await prisma.balanceReading.create({
     *   data: {
     *     // ... data to create a BalanceReading
     *   }
     * })
     * 
     */
    create<T extends BalanceReadingCreateArgs>(args: SelectSubset<T, BalanceReadingCreateArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many BalanceReadings.
     * @param {BalanceReadingCreateManyArgs} args - Arguments to create many BalanceReadings.
     * @example
     * // Create many BalanceReadings
     * const balanceReading = await prisma.balanceReading.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BalanceReadingCreateManyArgs>(args?: SelectSubset<T, BalanceReadingCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many BalanceReadings and returns the data saved in the database.
     * @param {BalanceReadingCreateManyAndReturnArgs} args - Arguments to create many BalanceReadings.
     * @example
     * // Create many BalanceReadings
     * const balanceReading = await prisma.balanceReading.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many BalanceReadings and only return the `id`
     * const balanceReadingWithIdOnly = await prisma.balanceReading.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BalanceReadingCreateManyAndReturnArgs>(args?: SelectSubset<T, BalanceReadingCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a BalanceReading.
     * @param {BalanceReadingDeleteArgs} args - Arguments to delete one BalanceReading.
     * @example
     * // Delete one BalanceReading
     * const BalanceReading = await prisma.balanceReading.delete({
     *   where: {
     *     // ... filter to delete one BalanceReading
     *   }
     * })
     * 
     */
    delete<T extends BalanceReadingDeleteArgs>(args: SelectSubset<T, BalanceReadingDeleteArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one BalanceReading.
     * @param {BalanceReadingUpdateArgs} args - Arguments to update one BalanceReading.
     * @example
     * // Update one BalanceReading
     * const balanceReading = await prisma.balanceReading.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BalanceReadingUpdateArgs>(args: SelectSubset<T, BalanceReadingUpdateArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more BalanceReadings.
     * @param {BalanceReadingDeleteManyArgs} args - Arguments to filter BalanceReadings to delete.
     * @example
     * // Delete a few BalanceReadings
     * const { count } = await prisma.balanceReading.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BalanceReadingDeleteManyArgs>(args?: SelectSubset<T, BalanceReadingDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BalanceReadings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many BalanceReadings
     * const balanceReading = await prisma.balanceReading.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BalanceReadingUpdateManyArgs>(args: SelectSubset<T, BalanceReadingUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BalanceReadings and returns the data updated in the database.
     * @param {BalanceReadingUpdateManyAndReturnArgs} args - Arguments to update many BalanceReadings.
     * @example
     * // Update many BalanceReadings
     * const balanceReading = await prisma.balanceReading.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more BalanceReadings and only return the `id`
     * const balanceReadingWithIdOnly = await prisma.balanceReading.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends BalanceReadingUpdateManyAndReturnArgs>(args: SelectSubset<T, BalanceReadingUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one BalanceReading.
     * @param {BalanceReadingUpsertArgs} args - Arguments to update or create a BalanceReading.
     * @example
     * // Update or create a BalanceReading
     * const balanceReading = await prisma.balanceReading.upsert({
     *   create: {
     *     // ... data to create a BalanceReading
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the BalanceReading we want to update
     *   }
     * })
     */
    upsert<T extends BalanceReadingUpsertArgs>(args: SelectSubset<T, BalanceReadingUpsertArgs<ExtArgs>>): Prisma__BalanceReadingClient<$Result.GetResult<Prisma.$BalanceReadingPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of BalanceReadings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingCountArgs} args - Arguments to filter BalanceReadings to count.
     * @example
     * // Count the number of BalanceReadings
     * const count = await prisma.balanceReading.count({
     *   where: {
     *     // ... the filter for the BalanceReadings we want to count
     *   }
     * })
    **/
    count<T extends BalanceReadingCountArgs>(
      args?: Subset<T, BalanceReadingCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BalanceReadingCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a BalanceReading.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BalanceReadingAggregateArgs>(args: Subset<T, BalanceReadingAggregateArgs>): Prisma.PrismaPromise<GetBalanceReadingAggregateType<T>>

    /**
     * Group by BalanceReading.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BalanceReadingGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BalanceReadingGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BalanceReadingGroupByArgs['orderBy'] }
        : { orderBy?: BalanceReadingGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BalanceReadingGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBalanceReadingGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the BalanceReading model
   */
  readonly fields: BalanceReadingFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for BalanceReading.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BalanceReadingClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the BalanceReading model
   */
  interface BalanceReadingFieldRefs {
    readonly id: FieldRef<"BalanceReading", 'String'>
    readonly instrument: FieldRef<"BalanceReading", 'String'>
    readonly command: FieldRef<"BalanceReading", 'String'>
    readonly result: FieldRef<"BalanceReading", 'String'>
    readonly createdAt: FieldRef<"BalanceReading", 'DateTime'>
    readonly userId: FieldRef<"BalanceReading", 'String'>
  }
    

  // Custom InputTypes
  /**
   * BalanceReading findUnique
   */
  export type BalanceReadingFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * Filter, which BalanceReading to fetch.
     */
    where: BalanceReadingWhereUniqueInput
  }

  /**
   * BalanceReading findUniqueOrThrow
   */
  export type BalanceReadingFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * Filter, which BalanceReading to fetch.
     */
    where: BalanceReadingWhereUniqueInput
  }

  /**
   * BalanceReading findFirst
   */
  export type BalanceReadingFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * Filter, which BalanceReading to fetch.
     */
    where?: BalanceReadingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BalanceReadings to fetch.
     */
    orderBy?: BalanceReadingOrderByWithRelationInput | BalanceReadingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BalanceReadings.
     */
    cursor?: BalanceReadingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BalanceReadings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BalanceReadings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BalanceReadings.
     */
    distinct?: BalanceReadingScalarFieldEnum | BalanceReadingScalarFieldEnum[]
  }

  /**
   * BalanceReading findFirstOrThrow
   */
  export type BalanceReadingFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * Filter, which BalanceReading to fetch.
     */
    where?: BalanceReadingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BalanceReadings to fetch.
     */
    orderBy?: BalanceReadingOrderByWithRelationInput | BalanceReadingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BalanceReadings.
     */
    cursor?: BalanceReadingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BalanceReadings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BalanceReadings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BalanceReadings.
     */
    distinct?: BalanceReadingScalarFieldEnum | BalanceReadingScalarFieldEnum[]
  }

  /**
   * BalanceReading findMany
   */
  export type BalanceReadingFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * Filter, which BalanceReadings to fetch.
     */
    where?: BalanceReadingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BalanceReadings to fetch.
     */
    orderBy?: BalanceReadingOrderByWithRelationInput | BalanceReadingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing BalanceReadings.
     */
    cursor?: BalanceReadingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BalanceReadings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BalanceReadings.
     */
    skip?: number
    distinct?: BalanceReadingScalarFieldEnum | BalanceReadingScalarFieldEnum[]
  }

  /**
   * BalanceReading create
   */
  export type BalanceReadingCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * The data needed to create a BalanceReading.
     */
    data: XOR<BalanceReadingCreateInput, BalanceReadingUncheckedCreateInput>
  }

  /**
   * BalanceReading createMany
   */
  export type BalanceReadingCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many BalanceReadings.
     */
    data: BalanceReadingCreateManyInput | BalanceReadingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * BalanceReading createManyAndReturn
   */
  export type BalanceReadingCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * The data used to create many BalanceReadings.
     */
    data: BalanceReadingCreateManyInput | BalanceReadingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * BalanceReading update
   */
  export type BalanceReadingUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * The data needed to update a BalanceReading.
     */
    data: XOR<BalanceReadingUpdateInput, BalanceReadingUncheckedUpdateInput>
    /**
     * Choose, which BalanceReading to update.
     */
    where: BalanceReadingWhereUniqueInput
  }

  /**
   * BalanceReading updateMany
   */
  export type BalanceReadingUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update BalanceReadings.
     */
    data: XOR<BalanceReadingUpdateManyMutationInput, BalanceReadingUncheckedUpdateManyInput>
    /**
     * Filter which BalanceReadings to update
     */
    where?: BalanceReadingWhereInput
    /**
     * Limit how many BalanceReadings to update.
     */
    limit?: number
  }

  /**
   * BalanceReading updateManyAndReturn
   */
  export type BalanceReadingUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * The data used to update BalanceReadings.
     */
    data: XOR<BalanceReadingUpdateManyMutationInput, BalanceReadingUncheckedUpdateManyInput>
    /**
     * Filter which BalanceReadings to update
     */
    where?: BalanceReadingWhereInput
    /**
     * Limit how many BalanceReadings to update.
     */
    limit?: number
  }

  /**
   * BalanceReading upsert
   */
  export type BalanceReadingUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * The filter to search for the BalanceReading to update in case it exists.
     */
    where: BalanceReadingWhereUniqueInput
    /**
     * In case the BalanceReading found by the `where` argument doesn't exist, create a new BalanceReading with this data.
     */
    create: XOR<BalanceReadingCreateInput, BalanceReadingUncheckedCreateInput>
    /**
     * In case the BalanceReading was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BalanceReadingUpdateInput, BalanceReadingUncheckedUpdateInput>
  }

  /**
   * BalanceReading delete
   */
  export type BalanceReadingDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
    /**
     * Filter which BalanceReading to delete.
     */
    where: BalanceReadingWhereUniqueInput
  }

  /**
   * BalanceReading deleteMany
   */
  export type BalanceReadingDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BalanceReadings to delete
     */
    where?: BalanceReadingWhereInput
    /**
     * Limit how many BalanceReadings to delete.
     */
    limit?: number
  }

  /**
   * BalanceReading without action
   */
  export type BalanceReadingDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BalanceReading
     */
    select?: BalanceReadingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BalanceReading
     */
    omit?: BalanceReadingOmit<ExtArgs> | null
  }


  /**
   * Model AuditTrail
   */

  export type AggregateAuditTrail = {
    _count: AuditTrailCountAggregateOutputType | null
    _min: AuditTrailMinAggregateOutputType | null
    _max: AuditTrailMaxAggregateOutputType | null
  }

  export type AuditTrailMinAggregateOutputType = {
    id: string | null
    action: string | null
    details: string | null
    userId: string | null
    createdAt: Date | null
  }

  export type AuditTrailMaxAggregateOutputType = {
    id: string | null
    action: string | null
    details: string | null
    userId: string | null
    createdAt: Date | null
  }

  export type AuditTrailCountAggregateOutputType = {
    id: number
    action: number
    details: number
    userId: number
    createdAt: number
    _all: number
  }


  export type AuditTrailMinAggregateInputType = {
    id?: true
    action?: true
    details?: true
    userId?: true
    createdAt?: true
  }

  export type AuditTrailMaxAggregateInputType = {
    id?: true
    action?: true
    details?: true
    userId?: true
    createdAt?: true
  }

  export type AuditTrailCountAggregateInputType = {
    id?: true
    action?: true
    details?: true
    userId?: true
    createdAt?: true
    _all?: true
  }

  export type AuditTrailAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditTrail to aggregate.
     */
    where?: AuditTrailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditTrails to fetch.
     */
    orderBy?: AuditTrailOrderByWithRelationInput | AuditTrailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AuditTrailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditTrails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditTrails.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AuditTrails
    **/
    _count?: true | AuditTrailCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AuditTrailMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AuditTrailMaxAggregateInputType
  }

  export type GetAuditTrailAggregateType<T extends AuditTrailAggregateArgs> = {
        [P in keyof T & keyof AggregateAuditTrail]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAuditTrail[P]>
      : GetScalarType<T[P], AggregateAuditTrail[P]>
  }




  export type AuditTrailGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuditTrailWhereInput
    orderBy?: AuditTrailOrderByWithAggregationInput | AuditTrailOrderByWithAggregationInput[]
    by: AuditTrailScalarFieldEnum[] | AuditTrailScalarFieldEnum
    having?: AuditTrailScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AuditTrailCountAggregateInputType | true
    _min?: AuditTrailMinAggregateInputType
    _max?: AuditTrailMaxAggregateInputType
  }

  export type AuditTrailGroupByOutputType = {
    id: string
    action: string
    details: string
    userId: string | null
    createdAt: Date
    _count: AuditTrailCountAggregateOutputType | null
    _min: AuditTrailMinAggregateOutputType | null
    _max: AuditTrailMaxAggregateOutputType | null
  }

  type GetAuditTrailGroupByPayload<T extends AuditTrailGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AuditTrailGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AuditTrailGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AuditTrailGroupByOutputType[P]>
            : GetScalarType<T[P], AuditTrailGroupByOutputType[P]>
        }
      >
    >


  export type AuditTrailSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    action?: boolean
    details?: boolean
    userId?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["auditTrail"]>

  export type AuditTrailSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    action?: boolean
    details?: boolean
    userId?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["auditTrail"]>

  export type AuditTrailSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    action?: boolean
    details?: boolean
    userId?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["auditTrail"]>

  export type AuditTrailSelectScalar = {
    id?: boolean
    action?: boolean
    details?: boolean
    userId?: boolean
    createdAt?: boolean
  }

  export type AuditTrailOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "action" | "details" | "userId" | "createdAt", ExtArgs["result"]["auditTrail"]>

  export type $AuditTrailPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AuditTrail"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      action: string
      details: string
      userId: string | null
      createdAt: Date
    }, ExtArgs["result"]["auditTrail"]>
    composites: {}
  }

  type AuditTrailGetPayload<S extends boolean | null | undefined | AuditTrailDefaultArgs> = $Result.GetResult<Prisma.$AuditTrailPayload, S>

  type AuditTrailCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AuditTrailFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AuditTrailCountAggregateInputType | true
    }

  export interface AuditTrailDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AuditTrail'], meta: { name: 'AuditTrail' } }
    /**
     * Find zero or one AuditTrail that matches the filter.
     * @param {AuditTrailFindUniqueArgs} args - Arguments to find a AuditTrail
     * @example
     * // Get one AuditTrail
     * const auditTrail = await prisma.auditTrail.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AuditTrailFindUniqueArgs>(args: SelectSubset<T, AuditTrailFindUniqueArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AuditTrail that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AuditTrailFindUniqueOrThrowArgs} args - Arguments to find a AuditTrail
     * @example
     * // Get one AuditTrail
     * const auditTrail = await prisma.auditTrail.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AuditTrailFindUniqueOrThrowArgs>(args: SelectSubset<T, AuditTrailFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditTrail that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailFindFirstArgs} args - Arguments to find a AuditTrail
     * @example
     * // Get one AuditTrail
     * const auditTrail = await prisma.auditTrail.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AuditTrailFindFirstArgs>(args?: SelectSubset<T, AuditTrailFindFirstArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditTrail that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailFindFirstOrThrowArgs} args - Arguments to find a AuditTrail
     * @example
     * // Get one AuditTrail
     * const auditTrail = await prisma.auditTrail.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AuditTrailFindFirstOrThrowArgs>(args?: SelectSubset<T, AuditTrailFindFirstOrThrowArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AuditTrails that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AuditTrails
     * const auditTrails = await prisma.auditTrail.findMany()
     * 
     * // Get first 10 AuditTrails
     * const auditTrails = await prisma.auditTrail.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const auditTrailWithIdOnly = await prisma.auditTrail.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AuditTrailFindManyArgs>(args?: SelectSubset<T, AuditTrailFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AuditTrail.
     * @param {AuditTrailCreateArgs} args - Arguments to create a AuditTrail.
     * @example
     * // Create one AuditTrail
     * const AuditTrail = await prisma.auditTrail.create({
     *   data: {
     *     // ... data to create a AuditTrail
     *   }
     * })
     * 
     */
    create<T extends AuditTrailCreateArgs>(args: SelectSubset<T, AuditTrailCreateArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AuditTrails.
     * @param {AuditTrailCreateManyArgs} args - Arguments to create many AuditTrails.
     * @example
     * // Create many AuditTrails
     * const auditTrail = await prisma.auditTrail.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AuditTrailCreateManyArgs>(args?: SelectSubset<T, AuditTrailCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AuditTrails and returns the data saved in the database.
     * @param {AuditTrailCreateManyAndReturnArgs} args - Arguments to create many AuditTrails.
     * @example
     * // Create many AuditTrails
     * const auditTrail = await prisma.auditTrail.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AuditTrails and only return the `id`
     * const auditTrailWithIdOnly = await prisma.auditTrail.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AuditTrailCreateManyAndReturnArgs>(args?: SelectSubset<T, AuditTrailCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AuditTrail.
     * @param {AuditTrailDeleteArgs} args - Arguments to delete one AuditTrail.
     * @example
     * // Delete one AuditTrail
     * const AuditTrail = await prisma.auditTrail.delete({
     *   where: {
     *     // ... filter to delete one AuditTrail
     *   }
     * })
     * 
     */
    delete<T extends AuditTrailDeleteArgs>(args: SelectSubset<T, AuditTrailDeleteArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AuditTrail.
     * @param {AuditTrailUpdateArgs} args - Arguments to update one AuditTrail.
     * @example
     * // Update one AuditTrail
     * const auditTrail = await prisma.auditTrail.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AuditTrailUpdateArgs>(args: SelectSubset<T, AuditTrailUpdateArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AuditTrails.
     * @param {AuditTrailDeleteManyArgs} args - Arguments to filter AuditTrails to delete.
     * @example
     * // Delete a few AuditTrails
     * const { count } = await prisma.auditTrail.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AuditTrailDeleteManyArgs>(args?: SelectSubset<T, AuditTrailDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditTrails.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AuditTrails
     * const auditTrail = await prisma.auditTrail.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AuditTrailUpdateManyArgs>(args: SelectSubset<T, AuditTrailUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditTrails and returns the data updated in the database.
     * @param {AuditTrailUpdateManyAndReturnArgs} args - Arguments to update many AuditTrails.
     * @example
     * // Update many AuditTrails
     * const auditTrail = await prisma.auditTrail.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AuditTrails and only return the `id`
     * const auditTrailWithIdOnly = await prisma.auditTrail.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AuditTrailUpdateManyAndReturnArgs>(args: SelectSubset<T, AuditTrailUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AuditTrail.
     * @param {AuditTrailUpsertArgs} args - Arguments to update or create a AuditTrail.
     * @example
     * // Update or create a AuditTrail
     * const auditTrail = await prisma.auditTrail.upsert({
     *   create: {
     *     // ... data to create a AuditTrail
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AuditTrail we want to update
     *   }
     * })
     */
    upsert<T extends AuditTrailUpsertArgs>(args: SelectSubset<T, AuditTrailUpsertArgs<ExtArgs>>): Prisma__AuditTrailClient<$Result.GetResult<Prisma.$AuditTrailPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AuditTrails.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailCountArgs} args - Arguments to filter AuditTrails to count.
     * @example
     * // Count the number of AuditTrails
     * const count = await prisma.auditTrail.count({
     *   where: {
     *     // ... the filter for the AuditTrails we want to count
     *   }
     * })
    **/
    count<T extends AuditTrailCountArgs>(
      args?: Subset<T, AuditTrailCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AuditTrailCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AuditTrail.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AuditTrailAggregateArgs>(args: Subset<T, AuditTrailAggregateArgs>): Prisma.PrismaPromise<GetAuditTrailAggregateType<T>>

    /**
     * Group by AuditTrail.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditTrailGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AuditTrailGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AuditTrailGroupByArgs['orderBy'] }
        : { orderBy?: AuditTrailGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AuditTrailGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAuditTrailGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AuditTrail model
   */
  readonly fields: AuditTrailFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AuditTrail.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AuditTrailClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AuditTrail model
   */
  interface AuditTrailFieldRefs {
    readonly id: FieldRef<"AuditTrail", 'String'>
    readonly action: FieldRef<"AuditTrail", 'String'>
    readonly details: FieldRef<"AuditTrail", 'String'>
    readonly userId: FieldRef<"AuditTrail", 'String'>
    readonly createdAt: FieldRef<"AuditTrail", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * AuditTrail findUnique
   */
  export type AuditTrailFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * Filter, which AuditTrail to fetch.
     */
    where: AuditTrailWhereUniqueInput
  }

  /**
   * AuditTrail findUniqueOrThrow
   */
  export type AuditTrailFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * Filter, which AuditTrail to fetch.
     */
    where: AuditTrailWhereUniqueInput
  }

  /**
   * AuditTrail findFirst
   */
  export type AuditTrailFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * Filter, which AuditTrail to fetch.
     */
    where?: AuditTrailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditTrails to fetch.
     */
    orderBy?: AuditTrailOrderByWithRelationInput | AuditTrailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditTrails.
     */
    cursor?: AuditTrailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditTrails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditTrails.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditTrails.
     */
    distinct?: AuditTrailScalarFieldEnum | AuditTrailScalarFieldEnum[]
  }

  /**
   * AuditTrail findFirstOrThrow
   */
  export type AuditTrailFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * Filter, which AuditTrail to fetch.
     */
    where?: AuditTrailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditTrails to fetch.
     */
    orderBy?: AuditTrailOrderByWithRelationInput | AuditTrailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditTrails.
     */
    cursor?: AuditTrailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditTrails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditTrails.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditTrails.
     */
    distinct?: AuditTrailScalarFieldEnum | AuditTrailScalarFieldEnum[]
  }

  /**
   * AuditTrail findMany
   */
  export type AuditTrailFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * Filter, which AuditTrails to fetch.
     */
    where?: AuditTrailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditTrails to fetch.
     */
    orderBy?: AuditTrailOrderByWithRelationInput | AuditTrailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AuditTrails.
     */
    cursor?: AuditTrailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditTrails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditTrails.
     */
    skip?: number
    distinct?: AuditTrailScalarFieldEnum | AuditTrailScalarFieldEnum[]
  }

  /**
   * AuditTrail create
   */
  export type AuditTrailCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * The data needed to create a AuditTrail.
     */
    data: XOR<AuditTrailCreateInput, AuditTrailUncheckedCreateInput>
  }

  /**
   * AuditTrail createMany
   */
  export type AuditTrailCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AuditTrails.
     */
    data: AuditTrailCreateManyInput | AuditTrailCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuditTrail createManyAndReturn
   */
  export type AuditTrailCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * The data used to create many AuditTrails.
     */
    data: AuditTrailCreateManyInput | AuditTrailCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuditTrail update
   */
  export type AuditTrailUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * The data needed to update a AuditTrail.
     */
    data: XOR<AuditTrailUpdateInput, AuditTrailUncheckedUpdateInput>
    /**
     * Choose, which AuditTrail to update.
     */
    where: AuditTrailWhereUniqueInput
  }

  /**
   * AuditTrail updateMany
   */
  export type AuditTrailUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AuditTrails.
     */
    data: XOR<AuditTrailUpdateManyMutationInput, AuditTrailUncheckedUpdateManyInput>
    /**
     * Filter which AuditTrails to update
     */
    where?: AuditTrailWhereInput
    /**
     * Limit how many AuditTrails to update.
     */
    limit?: number
  }

  /**
   * AuditTrail updateManyAndReturn
   */
  export type AuditTrailUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * The data used to update AuditTrails.
     */
    data: XOR<AuditTrailUpdateManyMutationInput, AuditTrailUncheckedUpdateManyInput>
    /**
     * Filter which AuditTrails to update
     */
    where?: AuditTrailWhereInput
    /**
     * Limit how many AuditTrails to update.
     */
    limit?: number
  }

  /**
   * AuditTrail upsert
   */
  export type AuditTrailUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * The filter to search for the AuditTrail to update in case it exists.
     */
    where: AuditTrailWhereUniqueInput
    /**
     * In case the AuditTrail found by the `where` argument doesn't exist, create a new AuditTrail with this data.
     */
    create: XOR<AuditTrailCreateInput, AuditTrailUncheckedCreateInput>
    /**
     * In case the AuditTrail was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AuditTrailUpdateInput, AuditTrailUncheckedUpdateInput>
  }

  /**
   * AuditTrail delete
   */
  export type AuditTrailDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
    /**
     * Filter which AuditTrail to delete.
     */
    where: AuditTrailWhereUniqueInput
  }

  /**
   * AuditTrail deleteMany
   */
  export type AuditTrailDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditTrails to delete
     */
    where?: AuditTrailWhereInput
    /**
     * Limit how many AuditTrails to delete.
     */
    limit?: number
  }

  /**
   * AuditTrail without action
   */
  export type AuditTrailDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditTrail
     */
    select?: AuditTrailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditTrail
     */
    omit?: AuditTrailOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const BalanceReadingScalarFieldEnum: {
    id: 'id',
    instrument: 'instrument',
    command: 'command',
    result: 'result',
    createdAt: 'createdAt',
    userId: 'userId'
  };

  export type BalanceReadingScalarFieldEnum = (typeof BalanceReadingScalarFieldEnum)[keyof typeof BalanceReadingScalarFieldEnum]


  export const AuditTrailScalarFieldEnum: {
    id: 'id',
    action: 'action',
    details: 'details',
    userId: 'userId',
    createdAt: 'createdAt'
  };

  export type AuditTrailScalarFieldEnum = (typeof AuditTrailScalarFieldEnum)[keyof typeof AuditTrailScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    
  /**
   * Deep Input Types
   */


  export type BalanceReadingWhereInput = {
    AND?: BalanceReadingWhereInput | BalanceReadingWhereInput[]
    OR?: BalanceReadingWhereInput[]
    NOT?: BalanceReadingWhereInput | BalanceReadingWhereInput[]
    id?: StringFilter<"BalanceReading"> | string
    instrument?: StringFilter<"BalanceReading"> | string
    command?: StringFilter<"BalanceReading"> | string
    result?: StringFilter<"BalanceReading"> | string
    createdAt?: DateTimeFilter<"BalanceReading"> | Date | string
    userId?: StringNullableFilter<"BalanceReading"> | string | null
  }

  export type BalanceReadingOrderByWithRelationInput = {
    id?: SortOrder
    instrument?: SortOrder
    command?: SortOrder
    result?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrderInput | SortOrder
  }

  export type BalanceReadingWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: BalanceReadingWhereInput | BalanceReadingWhereInput[]
    OR?: BalanceReadingWhereInput[]
    NOT?: BalanceReadingWhereInput | BalanceReadingWhereInput[]
    instrument?: StringFilter<"BalanceReading"> | string
    command?: StringFilter<"BalanceReading"> | string
    result?: StringFilter<"BalanceReading"> | string
    createdAt?: DateTimeFilter<"BalanceReading"> | Date | string
    userId?: StringNullableFilter<"BalanceReading"> | string | null
  }, "id">

  export type BalanceReadingOrderByWithAggregationInput = {
    id?: SortOrder
    instrument?: SortOrder
    command?: SortOrder
    result?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrderInput | SortOrder
    _count?: BalanceReadingCountOrderByAggregateInput
    _max?: BalanceReadingMaxOrderByAggregateInput
    _min?: BalanceReadingMinOrderByAggregateInput
  }

  export type BalanceReadingScalarWhereWithAggregatesInput = {
    AND?: BalanceReadingScalarWhereWithAggregatesInput | BalanceReadingScalarWhereWithAggregatesInput[]
    OR?: BalanceReadingScalarWhereWithAggregatesInput[]
    NOT?: BalanceReadingScalarWhereWithAggregatesInput | BalanceReadingScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"BalanceReading"> | string
    instrument?: StringWithAggregatesFilter<"BalanceReading"> | string
    command?: StringWithAggregatesFilter<"BalanceReading"> | string
    result?: StringWithAggregatesFilter<"BalanceReading"> | string
    createdAt?: DateTimeWithAggregatesFilter<"BalanceReading"> | Date | string
    userId?: StringNullableWithAggregatesFilter<"BalanceReading"> | string | null
  }

  export type AuditTrailWhereInput = {
    AND?: AuditTrailWhereInput | AuditTrailWhereInput[]
    OR?: AuditTrailWhereInput[]
    NOT?: AuditTrailWhereInput | AuditTrailWhereInput[]
    id?: StringFilter<"AuditTrail"> | string
    action?: StringFilter<"AuditTrail"> | string
    details?: StringFilter<"AuditTrail"> | string
    userId?: StringNullableFilter<"AuditTrail"> | string | null
    createdAt?: DateTimeFilter<"AuditTrail"> | Date | string
  }

  export type AuditTrailOrderByWithRelationInput = {
    id?: SortOrder
    action?: SortOrder
    details?: SortOrder
    userId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
  }

  export type AuditTrailWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AuditTrailWhereInput | AuditTrailWhereInput[]
    OR?: AuditTrailWhereInput[]
    NOT?: AuditTrailWhereInput | AuditTrailWhereInput[]
    action?: StringFilter<"AuditTrail"> | string
    details?: StringFilter<"AuditTrail"> | string
    userId?: StringNullableFilter<"AuditTrail"> | string | null
    createdAt?: DateTimeFilter<"AuditTrail"> | Date | string
  }, "id">

  export type AuditTrailOrderByWithAggregationInput = {
    id?: SortOrder
    action?: SortOrder
    details?: SortOrder
    userId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: AuditTrailCountOrderByAggregateInput
    _max?: AuditTrailMaxOrderByAggregateInput
    _min?: AuditTrailMinOrderByAggregateInput
  }

  export type AuditTrailScalarWhereWithAggregatesInput = {
    AND?: AuditTrailScalarWhereWithAggregatesInput | AuditTrailScalarWhereWithAggregatesInput[]
    OR?: AuditTrailScalarWhereWithAggregatesInput[]
    NOT?: AuditTrailScalarWhereWithAggregatesInput | AuditTrailScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"AuditTrail"> | string
    action?: StringWithAggregatesFilter<"AuditTrail"> | string
    details?: StringWithAggregatesFilter<"AuditTrail"> | string
    userId?: StringNullableWithAggregatesFilter<"AuditTrail"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"AuditTrail"> | Date | string
  }

  export type BalanceReadingCreateInput = {
    id?: string
    instrument: string
    command: string
    result: string
    createdAt?: Date | string
    userId?: string | null
  }

  export type BalanceReadingUncheckedCreateInput = {
    id?: string
    instrument: string
    command: string
    result: string
    createdAt?: Date | string
    userId?: string | null
  }

  export type BalanceReadingUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    instrument?: StringFieldUpdateOperationsInput | string
    command?: StringFieldUpdateOperationsInput | string
    result?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type BalanceReadingUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    instrument?: StringFieldUpdateOperationsInput | string
    command?: StringFieldUpdateOperationsInput | string
    result?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type BalanceReadingCreateManyInput = {
    id?: string
    instrument: string
    command: string
    result: string
    createdAt?: Date | string
    userId?: string | null
  }

  export type BalanceReadingUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    instrument?: StringFieldUpdateOperationsInput | string
    command?: StringFieldUpdateOperationsInput | string
    result?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type BalanceReadingUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    instrument?: StringFieldUpdateOperationsInput | string
    command?: StringFieldUpdateOperationsInput | string
    result?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AuditTrailCreateInput = {
    id?: string
    action: string
    details: string
    userId?: string | null
    createdAt?: Date | string
  }

  export type AuditTrailUncheckedCreateInput = {
    id?: string
    action: string
    details: string
    userId?: string | null
    createdAt?: Date | string
  }

  export type AuditTrailUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditTrailUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditTrailCreateManyInput = {
    id?: string
    action: string
    details: string
    userId?: string | null
    createdAt?: Date | string
  }

  export type AuditTrailUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditTrailUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type BalanceReadingCountOrderByAggregateInput = {
    id?: SortOrder
    instrument?: SortOrder
    command?: SortOrder
    result?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrder
  }

  export type BalanceReadingMaxOrderByAggregateInput = {
    id?: SortOrder
    instrument?: SortOrder
    command?: SortOrder
    result?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrder
  }

  export type BalanceReadingMinOrderByAggregateInput = {
    id?: SortOrder
    instrument?: SortOrder
    command?: SortOrder
    result?: SortOrder
    createdAt?: SortOrder
    userId?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type AuditTrailCountOrderByAggregateInput = {
    id?: SortOrder
    action?: SortOrder
    details?: SortOrder
    userId?: SortOrder
    createdAt?: SortOrder
  }

  export type AuditTrailMaxOrderByAggregateInput = {
    id?: SortOrder
    action?: SortOrder
    details?: SortOrder
    userId?: SortOrder
    createdAt?: SortOrder
  }

  export type AuditTrailMinOrderByAggregateInput = {
    id?: SortOrder
    action?: SortOrder
    details?: SortOrder
    userId?: SortOrder
    createdAt?: SortOrder
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}