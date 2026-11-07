import assert from "node:assert/strict";
import { test } from "node:test";
import { byteOffsetToIndex, offsets } from "../../src/offsets";

test("ascii offsets are identities", () => {
    const index = byteOffsetToIndex('guide "G"\n');
    assert.equal(index(0), 0);
    assert.equal(index(6), 6);
    assert.equal(index(10), 10);
});

test("multi-byte characters advance bytes faster than code units", () => {
    const text = "a\u00e9b\u20acc\u{1F5F3}d";
    const index = byteOffsetToIndex(text);
    assert.equal(index(0), 0);
    assert.equal(index(1), 1);
    assert.equal(index(3), 2);
    assert.equal(index(4), 3);
    assert.equal(index(7), 4);
    assert.equal(index(8), 5);
    assert.equal(index(12), 7);
    assert.equal(index(13), 8);
});

test("offsets past the end clamp to the length", () => {
    const index = byteOffsetToIndex("ab");
    assert.equal(index(2), 2);
    assert.equal(index(99), 2);
});

test("an empty document maps zero to zero", () => {
    assert.equal(byteOffsetToIndex("")(0), 0);
});

test("indices map back to byte offsets", () => {
    const text = 'guide "Güide" \u{1F5F3}\n';
    const { toByteOffset, toIndex } = offsets(text);
    assert.equal(toByteOffset(0), 0);
    assert.equal(toByteOffset(8), 8);
    assert.equal(toByteOffset(9), 10);
    assert.equal(toByteOffset(text.length), Buffer.byteLength(text, "utf8"));
    for (let i = 0; i <= text.length; i++) {
        const byte = toByteOffset(i);
        assert.equal(toIndex(byte), toIndex(toByteOffset(toIndex(byte))));
    }
});
