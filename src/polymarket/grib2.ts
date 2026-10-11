/**
 * Minimal GRIB2 decoder for the two fields P8 reads: one message on a regular
 * latitude/longitude grid (template 3.0) packed either with complex packing and
 * spatial differencing (template 5.3, NOAA GFS) or CCSDS/AEC compression
 * (template 5.42, ECMWF open data). Anything else fails closed.
 */

export type LatLonGrid = { ni: number; nj: number; la1: number; lo1: number; di: number; dj: number; scan: number };
export type Grib2Field = { grid: LatLonGrid; values: Float64Array };

export function decodeGrib2(bytes: Uint8Array): Grib2Field {
  if (text(bytes, 0, 4) !== "GRIB" || bytes[7] !== 2) throw new Error("Not a GRIB2 message.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let grid: LatLonGrid | null = null;
  let template = -1;
  let section5: Uint8Array | null = null;
  let count = 0;
  let values: Float64Array | null = null;
  let pos = 16;
  while (pos + 4 <= bytes.length && text(bytes, pos, 4) !== "7777") {
    const length = view.getUint32(pos);
    const number = bytes[pos + 4];
    const section = bytes.subarray(pos, pos + length);
    if (number === 3) grid = parseGrid(section);
    if (number === 5) {
      count = u32(section, 5);
      template = u16(section, 9);
      section5 = section;
    }
    if (number === 6 && section[5] !== 255) throw new Error("GRIB2 bitmaps are not supported.");
    if (number === 7) {
      if (!section5) throw new Error("GRIB2 data section before its representation section.");
      const data = section.subarray(5);
      if (template === 3) values = unpackComplex(section5, data, count);
      else if (template === 42) values = unpackCcsds(section5, data, count);
      else throw new Error(`GRIB2 data template 5.${template} is not supported.`);
    }
    if (length <= 0) break;
    pos += length;
  }
  if (!grid || !values) throw new Error("GRIB2 message is missing its grid or data.");
  if (values.length !== grid.ni * grid.nj) throw new Error("GRIB2 value count does not match the grid.");
  return { grid, values };
}

/** Nearest grid point to a station (longitudes wrap). */
export function sampleNearest(field: Grib2Field, latitude: number, longitude: number): number {
  const { ni, nj, la1, lo1, di, dj, scan } = field.grid;
  const j = Math.round(((scan & 0x40 ? latitude - la1 : la1 - latitude)) / dj);
  const i = Math.round(((((longitude - lo1) % 360) + 360) % 360) / di) % ni;
  if (j < 0 || j >= nj) throw new Error("Station is outside the GRIB2 grid.");
  return field.values[j * ni + i];
}

function parseGrid(section: Uint8Array): LatLonGrid {
  const template = u16(section, 12);
  if (template !== 0) throw new Error(`GRIB2 grid template 3.${template} is not supported.`);
  const scan = section[71];
  if (scan & 0x80 || scan & 0x20) throw new Error("GRIB2 scanning mode is not supported.");
  return {
    ni: u32(section, 30),
    nj: u32(section, 34),
    la1: s32(section, 46) / 1e6,
    lo1: s32(section, 50) / 1e6,
    di: u32(section, 63) / 1e6,
    dj: u32(section, 67) / 1e6,
    scan,
  };
}

function scaling(section5: Uint8Array) {
  const view = new DataView(section5.buffer, section5.byteOffset, section5.byteLength);
  return { reference: view.getFloat32(11), binary: s16(section5, 15), decimal: s16(section5, 17), bits: section5[19] };
}

function scale(raw: ArrayLike<number>, section5: Uint8Array) {
  const { reference, binary, decimal } = scaling(section5);
  const b = 2 ** binary;
  const d = 10 ** -decimal;
  const out = new Float64Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) out[index] = (reference + raw[index] * b) * d;
  return out;
}

// --- Template 5.3: complex packing with spatial differencing -----------------

