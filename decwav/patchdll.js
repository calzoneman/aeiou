#!/usr/bin/node
const { readFileSync, writeFileSync } = require('node:fs');

function hexliteral(str) {
    let bytes = str.split(' ').map(it => parseInt(it, 16));
    return Buffer.from(bytes);
}

let patches = [
    {
        // Change JZ to JLE
        offset: 0x30ac8,
        before: hexliteral('c0 74 25 53 8b 1d 24 51'),
        after:  hexliteral('c0 7e 25 53 8b 1d 24 51'),
    },
    {
        // Change JNZ to JG
        offset: 0x30ae8,
        before: hexliteral('52 ff d7 85 c0 75 e3 5b'),
        after:  hexliteral('52 ff d7 85 c0 7f e3 5b'),
    },
    {
        // Change JNZ to JMP
        offset: 0x2e0ee,
        before: hexliteral('75 0d 5f 5e 5d b8 04 00'),
        after:  hexliteral('eb 0d 5f 5e 5d b8 04 00')
    }
];

let filename = process.argv[2];
if (!filename) {
    console.error(`Usage: ${process.argv[0]} ${process.argv[1]} <dll file>`);
    console.error('       NOTE: patches in-place!');
    process.exit(1);
}

let contents = readFileSync(filename);
let changed = false;
let nomatch = false;

patches.forEach(({ offset: offset, before: before, after: after }) => {
    if (offset >= contents.length) {
        console.log(`${filename} does not match at 0x${offset.toString(16)}.  Patch will not be applied.`);
        nomatch = true;
        return;
    }

    if (contents.compare(before, 0, before.length, offset, offset + before.length) === 0) {
        console.log(`Patching 0x${offset.toString(16)}`);
        after.copy(contents, offset);
        changed = true;
    } else if (contents.compare(after, 0, after.length, offset, offset + after.length) === 0) {
        console.log(`Skipping 0x${offset.toString(16)}; already patched`);
    } else {
        console.log(`${filename} does not match at 0x${offset.toString(16)}.  Patch will not be applied.`);
        nomatch = true;
    }
});

if (changed && !nomatch) {
    writeFileSync(filename, contents);
}
