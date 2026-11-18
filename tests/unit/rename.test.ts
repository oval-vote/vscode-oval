import assert from "node:assert/strict";
import { test } from "node:test";
import { Analysis } from "@oval-vote/oval";
import { WORD, isDeclared } from "../../src/rename";

const SOURCE =
    'oval 1\nguide "Uses @ghost"\nparty @dem "Demócrata"\n# @phantom is only in a comment\n' +
    'candidate @n "N"\n  party @dem\n  website "https://example.org/@spirit"\n' +
    'ballot @b "B"\n  contest @k "K" single\n    campaign @n\n    campaign @undeclared\n' +
    "    recommend no-position\n";

function declared(name: string): boolean {
    const analysis = new Analysis(SOURCE);
    try {
        return isDeclared(analysis, SOURCE, name);
    } finally {
        analysis.free();
    }
}

test("a name with a declaration is declared", () => {
    for (const name of ["dem", "n", "b", "k"]) {
        assert.ok(declared(name), name);
    }
});

test("a name that is only a prefix of a declared one is not declared", () => {
    assert.ok(!declared("de"));
    assert.ok(!declared("d"));
});

test("a name that is only referred to, or only written in text, is not declared", () => {
    for (const name of ["undeclared", "ghost", "phantom", "spirit"]) {
        assert.ok(!declared(name), name);
    }
});

test("a new name must be a word", () => {
    for (const name of ["rosa-delgado", "a", "A_1"]) {
        assert.ok(WORD.test(name), name);
    }
    for (const name of ["9lives", "-x", "", "@dem", "a b"]) {
        assert.ok(!WORD.test(name), name);
    }
});
