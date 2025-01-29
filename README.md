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
disco http://enterprise.host/agshost/rest/services/someService/FeatureServer/0
```
### disco.json - configuration example
The urls block is used for auto-completion, for now, you can manually populate it with known enpoint or folders
username and password can be placed in the disco.json for simplifying generating token with --token
however its considered unsafe, other means of storing credentials should be used
```
{
  "urls": [
    "https://enterprise.host/agshost/rest/services",
    "https://enterprise.host/agshost/rest/services/someService/FeatureServer/0",
  ],
  "token": {
    "https://enterprise.host/": {
      "tokenUrl": "https://enterprise.host/portal/sharing/rest/generateToken",
      "referer": "https://enterprise.host/",
      "client": "referer",
      "f": "json",
      "username": "USERNAME",
      "password": "PASSWORD"
    }
  },
  "extents": {
  }
}
```

### Example output from running command
```
Discovering services at: https://enterprise.host/arcgis/rest/services/someService/FeatureServer/0
✔ Feature Layer discovered
Capabilities: Query,Create,Update,Delete,Uploads,Editing
Fields: 44
- objectid esriFieldTypeOID
- id esriFieldTypeString
...
```

### Example from running a command directly
```
disco enterprise.host/arcgis/rest/services/someService/FeatureServer/queryDomains
✔ Found JSON response
{
  "domains": [
    {
      "type": "some type",
      "name": "some value here",
      "description": "",
      "codedValues": [
        {
```


## Generating token (should be updated to the environment variable named TOKEN
If user credentials are present in disco.json or in environment variables
```
disco http://enterprise.host/somepath/ --token
```
If manually logging on:
```
disco http://enterprise.host/somepath/ --token --credentials username:password
```

## Installation of auto-complete
disco completion
```
#compdef disco
###-begin-disco-completions-###
#
# yargs command completion script
#
# Installation: /opt/homebrew/bin/disco completion >> ~/.zshrc
#    or /opt/homebrew/bin/disco completion >> ~/.zprofile on OSX.
#
_disco_yargs_completions()
{
  local reply
  local si=$IFS
  IFS=$'
' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" /opt/homebrew/bin/disco --get-yargs-completions "${words[@]}"))
  IFS=$si
  _describe 'values' reply
}
compdef _disco_yargs_completions disco
###-end-disco-completions-###
```
