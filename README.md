SQLite Porter Cordova/Phonegap Plugin
=================================

This Cordova/Phonegap plugin can be used to import/export to/from a SQLite database using either SQL or JSON.

- Works on all Cordova platforms that support HTML5 WebSQL DB in the WebView
- Works for native SQLite DB via a [plugin](https://github.com/litehelpers/Cordova-sqlite-storage). This can be used for platforms that don't have WebSQL in WebView (e.g. Windows) or for unlimited storage on platforms that do.
- Import/export either just the table data or the entire table structure as well.

Usage scenarios

- Create and populate a database from a database dump.
- Update an existing database by importing inserts/updates/deletes.
- Export and send data from a database.

## Contents

* [Installation](#installation)
* [Usage](#usage)
* [Example projects](#example-projects)
* [License](#license)
 
# Installation

## Using the Cordova/Phonegap [CLI](http://docs.phonegap.com/en/edge/guide_cli_index.md.html)

    $ cordova plugin add cordova-sqlite-porter
    $ phonegap plugin add cordova-sqlite-porter

## Using [Cordova Plugman](https://github.com/apache/cordova-plugman)

    $ plugman install --plugin=cordova-sqlite-porter --platform=<platform> --project=<project_path> --plugins_dir=plugins

For example, to install for the Android platform

    $ plugman install --plugin=cordova-sqlite-porter --platform=android --project=platforms/android --plugins_dir=plugins

## PhoneGap Build
Add the following xml to your config.xml to use the latest version of this plugin from [plugins.cordova.io](http://plugins.cordova.io):

    <gap:plugin name="cordova-sqlite-porter" source="plugins.cordova.io" />

or from [npmjs.com](https://npmjs.com/):

    <gap:plugin name="cordova-sqlite-porter" source="npm" />

# Usage

The plugin is exposed via the `cordova.plugins.sqlitePorter` object and provides the following functions:

- [importSqlToDb()](#importsqltodb)
- [exportDbToSql()](#exportdbtosql)
- [importJsonToDb()](#importjsontodb)
- [exportDbToJson()](#exportdbtojson)
- [wipeDb()](#wipedb)

## importSqlToDb()

Executes a set of SQL statements against the defined database.
Can be used to import data defined in the SQL statements into the database, and may additionally include commands to create the table structure.

    cordova.plugins.sqlitePorter.importSqlToDb(db, sql, successFn, errorFn);

### Parameters

- {Database} db - open SQLite database to import into
- {string} sql - SQL statements to execute against database.
- {function} successFn - callback function to execute once import is complete
- {function} errorFn - callback function to execute on error during import

### Example usage

Create a database from a SQL dump

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var sql = "CREATE TABLE Artist ([Id] PRIMARY KEY, [Title]);"+
        "INSERT INTO Artist(Id,Title) VALUES ('1','Fred');";
    var successFn = function(){
        alert("Successfully imported SQL to DB");
    };
    var errorFn = function(error){
        alert("The following error occurred: "+error.message);
    };
    cordova.plugins.sqlitePorter.importSqlToDb(db, sql, successFn, errorFn);


Update an existing database

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var sql = "INSERT INTO Artist(Id,Title) VALUES ('6','Jane');"+
        "UPDATE Artist SET Title='Susan' WHERE Id='2';"+
        "DELETE FROM Artist WHERE Id='5';";
    var successFn = function(){
        alert("Successfully updated DB");
    };
    var errorFn = function(error){
        alert("The following error occurred: "+error.message);
    };
    cordova.plugins.sqlitePorter.importSqlToDb(db, sql, successFn, errorFn);

## exportDbToSql()

Exports a SQLite DB as a set of SQL statements.

    cordova.plugins.sqlitePorter.exportDbToSql(db, successFn, dataOnly);

### Parameters

- {Database} db - open SQLite database to export
- {function} successFn - callback function to pass SQL statements to (as first parameter).
- {boolean} dataOnly - if true, only row data will be exported. Otherwise, table structure will also be exported.

### Example usage

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var successFn = function(sql){
        alert("Exported SQL: "+sql);
    };
    cordova.plugins.sqlitePorter.exportDbToSql(db, successFn, false);

## importJsonToDb()

Converts table structure and/or row data contained within a JSON structure into SQL statements that can be executed against a SQLite database.
Can be used to import data into the database and/or create the table structure.

    cordova.plugins.sqlitePorter.importJsonToDb(db, json, successFn, errorFn);

### Parameters

- {Database} db - open SQLite database to import into
- {string/object} json - JSON structure containing row data and/or table structure as either a JSON object or string
- {function} successFn - callback function to execute once import is complete
- {function} errorFn - callback function to execute on error during import

### Example usage
Create a database from a SQL dump

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var json = {
        "structure":{
            "tables":{
                "Artist":"([Id] PRIMARY KEY, [Title])"
            },
           "otherSQL": [
                "CREATE UNIQUE INDEX Artist_ID ON Artist(Id)"
           ]
        },
        "data":{
            "inserts":{
                "Artist":[
                    {
                        "Id":"1",
                        "Title":"Fred"
                    }
                ]
            }
        }
    };
    var successFn = function(){
        alert("Successfully imported JSON to DB");
    };
    var errorFn = function(error){
        alert("The following error occurred: "+error.message);
    };
    cordova.plugins.sqlitePorter.importJsonToDb(db, json, successFn, errorFn);


Update an existing database

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var json = {
        "data":{
            "inserts":{
                "Artist":[
                    {
                        "Id":"1",
                        "Title":"Fred"
                    }
                ]
            },
            "updates":{
                "Artist":[
                    {
                        "set":
                            {
                                "Title":"Susan"
                            },
                        "where":
                            {
                                "Id":"2"
                            }
                        }
                    ]
                },
                "deletes":{
                    "Artist":[
                        {
                            "Id":"5"
                        }
                    ]
                }
            }
        }
    };
    var successFn = function(){
        alert("Successfully imported JSON to DB");
    };
    var errorFn = function(error){
        alert("The following error occurred: "+error.message);
    };
    cordova.plugins.sqlitePorter.importJsonToDb(db, json, successFn, errorFn);

## exportDbToJson()

Exports a SQLite DB as a JSON structure

    cordova.plugins.sqlitePorter.exportDbToJson(db, successFn, dataOnly);

### Parameters

- {Database} db - open SQLite database to export
- {function} successFn - callback function to pass JSON structure to (as first parameter).
- {boolean} dataOnly - if true, only row data will be exported. Otherwise, table structure will also be exported.

### Example usage

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var successFn = function(json){
        alert("Exported JSON: "+json);
    };
    cordova.plugins.sqlitePorter.exportDbToSql(db, successFn, false);

## wipeDb()

Wipes all data from a database by dropping all existing tables.

    cordova.plugins.sqlitePorter.wipeData(db, successFn, errorFn);

### Parameters

- {Database} db - open SQLite database to wipe
- {function} successFn - callback function to execute once wipe is complete
- {function} errorFn - callback function to execute on error during wipe

### Example usage

    var db = window.openDatabase("Test", "1.0", "TestDB", 1 * 1024);
    var successFn = function(){
            alert("Successfully wiped DB");
        };
        var errorFn = function(error){
            alert("The following error occurred: "+error.message);
        };
    cordova.plugins.sqlitePorter.wipeData(db, successFn, errorFn);

## Example projects

### HTML5 WebSQL

[https://github.com/dpa99c/cordova-sqlite-porter-example](https://github.com/dpa99c/cordova-sqlite-porter-example)

This example project illustrates how the plugin can be used to import/export data from a WebSQL database in the WebView.

### Native SQLite

[https://github.com/dpa99c/cordova-sqlite-porter-example-native-plugin](https://github.com/dpa99c/cordova-sqlite-porter-example-native-plugin)

This example project illustrates how the plugin can be used to import/export data from a native SQLite database using a [native SQLite plugin](https://github.com/litehelpers/Cordova-sqlite-storage)

License
================

The MIT License

Copyright (c) 2015 Working Edge Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.