export function unpackComplex(section5: Uint8Array, data: Uint8Array, count: number): Float64Array {
  const { bits } = scaling(section5);
  if (section5[22] !== 0) throw new Error("GRIB2 complex packing with missing values is not supported.");
  const groups = u32(section5, 31);
  const widthReference = section5[35];
  const widthBits = section5[36];
  const lengthReference = u32(section5, 37);
  const lengthIncrement = section5[41];
  const lastLength = u32(section5, 42);
  const lengthBits = section5[46];
  const order = section5[47];
  const extra = section5[48];
  if (order !== 1 && order !== 2) throw new Error("GRIB2 spatial differencing order must be 1 or 2.");

  let offset = 0;
  const descriptor = () => {
    const value = signMagnitude(data, offset, extra);
    offset += extra;
    return value;
  };
  const first = descriptor();
  const second = order === 2 ? descriptor() : 0;
  const minimum = descriptor();

  const reader = new BitReader(data, offset * 8);
  const references = reader.array(groups, bits);
  reader.align();
  const widths = reader.array(groups, widthBits).map((value) => value + widthReference);
  reader.align();
  const lengths = reader.array(groups, lengthBits).map((value) => lengthReference + value * lengthIncrement);
  reader.align();
  lengths[groups - 1] = lastLength;

  const raw = new Float64Array(count);
  let n = 0;
  for (let group = 0; group < groups; group += 1) {
    const width = widths[group];
    const reference = references[group];
    for (let k = 0; k < lengths[group] && n < count; k += 1) raw[n++] = reference + (width ? reader.read(width) : 0);
  }
  if (n !== count) throw new Error("GRIB2 complex packing group lengths do not cover the field.");
  if (order === 1) {
    raw[0] = first;
    for (let index = 1; index < count; index += 1) raw[index] += minimum + raw[index - 1];
  } else {
    raw[0] = first;
    raw[1] = second;
    for (let index = 2; index < count; index += 1) raw[index] += minimum + 2 * raw[index - 1] - raw[index - 2];
  }
  return scale(raw, section5);
}

// --- Template 5.42: CCSDS 121.0-B adaptive entropy coding (libaec) ----------

const AEC_DATA_SIGNED = 1;
const AEC_DATA_PREPROCESS = 8;
const AEC_RESTRICTED = 16;
const AEC_PAD_RSI = 32;
const ROS = 5;

export function unpackCcsds(section5: Uint8Array, data: Uint8Array, count: number): Float64Array {
  const { bits } = scaling(section5);
  const flags = section5[21];
  const blockSize = section5[22];
  const rsi = u16(section5, 23);
  if (bits === 0) return scale(new Float64Array(count), section5);
  return scale(aecDecode(data, count, { bits, flags, blockSize, rsi }), section5);
}

