/*
 * Byte ↔ string helpers for upload preprocessing. Pure; no DOM, no I/O.
 */

export function bufferToString(buf) {
    return new Uint8Array(buf)
        .reduce((data, byte) => data + String.fromCharCode(byte), '');
}

export function decodeUTF16LE(buf) {
    return new TextDecoder('utf-16le').decode(buf);
}

export function stringToBuffer(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}
