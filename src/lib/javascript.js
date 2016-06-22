/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

const path = require( "path" );
const uglifyjs = require( "uglify-js" );
const linter = require( "eslint" ).linter;
const ckbuilder = {
	io: require( "./io" )
};

function filterComments( node, comment ) {
    const text = comment.value;
    const type = comment.type;
    if ( type === "comment2" ) {

        // multiline comment
        return /@preserve|@license|@cc_on/i.test( text );
    }
}

/**
 * Compile JavaScript file.
 *
 * @param {java.io.File} file
 * http://closure-compiler.googlecode.com/svn/trunk/javadoc/index.html
 * @member CKBuilder.javascript
 * @private
 * @returns {String}
 */
function compileFile( file ) {
	const code = ckbuilder.io.readFile( file );
	try {
		const result = uglifyjs.minify( code, {
			fromString: true,
			output: {
				comments: filterComments
			}
		} );
		return result.code;
	} catch ( e ) {
		throw new Error( "Unable to compile " + file + " file.\nError: " + e.toString() );
	}
}

/**
 * Handle javascript files. Minify them, remove white spaces and find errors.
 *
 * @class
 */
ckbuilder.javascript = {
	/**
	 * Finds errors in given code.
	 *
	 * @param {String} code JavaScript code
	 * @param fileName The name of the file from which the code has been taken (used only to build error messages).
	 * @returns {Array|null}
	 * @static
	 */
	findErrors: function( code, fileName ) {
		const messages = linter.verify( code, {}, { filename: fileName || "input.js" });
		return messages.length ? messages : null;
	},

	/**
	 * Removes white space characters from given code (removes comments and extra whitespace in the input JS).
	 *
	 * @param {String} code JavaScript code
	 * @param {String} fileName The name of the file from which the code has been taken (used only to build error messages).
	 * @returns {String}
	 * @static
	 */
	removeWhiteSpace: function( code, fileName ) {
		const result = uglifyjs.minify( code, {
			fromString: true,
			output: {
				comments: filterComments,
				beautify: true
			},
			parse: {
				filename: fileName
			}
		} );
		return result.code;
	},

	/**
	 * Minify and save specified file.
	 *
	 * @param {java.io.File} file
	 * @static
	 */
	minify: function( file ) {
		if ( ckbuilder.io.getExtension( path.basename( file ) ) !== "js" ) {
			throw( "Not a JavaScript file: " + path.resolve( file ) );
		}

		ckbuilder.io.saveFile( file, compileFile( file ), true );
	}
};

module.exports = ckbuilder.javascript;
