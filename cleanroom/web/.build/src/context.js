"use strict";
/**
 * What every subsystem is handed.
 *
 * Subsystems reach the hardware and the calibration through this, and reach the
 * two cross-cutting services — fault reporting and restart — through function
 * hooks. That keeps fault memory and the reset path from importing the
 * subsystems that call them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
