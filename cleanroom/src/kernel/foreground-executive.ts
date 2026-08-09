/**
 * The cooperative foreground executive, CODE:601a-607d.
 *
 * "CODE:601a-607d is a fixed cooperative foreground cycle. It invokes a
 * deterministic service sequence, repeatedly calls housekeeping at 6096, and
 * loops through 5f97-6017 -> 2112 -> 601a. No RTOS dispatcher or idle wait is
 * present."
 *
 * Three properties matter and are reproduced exactly: the service order is
 * fixed, housekeeping runs between services rather than once per cycle, and the
 * loop never idles. A service that throws would stall the cycle, so a thrown
 * error is surfaced with the name of the service that raised it rather than
 * being swallowed.
 */

export interface ForegroundService {
  name: string;
  /** Firmware address this service stands in for, where one is known. */
  address?: number;
  run(): void;
}

export class ForegroundExecutive {
  cycles = 0;
  housekeepingCalls = 0;
  /** Name of the service running right now, for error reporting. */
  private current: string | null = null;

  private readonly services: readonly ForegroundService[];
  /** CODE:6096. */
  private readonly housekeeping: () => void;
  /** The loop tail at 5f97-6017 -> 2112 -> 601a. */
  private readonly loopTail: () => void;

  constructor(
    services: readonly ForegroundService[],
    housekeeping: () => void,
    loopTail: () => void = () => {},
  ) {
    this.services = services;
    this.housekeeping = housekeeping;
    this.loopTail = loopTail;
  }

  /** One pass of 601a-607d. */
  cycle(): void {
    for (const service of this.services) {
      this.current = service.name;
      try {
        service.run();
      } catch (error) {
        this.current = null;
        throw new Error(
          `foreground service "${service.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      this.housekeeping();
      this.housekeepingCalls += 1;
    }
    this.current = null;
    this.loopTail();
    this.cycles += 1;
  }

  runningService(): string | null {
    return this.current;
  }

  serviceNames(): string[] {
    return this.services.map((service) => service.name);
  }
}
