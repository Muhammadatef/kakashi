/**
 * Path validation for the Guardian.
 *
 * The Guardian reads a resource the caller names and writes an artifact beside
 * it. Both halves are attacker-reachable in a realistic deployment (an AI agent
 * under prompt injection is exactly the caller we are defending against), so
 * both are validated here rather than at each call site.
 *
 * Rules:
 *   - No NUL bytes (defeats truncation tricks against the C layer).
 *   - The input must resolve, via realpath, to a REGULAR file. Symlinks are
 *     followed once and then judged on their target, so a symlink to /dev/zero
 *     or to a FIFO is refused rather than read.
 *   - The output's PARENT directory must exist and realpath to a directory; the
 *     output must resolve inside it (no `../` escape through a symlinked parent).
 *   - The output may never be the input. The Guardian does not overwrite
 *     originals, full stop -- unlike `kakashi mask --overwrite`, there is no flag.
 */

const fs = require('fs');
const path = require('path');

const NUL = String.fromCharCode(0);

function assertNoNul(p, what) {
  if (String(p).indexOf(NUL) !== -1) {
    throw new Error(`Guardian: ${what} contains a NUL byte`);
  }
}

/**
 * Resolve and validate a resource the Guardian is asked to read.
 * @param {string} p
 * @returns {string} absolute, symlink-resolved path to a regular file
 */
function resolveResource(p) {
  if (!p || typeof p !== 'string') throw new Error('Guardian: resource path is required');
  assertNoNul(p, 'resource path');
  const abs = path.resolve(p);
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Guardian: resource not found: ${p}`);
    throw new Error(`Guardian: cannot resolve resource: ${err.message}`);
  }
  // lstat on the RESOLVED path: after realpath there is no symlink left, so a
  // non-regular result means the target itself is a device/FIFO/socket/dir.
  const st = fs.lstatSync(real);
  if (!st.isFile()) {
    throw new Error(`Guardian: resource is not a regular file: ${p}`);
  }
  return real;
}

/**
 * Resolve and validate where a protected artifact may be written.
 * @param {string} out - desired output path
 * @param {string} resourceReal - the validated input path
 * @returns {string} absolute output path, guaranteed inside an existing directory
 */
function resolveOutput(out, resourceReal) {
  if (!out || typeof out !== 'string') throw new Error('Guardian: output path is required');
  assertNoNul(out, 'output path');
  const abs = path.resolve(out);
  const dir = path.dirname(abs);

  let realDir;
  try {
    realDir = fs.realpathSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Guardian: output directory does not exist: ${dir}`);
    throw new Error(`Guardian: cannot resolve output directory: ${err.message}`);
  }
  if (!fs.lstatSync(realDir).isDirectory()) {
    throw new Error(`Guardian: output parent is not a directory: ${dir}`);
  }

  const finalPath = path.join(realDir, path.basename(abs));
  // Containment: the basename must not climb out of the realpath'd directory.
  if (path.dirname(finalPath) !== realDir) {
    throw new Error(`Guardian: output path escapes its directory: ${out}`);
  }
  if (finalPath === resourceReal) {
    throw new Error('Guardian: refusing to overwrite the original resource');
  }
  // If the target already exists it must be a plain file -- never clobber through
  // a symlink into somewhere the caller could not otherwise write.
  if (fs.existsSync(finalPath)) {
    const st = fs.lstatSync(finalPath);
    if (st.isSymbolicLink()) throw new Error(`Guardian: refusing to write through a symlink: ${out}`);
    if (!st.isFile()) throw new Error(`Guardian: output exists and is not a regular file: ${out}`);
  }
  return finalPath;
}

/**
 * Default artifact path for a resource. Deliberately distinct from
 * formats.defaultOutputPath()'s `masked_` prefix so a Guardian artifact is never
 * confused with a plain `kakashi mask` output.
 * @param {string} resourcePath
 * @returns {string}
 */
function defaultArtifactPath(resourcePath) {
  const dir = path.dirname(resourcePath);
  const base = path.basename(resourcePath);
  // PDF write-back is lossy (formats/pdf.js emits a masked .md extract), so
  // mirror that convention rather than promising a .pdf we cannot produce.
  if (/\.pdf$/i.test(base)) {
    return path.join(dir, base.replace(/\.pdf$/i, '_guarded.md'));
  }
  return path.join(dir, `guarded_${base}`);
}

module.exports = { resolveResource, resolveOutput, defaultArtifactPath };
