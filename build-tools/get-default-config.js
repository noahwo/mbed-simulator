const spawn = require('child_process').spawn;
const fs = require('fs');
const { exists } = require('./helpers');
const promisify = require('es6-promisify').promisify;
const Path = require('path');

const TARGET = 'K64F'; // should be SIMULATOR at some point but OK

function getConfigForFolder(folder) {
    return new Promise((resolve, reject) => {
        let cmd = spawn('mbed', [ 'compile', '-m', TARGET, '-t', 'GCC_ARM', '--config' ], { cwd: folder });

        let stdout = '';

        cmd.stdout.on('data', data => stdout += data.toString('utf-8'));
        cmd.stderr.on('data', data => stdout += data.toString('utf-8'));

        cmd.on('close', code => {
            if (code !== 0) {
                return reject('Failed to retrieve config (' + code + ')\n' + stdout);
            }

            let macros = [];

            // OK, so now come the parsing part...
            let inConfig = false;
            let inMacros = false;
            for (let line of stdout.split('\n')) {
                if (line === 'Configuration parameters') {
                    inConfig = true;
                    continue;
                }
                if (line === 'Macros') {
                    inMacros = true;
                    inConfig = false;
                    continue;
                }

                if (inConfig) {
                    let configRegex = /([^=]+)=\s([^\(]+)\s\(macro\sname\:\s\"([^\"]+)/;
                    if (!configRegex.test(line)) continue;

                    let [ fullLine, configName, value, macro ] = line.match(configRegex);
                    macros.push({ key: macro, value: value });
                }

                if (inMacros) {
                    if (/^\w/.test(line)) {
                        macros.push({ key: line });
                    }
                }

                resolve(macros);
            }
        });
    });
}

/**
 * Turn a macros array ({ key, value }) into header file (for device.h)
 * @param {*} macros
 */
function configToHeaderFile(macros) {
    let output = '// Generated by build-tools/get-default-config.js\n\n';

    for (let { key, value } of macros) {
        output += `#ifndef ${key}\n`;
        if (value) {
            output += `#define ${key} ${value}\n`;
        }
        else {
            output += `#define ${key}\n`;
        }
        output += '#endif\n\n';
    }

    return output;
}

(async function() {
    let folder = Path.join(__dirname, '..', 'mbed-simulator-hal');
    let mbedFile = Path.join(folder, '.mbed');

    if (!(await exists(mbedFile))) {
        let content = 'ROOT=.\nTARGET=' + TARGET + '\n';
        await promisify(fs.writeFile.bind(fs))(mbedFile, content, 'utf-8');
    }

    let macros = await getConfigForFolder(folder);
    let header = configToHeaderFile(macros);

    console.log(header);
})();
