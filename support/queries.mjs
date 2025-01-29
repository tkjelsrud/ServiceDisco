import ora from 'ora';
import axios from 'axios';
import https from 'https';
import chalk from 'chalk';
//import {EsriTokenService, EsriService, JSONService} from './services.cjs';

const axiosInstance = axios.create({
    httpsAgent: new https.Agent({  
      rejectUnauthorized: false  // Disable SSL verification
    })
});

export class EsriSchema {
    constructor() {}

    static async getSchema(url, layerId, token) {
        const spinner = ora(`Fetching schema ${layerId} ...`).start();

        url = urlWithJsonFormat(appendQueryToUrl(url + layerId)) + `&where=1=1&outFields=*&resultRecordCount=1`;

        try {
            const response = await axiosInstance.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.data && response.data.fields) {
                spinner.succeed(`Schema ${layerId} fields: ${response.data.fields.length}`);
                return response.data.fields; // Return the fields directly
            } else {
                spinner.fail(`No fields in response for schema ${layerId}`);
                return [];
            }
        } catch (error) {
            spinner.fail(`Failed to fetch schema ${layerId}`);
            console.error('Error fetching schema:', error);
            return []; // Return an empty array on error
        }
    }
}

export class EsriQuery {
    constructor() {}

    static queryCount(url, token, where = '1=1') {
        const spinner = ora('Counting...').start();
    
        url = urlWithJsonFormat(appendQueryToUrl(url)) + `&where=${where}&returnCountOnly=true`;
    
        const startTime = Date.now();
    
        const response = axiosInstance.get(url, {
            headers: {
              Authorization: `Bearer ${token}`
            }
        }).then((response) => {
            const count = response.data.count;
            spinner.succeed('Count: ' + (count > 0 ? chalk.yellow(count) + ' features' : chalk.red('No features')) + ' where ' + where + ' (' + Math.floor(Date.now()-startTime) + 'ms)');
            //apdexScoring(startTime);
        }).catch((error) => {
            spinner.fail('Failed to count features');
            console.error('Error fetching data:', error);
        });
    }

    static queryLastRows(url, token, fieldList, count = 10, title = "") {
        const spinner = ora('Last rows...').start();
    
        let firstField = fieldList.split(',')[0];
    
        url = urlWithJsonFormat(appendQueryToUrl(url)) + `&where=1=1&outFields=${fieldList}&orderByFields=${firstField}+DESC&resultRecordCount=${count}`;
        const startTime = Date.now();
    
        const response = axiosInstance.get(url, {
            headers: {
              Authorization: `Bearer ${token}`
            }
        }).then((response) => {
            if(response.data.features) {
                spinner.succeed(`List features: ${title}`);
                response.data.features.forEach(feature => {
                    let line = "";
                    fieldList.split(',').forEach(field => {
                        let value = feature.attributes[field];
                        let type = getFieldType(response.data, field);
    
                        if(type == 'esriFieldTypeDate')
                            value = (new Date(value)).toLocaleString('no-nb');
    
                        line += '\t' + value;
                    });
                    if('geometry' in feature) {
                        if(feature.geometry['x'] != undefined && feature.geometry['x'] != 0 && feature.geometry['y'] != 0)
                            line += '\t' + 'geo ';
                        else
                            line += '\t' + 'err-geo';
                    }
                    else
                        line += '\t' + 'no-geo';
    
                    console.log(line);
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
}

function urlWithJsonFormat(url) {
    return `${url}${url.includes('?') ? '&' : '?'}f=json`;
}

function appendQueryToUrl(url) {
    const trimmedUrl = url.replace(/\/$/, '');
    return trimmedUrl + '/query';
}

function getFieldType(jsonData, fieldName) {
    let type = null;

    if(jsonData.fields) {
        jsonData.fields.forEach(field => {
            if(field.name == fieldName) {
                type = field.type;
            }
        });
    }
    return type;
}