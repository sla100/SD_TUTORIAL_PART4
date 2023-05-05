import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const F_CPU = 16_000_000;

const CFLAGS = [
  `-DF_CPU=${F_CPU}UL`,
  '-Os', // optimization level s = for size
  '-funsigned-char', '-funsigned-bitfields', '-fpack-struct', '-fshort-enums', // tuning, see GCC manual and avr-libc documentation
  '-Wall', // warning level
  '-Wstrict-prototypes',
  //CFLAGS += -Wa,-adhlns=$(<:.c=.lst) // tell GCC to pass this to the assembler. #    -adhlns...: create assembler listing
  '-std=gnu99',
];

const ALL_CFLAGS = [
  '-mmcu=atmega168',
  '-I.',
  ...CFLAGS,
];

const srcDir = 'src';
const objDir = 'dist/obj';

const dirents = await readdir(srcDir, {withFileTypes: true});
const sources = dirents.filter(dirent => dirent.isFile() && dirent.name.endsWith('.c')).map(dirent => dirent.name);

const exec = async (command, args) => {
  const cp = spawn(command, args, {
    shell: true,
    stdio: ['ignore','inherit', 'inherit'],
  });
  const [statusCode] = await once(cp, 'exit');
  if (statusCode) {
    throw new Error(statusCode);
  }
};

await mkdir(objDir, {recursive: true});

const objs = [];
for( const name of sources ){
  const src = join(srcDir, name);
  const obj = join(objDir, `${name}.o`);
  console.log(`Compiling: ${src} => ${obj}`);
  objs.push(obj);
  await exec('avr-gcc', [
    '-c',
    ...ALL_CFLAGS,
    src,
    `-Wa,-adhlns=${join(objDir, `${name}.lst`)}`,
    '-o', obj,
  ]);
}

const outName = 'main';

const elf = join(objDir, `${outName}.elf`);
const map = join(objDir, `${outName}.map`);
console.log(`Linking: [${objs}] into ${elf} and ${map}`);
await exec('avr-gcc', [
  ...ALL_CFLAGS,
  ...objs,
  '--output', elf,
  // -Wl,...:     tell GCC to pass this to linker.
  // -Map:      create map file
  // --cref:    add cross reference to  map file
  `-Wl,-Map=${map},--cref`,
]);

const hex = join(objDir, `${outName}.hex`);
console.log(`Creating load file for Flash: ${hex}`)
await exec( 'avr-objcopy', [
  '-O', 'ihex',
  '-R', '.eeprom',
  elf, hex,
]);

const eep = join(objDir, `${outName}.eep`);
console.log(`Creating load file for EEPROM: ${eep}`);
await exec( 'avr-objcopy', [
  '-j', '.eeprom',
  '--set-section-flags', '.eeprom=alloc,load',
  '--change-section-lma', '.eeprom=0',
  '-O', 'ihex',
  elf, eep,
]);

console.log('END');