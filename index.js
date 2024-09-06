#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';

import {EsriTokenService, EsriService, JSONService} from './support/services.cjs';

const qDisco = {'doCount': true, 'doAge': true, 'doExtent': true, 'lastRows': true};

const extents = {
    'heleNorge': ['Hele Norge', -1026115, 6383184, 1922183, 8040446],
    'oslo': ['Oslo', 233000, 6630000, 242000, 6640000],
    'østlandet': ['Østlandet', 100000, 6500000, 600000, 6800000],
    'vestlandet': ['Vestlandet', -500000, 6500000, 100000, 6800000],
    'nord': ['Nord', 600000, 7000000, 1922183, 8040446],
    'sørlandet': ['Sørlandet', 50000, 6400000, 300000, 6600000]
  };

let apdex = {'enabled': false, 'satisfied': 200, 'tolerating': 800};

const configPath = path.resolve('config.json');
let config = {};

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Error loading config.json:', error);
  process.exit(1);
}

// Load known URLs from the file
const knownUrls = config.urls;

// Set up yargs CLI with autocompletion
yargs(hideBin(process.argv))
  .command(
    '$0 <url>',  // $0 means this is the default command, and <url> is the positional argument
    'Fetch data from the specified URL',
    (yargs) => {
      yargs.positional('url', {
        describe: 'The URL to fetch data from',
        type: 'string',
      });

      yargs.option('fields', {
        alias: 'f',
        type: 'boolean',
        describe: 'Display all fields',
        default: false,
      });

      yargs.option('token', {
        alias: 'gt',
        type: 'boolean',
        describe: 'call token generation',
        default: false,
      });

      yargs.option('credentials', {
        alias: 'u',
        type: 'string',
        describe: 'username:password for token service auth',
        default: false,
      });
    },
    (argv) => {
      const url = argv.url;
      if (url) {
        console.log(`Discovering services at: ${url}`);
        let token = process.env.TOKEN;
        const displayFields = argv.fields;
        
        if (!token) {
            console.error('Error: Bearer token is required. Set TOKEN environment variable or pass --token option.');
            process.exit(1);
        }

        if(argv.token && !argv.credentials) {
            console.log(chalk.red('supply --credentials username:password to generate token'));
            return;
        }
        if(argv.token && argv.credentials) {
            // Generate token
            console.log('time to gen token');

            const [username, password] = argv.credentials.split(':');

            Object.entries(config.token).forEach(([key, value]) => {
                if(url.startsWith(key)) {
                    let ts = new EsriTokenService(value.tokenUrl);

                    let resToken = ts.getToken(username, password, value.referer).then((response) => {
                        token = response;
                        console.log('Generated TOKEN: ' + token);
                    });
                }
            });
            return;
        }

        const spinner = ora('Fetching services...').start();
        
        const response = axios.get(urlWithJsonFormat(url), {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }).then((response) => {
            const services = response.data.services;
            const layers = response.data.layers;
            const type = response.data.type;

            //console.log(response.data);

            if (services && services.length > 0) {
                spinner.succeed('Services discovered');
                services.forEach(service => {
                    console.log(`- ${chalk.blue(service.name)} (${service.type})`);
                });
            }
            else if(layers && layers.length > 0) {
                spinner.succeed('Layers discovered');
                console.log(`Capabilities: ${chalk.blue(response.data.capabilities)}`);
                layers.forEach(layer => {
                    console.log(`- ${layer.id} ${chalk.blue(layer.name)} (${layer.type})`);
                });
    
                if(response.data.tables && response.data.tables.length > 0) {
                    console.log(`Tables: `);
    
                    response.data.tables.forEach(table => {
                        console.log(`- ${table.id} ${chalk.blue(table.name)}`);
                    });
                }
    
                //if(qDisco.doCount)
                //    await queryCount(url, token);
            }
            else if(type && type == 'Table') {
                spinner.succeed('Table Layer discovered');
                console.log(`Capabilities: ${chalk.blue(response.data.capabilities)}`);
                console.log(`Fields: ${chalk.blue(response.data.fields.length)}`)
            }
            else if(type && type == 'Feature Layer') {
                spinner.succeed('Feature Layer discovered');
                console.log(`Capabilities: ${chalk.blue(response.data.capabilities)}`);
                console.log(`Fields: ${chalk.blue(response.data.fields.length)}`)
    
                if(displayFields) {
                    response.data.fields.forEach(field => {
                        console.log(`- ${field.name} ${chalk.blue(field.type)}`);
                    });
                }
                
                if(qDisco.doCount)
                    queryCount(url, token);

                if(qDisco.lastRows)
                    queryLastRows(url, token);
            
                /*
                if(qDisco.doExtent) {
                    await queryExtent(url, extents.heleNorge, token);
                    await queryExtent(url, extents.oslo, token);
                    await queryExtent(url, extents.vestlandet, token);
                    await queryExtent(url, extents.østlandet, token);
                    await queryExtent(url, extents.sørlandet, token);
                    await queryExtent(url, extents.nord, token);
    
                    await queryBlankShape(url, token);
                }
    
                if(qDisco.doAge)
                    await timeStampRange(url, response.data.fields, token);
                */
            }
            else if(response.data.feature && response.data.feature.attributes) {
                spinner.succeed('Feature discovered');
                console.log(JSON.stringify(response.data.feature, null, 2));
            }
            else if(response.data.folders) {
                spinner.succeed('Folders discovered');
                response.data.folders.forEach(folder => {
                    console.log(`- ${chalk.blue(folder)}`);
                });
            }
            else if(response.data.error) {
                spinner.fail(chalk.red('Found error in response: ' + response.data.error.message));
            } else {
                spinner.fail(chalk.yellow('No services found.'));
            }
        })
        .catch((error) => {
            spinner.fail('Failed to discover services.');
            console.error('Error fetching data:', error);
        });

      } else {
        console.log('Please specify a URL');
      }
    }
  )
  .completion('completion', 'Generate bash completion', (current, argv) => {
    // Escape '://' by replacing with '\:\/\/' for bash and zsh
    return knownUrls
      .filter(url => url.startsWith(current))
      .map(url => url.replace('://', '\\:\\/\\/')); // Escape '://'
  })
  .help()
  .argv;