export function aecDecode(data: Uint8Array, count: number, options: { bits: number; flags: number; blockSize: number; rsi: number }): Float64Array {
  const { bits, flags, blockSize, rsi } = options;
  if (flags & AEC_DATA_SIGNED) throw new Error("Signed CCSDS samples are not supported.");
  if (flags & AEC_RESTRICTED && bits <= 4) throw new Error("Restricted CCSDS coding is not supported.");
  const preprocess = (flags & AEC_DATA_PREPROCESS) !== 0;
  const idLength = bits > 16 ? 5 : bits > 8 ? 4 : 3;
  const uncompressedId = (1 << idLength) - 1;
  const reader = new BitReader(data, 0);
  const out = new Float64Array(count);
  let n = 0;

  while (n < count) {
    // One reference sample interval: rsi blocks, the first carrying a raw reference sample.
    const rsiStart = n;
    const rsiEnd = Math.min(count, n + rsi * blockSize);
    let block = 0;
    while (n < rsiEnd && block < rsi) {
      const ref = preprocess && block === 0;
      const id = reader.read(idLength);
      if (id === 0) {
        const secondExtension = reader.read(1) === 1;
        if (ref) out[n++] = reader.read(bits);
        if (secondExtension) {
          let i = ref ? 1 : 0;
          while (i < blockSize) {
            const m = reader.fundamental();
            let sum = 0;
            while (((sum + 1) * (sum + 2)) / 2 <= m) sum += 1;
            const d1 = m - (sum * (sum + 1)) / 2;
            if ((i & 1) === 0) {
              put(sum - d1);
              i += 1;
            }
            put(d1);
            i += 1;
          }
          block += 1;
        } else {
          let zeroBlocks = reader.fundamental() + 1;
          if (zeroBlocks === ROS) zeroBlocks = Math.min(rsi - block, 64 - (block % 64));
          else if (zeroBlocks > ROS) zeroBlocks -= 1;
          for (let k = zeroBlocks * blockSize - (ref ? 1 : 0); k > 0; k -= 1) put(0);
          block += zeroBlocks;
        }
      } else if (id === uncompressedId) {
        for (let k = 0; k < blockSize; k += 1) put(reader.read(bits));
        block += 1;
      } else {
        const k = id - 1;
        if (ref) out[n++] = reader.read(bits);
        const samples = blockSize - (ref ? 1 : 0);
        const high: number[] = new Array(samples);
        for (let s = 0; s < samples; s += 1) high[s] = reader.fundamental();
        for (let s = 0; s < samples; s += 1) put(high[s] * 2 ** k + (k ? reader.read(k) : 0));
        block += 1;
      }
    }
    if (preprocess) undoPrediction(out, rsiStart, n, bits);
    if (flags & AEC_PAD_RSI) reader.align();
  }
  return out;

  function put(value: number) {
    if (n < count) out[n++] = value;
  }
}

/** Inverse of the unit-delay predictor with the CCSDS mapping (unsigned samples). */
function undoPrediction(out: Float64Array, start: number, end: number, bits: number) {
  const xmax = 2 ** bits - 1;
  const med = Math.floor(xmax / 2) + 1;
  let data = out[start];
  for (let index = start + 1; index < end; index += 1) {
    const d = out[index];
    const half = Math.floor(d / 2) + (d % 2);
    const mask = data >= med ? xmax : 0;
    const room = mask ? xmax - data : data;
    if (half <= room) data += d % 2 ? -((d + 1) / 2) : d / 2;
    else data = mask ? xmax - d : d;
    out[index] = data;
  }
}

// --- Bits and integers --------------------------------------------------------

export class BitReader {
  constructor(private readonly bytes: Uint8Array, private bit: number) {}

  read(width: number): number {
    let value = 0;
    for (let remaining = width; remaining > 0;) {
      const byte = this.bytes[this.bit >> 3];
      if (byte === undefined) throw new Error("GRIB2 bit stream ended early.");
      const offset = this.bit & 7;
      const take = Math.min(remaining, 8 - offset);
      value = value * 2 ** take + ((byte >> (8 - offset - take)) & ((1 << take) - 1));
      remaining -= take;
      this.bit += take;
    }
    return value;
  }

  /** Fundamental-sequence code: count zero bits before the terminating one. */
  fundamental(): number {
    let zeros = 0;
    while (this.read(1) === 0) zeros += 1;
    return zeros;
  }

  array(length: number, width: number) {
    const out = new Array<number>(length);
    for (let index = 0; index < length; index += 1) out[index] = width ? this.read(width) : 0;
    return out;
  }

  align() {
    this.bit = Math.ceil(this.bit / 8) * 8;
  }
}

function text(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 256 + bytes[offset + 1];
}
function u32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] * 256 + bytes[offset + 1]) * 256 + bytes[offset + 2]) * 256 + bytes[offset + 3];
}
function s16(bytes: Uint8Array, offset: number) {
  const value = u16(bytes, offset);
  return value & 0x8000 ? -(value & 0x7fff) : value;
}
function s32(bytes: Uint8Array, offset: number) {
  const value = u32(bytes, offset);
  return value >= 0x80000000 ? -(value - 0x80000000) : value;
}
function signMagnitude(bytes: Uint8Array, offset: number, length: number) {
  let value = 0;
  for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index];
  const sign = 2 ** (8 * length - 1);
  return value >= sign ? -(value - sign) : value;
}

