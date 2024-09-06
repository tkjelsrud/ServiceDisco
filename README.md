# Command for quickly exploring data in ESRI ArcGIS Enterprise REST services
Especially useful for FeatureServers

## Installation
```
npm install
```
## Autocompletion in zsh, following added to ~/.zshrc
```
autoload -U compinit
compinit
eval "$(disco completion)"
```
## Once installed you can do different look ups to both services, folders, layers and directly on features using the syntax
```
disco http://enterprise.host/somepath/
disco http://enterprise.host/agshost/rest/services
disco http://enterprise.host/agshost/rest/services/someService/FeatureServer/
disco http://enterprise.host/agshost/rest/services/someService/FeatureServer/0
disco http://enterprise.host/agshost/rest/services/someService/FeatureServer/0/1234
```
Token is read from environment variables but can be generated using

Example output
```
Discovering services at: https://enterprise.host/arcgis/rest/services/someService/FeatureServer/0
✔ Feature Layer discovered
Capabilities: Query,Create,Update,Delete,Uploads,Editing
Fields: 44
- objectid esriFieldTypeOID
- id esriFieldTypeString
```

## Generating token (should be updated to the environment variable named TOKEN
```
disco http://enterprise.host/somepath/ --token --credentials username:password
export TOKEN=blabla
```
