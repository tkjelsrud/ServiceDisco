#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import https from 'https';

import {EsriTokenService, EsriService, JSONService} from './support/services.cjs';
import {EsriSchema, EsriQuery}  from './support/queries.mjs';

const qDisco = {'doCount': true, 'doAge': true, 'doExtent': true, 'lastRows': false};
let apdex = {'enabled': false, 'satisfied': 200, 'tolerating': 800};

const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
      rejectUnauthorized: false  // Disable SSL verification
    })
});

const configPath = path.resolve('disco.json');
let config = {};

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  // No config found, just create default values
  config.urls = [];
  config.token = {};
  config.extents = {};
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
      yargs.option('notnull', {
        alias: 'nn',
        type: 'string',
        describe: 'query with field that should not have null values',
        default: false,
      });
      yargs.option('rows', {
        alias: 'r',
        type: 'string',
        describe: 'query based on fields spesified and output (last) rows',
        default: false,
      });
      yargs.option('schema', {
        alias: 'z',
        type: 'string',
        describe: 'generate schema from layer or layers to filename',
        default: '',
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
        let where = "";
        let token = null;
        let tokenData = getConfigToken(url);

        if(tokenData && tokenData.token) {
            token = tokenData.token;
        }
        else { 
            token = process.env.TOKEN;
        }

        const displayFields = argv.fields;

        if(argv.token && !argv.credentials) {
            // check if username and password is inside config (kind of unsafe)
            argv.credentials = tokenData.username + ":" + tokenData.password;
        }
        if(argv.token && argv.credentials) {
            // Generate token
            const spinner = ora('Fetching token').start();

            const [username, password] = argv.credentials.split(':');

            Object.entries(config.token).forEach(([key, value]) => {
                if(url.startsWith(key)) {
                    let ts = new EsriTokenService(value.tokenUrl);
                    
                    let resToken = ts.getToken(username, password, value.referer).then((response) => {
                        token = response;
                        if(!token)
                            spinner.fail(chalk.red('Failed to generate token:'));
                        else {
                            spinner.succeed('Generated TOKEN: ' + token);
                            writeConfigToken(url, token);
                        }
                        // Write token to config file
                    });
                }
            });
            return;
        }

        if (!token) {
            console.error('Error: Bearer token is required. Set TOKEN environment variable or pass --token option.');
            process.exit(1);
        }

        if(argv.where) {
            where = '&' + argv.where;
        }

        console.log(`Discovering services at: ${url}`);

        const spinner = ora('Fetching services...').start();
        
        axiosInstance.get(urlWithJsonFormat(url) + where, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }).then((response) => {
            const services = response.data.services;
            const layers = response.data.layers;
            const type = response.data.type;
            let didResult = false;
            
            if(response.data.folders && response.data.folders.length > 0) {
                spinner.succeed('Folders discovered');
                response.data.folders.forEach(folder => {
                    console.log(`- ${chalk.blue(folder)}`);
                });
                didResult = true;
            }
            if (services && services.length > 0) {
                spinner.succeed('Services discovered');
                services.forEach(service => {
                    console.log(`- ${chalk.blue(service.name)} (${service.type})`);
                });
                didResult = true;
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

                if(argv.rows) {
                    // Try to get rows across all layers
                    layers.forEach(layer => {
                        EsriQuery.queryLastRows(url + layer.id, token, argv.rows, 3, `${layer.name} (${layer.id})`);
                    });
                }

                if (argv.schema && argv.schema != '') {
                    let schemas = {};
                
                    const generateSchemas = async () => {
                        for (const layer of layers) {
                            schemas[layer.id] = {"name": layer.name, "fields": await EsriSchema.getSchema(url, layer.id, token) };
                        }
                        
                        try {
                            fs.writeFileSync(argv.schema, JSON.stringify(schemas, null, 2), 'utf-8');
                            console.log(`Schema saved to ${argv.schema}`);
                        } catch (error) {
                            console.error(`Error saving schema to file:`, error.message);
                        }
                    };
                
                    generateSchemas().catch((err) => console.error(`Failed to generate schemas: ${err.message}`));
                }
            }
            else if(type && type == 'Table') {
                spinner.succeed('Table Layer discovered');
                console.log(`Capabilities: ${chalk.blue(response.data.capabilities)}`);
                console.log(`Fields: ${chalk.blue(response.data.fields.length)}`)
            }
            else if(type && type == 'Feature Layer') {
                spinner.succeed(`Feature Layer (${response.data.id}) ${chalk.yellow(response.data.name)}`);
                console.log(`Capabilities: ${chalk.blue(response.data.capabilities)}`);
                console.log(`Fields: ${chalk.blue(response.data.fields.length)}`)
    
                if(displayFields || response.data.fields.length < 8) {
                    response.data.fields.forEach(field => {
                        console.log(`- ${field.name} ${chalk.blue(field.type)}`);
                    });
                }
                
                if(qDisco.doCount)
                    EsriQuery.queryCount(url, token);

                if(argv.rows)
                    EsriQuery.queryLastRows(url, token, argv.rows, 10);
            
                if(argv.notnull) {
                    EsriQuery.queryCount(url, token, `${argv.notnull} IS NOT NULL`);
                }
            }
            else if(response.data.feature && response.data.feature.attributes) {
                spinner.succeed('Feature discovered');
                console.log(JSON.stringify(response.data.feature, null, 2));
            }
            else if(response.data.error) {
                spinner.fail(chalk.red('Found error in response: ' + response.data.error.message));
            }
            else if(response.data && !didResult) {
                // Found some other type of JSON service, possibly?
                spinner.succeed('Found JSON response');
                console.log(JSON.stringify(response.data, null, 2));
            }
            else {
                spinner.fail(chalk.yellow('No services found.'));
            }
        })
        .catch((error) => {
            spinner.fail('Failed to discover services.');
            console.error('Error fetching data:', error.status, error.code);
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

function getConfigToken(url) {
    let fToken = null;

    Object.entries(config.token).forEach(([key, value]) => {
        if(url.startsWith(key)) {
            fToken = config.token[key];
        }
    });
    return fToken;
}

function writeConfigToken(url, token) {
    let configW = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    Object.entries(configW.token).forEach(([key, value]) => {
        if(url.startsWith(key)) {
            configW.token[key].token = token;
        }
    });

    fs.writeFileSync(configPath, JSON.stringify(configW, null, 2));
}