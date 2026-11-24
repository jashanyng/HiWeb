export interface DateFormatterOptions {
  readonly locale: string;
  readonly timeZone: string;
  readonly fallback?: string;
}

export interface DateFormatter {
  formatDate(input: Date | string | number | null | undefined): string;
  formatDateTime(input: Date | string | number | null | undefined): string;
  formatFullDate(input: Date | string | number | null | undefined): string;
  formatCompactDate(input: Date | string | number | null | undefined, referenceDate?: Date): string;
  isSameDay(a: Date | string | number, b?: Date | string | number): boolean;
}

function toValidDate(input: Date | string | number | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 创建可注入 Locale 与 TimeZone 的日期时间格式化器，不写死任何默认时区。 */
export function createDateFormatter(options: DateFormatterOptions): DateFormatter {
  const fallback = options.fallback ?? "—";
  const dateFmt = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateTimeFmt = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const fullDateFmt = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    dateStyle: "long",
  });
  const sameYearFmt = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    month: "short",
    day: "numeric",
  });
  const yearFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: options.timeZone,
    year: "numeric",
  });
  const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: options.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return {
    formatDate(input) {
      const date = toValidDate(input);
      return date ? dateFmt.format(date) : fallback;
    },
    formatDateTime(input) {
      const date = toValidDate(input);
      return date ? dateTimeFmt.format(date) : fallback;
    },
    formatFullDate(input) {
      const date = toValidDate(input);
      return date ? fullDateFmt.format(date) : fallback;
    },
    formatCompactDate(input, referenceDate = new Date()) {
      const date = toValidDate(input);
      if (!date) return fallback;
      if (yearFmt.format(date) === yearFmt.format(referenceDate)) {
        return sameYearFmt.format(date);
      }
      return fullDateFmt.format(date);
    },
    isSameDay(a, b = new Date()) {
      const da = toValidDate(a);
      const db = toValidDate(b);
      if (!da || !db) return false;
      return dayKeyFmt.format(da) === dayKeyFmt.format(db);
    },
  };
}

export interface NumberFormatterOptions {
  readonly locale: string;
  readonly fallback?: string;
}

export interface NumberFormatter {
  formatNumber(value: number | null | undefined): string;
  formatPercent(ratio: number | null | undefined, fractionDigits?: number): string;
  formatLatency(ms: number | null | undefined): string;
}

export function createNumberFormatter(options: NumberFormatterOptions): NumberFormatter {
  const fallback = options.fallback ?? "—";
  const numFmt = new Intl.NumberFormat(options.locale);

  return {
    formatNumber(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
      return numFmt.format(value);
    },
    formatPercent(ratio, fractionDigits = 0) {
      if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return fallback;
      return new Intl.NumberFormat(options.locale, {
        style: "percent",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(ratio);
    },
    formatLatency(ms) {
      if (ms === null || ms === undefined || !Number.isFinite(ms)) return fallback;
      if (ms < 1000) return `${Math.round(ms)} ms`;
      return `${(ms / 1000).toFixed(2)} s`;
    },
  };
}

export function shortId(id: string | null | undefined, length = 8, fallback = "—"): string {
  if (!id) return fallback;
  return id.length <= length ? id : id.slice(0, length);
}