function urlWithJsonFormat(url) {
    return `${url}${url.includes('?') ? '&' : '?'}f=json`;
}

function queryCount(url, token) {
    const spinner = ora('Counting...').start();

    url = urlWithJsonFormat(appendQueryToUrl(url)) + '&where=1=1&returnCountOnly=true';

    const startTime = Date.now();

    const response = axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
    }).then((response) => {
        const count = response.data.count;

        spinner.succeed('Count: ' + (count > 0 ? chalk.yellow(count) + ' features' : chalk.red('No features')));
        //apdexScoring(startTime);
    }).catch((error) => {
        spinner.fail('Failed to count features');
        console.error('Error fetching data:', error);
    });
}

function queryLastRows(url, token) {
    const spinner = ora('Last rows...').start();

    url = urlWithJsonFormat(appendQueryToUrl(url)) + '&where=1=1&outFields=*&orderByFields=objectid+DESC&resultRecordCount=10';
    const startTime = Date.now();

    const response = axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
    }).then((response) => {
        if(response.data.features) {
            spinner.succeed('Last features:');
            response.data.features.forEach(feature => {
                console.log(`- ${chalk.blue(feature.attributes.objectid)}`);
            });
        }
        else {
            spinner.fail('No last features fetched');
        }

        //spinner.succeed('Count: ' + (count > 0 ? chalk.yellow(count) + ' features' : chalk.red('No features')));
        //apdexScoring(startTime);
    }).catch((error) => {
        spinner.fail('Failed to fetch last features');
        console.error('Error fetching data:', error);
    });
}

function appendQueryToUrl(url) {
    // Remove the trailing slash if it exists
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return `${url}/query`;
  }