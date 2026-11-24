const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Case identifier: "OP-" + 8 Crockford base32 characters (no I, L, O, U to avoid confusion). */
export function newCaseId(random: () => number = Math.random): string {
  let id = "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto && random === Math.random) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const b of bytes) id += CROCKFORD[b % 32];
  } else {
    for (let i = 0; i < 8; i++) id += CROCKFORD[Math.floor(random() * 32)];
  }
  return `OP-${id}`;
}
