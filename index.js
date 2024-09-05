#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { urlencoded } from 'express';

const program = new Command();

const qDisco = {'doCount': true, 'doAge': true, 'doExtent': true};

const extents = {
    'heleNorge': ['Hele Norge', -1026115, 6383184, 1922183, 8040446],
    'oslo': ['Oslo', 233000, 6630000, 242000, 6640000],
    'østlandet': ['Østlandet', 100000, 6500000, 600000, 6800000],
    'vestlandet': ['Vestlandet', -500000, 6500000, 100000, 6800000],
    'nord': ['Nord', 600000, 7000000, 1922183, 8040446],
    'sørlandet': ['Sørlandet', 50000, 6400000, 300000, 6600000]
  };

let apdex = {'enabled': false, 'satisfied': 200, 'tolerating': 800};

program
  .version('1.0.0')
  .description('Service Discovery CLI Tool');

program
  .command('discover <url>')
  .description('Discover ArcGIS Enterprise (ESRI) services at the specified URL, including feature services and layers')
  .option('-t, --token <token>', 'Bearer token for authorization - also read through env:TOKEN')
  .option('-f, --fields', 'Output field names when querying Feature/MapService')
  .option('-ms, --ms', 'Output latency in MS and Apdex rating based on satisfied <= ' + apdex.satisfied + 'ms')
  .action(async (url, options) => {

    const token = options.token || process.env.TOKEN;

    const fields = options.fields || '';

    if(options.ms)
        apdex.enabled = true;
    
    if (!token) {
      console.error('Error: Bearer token is required. Set TOKEN environment variable or pass --token option.');
      process.exit(1);
    }

    const spinner = ora('Fetching services...').start();
    
    try {
      const response = await axios.get(urlWithJsonFormat(url), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if(response.data.error) {
        spinner.fail('Found JSON error: ' + response.data.error.message);
      }
      else {

        const services = response.data.services;
        const layers = response.data.layers;
        const type = response.data.type;

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

            if(qDisco.doCount)
                await queryCount(url, token);
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

            if(fields) {
                response.data.fields.forEach(field => {
                    console.log(`- ${field.name} ${chalk.blue(field.type)}`);
                });
            }
            
            if(qDisco.doCount)
                await queryCount(url, token);
        
            if(qDisco.doExtent) {
                await queryExtent(url, extents.heleNorge, token);
                await queryExtent(url, extents.oslo, token);
                await queryExtent(url, extents.vestlandet, token);
                await queryExtent(url, extents.østlandet, token);
                await queryExtent(url, extents.sørlandet, token);
                await queryExtent(url, extents.nord, token);
            }

            if(qDisco.doAge)
                await timeStampRange(url, response.data.fields, token);
        }
        else if(response.data.feature && response.data.feature.attributes) {
            spinner.succeed('Feature discovered');
            console.log(JSON.stringify(response.data.feature, null, 2));
        } else {
            spinner.fail(chalk.yellow('No services found.'));
        }
    }
    } catch (error) {
      spinner.fail('Failed to discover services.');
      console.error(chalk.red(`Error: ${error.message}`));
    }
  });

function urlWithJsonFormat(url) {
    return `${url}${url.includes('?') ? '&' : '?'}f=json`;
}

async function queryCount(url, token) {
    const spinner = ora('Counting...').start();

    url = urlWithJsonFormat(appendQueryToUrl(url)) + '&where=1=1&returnCountOnly=true';

    const startTime = Date.now();

    const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
    });

    const count = response.data.count;

    spinner.succeed('Count: ' + (count > 0 ? chalk.yellow(count) + ' features' : chalk.red('No features')));
    apdexScoring(startTime);
}

async function queryExtent(url, extent, token) {
    const spinner = ora('Counting...').start();

    const geoEx = `geometry=${encodeURIComponent(
        JSON.stringify({
          spatialReference: { latestWkid: 25833, wkid: 25833 },
          xmin: extent[1],
          ymin: extent[2],
          xmax: extent[3],
          ymax: extent[4]
        })
      )}&geometryType=esriGeometryEnvelope`;

    url = urlWithJsonFormat(appendQueryToUrl(url)) + '&where=1=1&' + geoEx + '&returnCountOnly=true';

    const startTime = Date.now();

    const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
    });

    spinner.succeed('Extent: ' + extent[0] + ' ' + response.data.count + ' features');
    //console.log(response.data);

    apdexScoring(startTime);
}

async function timeStampRange(url, fields, token) {
    // Find last and first updated timestamp
    let tsField = null;

    // Primarily use a field with name containing timestamp and date format
    for(let i = 0; i < fields.length; i++) {
        if(fields[i].name.toLowerCase().includes('timestamp') && fields[i].type == 'esriFieldTypeDate') {
            tsField = fields[i].name;
            break;
        }

    }
    if(!tsField) {
        // if not, just use a date fields
        for(let i = 0; i < fields.length; i++) {
            if(fields[i].type == 'esriFieldTypeDate') {
                tsField = fields[i].name;
                break;
            }
        }
    }

    if(tsField) {    
        const spinner = ora('Data age...').start();

        url = urlWithJsonFormat(appendQueryToUrl(url)) + `&where=1=1&orderByField=${tsField}%20DESC&outfields=objectid,${tsField}`;

        const startTime = Date.now();

        const response = await axios.get(url, {
            headers: {
            Authorization: `Bearer ${token}`
            }
        });

        //console.log(response.data);

        if(response.data.features.length > 0) {
            spinner.succeed('Found age data, using field: ' + tsField);

            const date = new Date(response.data.features[0].attributes[tsField]);

            console.log("Raw Date: ", date.toUTCString()); // To check what the timestamp represents
        }
        else {
            spinner.fail('No timing data');
        }
        apdexScoring(startTime);
    }
}

function appendQueryToUrl(url) {
    // Remove the trailing slash if it exists
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return `${url}/query`;
  }

function apdexScoring(startTime) {
    if(!apdex.enabled)
        return;

    const endTime = Date.now();  // Record the end time
    const responseTime = endTime - startTime;

    if(responseTime <= apdex.satisfied)
        console.log('MS ' + chalk.green( + responseTime + ' safisfied' ));
    else if(responseTime <= apdex.tolerating)
        console.log( 'MS ' + chalk.yellow(responseTime + ' tolerated'));
    else
        console.log( 'MS ' + chalk.red(responseTime + ' failure'));
}

program.parse(process.argv);