const axios = require('axios');

class Service {
    constructor() {
        this.timeout = 10000;
    }
}

class JSONService extends Service {
    constructor() {
        super();
        this.debug = false;
    }

    setDebug(onOff) {
        this.debug = onOff;
    }
}

class EsriService extends JSONService {
    constructor(servicePath, token) {
        super();
        this.servicePath = servicePath;
        this.token = token;
    }

    async query(path, queryParams) {
        let response = null;

        try {
            const serializedParams = {};
            for (const [key, value] of Object.entries(queryParams)) {
                if (typeof value === 'object') {
                    serializedParams[key] = JSON.stringify(value);
                } else {
                    serializedParams[key] = value;
                }
            }
            
            const queryString = Object.keys(serializedParams).length ? '?' + new URLSearchParams(serializedParams).toString() : '';
            const fullUrl = this.servicePath + path + queryString;

            if(this.debug)
                console.log(fullUrl);
        
            response = await axios.get(fullUrl, {
                headers: {
                    'Accept': 'application/json',
                    'X-Esri-Authorization': `Bearer ${this.token}`
                }}, {timeout: this.timeout});
        
            if (response.status !== 200) {
                throw new Error(`Expected status 200 but got ${response.status}`);
            }
        }
        catch (error) {
            console.error(`GET query to ${path} failed: ${error.message}`);
            throw error;
        }
        return response;
    }

    async post(path, formInput, timeout = 10000) {
        let response = null;

        try {
            const fullUrl = this.servicePath + path;

            const formData = new URLSearchParams();
            for (const key in formInput) {
                formData.append(key, formInput[key]);
            }
        
            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out')), timeout)
            );

            if(this.debug) {
                console.log(fullUrl);
                console.log(formData.toString())
            }
            

            // Execute the axios post and race it against the timeout
            response = await Promise.race([
                axios.post(fullUrl, formData.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
                        'X-Esri-Authorization': `Bearer ${this.token}`
                    }
                }, {timeout: this.timeout}),
                timeoutPromise
            ]);
        
            if (response.status !== 200) {
                throw new Error(`Expected status 200 but got ${response.status}`);
            }
        }
        catch (error) {
            console.error(`GET query to ${path} failed: ${error.message}`);
            throw error;
        }
        return response;
    }
}

class EsriTokenService extends JSONService {
    constructor(tokenUrl) {
        super();
        this.tokenUrl = tokenUrl;
    }

    async getToken(username, password, refUrl) {
        let response = null;

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);
            formData.append('client', 'referer');
            formData.append('referer', refUrl);
            formData.append('f', 'json');
        
            response = await axios.post(this.tokenUrl, formData.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
        } catch (error) {
            console.error(`POST request to ${this.tokenUrl} failed: ${error.message}`);
        }
        if (response.status !== 200) {
            throw new Error(`Expected status 200 but got ${response.status}`);
        }
        if(!'token' in response.data) {
            throw new Error(`Expected status 200 but got ${response.status}`);
        }

        //console.log(response.data);
        
        return response.data.token;
    }
}

class SoapService extends Service {
    constructor(servicePath, token) {
        super();
        this.servicePath = servicePath;
    }

    async getServiceDescription(path) {
        let response = null;
        let fullUrl = this.servicePath + path + '?wsdl';

        response = await axios.get(fullUrl, {
            headers: {
                'Accept': 'text/xml; charset=utf-8',
                'X-Esri-Authorization': `Bearer ${this.token}`
            }}, {timeout: this.timeout}
        );
    
        if (response.status !== 200) {
            throw new Error(`Expected status 200 but got ${response.status}`);
        }

        return response;
    }
}

module.exports = {EsriTokenService, EsriService, JSONService, SoapService};