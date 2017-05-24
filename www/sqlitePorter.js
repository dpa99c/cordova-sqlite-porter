/**
 * Enables data/table structure to be imported/exported from a SQLite database as JSON/SQL
 * @module sqlitePorter
 * @author  Dave Alden (http://github.com/dpa99c)
 *
 * Copyright (c) 2015 Working Edge Ltd. (http://www.workingedge.co.uk)
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 *
 */
(function() {
    var sqlitePorter = {};

    // Default maximum number of statements to use for batch inserts for bulk importing data via JSON.
    var DEFAULT_BATCH_INSERT_SIZE = 250;

    // Statement separator
    var separator = ";\n";

    // Matches statements based on semicolons outside of quotes
    var statementRegEx = /(?!\s|;|$)(?:[^;"']*(?:"(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*')?)*/g;


    /**
     * Executes a set of SQL statements against the defined database.
     * Can be used to import data defined in the SQL statements into the database, and may additionally include commands to create the table structure.
     * @param {Database} db - open SQLite database to import into
     * @param {string} sql - SQL statements to execute against database.
     * @param {object} opts - optional parameters:
     * <ul>
     *  <li>{function} successFn - callback function to execute once import is complete, called with arguments:
     *      <ul>
     *          <li>{integer} count - total number of statements executed in the given SQL string.</li>
     *      <ul>
     *  </li>
     *  <li>{function} errorFn - callback function to execute on error during import, called with arguments:
     *      <ul>
     *          <li>{object} error - object representing the error.</li>
     *      <ul>
     *  </li>
     *  <li>{function} progressFn - callback function to execute after each successful execution of SQL statement, called with arguments:
     *      <ul>
     *          <li>{object} count - number of statements executed so far.</li>
     *          <li>{integer} totalCount - total number of statements in the given SQL string.</li>
     *      <ul>
     *  </li>
     * </ul>
     */
    sqlitePorter.importSqlToDb = function (db, sql, opts){
        opts = opts || {};
        db.transaction(function(tx) {
            try {
                //Clean SQL + split into statements
                var totalCount, currentCount, statements = sql.replace(/[\n\r]/g,"") // strip out line endings
                    .replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm,"") // strip out comments
                    .match(statementRegEx);

                if(statements === null || (Array.isArray && !Array.isArray(statements)))
                    statements = [];

                function handleError(e){
                    if(opts.errorFn){
                        opts.errorFn(e);
                    }else{
                        console.error(e.message);
                    }
                }

                function applyStatements() {
                    if (statements.length > 0) {
                        var statement = trimWhitespace(statements.shift());
                        tx.executeSql(statement, [], function(){
                            currentCount++;
                            if(opts.progressFn){
                                opts.progressFn(currentCount, totalCount);
                            }
                            applyStatements();
                        }, function (tx, error) {
                            error.message = "Failed to import SQL; message="+ error.message;
                            error.statement = statement;
                            handleError(error);
                        });
                    } else if(opts.successFn){
                        opts.successFn(totalCount);
                    }
                }

                // Strip empty statements
                for(var i = 0; i < statements.length; i++){
                    if(!statements[i]){
                        delete statements[i];
                    }
                }

                currentCount = 0;
                totalCount = statements.length;
                applyStatements();
            } catch (e) {
                handleError(e);
            }
        });
    };

    /**
     * Exports a SQLite DB as a set of SQL statements.
     * @param {Database} db - open SQLite database to export
     * @param {object} opts - optional parameters:
     * <ul>
     *  <li>{function} successFn - callback function to execute after export is complete, with arguments:
     *      <ul>
     *          <li>{string} sql - exported SQL statements combined into a single string.</li>
     *          <li>{integer} count - number of SQL statements in exported string.</li>
     *      <ul>
     *  </li>
     *  <li>{boolean} dataOnly - if true, only row data will be exported. Otherwise, table structure will also be exported. Defaults to false.</li>
     *  <li>{boolean} structureOnly - if true, only table structure will be exported. Otherwise, row will also be exported. Defaults to false.</li>
     */
    sqlitePorter.exportDbToSql = function (db, opts){
        opts = opts || {};
        var exportSQL = "", statementCount = 0;

        var exportTables = function (tables) {
            if (tables.n < tables.sqlTables.length && !opts.structureOnly) {
                db.transaction(
                    function (tx) {
                        var tableName = sqlUnescape(tables.sqlTables[tables.n]),
                            sqlStatement = "SELECT * FROM " + sqlEscape(tableName);
                        tx.executeSql(sqlStatement, [],
                            function (tx, rslt) {
                                if (rslt.rows) {
                                    for (var m = 0; m < rslt.rows.length; m++) {
                                        var dataRow = rslt.rows.item(m);
                                        var _fields = [];
                                        var _values = [];
                                        for (col in dataRow) {
                                            _fields.push(sqlEscape(col));
                                            _values.push(dataRow[col] === null ? "NULL" : "'" + sanitiseForSql(dataRow[col]) + "'");
                                        }
                                        exportSQL += "INSERT OR REPLACE INTO " + sqlEscape(tableName) + "(" + _fields.join(",") + ") VALUES (" + _values.join(",") + ")" + separator;
                                        statementCount++;
                                    }
                                }
                                tables.n++;
                                exportTables(tables);
                            }
                        );
                    });
            }else if(opts.successFn){
                opts.successFn(exportSQL, statementCount);
            }
        };

        db.transaction(
            function (transaction) {
                transaction.executeSql("SELECT sql FROM sqlite_master;", [],
                    function (transaction, results) {
                        var sqlStatements = [];

                        if (results.rows && !opts.dataOnly) {
                            for (var i = 0; i < results.rows.length; i++) {
                                var row = results.rows.item(i);
                                if (row.sql != null && row.sql.indexOf("CREATE TABLE") != -1 && row.sql.indexOf("__") == -1) {
                                    var tableName = sqlUnescape(trimWhitespace(trimWhitespace(row.sql.replace("CREATE TABLE", "")).split(/ |\(/)[0]));
                                    sqlStatements.push("DROP TABLE IF EXISTS " + sqlEscape(tableName));
                                }
                                if(row.sql != null && row.sql.indexOf("__") == -1){
                                    sqlStatements.push(row.sql);
                                }
                            }
                        }

                        for (var j = 0; j < sqlStatements.length; j++) {
                            if (sqlStatements[j] != null) {
                                exportSQL += sqlStatements[j].replace(/\s+/g," ") + separator;
                                statementCount++;
                            }
                        }

                        transaction.executeSql("SELECT tbl_name from sqlite_master WHERE type = 'table'", [],
                            function (transaction, res) {
                                var sqlTables = [];
                                for (var k = 0; k < res.rows.length; k++) {
                                    var tableName = res.rows.item(k).tbl_name;
                                    if (tableName.indexOf("__") == -1 && !isReservedTable(tableName)) {
                                        sqlTables.push(tableName);
                                    }
                                }
                                exportTables({
                                    sqlTables: sqlTables,
                                    n: 0
                                });
                            });

                    }
                );
            });
    };

    /**
     * Exports a SQLite DB as a JSON structure
     * @param {Database} db - open SQLite database to export
     * @param {object} opts - optional parameters:
     * <ul>
     *  <li>{function} successFn - callback function to execute after export is complete, with arguments:
     *      <ul>
     *          <li>{object} json - exported JSON structure.</li>
     *          <li>{integer} count - number of SQL statements that exported JSON structure corresponds to.</li>
     *      <ul>
     *  </li>
     *  <li>{boolean} dataOnly - if true, only row data will be exported. Otherwise, table structure will also be exported. Defaults to false.</li>
     *  <li>{boolean} structureOnly - if true, only table structure will be exported. Otherwise, row will also be exported. Defaults to false.</li>
     */
    sqlitePorter.exportDbToJson = function (db, opts){
        opts = opts || {};
        var json = {}, statementCount = 0;

        var exportTables = function (tables) {
            if (tables.n < tables.sqlTables.length && !opts.structureOnly) {
                db.transaction(
                    function (tx) {
                        var tableName = sqlUnescape(tables.sqlTables[tables.n]),
                            sqlStatement = "SELECT * FROM " + sqlEscape(tableName);
                        tx.executeSql(sqlStatement, [],
                            function (tx, rslt) {
                                if (rslt.rows) {
                                    json.data.inserts[tableName] = [];
                                    for (var m = 0; m < rslt.rows.length; m++) {
                                        var dataRow = rslt.rows.item(m);
                                        var _row = {};
                                        for (col in dataRow) {
                                            _row[col] = dataRowToJsonData(dataRow[col]);
                                        }
                                        json.data.inserts[tableName].push(_row);
                                        statementCount++;
                                    }
                                }
                                tables.n++;
                                exportTables(tables);
                            }
                        );
                    });
            }
            else if(opts.successFn){
                opts.successFn(json, statementCount);
            }

        };

        db.transaction(
            function (transaction) {
                transaction.executeSql("SELECT sql FROM sqlite_master;", [],
                    function (transaction, results) {

                        if (results.rows && !opts.dataOnly) {
                            json.structure = {
                                tables:{},
                                otherSQL:[]
                            };
                            for (var i = 0; i < results.rows.length; i++) {
                                var row = results.rows.item(i);

                                if(row.sql != null && row.sql.indexOf("__") == -1){
                                    if (row.sql.indexOf("CREATE TABLE") != -1){
                                        var tableName = sqlUnescape(trimWhitespace(trimWhitespace(row.sql.replace("CREATE TABLE", "")).split(/ |\(/)[0]));
                                        if(!isReservedTable(tableName)){
                                            var tableStructure = trimWhitespace(row.sql.replace("CREATE TABLE " + sqlEscape(tableName), ""));
                                            json.structure.tables[tableName] = tableStructure.replace(/\s+/g," ");
                                            statementCount += 2; // One for DROP, one for create
                                        }
                                    }else{
                                        json.structure.otherSQL.push(row.sql.replace(/\s+/g," "));
                                        statementCount++;
                                    }
                                }
                            }
                        }

                        transaction.executeSql("SELECT tbl_name from sqlite_master WHERE type = 'table'", [],
                            function (transaction, res) {
                                var sqlTables = [];
                                json.data = {
                                    inserts: {}
                                };

                                for (var k = 0; k < res.rows.length; k++) {
                                    if (res.rows.item(k).tbl_name.indexOf("__") == -1) {
                                        sqlTables.push(res.rows.item(k).tbl_name);
                                    }
                                }
                                exportTables({
                                    sqlTables: sqlTables,
                                    n: 0
                                });
                            }
                        );
                    }
                );
            });
    };

    /**
     * Converts table structure and/or row data contained within a JSON structure into SQL statements that can be executed against a SQLite database.
     * Can be used to import data into the database and/or create the table structure.
     * @param {Database} db - open SQLite database to import into
     * @param {string/object} json - JSON structure containing row data and/or table structure as either a JSON object or string
     * @param {object} opts - optional parameters:
     * <ul>
     *  <li>{function} successFn - callback function to execute once import is complete, called with arguments:
     *      <ul>
     *          <li>{integer} count - total number of statements executed in the given SQL string.</li>
     *      <ul>
     *  </li>
     *  <li>{function} errorFn - callback function to execute on error during import, called with arguments:
     *      <ul>
     *          <li>{object} error - object representing the error.</li>
     *      <ul>
     *  </li>
     *  <li>{function} progressFn - callback function to execute after each successful execution of SQL statement, called with arguments:
     *      <ul>
     *          <li>{object} count - number of statements executed so far.</li>
     *          <li>{integer} totalCount - total number of statements in the given SQL string.</li>
     *      <ul>
     *  </li>
     *  <li>{integer} batchInsertSize - maximum number of inserts to batch into a SQL statement using UNION SELECT method.
     *  Defaults to 250 if not specified. Set to 1 to disable batching and perform 1 insert per SQL statement.
     *  You can tweak this to optimize performance but numbers higher than 500 may cause the app to run out of memory and crash.
     *  </li>
     * </ul>
     */
    sqlitePorter.importJsonToDb = function (db, json, opts){
        opts = opts || {};
        var mainSql = "", createIndexSql = "";

        try{
            if(typeof(json) === "string"){
                json = JSON.parse(json);
            }
            if(json.structure){
                for(var tableName in json.structure.tables){
                    mainSql += "DROP TABLE IF EXISTS " + sqlEscape(tableName) + separator
                    + "CREATE TABLE " + sqlEscape(tableName) + json.structure.tables[tableName] + separator;
                }
                for(var i=0; i<json.structure.otherSQL.length; i++){
                    var command = json.structure.otherSQL[i];
                    if(command.match(/CREATE INDEX/i)){
                        createIndexSql += json.structure.otherSQL[i] + separator;
                    }else{
                        mainSql += json.structure.otherSQL[i] + separator;
                    }
                }
            }

            var batchInsertSize = opts.batchInsertSize ? opts.batchInsertSize : DEFAULT_BATCH_INSERT_SIZE;
            if(json.data.inserts){
                for(var tableName in json.data.inserts){
                    var _count = 0;
                    for(var i=0; i<json.data.inserts[tableName].length; i++){
                        if(_count === batchInsertSize){
                            mainSql += separator;
                            _count = 0;
                        }

                        var _row = json.data.inserts[tableName][i];
                        var _fields = [];
                        var _values = [];
                        for(var col in _row){
                            _fields.push(col);
                            _values.push(sanitiseForSql(_row[col]));
                        }

                        if(_count === 0){
                            mainSql += "INSERT OR REPLACE INTO " + sqlEscape(tableName) + " SELECT";
                            for(var j = 0; j < _fields.length; j++){
                                if(_values[j] === undefined || _values[j] === null || _values[j].toLowerCase() == 'null'){
                                    mainSql += " NULL AS '" + _fields[j] + "'";
                                }else{
                                    mainSql += " '" + _values[j] + "' AS '" + _fields[j] + "'";
                                }
                                if(j < _fields.length-1){
                                    mainSql += ",";
                                }
                            }
                        }else{
                            mainSql += " UNION SELECT ";
                            for(var j = 0; j < _values.length; j++){
                                if(_values[j] === undefined || _values[j] === null || _values[j].toLowerCase() == 'null'){
                                    mainSql += " NULL";
                                }else{
                                    mainSql += " '" + _values[j] + "'";
                                }
                                if(j < _values.length-1){
                                    mainSql += ",";
                                }
                            }
                        }
                        _count++;
                    }
                    mainSql += separator;
                }
            }

            if(json.data.deletes){
                for(var tableName in json.data.deletes){
                    for(var i=0; i < json.data.deletes[tableName].length; i++){
                        var _count = 0,
                            _row = json.data.deletes[tableName][i];
                        mainSql += "DELETE FROM " + sqlEscape(tableName);
                        for(var col in _row){
                            mainSql += (_count === 0 ? " WHERE " : " AND ") + col + "='" + sanitiseForSql(_row[col]) + "'";
                            _count++;
                        }
                        mainSql += separator;
                    }
                }
            }

            if(json.data.updates){
                var tableName, _row, i, _col, _count;
                for( tableName in json.data.updates){
                    for(i=0; i < json.data.updates[tableName].length; i++){
                        var _row = json.data.updates[tableName][i];
                        mainSql += "UPDATE " + sqlEscape(tableName);

                        _count = 0;
                        for(_col in _row.set){
                            mainSql += (_count === 0 ? " SET " : ", ") + _col + "='" + sanitiseForSql(_row.set[_col]) + "'";
                            _count++;
                        }

                        _count = 0;
                        for(_col in _row.where){
                            mainSql += (_count === 0 ? " WHERE " : " AND ") + _col + "='" + sanitiseForSql(_row.where[_col]) + "'";
                            _count++;
                        }

                        mainSql += separator;
                    }
                }
            }

            // If creating indexes, do it in a different transaction after other SQL to optimise performance
            if(createIndexSql){
                sqlitePorter.importSqlToDb(db, mainSql, extend({}, opts, {
                    successFn:function(mainTotalCount){
                        sqlitePorter.importSqlToDb(db, createIndexSql, extend({}, opts, {
                            successFn:function(totalCount){
                                if(opts.successFn){
                                    opts.successFn(mainTotalCount+totalCount);
                                }
                            },
                            progressFn:function(count, totalCount){
                                if(opts.progressFn){
                                    opts.progressFn(mainTotalCount+count, mainTotalCount+totalCount);
                                }
                            }
                        }));
                    }
                }));
            }else{
                sqlitePorter.importSqlToDb(db, mainSql, opts);
            }

        }catch(e){
            e.message = "Failed to parse JSON structure to SQL: "+ e.message;
            if(opts.errorFn){
                opts.errorFn(e);
            }else{
                console.error(e.message);
            }
        }
    };

    /**
     * Wipes a SQLite DB by dropping all tables.
     * @param {Database} db - open SQLite database to wipe
     * @param {object} opts - optional parameters:
     * <ul>
     *  <li>{function} successFn - callback function to execute once wipe is complete, called with arguments:
     *      <ul>
     *          <li>{integer} count - number of tables dropped.</li>
     *      <ul>
     *  </li>
     *  <li>{function} errorFn - callback function to execute on error during wipe, called with arguments:
     *      <ul>
     *          <li>{object} error - object representing the error.</li>
     *      <ul>
     *  </li>
     *  <li>{function} progressFn - callback function to execute after each successful table drop, called with arguments:
     *      <ul>
     *          <li>{object} count - number of tables dropped so far.</li>
     *          <li>{integer} totalCount - total number of tables to drop.</li>
     *      <ul>
     *  </li>
     * </ul>
     */
    sqlitePorter.wipeDb = function (db, opts){
        opts = opts || {};
        db.transaction(
            function (transaction) {
                transaction.executeSql("SELECT sql FROM sqlite_master;", [],
                    function (transaction, results) {
                        var dropStatements = [];

                        if (results.rows) {
                            for (var i = 0; i < results.rows.length; i++) {
                                var row = results.rows.item(i);
                                if (row.sql != null && row.sql.indexOf("CREATE TABLE") != -1 && row.sql.indexOf("__") == -1) {
                                    var tableName = sqlUnescape(trimWhitespace(trimWhitespace(row.sql.replace("CREATE TABLE", "")).split(/ |\(/)[0]));
                                    if(!isReservedTable(tableName)){
                                        dropStatements.push("DROP TABLE IF EXISTS " + sqlEscape(tableName));
                                    }
                                }
                            }
                        }
                        if(dropStatements.length > 0){
                            sqlitePorter.importSqlToDb(db, dropStatements.join(separator), opts);
                        }else if(opts.successFn){
                            opts.successFn(dropStatements.length);
                        }
                    }
                );
            }
        );
    };

    /**
     * Converts "null", "false", "true", and "undefined" fields to their properly typed null, false, true, and undefined equivalents
     * @param {string} data - raw string from db
     * @returns {object} boolean, null, or undefined if the original data
     */
    function dataRowToJsonData(data){
        if (data === null || data === "null") return null;
        if (data === undefined || data === "undefined") return undefined;
        if (data === true || data === "true") return true;
        if (data === false || data === "false") return false;
        return data;
    }

    /**
     * Trims leading and trailing whitespace from a string
     * @param {string} str - untrimmed string
     * @returns {string} trimmed string
     */
    function trimWhitespace(str){
        return str.replace(/^\s+/,"").replace(/\s+&/,"");
    }

    /**
     * Sanitises a value for insertion into a SQL statement.
     * Replace occurrences of 1 single quote with 2 single quotes to SQL-escape them.
     * @param {string} value - unsanitised value
     * @returns {string} sanitised value
     */
    function sanitiseForSql(value){
        if (value === null || value === undefined) { return null; }
        return (value+"").replace(/'([^']|$)/g,"''$1");
    }

    /**
     * Escapes the given value if it contains special characters by wrapping it with back-ticks: value => `value`.
     * @param {string} value - unescaped value
     * @return {string} escaped value
     */
    function sqlEscape(value){
        if(value.match(/[_-]+/)){
            value = '`' + value + '`';
        }
        return value;
    }

    /**
     * Unescapes the given value if it's escaped with back-ticks: `value` => value.
     * @param {string} value - unescaped value
     * @return {string} escaped value
     */
    function sqlUnescape(value){
        var matchesEscaped = value.match(/`([^`]+)`/);
        if(matchesEscaped){
            value = matchesEscaped[1];
        }
        return value;
    }

    /**
     * Applies properties to the 1st object specified from the 2nd, 3rd, 4th, etc.
     * Emulates jQuery's $.extend()
     * @returns {object}
     */
    function extend(){
        for(var i=1; i<arguments.length; i++)
            for(var key in arguments[i])
                if(arguments[i].hasOwnProperty(key))
                    arguments[0][key] = arguments[i][key];
        return arguments[0];
    }

    /**
     * Indicates if given table name is a reserved SQLite meta-table.
     * @param {string} tableName - name of table to check
     * @returns {boolean} true if table is a reserved SQLite table
     */
    function isReservedTable(tableName){
        return !!tableName.match(/^sqlite_/);
    }

    module.exports = sqlitePorter;
}());