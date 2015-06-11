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

    // Statement separator
    var separator = ";\n";

    // Matches statements based on semicolons outside of quotes
    var statementRegEx = /(?!\s|;|$)(?:[^;"']*(?:"(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*')?)*/g;

    /**
     * Executes a set of SQL statements against the defined database.
     * Can be used to import data defined in the SQL statements into the database, and may additionally include commands to create the table structure.
     * @param {Database} db - open SQLite database to import into
     * @param {string} sql - SQL statements to execute against database.
     * @param {function} successFn - callback function to execute once import is complete
     * @param {function} errorFn - callback function to execute on error during import
     */
    sqlitePorter.importSqlToDb = function (db, sql, successFn, errorFn){
        db.transaction(function(tx) {
            try {
                //Clean SQL + split into statements
                var statements = sql.replace(/[\n\r]/g,"") // strip out line endings
                    .replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm,"") // strip out comments
                    .match(statementRegEx);

                function applyStatements() {
                    if (statements.length > 0) {
                        var statement = trimWhitespace(statements.shift());
                        if (statement) {
                            tx.executeSql(statement, [], applyStatements, function (tx, error) {
                                errorFn(new Error("Failed to import SQL; code=" + error.code + "; message=" + error.message + "; sql=" + statement));
                            });
                        } else {
                            applyStatements();
                        }
                    } else {
                        successFn();
                    }
                }

                applyStatements();
            } catch (e) {
                errorFn(e);
            }
        });
    };

    /**
     * Exports a SQLite DB as a set of SQL statements.
     * @param {Database} db - open SQLite database to export
     * @param {function} successFn - callback function to pass SQL statements to (as first parameter).
     * @param {boolean} dataOnly - if true, only row data will be exported. Otherwise, table structure will also be exported.
     */
    sqlitePorter.exportDbToSql = function (db, successFn, dataOnly){
        var exportSQL = "";

        var exportTables = function (options) {
            if (options.n < options.sqlTables.length) {
                db.transaction(
                    function (tx) {
                        var tableName = options.sqlTables[options.n],
                            sqlStatement = "SELECT * FROM " + tableName;
                        tx.executeSql(sqlStatement, [],
                            function (tx, rslt) {
                                if (rslt.rows) {
                                    for (var m = 0; m < rslt.rows.length; m++) {
                                        var dataRow = rslt.rows.item(m);
                                        var _fields = [];
                                        var _values = [];
                                        for (col in dataRow) {
                                            _fields.push(col);
                                            _values.push("'" + dataRow[col] + "'");
                                        }
                                        exportSQL += "INSERT OR REPLACE INTO " + tableName + "(" + _fields.join(",") + ") VALUES (" + _values.join(",") + ")" + separator;
                                    }
                                }
                                options.n++;
                                exportTables(options);
                            }
                        );
                    });
            }else{
                successFn(exportSQL);
            }
        };

        db.transaction(
            function (transaction) {
                transaction.executeSql("SELECT sql FROM sqlite_master;", [],
                    function (transaction, results) {
                        var sqlStatements = [];

                        if (results.rows && !dataOnly) {
                            for (var i = 0; i < results.rows.length; i++) {
                                var row = results.rows.item(i);
                                if (row.sql != null && row.sql.indexOf("CREATE TABLE") != -1 && row.sql.indexOf("__") == -1) {
                                    var tableName = trimWhitespace(trimWhitespace(row.sql.replace("CREATE TABLE", "")).split(/ |\(/)[0]);
                                    sqlStatements.push("DROP TABLE IF EXISTS " + tableName);
                                }
                                if(row.sql != null && row.sql.indexOf("__") == -1){
                                    sqlStatements.push(row.sql);
                                }
                            }
                        }

                        for (var j = 0; j < sqlStatements.length; j++) {
                            if (sqlStatements[j] != null) {
                                exportSQL += sqlStatements[j].replace(/\s+/g," ") + separator;
                            }
                        }

                        transaction.executeSql("SELECT tbl_name from sqlite_master WHERE type = 'table'", [],
                            function (transaction, res) {
                                var sqlTables = [];
                                for (var k = 0; k < res.rows.length; k++) {
                                    if (res.rows.item(k).tbl_name.indexOf("__") == -1) {
                                        sqlTables.push(res.rows.item(k).tbl_name);
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
     * @param {function} successFn - callback function to pass JSON structure to (as first parameter).
     * @param {boolean} dataOnly - if true, only row data will be exported. Otherwise, table structure will also be exported.
     */
    sqlitePorter.exportDbToJson = function (db, successFn, dataOnly){
        var JSON = {};

        var exportTables = function (options) {
            if (options.n < options.sqlTables.length) {
                db.transaction(
                    function (tx) {
                        var tableName = options.sqlTables[options.n],
                            sqlStatement = "SELECT * FROM " + tableName;
                        tx.executeSql(sqlStatement, [],
                            function (tx, rslt) {
                                if (rslt.rows) {
                                    JSON.data.inserts[tableName] = [];
                                    for (var m = 0; m < rslt.rows.length; m++) {
                                        var dataRow = rslt.rows.item(m);
                                        var _row = {};
                                        for (col in dataRow) {
                                            _row[col] = dataRow[col];
                                        }
                                        JSON.data.inserts[tableName].push(_row);
                                    }
                                }
                                options.n++;
                                exportTables(options);
                            }
                        );
                    });
            }else{
                successFn(JSON);
            }

        };

        db.transaction(
            function (transaction) {
                transaction.executeSql("SELECT sql FROM sqlite_master;", [],
                    function (transaction, results) {

                        if (results.rows && !dataOnly) {
                            JSON.structure = {
                                tables:{},
                                otherSQL:[]
                            };
                            for (var i = 0; i < results.rows.length; i++) {
                                var row = results.rows.item(i);

                                if(row.sql != null && row.sql.indexOf("__") == -1){
                                    if (row.sql.indexOf("CREATE TABLE") != -1){
                                        var tableName = trimWhitespace(trimWhitespace(row.sql.replace("CREATE TABLE", "")).split(/ |\(/)[0]),
                                            tableStructure = trimWhitespace(row.sql.replace("CREATE TABLE " + tableName, ""));
                                        JSON.structure.tables[tableName] = tableStructure.replace(/\s+/g," ");
                                    }else{
                                        JSON.structure.otherSQL.push(row.sql.replace(/\s+/g," "));
                                    }
                                }
                            }
                        }

                        transaction.executeSql("SELECT tbl_name from sqlite_master WHERE type = 'table'", [],
                            function (transaction, res) {
                                var sqlTables = [];
                                JSON.data = {
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
     * @param {function} successFn - callback function to execute once import is complete
     * @param {function} errorFn - callback function to execute on error during import
     */
    sqlitePorter.importJsonToDb = function (db, json, successFn, errorFn){
        var sql = "";

        try{
            if(typeof(json) === "string"){
                json = JSON.parse(json);
            }
            if(json.structure){
                for(var tableName in json.structure.tables){
                    sql += "DROP TABLE IF EXISTS " + tableName + separator
                    + "CREATE TABLE " + tableName + json.structure.tables[tableName] + separator;
                }
                for(var i=0; i<json.structure.otherSQL.length; i++){
                    sql += json.structure.otherSQL[i] + separator;
                }
            }

            if(json.data.inserts){
                for(var tableName in json.data.inserts){
                    for(var i=0; i<json.data.inserts[tableName].length; i++){
                        var _row = json.data.inserts[tableName][i];
                        var _fields = [];
                        var _values = [];
                        for(var col in _row){
                            _fields.push(col);
                            _values.push("'" + sanitiseForSql(_row[col]) + "'");
                        }
                        sql += "INSERT OR REPLACE INTO " + tableName + "(" + _fields.join(",") + ") VALUES (" + _values.join(",") + ")" + separator;
                    }

                }
            }

            if(json.data.deletes){
                for(var tableName in json.data.deletes){
                    for(var i=0; i<json.data.deletes[tableName].length; i++){
                        var _count = 0,
                            _row = json.data.deletes[tableName][i];
                        sql += "DELETE FROM " + tableName;
                        for(var col in _row){
                            sql += (_count === 0 ? " WHERE " : " AND ") + col + "='"+sanitiseForSql(_row[col])+"'";
                            _count++;
                        }
                        sql += separator;
                    }
                }
            }

            if(json.data.updates){
                var tableName, _row, i, _col, _count;
                for( tableName in json.data.updates){
                    for(i=0; i<json.data.updates[tableName].length; i++){
                        var _row = json.data.updates[tableName][i];
                        sql += "UPDATE " + tableName;

                        _count = 0;
                        for(_col in _row.set){
                            sql += (_count === 0 ? " SET " : ", ") + _col + "='" + sanitiseForSql(_row.set[_col]) + "'";
                        }

                        _count = 0;
                        for(_col in _row.where){
                            sql += (_count === 0 ? " WHERE " : " AND ") + _col + "='" + sanitiseForSql(_row.where[_col]) + "'";
                        }

                        sql += separator;
                    }
                }
            }

            sqlitePorter.importSqlToDb(db, sql, successFn, errorFn);
        }catch(e){
            e.message = "Failed to parse JSON structure to SQL: "+ e.message;
            errorFn(e);
        }

    };

    /**
     * Wipes a SQLite DB by dropping all tables.
     * @param {Database} db - open SQLite database to wipe
     * @param {function} successFn - callback function to execute once wipe is complete
     * @param {function} errorFn - callback function to execute on error during wipe
     */
    sqlitePorter.wipeDb = function (db, successFn, errorFn){

        db.transaction(
            function (transaction) {
                transaction.executeSql("SELECT sql FROM sqlite_master;", [],
                    function (transaction, results) {
                        var dropStatements = [];

                        if (results.rows) {
                            for (var i = 0; i < results.rows.length; i++) {
                                var row = results.rows.item(i);
                                if (row.sql != null && row.sql.indexOf("CREATE TABLE") != -1 && row.sql.indexOf("__") == -1) {
                                    var tableName = trimWhitespace(trimWhitespace(row.sql.replace("CREATE TABLE", "")).split(/ |\(/)[0]);
                                    dropStatements.push("DROP TABLE IF EXISTS " + tableName);
                                }
                            }
                        }
                        if(dropStatements.length > 0){
                            sqlitePorter.importSqlToDb(db, dropStatements.join(separator), successFn, errorFn);
                        }else{
                            successFn();
                        }
                    }
                );
            }
        );
    };


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
        return (value+"").replace(/'([^']|$)/g,"''$1");
    }

    module.exports = sqlitePorter;
}());