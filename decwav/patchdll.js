#!/usr/bin/node
const { readFileSync, writeFileSync } = require('node:fs');

function hexliteral(str) {
    let bytes = str.split(' ').map(it => parseInt(it, 16));
    return Buffer.from(bytes);
}

let patches = [
    /* Patchset 1:
     * Change != 0 comparisons to signed <= and > comparisons to handle
     * GetMessageA returning 0xFFFFFFFF correctly in the window procedure.
     */
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

    /* Patchset 2:
     * Change the conditional jump to an unconditional jump in the license
     * counter check to bypass the maximum process count (prone to becoming
     * corrupted if processes crash without decrementing it etc.).
     */
    {
        // Change JNZ to JMP
        offset: 0x2e0ee,
        before: hexliteral('75 0d 5f 5e 5d b8 04 00'),
        after:  hexliteral('eb 0d 5f 5e 5d b8 04 00')
    },

    /* Patchset 3:
     * Add an overflow check to phoneme duration (signed short) to an unused
     * area of debug code.  Reroute the phoneme duration code to the overflow
     * check before saving it.
     *
     * Add a null-pointer check because there are other causes of null pointer
     * issues here besides just the overflow
     */
    {
        offset: 0x25ed0,
        before: hexliteral('83 c4 08 66 81 bf 40 06 00 00 ff 2f 8b e8 75 3d ' +
                           '68 d8 f0 07 1c ff d3 68 f8 f0 07 1c ff d3 68 2c ' +
                           'f1 07 1c ff d3 68 60 f1 07 1c ff d3 68 90 f1 07 ' +
                           '1c ff d3 68 c0 f1 07 1c ff d3 68 f0 f1 07 1c ff ' +
                           'd3 83 c4 1c 66 c7 87 40 06 00 00 00 00 8b 87 34'),
        after:  hexliteral('83 c4 08 66 81 bf 40 06 00 00 ff 2f 8b e8 eb 3d ' +
                           '66 8b 54 24 12 66 85 d2 7d 04 66 ba ff 7f e9 e9 ' +
                           '05 00 00 8b 48 1c 85 c9 0f 84 a3 08 ff ff 66 8b ' +
                           '11 e9 75 08 ff ff 8b 9b 80 02 00 00 85 db 0f 84 ' +
                           '10 d5 fd ff e9 3f d3 fd ff 90 90 90 90 8b 87 34')
    },
    {
        // Overflow on [bah<32768,25>]
        offset: 0x264d0,
        before: hexliteral('0f bf 86 82 17 00 00 66 8b 54 24 12 83 fd 01 66'),
        after:  hexliteral('0f bf 86 82 17 00 00 e9 04 fa ff ff 83 fd 01 66')
    },
    {
        // Null pointer segfault on [s<1,20>][s<1,20>]
        offset: 0x16770,
        before: hexliteral('66 3b d5 7c 2c 8b 48 1c 66 8b 11 83 c1 02 66 89'),
        after:  hexliteral('66 3b d5 7c 2c e9 79 f7 00 00 90 83 c1 02 66 89')
    },
    {
        // Null pointer segfault on [:dial:1234]
        offset: 0x3240,
        before: hexliteral('5e 5d 5b 83 c4 10 c3 6a ff 57 e8 81 dc 02 00 8b ' +
                           '9b 80 02 00 00 83 c4 08 89 5c 24 24 8a 0b 84 c9'),
        after:  hexliteral('5e 5d 5b 83 c4 10 c3 6a ff 57 e8 81 dc 02 00 83 ' +
                           'c4 08 e9 af 2c 02 00 90 89 5c 24 24 8a 0b 84 c9')
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
