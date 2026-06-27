import { DateTime } from 'luxon';
import { evaluate } from 'mathjs';
import { TemplateContext } from './types';

/**
 * Matches `displayUnits` on a path's own metadata (`app.getMetadata(path).displayUnits` in the live
 * plugin, the `.../meta` tree over HTTP in the CLI) - SignalK's per-path unit-preference info, fully
 * resolved (formula/symbol ready to use), unlike the global `/signalk/v1/unitpreferences/active`
 * endpoint which only gives a bare `targetUnit` name with no conversion math at all.
 */
export interface DisplayUnits {
  category: string;
  targetUnit: string;
  formula?: string;
  symbol?: string;
  displayFormat?: string;
}

/** Converts a base-SI value (always what SignalK paths deliver) to its metadata's preferred display unit and formats it with the unit's symbol, e.g. 3.42 -> "11.2ft". */
export function formatDisplayUnits(value: number, displayUnits: DisplayUnits, round: number | undefined): string {
  const converted = displayUnits.formula ? Number(evaluate(displayUnits.formula, { value })) : value;
  const decimals = round ?? (displayUnits.displayFormat?.includes('.') ? displayUnits.displayFormat.split('.')[1].length : 0);
  const symbol = displayUnits.symbol ?? displayUnits.targetUnit;
  return `${converted.toFixed(decimals)}${symbol}`;
}

/**
 * Shows the explicit IANA zone name rather than an abbreviation (e.g. "BST") - UK tide tables are
 * officially published in GMT, so the basis for the displayed time must be unambiguous rather than
 * just locally styled. Always reads the local vessel's timezone (`signalk.self`), regardless of which
 * vessel's value is being formatted - the display's own clock/locale is what matters.
 */
function formatLocalTime(value: unknown, context: TemplateContext): string {
  if (typeof value !== 'string') return '';
  const signalk = context.signalk as Record<string, unknown> | undefined;
  const self = signalk?.self as Record<string, unknown> | undefined;
  const environment = self?.environment as { time?: { timezoneRegion?: string } } | undefined;
  const zone = environment?.time?.timezoneRegion || 'utc';
  const dt = DateTime.fromISO(value, { zone: 'utc' }).setZone(zone);
  return dt.isValid ? dt.toFormat('HH:mm') : '';
}

/**
 * IANA region names are ambiguous about DST (e.g. "Europe/London" is UTC+00:00 in winter, UTC+01:00
 * in summer); show the numeric offset actually in effect.
 */
function formatUtcOffset(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const dt = DateTime.now().setZone(value);
  return dt.isValid ? `UTC${dt.toFormat('ZZ')}` : '';
}

function formatPosition(value: unknown, round: number | undefined): string {
  const position = value as { latitude?: number; longitude?: number } | undefined;
  if (typeof position?.latitude !== 'number' || typeof position?.longitude !== 'number') return '';
  const decimals = round ?? 4;
  const lat = Math.abs(position.latitude).toFixed(decimals);
  const lon = Math.abs(position.longitude).toFixed(decimals);
  const latHemisphere = position.latitude >= 0 ? 'N' : 'S';
  const lonHemisphere = position.longitude >= 0 ? 'E' : 'W';
  return `${lat}°${latHemisphere} ${lon}°${lonHemisphere}`;
}

/** Applies a named `format=` formatter to a resolved binding value. */
export function applyFormat(name: string, value: unknown, context: TemplateContext, round: number | undefined): string {
  switch (name) {
    case 'local_time':
      return formatLocalTime(value, context);
    case 'utc_offset':
      return formatUtcOffset(value);
    case 'position':
      return formatPosition(value, round);
    default:
      throw new Error(`unknown format "${name}"`);
  }
}
